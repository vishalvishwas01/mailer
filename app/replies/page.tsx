"use client";

import { useEffect, useState } from "react";

type ReplyItem = {
  _id: string;
  fromEmail: string;
  toEmail?: string;
  subject?: string;
  snippet: string;
  receivedAt: string;
  gmailThreadId: string;
};

export default function RepliesPage() {
  const [replies, setReplies] = useState<ReplyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadReplies() {
      try {
        const response = await fetch("/api/replies?limit=100", { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load replies.");
        if (!cancelled) setReplies(data.replies ?? []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unable to load replies.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadReplies();
    return () => { cancelled = true; };
  }, []);

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-5 py-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-zinc-500">MAILER</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Replies</h1>
          <p className="mt-2 text-sm text-zinc-600">Replies discovered in Gmail threads for recent sent messages.</p>
        </div>
        <a href="/" className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-50">Dashboard</a>
      </div>

      {error ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {loading ? <p className="text-sm text-zinc-600">Loading replies…</p> : null}
      {!loading && !error && replies.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 p-8 text-center">
          <h2 className="font-medium">No replies found yet</h2>
          <p className="mt-1 text-sm text-zinc-600">The scheduled reply poll checks recent Gmail threads every 15 minutes.</p>
        </div>
      ) : null}
      <div className="space-y-3">
        {replies.map((reply) => (
          <article key={reply._id} className="rounded-xl border border-zinc-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="break-all font-medium">{reply.fromEmail}</p>
                <p className="mt-1 break-words text-sm text-zinc-700">{reply.subject || "(no subject)"}</p>
              </div>
              <time className="shrink-0 text-xs text-zinc-500" dateTime={reply.receivedAt}>
                {new Date(reply.receivedAt).toLocaleString()}
              </time>
            </div>
            <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-zinc-600">{reply.snippet || "No message preview available."}</p>
            <p className="mt-3 text-xs text-zinc-400">Thread ID: {reply.gmailThreadId}</p>
          </article>
        ))}
      </div>
    </main>
  );
}
