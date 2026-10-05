import type { SupabaseClient } from "@supabase/supabase-js";
import type OpenAI from "openai";

export type Channel = "website" | "whatsapp";
export type SenderType = "customer" | "ai" | "human" | "system";
export type LeadStatus =
  | "NEW" | "QUALIFYING" | "QUALIFIED" | "VIEWING_BOOKED" | "FOLLOW_UP" | "CONVERTED" | "LOST";

export interface Organization { id: string; name: string; website: string | null }

export interface AiSettings {
  enabled: boolean;
  company_name: string | null;
  tone: "professional" | "friendly" | "concise";
  languages: string[];
  qualification_fields: string[];
  human_handoff_enabled: boolean;
  follow_up_enabled: boolean;
  follow_up_delay_hours: number;
  follow_up_max_count: number;
  instructions: string;
}

export interface Lead {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  status: LeadStatus;
  budget_min: number | null;
  budget_max: number | null;
  preferred_location: string | null;
  property_type: string | null;
  bedrooms: number | null;
  timeline: string | null;
  financing_type: string | null;
}

export interface Conversation {
  id: string;
  organization_id: string;
  lead_id: string;
  channel: Channel;
  status: "open" | "closed";
  ai_enabled: boolean;
}

export interface StoredMessage { sender_type: SenderType; content: string }

export interface AgentContext {
  organization: Organization;
  settings: AiSettings;
  conversation: Conversation;
  lead: Lead;
  history: StoredMessage[];
}

export interface PropertySummary {
  id: string;
  title: string;
  price: number | null;
  currency: string;
  location: string | null;
  property_type: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  area_sqm: number | null;
  url: string | null;
}

export interface Interval { start: Date; end: Date }

/** Implemented in Phase 5 (Google Calendar). Tools never talk to Google directly. */
export interface CalendarService {
  timeZone: string;
  getWorkingWindow(date: string): Interval;
  listBusy(range: Interval): Promise<Interval[]>;
  createEvent(input: { title: string; description: string; start: Date; end: Date }): Promise<{ id: string }>;
  cancelEvent(eventId: string): Promise<void>;
}

export interface NotifyEvent {
  type: "qualified_lead" | "viewing_booked" | "handoff";
  organizationId: string;
  leadId: string;
  detail: Record<string, string>;
}
export interface Notifier { notify(event: NotifyEvent): Promise<void> }

export interface Logger {
  info(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

export interface ToolState {
  propertyIds: Set<string>;
  viewingId: string | null;
  handedOff: boolean;
  calls: Array<{ name: string; ok: boolean }>;
}

export interface ToolContext {
  db: SupabaseClient;
  organizationId: string;
  conversation: Conversation;
  lead: Lead;
  settings: AiSettings;
  calendar: CalendarService | null;
  notifier: Notifier | null;
  logger?: Logger;
  state: ToolState;
  now: () => Date;
}

export type ToolResult = { ok: true; data: Record<string, unknown> } | { ok: false; error: string };

export interface AgentInput { organizationId: string; conversationId: string; message: string }

export interface AgentResult {
  reply: string | null;
  skipped?: "ai_disabled";
  conversationId: string;
  handedOff: boolean;
  viewingId: string | null;
  propertyIds: string[];
}

export interface AgentDeps {
  db: SupabaseClient;
  openai: OpenAI;
  calendar?: CalendarService | null;
  notifier?: Notifier;
  logger?: Logger;
  model?: string;
  now?: () => Date;
}
