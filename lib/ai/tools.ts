import { z } from "zod";
import type {
  AiSettings, Interval, LeadStatus, NotifyEvent, PropertySummary, ToolContext, ToolResult,
} from "./types";

/* ───────── helpers ───────── */
const PUBLIC_COLS = "id,title,price,currency,location,property_type,bedrooms,bathrooms,area_sqm,url";
const MIN_NOTICE_MINUTES = 60;
const MAX_FOLLOW_UP_DAYS = 30;

const ok = (data: Record<string, unknown>): ToolResult => ({ ok: true, data });
const fail = (error: string): ToolResult => ({ ok: false, error });
const likeSafe = (s: string) => s.replace(/[\\%_,()*]/g, " ").trim();
const overlaps = (a: Interval, b: Interval) => a.start < b.end && a.end > b.start;

async function notify(ctx: ToolContext, type: NotifyEvent["type"], detail: Record<string, string>) {
  try {
    await ctx.notifier?.notify({ type, organizationId: ctx.organizationId, leadId: ctx.lead.id, detail });
  } catch {
    ctx.logger?.error("notify_failed", { type });
  }
}

export function formatLocal(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone, weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(date);
}

/* ───────── pure business logic (unit-tested) ───────── */
export function rankProperties<T extends Pick<PropertySummary, "price" | "bedrooms">>(
  rows: T[],
  c: { budget_max?: number; bedrooms?: number },
): T[] {
  const score = (p: T) => {
    const beds = c.bedrooms !== undefined && p.bedrooms !== null ? Math.abs(p.bedrooms - c.bedrooms) : 0;
    const gap =
      c.budget_max !== undefined && p.price !== null ? Math.abs(c.budget_max - p.price) / c.budget_max : 0;
    return beds * 10 + gap;
  };
  return [...rows].sort((a, b) => score(a) - score(b));
}

export function generateSlots(opts: {
  window: Interval; busy: Interval[]; durationMinutes: number; now: Date; stepMinutes?: number;
}): Date[] {
  const { window, busy, durationMinutes, now, stepMinutes = 30 } = opts;
  const dur = durationMinutes * 60_000;
  const earliest = now.getTime() + MIN_NOTICE_MINUTES * 60_000;
  const out: Date[] = [];
  for (let t = window.start.getTime(); t + dur <= window.end.getTime(); t += stepMinutes * 60_000) {
    if (t < earliest) continue;
    const slot = { start: new Date(t), end: new Date(t + dur) };
    if (!busy.some((b) => overlaps(slot, b))) out.push(slot.start);
  }
  return out;
}

export function spreadSlots(slots: Date[], n: number): Date[] {
  if (slots.length <= n) return slots;
  return Array.from({ length: n }, (_, i) => slots[Math.round((i * (slots.length - 1)) / (n - 1))]);
}

/** The AI may move a lead through the funnel, but never past what only booking or humans can set. */
export function resolveStatus(current: LeadStatus, requested?: LeadStatus): LeadStatus | undefined {
  if (!requested || requested === current) return undefined;
  if (current === "VIEWING_BOOKED" || current === "CONVERTED") return undefined;
  return requested;
}

export function canScheduleFollowUp(opts: {
  existingStatuses: string[]; max: number; scheduledFor: Date; now: Date; enabled: boolean;
}): string | null {
  const { existingStatuses, max, scheduledFor, now, enabled } = opts;
  if (!enabled) return "follow_ups_disabled";
  if (scheduledFor <= now) return "scheduled_in_past";
  if (scheduledFor.getTime() - now.getTime() > MAX_FOLLOW_UP_DAYS * 86_400_000) return "too_far_ahead";
  if (existingStatuses.includes("scheduled")) return "follow_up_already_scheduled";
  if (existingStatuses.filter((s) => s === "sent").length >= max) return "max_follow_ups_reached";
  return null;
}

