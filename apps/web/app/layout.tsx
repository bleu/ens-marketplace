import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { TopNav } from "@/components/TopNav";
import { ChainGuard } from "@/components/ChainGuard";

export const metadata: Metadata = {
  /// Without this, Next resolves `og:image` against `http://localhost:3000`, so the
  /// Discourse link preview the OG image exists for would fetch nothing. Set
  /// NEXT_PUBLIC_SITE_URL to the deployed origin before sharing any link.
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: "Farol — ENS Marketplace",
  description: "Non-custodial ENS marketplace. Forkable by design.",
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
