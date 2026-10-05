import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { guardBookingClaim } from "./agent";
import { DEFAULT_SETTINGS } from "./context";
import { BOOKING_FAILED } from "./prompts";
import {
  canScheduleFollowUp, executeTool, generateSlots, rankProperties, resolveStatus, validateToolInput,
} from "./tools";
import type { ToolContext } from "./types";

/** Records every query-builder call so we can assert organization scoping without a database. */
function fakeDb() {
  const calls: Array<[string, ...unknown[]]> = [];
  const chain: unknown = new Proxy(function () {}, {
    get(_t, prop: string) {
      if (prop === "then") return (resolve: (v: unknown) => void) => resolve({ data: [], error: null });
      return (...args: unknown[]) => {
        calls.push([prop, ...args]);
        return chain;
      };
    },
  });
  const db = { from: (table: string) => { calls.push(["from", table]); return chain; } } as unknown as SupabaseClient;
  return { db, calls };
}

function makeCtx(db: SupabaseClient): ToolContext {
  return {
    db, organizationId: "org-A", settings: DEFAULT_SETTINGS, calendar: null, notifier: null,
    conversation: { id: "c1", organization_id: "org-A", lead_id: "l1", channel: "website", status: "open", ai_enabled: true },
    lead: {
      id: "l1", name: null, email: null, phone: null, status: "NEW", budget_min: null, budget_max: null,
      preferred_location: null, property_type: null, bedrooms: null, timeline: null, financing_type: null,
    },
    state: { propertyIds: new Set(), viewingId: null, handedOff: false, calls: [] },
    now: () => new Date("2026-10-05T09:00:00Z"),
  };
}

describe("property matching", () => {
  it("ranks exact bedroom matches first, then closest to budget", () => {
    const rows = [
      { id: "a", price: 300_000, bedrooms: 3 },
      { id: "b", price: 440_000, bedrooms: 2 },
      { id: "c", price: 400_000, bedrooms: 2 },
    ];
    expect(rankProperties(rows, { budget_max: 450_000, bedrooms: 2 }).map((r) => r.id)).toEqual(["b", "c", "a"]);
  });

  it("search scopes by organization and only available, approved properties", async () => {
    const { db, calls } = fakeDb();
    const res = await executeTool(makeCtx(db), "search_properties", JSON.stringify({ location: "Milan", bedrooms: 2 }));
    expect(res.ok).toBe(true);
    expect(calls).toContainEqual(["eq", "organization_id", "org-A"]);
    expect(calls).toContainEqual(["eq", "availability_status", "available"]);
    expect(calls).toContainEqual(["eq", "approved", true]);
  });
});

describe("tool validation and organization isolation", () => {
  it("rejects a model-supplied organization_id before touching the database", async () => {
    const { db, calls } = fakeDb();
    const res = await executeTool(makeCtx(db), "search_properties", JSON.stringify({ location: "Milan", organization_id: "org-B" }));
    expect(res.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("validates inputs", () => {
    expect(validateToolInput("get_property", { property_id: "nope" })?.success).toBe(false);
    expect(validateToolInput("search_properties", { budget_max: -5 })?.success).toBe(false);
    expect(validateToolInput("update_lead", { status: "CONVERTED" })?.success).toBe(false);
    expect(validateToolInput("update_lead", { bedrooms: 2, status: "QUALIFIED" })?.success).toBe(true);
    expect(validateToolInput("unknown_tool", {})).toBeNull();
  });

  it("unknown tools fail safely", async () => {
    const { db } = fakeDb();
    expect((await executeTool(makeCtx(db), "drop_tables", "{}")).ok).toBe(false);
  });
});

describe("lead updates", () => {
  it("never lets the AI move a booked or converted lead backwards", () => {
    expect(resolveStatus("VIEWING_BOOKED", "QUALIFYING")).toBeUndefined();
    expect(resolveStatus("CONVERTED", "LOST")).toBeUndefined();
    expect(resolveStatus("NEW", "QUALIFYING")).toBe("QUALIFYING");
    expect(resolveStatus("QUALIFIED", "QUALIFIED")).toBeUndefined();
  });

  it("update_lead writes only to the conversation's lead, inside the organization", async () => {
    const { db, calls } = fakeDb();
    const res = await executeTool(makeCtx(db), "update_lead", JSON.stringify({ bedrooms: 2, budget_max: 450000 }));
    expect(res.ok).toBe(true);
    expect(calls).toContainEqual(["eq", "id", "l1"]);
    expect(calls).toContainEqual(["eq", "organization_id", "org-A"]);
  });
});

describe("booking logic", () => {
  const window = { start: new Date("2026-10-06T09:00:00Z"), end: new Date("2026-10-06T13:00:00Z") };
  const now = new Date("2026-10-05T09:00:00Z");

  it("skips busy intervals and respects duration", () => {
    const busy = [{ start: new Date("2026-10-06T10:00:00Z"), end: new Date("2026-10-06T11:00:00Z") }];
    const slots = generateSlots({ window, busy, durationMinutes: 60, now }).map((d) => d.toISOString());
    expect(slots).toEqual(["2026-10-06T09:00:00.000Z", "2026-10-06T11:00:00.000Z", "2026-10-06T11:30:00.000Z", "2026-10-06T12:00:00.000Z"]);
  });

  it("offers nothing in the past or inside the minimum notice", () => {
    const late = new Date("2026-10-06T09:30:00Z");
    const slots = generateSlots({ window, busy: [], durationMinutes: 30, now: late });
    expect(slots[0].toISOString()).toBe("2026-10-06T10:30:00.000Z");
  });

  it("book_viewing without a calendar fails instead of pretending", async () => {
    const { db } = fakeDb();
    const res = await executeTool(makeCtx(db), "book_viewing", JSON.stringify({
      property_id: "6f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e5f", start_time: "2026-10-06T10:00:00+02:00",
    }));
    expect(res).toEqual({ ok: false, error: "calendar_not_connected" });
  });

  it("blocks the AI from claiming a booking that did not happen", () => {
    expect(guardBookingClaim("Great, you're booked for Tuesday at 14:30.", false)).toBe(BOOKING_FAILED);
    expect(guardBookingClaim("Great, you're booked for Tuesday at 14:30.", true)).toContain("booked");
    expect(guardBookingClaim("Which day works best for you?", false)).toBe("Which day works best for you?");
  });
});

describe("follow-up scheduling", () => {
  const now = new Date("2026-10-05T09:00:00Z");
  const base = { existingStatuses: [] as string[], max: 2, now, enabled: true };

  it("allows a first follow-up", () => {
    expect(canScheduleFollowUp({ ...base, scheduledFor: new Date("2026-10-06T09:00:00Z") })).toBeNull();
  });
  it("blocks spam, past dates and disabled agencies", () => {
    const later = new Date("2026-10-06T09:00:00Z");
    expect(canScheduleFollowUp({ ...base, scheduledFor: later, existingStatuses: ["scheduled"] })).toBe("follow_up_already_scheduled");
    expect(canScheduleFollowUp({ ...base, scheduledFor: later, existingStatuses: ["sent", "sent"] })).toBe("max_follow_ups_reached");
    expect(canScheduleFollowUp({ ...base, scheduledFor: new Date("2026-10-04T09:00:00Z") })).toBe("scheduled_in_past");
    expect(canScheduleFollowUp({ ...base, scheduledFor: later, enabled: false })).toBe("follow_ups_disabled");
    expect(canScheduleFollowUp({ ...base, scheduledFor: new Date("2026-12-01T09:00:00Z") })).toBe("too_far_ahead");
  });
});
