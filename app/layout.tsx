import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/sidebar";
import { SyncIndicator } from "@/components/sync-indicator";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Canvas Companion",
  description: "EUR Canvas companion app",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark h-full">
      <body className={`${inter.className} h-full flex bg-background text-foreground antialiased`}>
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex justify-end px-8 py-2 border-b border-border">
            <SyncIndicator />
          </div>
          <main className="flex-1 overflow-y-auto px-8 py-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
