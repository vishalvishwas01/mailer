"use client";

import { useCallback, useEffect, useState } from "react";

type QueueItem = {
  _id: string;
  status: "queued" | "processing" | "sent" | "failed" | "unknown" | "cancelled";
  senderEmail: string;
  scheduledFor: string;
  attempts: number;
  lastError?: string;
  emailDraftId?: { subject?: string; status?: string } | string;
  campaignDraftId?: { name?: string } | string;
  gmailAccountId?: { email?: string } | string;
};

export default function QueuePage() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/email-queue/list?limit=100", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load queue.");
      setItems(data.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load queue.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function cancel(id: string) {
    if (!window.confirm("Cancel this queued email? This cannot cancel an email already being processed.")) return;
    setBusyId(id);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/email-queue/${id}/cancel`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to cancel queue item.");
      setNotice("Queued email cancelled.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to cancel queue item.");
    } finally {
      setBusyId("");
    }
  }

  function draftSubject(item: QueueItem) {
    return typeof item.emailDraftId === "object" ? item.emailDraftId.subject || "Email draft" : "Email draft";
  }
  function campaignName(item: QueueItem) {
    return typeof item.campaignDraftId === "object" ? item.campaignDraftId.name || "Campaign" : "Campaign";
  }
  function senderName(item: QueueItem) {
    return typeof item.gmailAccountId === "object" ? item.gmailAccountId.email || item.senderEmail : item.senderEmail;
  }

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-5 py-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-zinc-500">MAILER</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Email queue</h1>
          <p className="mt-2 text-sm text-zinc-600">Review scheduled jobs and cancel items that have not started processing.</p>
        </div>
        <div className="flex gap-2">
          <a href="/schedule" className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-50">Schedule settings</a>
          <a href="/" className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-50">Dashboard</a>
        </div>
      </div>
      {error ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {notice ? <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p> : null}
      <div className="flex justify-end">
        <button type="button" onClick={() => void load()} disabled={loading} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium disabled:opacity-50">Refresh</button>
      </div>
      {loading ? <p className="py-8 text-center text-sm text-zinc-600">Loading queue…</p> : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 p-8 text-center">
          <h2 className="font-medium">Queue is empty</h2>
          <p className="mt-1 text-sm text-zinc-600">Approve an email draft and choose “Queue for schedule”.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <article key={item._id} className="rounded-xl border border-zinc-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="break-words font-medium">{draftSubject(item)}</h2>
                  <p className="mt-1 text-sm text-zinc-600">{campaignName(item)}</p>
                  <p className="mt-1 break-all text-sm text-zinc-500">Sender: {senderName(item)}</p>
                  <p className="mt-1 text-xs text-zinc-500">Scheduled: {new Date(item.scheduledFor).toLocaleString()} · Attempts: {item.attempts}</p>
                </div>
                <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium capitalize">{item.status}</span>
              </div>
              {item.lastError ? <p className="mt-3 break-words text-sm text-red-700">{item.lastError}</p> : null}
              {item.status === "queued" ? (
                <div className="mt-4">
                  <button type="button" disabled={busyId === item._id} onClick={() => void cancel(item._id)} className="rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-700 disabled:opacity-50">{busyId === item._id ? "Cancelling…" : "Cancel queued email"}</button>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
