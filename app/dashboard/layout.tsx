import type { ReactNode } from "react";
import { logout } from "@/app/auth/actions";
import { requireOrg, trialDaysLeft } from "@/lib/auth";
import Nav from "./Nav";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const { user, org, sub } = await requireOrg();
  const days = trialDaysLeft(sub);
  return (
    <div className="app">
      <aside className="side">
        <div className="logo" style={{ padding: "4px 12px" }}>Closer</div>
        <div className="org">{org.name}{days !== null && <><br />Trial: {days} {days === 1 ? "day" : "days"} left</>}</div>
        <nav aria-label="Dashboard" style={{ display: "contents" }}><Nav /></nav>
        <div className="me">
          <div className="mut" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{user.email}</div>
          <form action={logout}><button className="btn s sm" type="submit" style={{ marginTop: 8 }}>Log out</button></form>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
