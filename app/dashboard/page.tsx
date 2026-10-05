import Link from "next/link";
import { requireOrg } from "@/lib/auth";

export const metadata = { title: "Overview — Closer" };

const RANGES: Record<string, { label: string; days: number }> = {
  today: { label: "Today", days: 0 }, "7": { label: "7 days", days: 7 }, "30": { label: "30 days", days: 30 },
};
const STATUS: Record<string, string> = {
  NEW: "New", QUALIFYING: "Qualifying", QUALIFIED: "Qualified", VIEWING_BOOKED: "Viewing booked",
  FOLLOW_UP: "Follow-up", CONVERTED: "Converted", LOST: "Lost",
};
interface LeadRow {
  id: string; name: string | null; status: string; budget_max: number | null; preferred_location: string | null;
  property_type: string | null; bedrooms: number | null; last_activity_at: string;
}

export default async function Page({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const { range } = await searchParams;
  const key = range && range in RANGES ? range : "7";
  const since = new Date();
  if (key === "today") since.setUTCHours(0, 0, 0, 0);
  else since.setUTCDate(since.getUTCDate() - RANGES[key].days);

  const { supabase, user, org } = await requireOrg();
  const leads = () => supabase.from("leads").select("id", { count: "exact", head: true })
    .eq("organization_id", org.id).gte("created_at", since.toISOString());
  const [received, qualified, viewings, recent] = await Promise.all([
    leads(),
    leads().in("status", ["QUALIFIED", "VIEWING_BOOKED", "CONVERTED"]),
    supabase.from("viewings").select("id", { count: "exact", head: true })
      .eq("organization_id", org.id).neq("status", "cancelled").gte("created_at", since.toISOString()),
    supabase.from("leads").select("id,name,status,budget_max,preferred_location,property_type,bedrooms,last_activity_at")
      .eq("organization_id", org.id).order("last_activity_at", { ascending: false }).limit(8),
  ]);

  const n = received.count ?? 0, v = viewings.count ?? 0;
  const metrics: Array<[string, string]> = [
    ["New leads", String(n)], ["Qualified", String(qualified.count ?? 0)],
    ["Viewings booked", String(v)], ["Conversion rate", n ? `${Math.round((v / n) * 100)}%` : "–"],
  ];
  const rows = (recent.data ?? []) as LeadRow[];
  const name = (user.user_metadata?.full_name as string | undefined)?.split(" ")[0] || user.email?.split("@")[0];
  const req = (l: LeadRow) =>
    [l.property_type, l.bedrooms !== null ? `${l.bedrooms} bd` : null, l.preferred_location,
      l.budget_max ? `up to €${Number(l.budget_max).toLocaleString("en-GB")}` : null].filter(Boolean).join(" · ") || "Not yet known";

  return (
    <>
      <h1>Welcome back, {name}</h1>
      <p className="mut">Here’s what Closer has been doing for you.</p>
      <div className="tabs" role="group" aria-label="Date range">
        {Object.entries(RANGES).map(([k, r]) => (
          <Link key={k} href={`/dashboard?range=${k}`} className={k === key ? "btn sm" : "btn s sm"} aria-current={k === key ? "true" : undefined}>{r.label}</Link>
        ))}
      </div>
      <div className="metrics">
        {metrics.map(([label, value]) => (
          <div key={label} className="box metric"><div className="mut">{label}</div><div className="n">{value}</div></div>
        ))}
      </div>
      <div className="box">
        <h2 style={{ fontSize: 17, margin: "0 0 8px" }}>Recent leads</h2>
        {rows.length === 0 ? (
          <div className="empty">
            <p><strong>No leads yet.</strong></p>
            <p className="mut">Once Closer receives your first lead, you’ll see it here.</p>
            <Link className="btn" href="/dashboard/integrations">Connect website</Link>
          </div>
        ) : (
          <div className="tbl"><table>
            <thead><tr><th>Name</th><th>Requirements</th><th>Status</th><th>Last activity</th></tr></thead>
            <tbody>{rows.map((l) => (
              <tr key={l.id}>
                <td>{l.name ?? "Unknown visitor"}</td><td>{req(l)}</td>
                <td><span className="badge">{STATUS[l.status] ?? l.status}</span></td>
                <td className="mut">{new Date(l.last_activity_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
    </>
  );
}
