import { notFound } from "next/navigation";

export const dynamicParams = false;

const PLACEHOLDER = "PLACEHOLDER: replace with text reviewed by a qualified lawyer before launch.";
const PAGES: Record<string, { title: string; body: string[] }> = {
  privacy: {
    title: "Privacy Policy",
    body: [PLACEHOLDER, "Describe what personal data Closer processes (lead contact details and conversation messages), why, how long it is kept, which providers process it (hosting, AI, messaging), and how people can exercise their rights."],
  },
  terms: {
    title: "Terms of Service",
    body: [PLACEHOLDER, "Describe the service, acceptable use, subscription and trial terms, liability and governing law."],
  },
  contact: { title: "Contact", body: ["Contact details will be added before launch."] },
};

export function generateStaticParams() {
  return Object.keys(PAGES).map((page) => ({ page }));
}

export default async function Page({ params }: { params: Promise<{ page: string }> }) {
  const { page } = await params;
  const content = PAGES[page];
  if (!content) notFound();
  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "64px 20px", lineHeight: 1.6 }}>
      <a href="/" style={{ fontWeight: 700, color: "inherit", textDecoration: "none" }}>Closer</a>
      <h1>{content.title}</h1>
      {content.body.map((t) => <p key={t}>{t}</p>)}
    </main>
  );
}
