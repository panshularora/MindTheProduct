import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Product Council AI · AI Executive Boardroom",
  description: "4-Stage AI Alignment Engine: Resolve PRD contradictions, debate tradeoffs, and synthesize a verified product roadmap.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" style={{ background: '#050810' }}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
      </head>
      <body style={{ background: '#050810', margin: 0, padding: 0 }}>
        {children}
      </body>
    </html>
  );
}
