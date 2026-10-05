import { readFileSync } from "node:fs";
import path from "node:path";

// Serves the approved landing page (content/landing.html) at "/". Built once at deploy time.
export const dynamic = "force-static";

export function GET() {
  const html = readFileSync(path.join(process.cwd(), "content", "landing.html"), "utf8");
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
