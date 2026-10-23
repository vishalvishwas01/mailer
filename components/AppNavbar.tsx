"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import LogoutButton from "@/components/LogoutButton";

const links = [
  { href: "/", label: "Overview" },
  { href: "/contacts", label: "Contacts" },
  { href: "/email-drafts", label: "Email drafts" },
  { href: "/contacts?view=queue", label: "Queue" },
  { href: "/email-sends", label: "Send history" },
  { href: "/replies", label: "Replies" },
  { href: "/schedule", label: "Schedule" },
  { href: "/settings", label: "AI & templates" },
];

export default function AppNavbar() {
  const pathname = usePathname();
  const [queueActive, setQueueActive] = useState(false);

  useEffect(() => {
    const updateQueueActive = () => setQueueActive(window.location.search.includes("view=queue"));
    updateQueueActive();
    window.addEventListener("popstate", updateQueueActive);
    return () => window.removeEventListener("popstate", updateQueueActive);
  }, [pathname]);
  if (pathname === "/login") return null;

  return (
    <div className="sticky top-0 z-40 border-b border-zinc-200 bg-white/95 shadow-sm backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-5 px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/" className="shrink-0 text-lg font-extrabold tracking-tight text-indigo-700">Mailer<span className="text-zinc-900">.</span></Link>
        <nav aria-label="Main navigation" className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto whitespace-nowrap py-1">
          {links.map((item) => {
            const href = item.href.split("?")[0];
            const isQueue = item.href.includes("view=queue");
            const active = isQueue
              ? pathname === "/contacts" && queueActive
              : item.href === "/"
                ? pathname === "/"
                : pathname === href || pathname.startsWith(href + "/");
            return (
              <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={"rounded-lg px-3 py-2 text-sm font-semibold transition-colors " + (active ? "bg-indigo-50 text-indigo-700" : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950")}>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <LogoutButton />
      </div>
    </div>
  );
}
