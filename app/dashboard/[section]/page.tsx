import { notFound } from "next/navigation";
import { logout } from "@/app/auth/actions";
import { requireOrg } from "@/lib/auth";

const SECTIONS: Record<string, { title: string; headline: string; body: string }> = {
  inbox: { title: "Inbox", headline: "No conversations yet.", body: "Website chat conversations will appear here. The inbox with Take over is being built next." },
  leads: { title: "Leads", headline: "Lead table coming soon.", body: "The full leads table is being built. Your most recent leads are on the Overview page." },
  properties: { title: "Properties", headline: "Property management is being built.", body: "Until then, add listings in the Supabase table editor (table: properties, with your organization_id). Closer only recommends available, approved listings." },
  calendar: { title: "Calendar", headline: "Connect Google Calendar to start booking viewings automatically.", body: "Google Calendar is coming soon." },
  "ai-settings": { title: "AI Settings", headline: "Your AI employee", body: "Settings are being built. Closer currently uses the default instructions: professional, English, never invents property information." },
  billing: { title: "Billing", headline: "Billing opens soon.", body: "Your 14-day free trial is running. Plans start at €99/month when billing launches." },
  account: { title: "Account", headline: "Your account", body: "" },
};

export default async function Page({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const s = SECTIONS[section];
  if (!s) notFound();
  const { user, role } = await requireOrg();
  return (
    <>
      <h1>{s.title}</h1>
      <div className="box empty" style={{ marginTop: 20 }}>
        <p><strong>{s.headline}</strong></p>
        {section === "account" ? (
          <>
            <p className="mut">{user.email} · {role}</p>
            <form action={logout}><button className="btn s" type="submit">Log out</button></form>
          </>
        ) : <p className="mut">{s.body}</p>}
      </div>
    </>
  );
}
