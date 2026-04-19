import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/sidebar";
import { SyncIndicator } from "@/components/sync-indicator";
import { CourseSetupOverlay } from "@/components/course-setup-overlay";

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
      <body className={`${inter.className} h-full flex flex-col bg-background text-foreground antialiased`}>
        <Sidebar />
        <div className="flex justify-end px-8 py-2 border-b border-border bg-background/60 backdrop-blur-sm">
          <SyncIndicator />
        </div>
        <main className="flex-1 overflow-y-auto px-8 py-6">{children}</main>
        <CourseSetupOverlay />
      </body>
    </html>
  );
}
