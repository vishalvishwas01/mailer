"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

export default function LogoutButton() {
  const pathname = usePathname();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  if (pathname === "/login") return null;

  async function logout() {
    setLoading(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.replace("/login");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={logout}
      disabled={loading}
      className="fixed right-4 top-4 z-50 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 disabled:opacity-60"
    >
      {loading ? "Signing out…" : "Sign out"}
    </button>
  );
}
