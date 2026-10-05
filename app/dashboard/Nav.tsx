"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS: Array<[string, string]> = [
  ["Overview", "/dashboard"], ["Inbox", "/dashboard/inbox"], ["Leads", "/dashboard/leads"],
  ["Properties", "/dashboard/properties"], ["Calendar", "/dashboard/calendar"],
  ["AI Settings", "/dashboard/ai-settings"], ["Integrations", "/dashboard/integrations"],
  ["Billing", "/dashboard/billing"], ["Account", "/dashboard/account"],
];

export default function Nav() {
  const path = usePathname();
  return (
    <>
      {ITEMS.map(([label, href]) => (
        <Link key={href} href={href} className={path === href ? "nav on" : "nav"} aria-current={path === href ? "page" : undefined}>
          {label}
        </Link>
      ))}
    </>
  );
}
