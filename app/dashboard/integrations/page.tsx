import { requireOrg } from "@/lib/auth";

export const metadata = { title: "Integrations — Closer" };

export default async function Page() {
  const { supabase, org } = await requireOrg();
  const { data: widget } = await supabase.from("website_widgets").select("public_id,enabled")
    .eq("organization_id", org.id).maybeSingle();
  const base = process.env.NEXT_PUBLIC_APP_URL || "https://YOUR_APP_URL";
  const snippet = `<script src="${base}/widget.js" data-closer-id="${widget?.public_id ?? "PUBLIC_WIDGET_ID"}"></script>`;
  const soon: Array<[string, string]> = [
    ["WhatsApp", "Reply to buyers on WhatsApp."], ["Google Calendar", "Book viewings into your calendar."], ["Stripe", "Plans and billing."],
  ];
  return (
    <>
      <h1>Integrations</h1>
      <p className="mut" style={{ marginBottom: 20 }}>Connect the channels Closer answers on.</p>
      <div className="box" style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: 17, margin: "0 0 4px" }}>Website chat <span className="badge">Ready to install</span></h2>
        <p className="mut">Paste this before the closing &lt;/body&gt; tag on your website.</p>
        <pre>{snippet}</pre>
      </div>
      <div className="metrics" style={{ margin: 0 }}>
        {soon.map(([t, d]) => (
          <div key={t} className="box"><h2 style={{ fontSize: 17, margin: "0 0 4px" }}>{t} <span className="badge">Coming soon</span></h2><p className="mut" style={{ margin: 0 }}>{d}</p></div>
        ))}
      </div>
    </>
  );
}
