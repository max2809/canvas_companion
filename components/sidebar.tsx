"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, BookOpen, Settings } from "lucide-react";

const nav = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Courses", href: "/courses", icon: BookOpen },
  { label: "Settings", href: "/settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <header className="h-20 shrink-0 border-b border-border bg-sidebar flex items-center px-4 gap-8 sticky top-0 z-50">
      {/* Logo */}
      <div className="flex items-center gap-2.5 mr-4">
        <img src="/logo.png" alt="Erasmus AI Society" className="size-16 shrink-0 object-contain" />
        <span className="text-[22px] font-medium gradient-text tracking-tight whitespace-nowrap ml-3">
          Canvas Companion
        </span>
      </div>

      {/* Nav */}
      <nav className="flex items-center gap-4 flex-1">
        {nav.map(({ label, href, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`btn-brand flex items-center gap-3 px-6 py-3 rounded-xl text-[16px] font-medium transition-all duration-150 ${
                active
                  ? "text-white shadow-sm"
                  : "text-foreground/80 hover:text-white"
              }`}
              style={
                active
                  ? {
                      background:
                        "linear-gradient(135deg, rgba(30,200,232,0.18) 0%, rgba(147,51,234,0.25) 100%)",
                    }
                  : {}
              }
            >
              <Icon
                size={18}
                style={active ? { color: "#1ec8e8" } : { opacity: 0.8 }}
              />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Footer label */}
      <p className="text-[10px] font-medium uppercase tracking-widest ml-auto" style={{ color: "oklch(0.40 0.025 264)" }}>
        EUR · Canvas AI
      </p>
    </header>
  );
}