/* ───────── schemas (Zod is the source of truth) ───────── */
const requirements = {
  budget_min: z.number().nonnegative().optional(),
  budget_max: z.number().positive().optional(),
  preferred_location: z.string().trim().min(2).max(80).optional(),
  property_type: z.string().trim().min(2).max(40).optional(),
  bedrooms: z.number().int().min(0).max(20).optional(),
  timeline: z.string().trim().min(2).max(100).optional(),
  financing_type: z.string().trim().min(2).max(60).optional(),
};
const contact = {
  name: z.string().trim().min(1).max(100).optional(),
  email: z.string().trim().email().max(254).toLowerCase().optional(),
  phone: z.string().trim().regex(/^\+?[0-9 ()-]{6,20}$/).optional(),
};
const AI_STATUSES = ["NEW", "QUALIFYING", "QUALIFIED", "FOLLOW_UP", "LOST"] as const;
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const isoTime = z.string().datetime({ offset: true });

/* ───────── tool plumbing ───────── */
interface Tool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  schema: z.ZodTypeAny;
  execute(ctx: ToolContext, raw: unknown): Promise<ToolResult>;
}

function defineTool<S extends z.ZodTypeAny>(d: {
  name: string; description: string; parameters: Record<string, unknown>; schema: S;
  run(ctx: ToolContext, input: z.infer<S>): Promise<ToolResult>;
}): Tool {
  return {
    name: d.name, description: d.description, parameters: d.parameters, schema: d.schema,
    async execute(ctx, raw) {
      const parsed = d.schema.safeParse(raw);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        return fail(`invalid_input: ${issue?.path.join(".") || "input"} ${issue?.message ?? ""}`.trim());
      }
      return d.run(ctx, parsed.data);
    },
  };
}

const t = (type: string, description: string) => ({ type, description });
const obj = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: "object", properties, required, additionalProperties: false,
});
const REQ_PROPS = {
  budget_min: t("number", "Minimum budget"), budget_max: t("number", "Maximum budget"),
  preferred_location: t("string", "City or area"), property_type: t("string", "e.g. apartment, house"),
  bedrooms: t("integer", "Number of bedrooms"), timeline: t("string", "When they want to move or buy"),
  financing_type: t("string", "e.g. mortgage, cash"),
};
const CONTACT_PROPS = { name: t("string", "Full name"), email: t("string", "Email"), phone: t("string", "Phone") };

/* ───────── the tools ───────── */
export const TOOLS: Record<string, Tool> = {};
const register = (tool: Tool) => { TOOLS[tool.name] = tool; };

register(defineTool({
  name: "search_properties",
  description: "Search available, approved properties in this agency's database.",
  parameters: obj({
    budget_min: t("number", "Minimum price"), budget_max: t("number", "Maximum price"),
    location: t("string", "City or area"), property_type: t("string", "e.g. apartment"),
    bedrooms: t("integer", "Minimum bedrooms"),
  }),
  schema: z.object({
    budget_min: z.number().nonnegative().optional(), budget_max: z.number().positive().optional(),
    location: z.string().trim().min(2).max(80).optional(),
    property_type: z.string().trim().min(2).max(40).optional(),
    bedrooms: z.number().int().min(0).max(20).optional(),
  }).strict(),
  async run(ctx, i) {
    let q = ctx.db.from("properties").select(PUBLIC_COLS)
      .eq("organization_id", ctx.organizationId)
      .eq("availability_status", "available")
      .eq("approved", true);
    if (i.budget_max !== undefined) q = q.lte("price", i.budget_max);
    if (i.budget_min !== undefined) q = q.gte("price", i.budget_min);
    if (i.location) q = q.ilike("location", `%${likeSafe(i.location)}%`);
    if (i.property_type) q = q.ilike("property_type", `%${likeSafe(i.property_type)}%`);
    if (i.bedrooms !== undefined) q = q.gte("bedrooms", i.bedrooms);
    const { data, error } = await q.limit(50);
    if (error) return fail("search_failed");
    const ranked = rankProperties((data ?? []) as PropertySummary[], i).slice(0, 5);
    ranked.forEach((p) => ctx.state.propertyIds.add(p.id));
    return ok({ count: ranked.length, properties: ranked });
  },
}));

