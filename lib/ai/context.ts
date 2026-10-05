import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentContext, AiSettings, Conversation, Lead, Organization, StoredMessage } from "./types";

export const HISTORY_LIMIT = 30;

export class AgentError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export const DEFAULT_SETTINGS: AiSettings = {
  enabled: true,
  company_name: null,
  tone: "professional",
  languages: ["English"],
  qualification_fields: ["budget", "location", "property_type", "bedrooms"],
  human_handoff_enabled: true,
  follow_up_enabled: true,
  follow_up_delay_hours: 24,
  follow_up_max_count: 2,
  instructions:
    "Always be professional and helpful. Never invent property information. Only use information available in the property database. If you don't know the answer, tell the customer that an agent can confirm it. Your goal is to qualify the lead and help book a property viewing.",
};

const SETTINGS_COLS =
  "enabled,company_name,tone,languages,qualification_fields,human_handoff_enabled,follow_up_enabled,follow_up_delay_hours,follow_up_max_count,instructions";
const LEAD_COLS =
  "id,name,email,phone,status,budget_min,budget_max,preferred_location,property_type,bedrooms,timeline,financing_type";

/**
 * Every query is filtered by organizationId, which comes from the server
 * (webhook / widget lookup), never from the model or the browser.
 */
export async function loadContext(
  db: SupabaseClient,
  organizationId: string,
  conversationId: string,
): Promise<AgentContext> {
  const { data: conv } = await db
    .from("conversations")
    .select("id,organization_id,lead_id,channel,status,ai_enabled")
    .eq("id", conversationId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!conv) throw new AgentError("conversation_not_found");

  const [org, settings, lead, history] = await Promise.all([
    db.from("organizations").select("id,name,website").eq("id", organizationId).maybeSingle(),
    db.from("ai_settings").select(SETTINGS_COLS).eq("organization_id", organizationId).maybeSingle(),
    db.from("leads").select(LEAD_COLS).eq("id", conv.lead_id).eq("organization_id", organizationId).maybeSingle(),
    db
      .from("messages")
      .select("sender_type,content")
      .eq("organization_id", organizationId)
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT),
  ]);
  if (!org.data || !lead.data) throw new AgentError("context_not_found");

  return {
    organization: org.data as Organization,
    settings: { ...DEFAULT_SETTINGS, ...(settings.data ?? {}) } as AiSettings,
    conversation: conv as Conversation,
    lead: lead.data as Lead,
    history: ((history.data ?? []) as StoredMessage[]).reverse(),
  };
}
