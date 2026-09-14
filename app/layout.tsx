import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ask Your Documents by Voice",
  description:
    "Upload an equipment manual, ask questions by voice, get a spoken answer grounded in a visible quotation and page reference.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
