import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Closer — Your AI Sales Employee for Real Estate",
  description:
    "Closer responds to real-estate leads, qualifies prospects, recommends properties and books viewings automatically.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
