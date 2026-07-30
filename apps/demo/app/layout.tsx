import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { TopNav } from "@/components/TopNav";
import { ChainGuard } from "@/components/ChainGuard";

export const metadata: Metadata = {
  title: "Bleu ENS Marketplace — PoC Demo",
  description: "ENS DAO SPP3 Marketplace RFP proof-of-concept demo",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <Providers>
          <TopNav />
          <div className="px-4 pt-4 lg:px-8">
            <ChainGuard />
          </div>
          {children}
        </Providers>
      </body>
    </html>
  );
}
