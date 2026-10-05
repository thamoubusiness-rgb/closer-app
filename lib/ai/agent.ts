import type OpenAI from "openai";
import { z } from "zod";
import { loadContext } from "./context";
import { BOOKING_FAILED, SAFE_ERROR_REPLY, buildSystemPrompt } from "./prompts";
import { executeTool, getToolDefinitions } from "./tools";
import type {
  AgentDeps, AgentInput, AgentResult, SenderType, StoredMessage, ToolContext, ToolState,
} from "./types";

type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

const MAX_TOOL_STEPS = 6;
const DEFAULT_MODEL = process.env.OPENAI_MODEL ?? "gpt-4.1";

const inputSchema = z.object({
  organizationId: z.string().uuid(),
  conversationId: z.string().uuid(),
  message: z.string().trim().min(1).max(2000),
});

const BOOKED_CLAIM =
  /\b(you['’]?re|you are|your viewing (is|has been)|viewing (is|has been)|all set|i['’]?ve booked|i have booked)\b[^.!?\n]{0,30}\b(booked|confirmed|scheduled)\b/i;

/** Safety net: the model may only say "booked" if book_viewing really succeeded this turn. */
export function guardBookingClaim(reply: string, bookedThisTurn: boolean): string {
  return !bookedThisTurn && BOOKED_CLAIM.test(reply) ? BOOKING_FAILED : reply;
}

function toChatHistory(history: StoredMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const m of history) {
    if (m.sender_type === "customer") out.push({ role: "user", content: m.content });
    else if (m.sender_type === "ai" || m.sender_type === "human") out.push({ role: "assistant", content: m.content });
  }
  return out;
}

async function saveMessage(
  deps: AgentDeps, organizationId: string, conversationId: string,
  sender: SenderType, content: string, metadata: Record<string, unknown>,
) {
  const { error } = await deps.db.from("messages").insert({
    organization_id: organizationId, conversation_id: conversationId,
    sender_type: sender, content, metadata,
  });
  if (error) throw new Error("save_message_failed");
}

async function touch(deps: AgentDeps, organizationId: string, conversationId: string, leadId: string, at: Date) {
  const iso = at.toISOString();
  await deps.db.from("conversations").update({ last_message_at: iso })
    .eq("id", conversationId).eq("organization_id", organizationId);
  await deps.db.from("leads").update({ last_activity_at: iso })
    .eq("id", leadId).eq("organization_id", organizationId);
}

/**
 * One customer message in, one AI reply out.
 * The caller (widget route / WhatsApp webhook) resolves organizationId from its own trusted lookup.
 */
export async function runAgent(rawInput: AgentInput, deps: AgentDeps): Promise<AgentResult> {
  const input = inputSchema.parse(rawInput);
  const now = deps.now ?? (() => new Date());
  const ctx = await loadContext(deps.db, input.organizationId, input.conversationId);
  const base = { conversationId: input.conversationId, handedOff: false, viewingId: null, propertyIds: [] as string[] };

  await saveMessage(deps, input.organizationId, input.conversationId, "customer", input.message,
    { channel: ctx.conversation.channel });
  await touch(deps, input.organizationId, input.conversationId, ctx.lead.id, now());

  // Human is in control, or the agency switched the AI off: store the message, do not reply.
  if (!ctx.settings.enabled || !ctx.conversation.ai_enabled) {
    return { ...base, reply: null, skipped: "ai_disabled" };
  }

  const state: ToolState = { propertyIds: new Set(), viewingId: null, handedOff: false, calls: [] };
  const toolCtx: ToolContext = {
    db: deps.db, organizationId: input.organizationId, conversation: ctx.conversation,
    lead: { ...ctx.lead }, settings: ctx.settings, calendar: deps.calendar ?? null,
    notifier: deps.notifier ?? null, logger: deps.logger, state, now,
  };
  const model = deps.model ?? DEFAULT_MODEL;
  const tools = getToolDefinitions(ctx.settings);

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: buildSystemPrompt({
        organization: ctx.organization, settings: ctx.settings, lead: ctx.lead, now: now(),
        timeZone: deps.calendar?.timeZone ?? null,
      }),
    },
    ...toChatHistory(ctx.history),
    { role: "user", content: input.message },
  ];

  let reply = "";
  try {
    for (let step = 0; step < MAX_TOOL_STEPS && !reply; step++) {
      const res = await deps.openai.chat.completions.create({ model, messages, tools, temperature: 0.3 });
      const msg = res.choices[0]?.message;
      if (!msg) throw new Error("empty_completion");
      if (!msg.tool_calls?.length) {
        reply = (msg.content ?? "").trim();
        break;
      }
      messages.push(msg);
      for (const call of msg.tool_calls) {
        if (call.type !== "function") continue;
        const result = await executeTool(toolCtx, call.function.name, call.function.arguments);
        messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
      }
    }
    if (!reply) throw new Error("no_final_reply");
    reply = guardBookingClaim(reply, state.viewingId !== null);
  } catch (e) {
    deps.logger?.error("agent_failed", {
      organizationId: input.organizationId, conversationId: input.conversationId,
      message: e instanceof Error ? e.message : "unknown",
    });
    if (ctx.settings.human_handoff_enabled && !state.handedOff) {
      await executeTool(toolCtx, "handoff_to_human", JSON.stringify({ reason: "AI agent error" }));
    }
    reply = SAFE_ERROR_REPLY;
  }

  const propertyIds = [...state.propertyIds];
  await saveMessage(deps, input.organizationId, input.conversationId, "ai", reply, {
    channel: ctx.conversation.channel, model, tool_calls: state.calls,
    property_ids: propertyIds, viewing_id: state.viewingId,
  });
  await touch(deps, input.organizationId, input.conversationId, ctx.lead.id, now());

  return { reply, conversationId: input.conversationId, handedOff: state.handedOff, viewingId: state.viewingId, propertyIds };
}