register(defineTool({
  name: "get_property",
  description: "Get full details of one property by id.",
  parameters: obj({ property_id: t("string", "Property UUID from search_properties") }, ["property_id"]),
  schema: z.object({ property_id: z.string().uuid() }).strict(),
  async run(ctx, i) {
    const { data, error } = await ctx.db.from("properties")
      .select(`${PUBLIC_COLS},description,address,availability_status,photos`)
      .eq("id", i.property_id).eq("organization_id", ctx.organizationId).eq("approved", true)
      .maybeSingle();
    if (error) return fail("lookup_failed");
    if (!data) return fail("property_not_found");
    ctx.state.propertyIds.add(data.id);
    const photos = Array.isArray(data.photos) ? data.photos.slice(0, 3) : [];
    return ok({ property: { ...data, photos } });
  },
}));

async function applyLeadFields(ctx: ToolContext, fields: Record<string, unknown>, status?: LeadStatus) {
  const update = { ...fields, ...(status ? { status } : {}), last_activity_at: ctx.now().toISOString() };
  const { error } = await ctx.db.from("leads").update(update)
    .eq("id", ctx.lead.id).eq("organization_id", ctx.organizationId);
  if (error) return fail(error.code === "23505" ? "duplicate_contact" : "update_failed");
  Object.assign(ctx.lead, fields);
  if (status) ctx.lead.status = status;
  return ok({ updated: Object.keys(fields) });
}

register(defineTool({
  name: "create_lead",
  description: "Save the customer's contact details and requirements on their lead record.",
  parameters: obj({ ...CONTACT_PROPS, ...REQ_PROPS }),
  schema: z.object({ ...contact, ...requirements }).strict(),
  async run(ctx, i) {
    const fields = Object.fromEntries(Object.entries(i).filter(([, v]) => v !== undefined));
    if (!Object.keys(fields).length) return fail("invalid_input: no fields");
    return applyLeadFields(ctx, fields, resolveStatus(ctx.lead.status, ctx.lead.status === "NEW" ? "QUALIFYING" : undefined));
  },
}));

register(defineTool({
  name: "update_lead",
  description: "Update the customer's lead record as you learn more.",
  parameters: obj({
    ...CONTACT_PROPS, ...REQ_PROPS, notes: t("string", "Short internal note"),
    status: { type: "string", enum: [...AI_STATUSES], description: "Funnel status" },
  }),
  schema: z.object({
    ...contact, ...requirements,
    notes: z.string().trim().max(1000).optional(),
    status: z.enum(AI_STATUSES).optional(),
  }).strict(),
  async run(ctx, i) {
    const { status, ...rest } = i;
    const fields = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
    const next = resolveStatus(ctx.lead.status, status);
    if (!Object.keys(fields).length && !next) return fail("invalid_input: no fields");
    const result = await applyLeadFields(ctx, fields, next);
    if (result.ok && next === "QUALIFIED") {
      await notify(ctx, "qualified_lead", { lead: ctx.lead.name ?? "Unknown", location: ctx.lead.preferred_location ?? "-" });
    }
    return result;
  },
}));

register(defineTool({
  name: "check_availability",
  description: "List open viewing times on a given day.",
  parameters: obj({
    date: t("string", "YYYY-MM-DD"), duration_minutes: t("integer", "Viewing length, default 45"),
  }, ["date"]),
  schema: z.object({ date: isoDate, duration_minutes: z.number().int().min(15).max(180).default(45) }).strict(),
  async run(ctx, i) {
    if (!ctx.calendar) return fail("calendar_not_connected");
    try {
      const window = ctx.calendar.getWorkingWindow(i.date);
      const busy = await ctx.calendar.listBusy(window);
      const slots = spreadSlots(
        generateSlots({ window, busy, durationMinutes: i.duration_minutes, now: ctx.now() }), 4,
      );
      const tz = ctx.calendar.timeZone;
      return ok({
        date: i.date,
        slots: slots.map((s) => ({ start_time: s.toISOString(), label: formatLocal(s, tz) })),
      });
    } catch {
      return fail("calendar_unavailable");
    }
  },
}));

