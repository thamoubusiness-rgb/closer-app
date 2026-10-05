import OpenAI from "openai";
import { NextResponse } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runAgent } from "@/lib/ai/agent";
import { adminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  widget_id: z.string().regex(/^[a-f0-9]{32}$/),
  session_id: z.string().uuid(),
  message: z.string().trim().min(1).max(2000),
});

const logger = {
  info: (m: string, d?: Record<string, unknown>) => console.log(JSON.stringify({ level: "info", m, ...d })),
  error: (m: string, d?: Record<string, unknown>) => console.error(JSON.stringify({ level: "error", m, ...d })),
};

let openai: OpenAI | undefined;
const getOpenAI = () => (openai ??= new OpenAI());

function reply(data: Record<string, unknown>, status: number, origin: string | null) {
  return NextResponse.json(data, {
    status,
    headers: origin ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {},
  });
}

/** Empty list = any site (fine for testing). Set allowed_domains in production. This deters casual abuse; rate limits are the real protection. */
function originAllowed(origin: string | null, domains: string[]): boolean {
  if (domains.length === 0) return true;
  if (!origin) return false;
  try {
    const host = new URL(origin).hostname;
    return domains.some((d) => host === d || host.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

function subscriptionActive(
  s: { status: string; trial_ends_at: string | null } | null, now: Date,
): boolean {
  if (!s) return false;
  if (s.status === "trialing") return !!s.trial_ends_at && new Date(s.trial_ends_at) > now;
  return s.status === "active" || s.status === "past_due";
}

async function getOrCreateConversation(db: SupabaseClient, orgId: string, sessionId: string): Promise<string> {
  const find = () =>
    db.from("conversations").select("id").eq("organization_id", orgId).eq("widget_session_id", sessionId).maybeSingle();

  const existing = await find();
  if (existing.data) return existing.data.id as string;

  const lead = await db.from("leads").insert({ organization_id: orgId, source: "website", status: "NEW" })
    .select("id").single();
  if (lead.error || !lead.data) throw new Error("lead_create_failed");

  const conv = await db.from("conversations").insert({
    organization_id: orgId, lead_id: lead.data.id, channel: "website", widget_session_id: sessionId,
  }).select("id").single();

  if (conv.error || !conv.data) {
    // Two requests raced on the same session: drop our orphan lead and use the winner's conversation.
    await db.from("leads").delete().eq("id", lead.data.id).eq("organization_id", orgId);
    const again = await find();
    if (again.data) return again.data.id as string;
    throw new Error("conversation_create_failed");
  }
  await db.from("analytics_events").insert({ organization_id: orgId, name: "lead_created", properties: { source: "website" } });
  return conv.data.id as string;
}

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}

export async function POST(req: Request) {
  const origin = req.headers.get("origin");

  let parsed;
  try {
    parsed = bodySchema.safeParse(await req.json());
  } catch {
    return reply({ error: "invalid_request" }, 400, origin);
  }
  if (!parsed.success) return reply({ error: "invalid_request" }, 400, origin);
  const { widget_id, session_id, message } = parsed.data;

  try {
    const db = adminClient();
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const [ipOk, sessionOk] = await Promise.all([
      rateLimit(db, `widget:ip:${ip}`, 60, 40),
      rateLimit(db, `widget:sid:${session_id}`, 60, 12),
    ]);
    if (!ipOk || !sessionOk) return reply({ error: "rate_limited" }, 429, origin);

    // Organization comes from the widget's public ID, never from the request body.
    const { data: widget } = await db.from("website_widgets")
      .select("organization_id,enabled,allowed_domains").eq("public_id", widget_id).maybeSingle();
    if (!widget || !widget.enabled) return reply({ error: "not_found" }, 404, origin);
    if (!originAllowed(origin, (widget.allowed_domains as string[] | null) ?? [])) {
      return reply({ error: "forbidden" }, 403, origin);
    }
    const orgId = widget.organization_id as string;

    const { data: sub } = await db.from("subscriptions").select("status,trial_ends_at")
      .eq("organization_id", orgId).maybeSingle();
    if (!subscriptionActive(sub, new Date())) return reply({ error: "unavailable" }, 402, origin);

    const conversationId = await getOrCreateConversation(db, orgId, session_id);
    const result = await runAgent(
      { organizationId: orgId, conversationId, message },
      { db, openai: getOpenAI(), logger }, // calendar + notifier plug in here in Phase 5 / 7
    );
    return reply({ reply: result.reply, paused: result.reply === null, conversation_id: conversationId }, 200, origin);
  } catch (e) {
    logger.error("widget_message_failed", { message: e instanceof Error ? e.message : "unknown" });
    return reply({ error: "server_error" }, 500, origin);
  }
}
