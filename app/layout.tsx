import type { Metadata } from "next";
import localFont from "next/font/local";
import Script from "next/script";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Product Council AI",
  description: "AI-Powered Decision Pipeline for Product Alignment",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
        
        {/* Novus.ai Tracking Snippet */}
        <Script
          id="novus-tracker"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              (function(n,o,v,u,s){
                n[u]=n[u]||function(){(n[u].q=n[u].q||[]).push(arguments)};
                s=o.createElement(v);s.async=1;s.src="https://cdn.novus.ai/tracker.js";
                var a=o.getElementsByTagName(v)[0];a.parentNode.insertBefore(s,a);
              })(window,document,"script","novus");
              // Initialize tracking. If you have an account or write-key, replace 'YOUR_WRITE_KEY' below:
              novus("init", "YOUR_WRITE_KEY");
              novus("track", "pageview");
            `,
          }}
        />
      </body>
    </html>
  );
}