register(defineTool({
  name: "book_viewing",
  description: "Book a viewing. Only call after the customer chose a time offered by check_availability.",
  parameters: obj({
    property_id: t("string", "Property UUID"), start_time: t("string", "ISO 8601 with offset"),
    duration_minutes: t("integer", "Default 45"),
  }, ["property_id", "start_time"]),
  schema: z.object({
    property_id: z.string().uuid(), start_time: isoTime,
    duration_minutes: z.number().int().min(15).max(180).default(45),
  }).strict(),
  async run(ctx, i) {
    const cal = ctx.calendar;
    if (!cal) return fail("calendar_not_connected");
    const start = new Date(i.start_time);
    const end = new Date(start.getTime() + i.duration_minutes * 60_000);
    if (start.getTime() < ctx.now().getTime()) return fail("start_in_past");

    const { data: prop } = await ctx.db.from("properties").select("id,title,availability_status")
      .eq("id", i.property_id).eq("organization_id", ctx.organizationId).eq("approved", true).maybeSingle();
    if (!prop || prop.availability_status !== "available") return fail("property_unavailable");

    let eventId: string | null = null;
    let viewingId: string | null = null;
    try {
      const busy = await cal.listBusy({ start, end });
      if (busy.some((b) => overlaps({ start, end }, b))) return fail("slot_taken");

      // The DB row goes first: the unique index (property_id, start_time) is the double-booking lock.
      const ins = await ctx.db.from("viewings").insert({
        organization_id: ctx.organizationId, lead_id: ctx.lead.id, property_id: prop.id,
        start_time: start.toISOString(), end_time: end.toISOString(), status: "scheduled",
      }).select("id").single();
      if (ins.error || !ins.data) return fail(ins.error?.code === "23505" ? "slot_taken" : "booking_failed");
      viewingId = ins.data.id;

      const { data: lead } = await ctx.db.from("leads")
        .select("name,email,phone,budget_min,budget_max,preferred_location,property_type,bedrooms")
        .eq("id", ctx.lead.id).eq("organization_id", ctx.organizationId).maybeSingle();
      const l = lead ?? ctx.lead;
      const event = await cal.createEvent({
        title: `Viewing — ${prop.title} — ${l.name ?? "Lead"}`,
        description: [
          `Lead: ${l.name ?? "-"}`,
          `Budget: ${l.budget_min ?? "-"} – ${l.budget_max ?? "-"}`,
          `Requirements: ${[l.property_type, l.bedrooms !== null ? `${l.bedrooms} bd` : null, l.preferred_location].filter(Boolean).join(", ") || "-"}`,
          `Phone: ${l.phone ?? "-"}`,
          `Email: ${l.email ?? "-"}`,
        ].join("\n"),
        start, end,
      });
      eventId = event.id;

      const upd = await ctx.db.from("viewings").update({ calendar_event_id: eventId })
        .eq("id", viewingId).eq("organization_id", ctx.organizationId);
      if (upd.error) throw new Error("viewing_update_failed");
      await applyLeadFields(ctx, {}, "VIEWING_BOOKED");
    } catch (e) {
      ctx.logger?.error("book_viewing_failed", { message: e instanceof Error ? e.message : "unknown" });
      if (eventId) await cal.cancelEvent(eventId).catch(() => undefined);
      if (viewingId) {
        await ctx.db.from("viewings").delete().eq("id", viewingId).eq("organization_id", ctx.organizationId);
      }
      return fail("booking_failed");
    }

    ctx.state.viewingId = viewingId;
    const label = formatLocal(start, cal.timeZone);
    await notify(ctx, "viewing_booked", { property: prop.title, when: label, lead: ctx.lead.name ?? "Unknown" });
    return ok({ booked: true, viewing_id: viewingId, property: prop.title, start_time: start.toISOString(), label });
  },
}));

register(defineTool({
  name: "create_follow_up",
  description: "Schedule one polite follow-up message for a customer who went quiet.",
  parameters: obj({
    message: t("string", "Message to send, max 500 chars"), scheduled_for: t("string", "ISO 8601 with offset"),
  }, ["message", "scheduled_for"]),
  schema: z.object({ message: z.string().trim().min(5).max(500), scheduled_for: isoTime }).strict(),
  async run(ctx, i) {
    const { data, error } = await ctx.db.from("follow_ups").select("status")
      .eq("organization_id", ctx.organizationId).eq("lead_id", ctx.lead.id).in("status", ["scheduled", "sent"]);
    if (error) return fail("follow_up_failed");
    const reason = canScheduleFollowUp({
      existingStatuses: (data ?? []).map((r: { status: string }) => r.status),
      max: ctx.settings.follow_up_max_count, scheduledFor: new Date(i.scheduled_for),
      now: ctx.now(), enabled: ctx.settings.follow_up_enabled,
    });
    if (reason) return fail(reason);
    const ins = await ctx.db.from("follow_ups").insert({
      organization_id: ctx.organizationId, lead_id: ctx.lead.id, conversation_id: ctx.conversation.id,
      scheduled_for: i.scheduled_for, message: i.message, status: "scheduled",
    });
    return ins.error ? fail("follow_up_failed") : ok({ scheduled: true });
  },
}));

register(defineTool({
  name: "handoff_to_human",
  description: "Pause the AI and ask a human agent to take over this conversation.",
  parameters: obj({ reason: t("string", "Why a human is needed") }, ["reason"]),
  schema: z.object({ reason: z.string().trim().min(3).max(300) }).strict(),
  async run(ctx, i) {
    if (!ctx.settings.human_handoff_enabled) return fail("handoff_disabled");
    const { error } = await ctx.db.from("conversations")
      .update({ ai_enabled: false, handoff_requested: true })
      .eq("id", ctx.conversation.id).eq("organization_id", ctx.organizationId);
    if (error) return fail("handoff_failed");
    await ctx.db.from("messages").insert({
      organization_id: ctx.organizationId, conversation_id: ctx.conversation.id,
      sender_type: "system", content: "Human handoff requested.", metadata: { reason: i.reason },
    });
    ctx.state.handedOff = true;
    await notify(ctx, "handoff", { reason: i.reason, lead: ctx.lead.name ?? "Unknown" });
    return ok({ handed_off: true });
  },
}));

/* ───────── public API ───────── */
export function getToolDefinitions(settings: Pick<AiSettings, "human_handoff_enabled">) {
  return Object.values(TOOLS)
    .filter((tool) => tool.name !== "handoff_to_human" || settings.human_handoff_enabled)
    .map((tool) => ({
      type: "function" as const,
      function: { name: tool.name, description: tool.description, parameters: tool.parameters },
    }));
}

export function validateToolInput(name: string, raw: unknown) {
  const tool = TOOLS[name];
  return tool ? tool.schema.safeParse(raw) : null;
}

/** Never throws, never leaks raw DB errors to the model or customer. organizationId always comes from ctx. */
export async function executeTool(ctx: ToolContext, name: string, rawArgs: string): Promise<ToolResult> {
  const tool = TOOLS[name];
  let result: ToolResult;
  if (!tool || (name === "handoff_to_human" && !ctx.settings.human_handoff_enabled)) {
    result = fail("unknown_tool");
  } else {
    try {
      result = await tool.execute(ctx, rawArgs ? JSON.parse(rawArgs) : {});
    } catch (e) {
      ctx.logger?.error("tool_failed", { tool: name, message: e instanceof Error ? e.message : "unknown" });
      result = fail("internal_error");
    }
  }
  ctx.state.calls.push({ name, ok: result.ok });
  return result;
}
