"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

type Status = "all" | "sent" | "failed" | "sending" | "queued" | "unknown" | "not_sent" | "reply_received";
type Contact = {
  _id: string; email: string; name?: string; company?: string; website?: string; sourceFile?: string;
  contactStatus: Exclude<Status, "all">;
  latestSend?: { status: string; attemptedAt?: string; sentAt?: string; errorMessage?: string; senderEmail?: string } | null;
  latestQueue?: { status: string; scheduledFor?: string; lastError?: string; attempts?: number } | null;
  latestReply?: { subject?: string; snippet?: string; receivedAt?: string; fromEmail?: string; gmailThreadId?: string } | null;
};
type QueueItem = { _id: string; status: string; senderEmail: string; scheduledFor: string; attempts: number; lastError?: string; contactId?: { email?: string; name?: string; company?: string } | string; emailDraftId?: { subject?: string } | string; campaignDraftId?: { name?: string } | string; gmailAccountId?: { email?: string } | string };
type Pagination = { page: number; limit: number; total: number; totalPages: number };
const filters: { value: Status; label: string }[] = [
  { value: "all", label: "All contacts" }, { value: "sent", label: "Sent" }, { value: "failed", label: "Failed" },
  { value: "sending", label: "Sending" }, { value: "queued", label: "Queued" }, { value: "not_sent", label: "Did not send" },
  { value: "reply_received", label: "Reply received" }, { value: "unknown", label: "Uncertain" },
];
const statusStyle: Record<string, string> = {
  sent: "bg-emerald-50 text-emerald-700 ring-emerald-200", failed: "bg-red-50 text-red-700 ring-red-200",
  sending: "bg-blue-50 text-blue-700 ring-blue-200", queued: "bg-violet-50 text-violet-700 ring-violet-200",
  not_sent: "bg-zinc-100 text-zinc-700 ring-zinc-200", reply_received: "bg-teal-50 text-teal-700 ring-teal-200",
  unknown: "bg-amber-50 text-amber-800 ring-amber-200", processing: "bg-blue-50 text-blue-700 ring-blue-200",
  cancelled: "bg-zinc-100 text-zinc-600 ring-zinc-200",
};
function prettyStatus(value: string) { return ({ not_sent: "Did not send", reply_received: "Reply received", unknown: "Uncertain", sending: "Sending" } as Record<string,string>)[value] || value.charAt(0).toUpperCase() + value.slice(1); }
function date(value?: string) { if (!value) return "—"; const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString(); }

function ContactsContent() {
  const searchParams = useSearchParams();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [view, setView] = useState<"contacts" | "queue">(searchParams.get("view") === "queue" ? "queue" : "contacts");
  const [filter, setFilter] = useState<Status>("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [notice, setNotice] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [savingContact, setSavingContact] = useState(false);
  const [manualContact, setManualContact] = useState({ email: "", name: "", company: "", website: "" });

  const load = useCallback(async (page: number, term: string, status: Status, currentView: "contacts" | "queue") => {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20", view: currentView, status: status, search: term });
      const response = await fetch("/api/contacts/overview?" + params.toString(), { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load contacts.");
      setPagination(data.pagination || { page, limit: 20, total: 0, totalPages: 0 });
      if (currentView === "queue") setQueueItems(Array.isArray(data.items) ? data.items : []);
      else { setContacts(Array.isArray(data.contacts) ? data.contacts : []); setCounts(data.counts || {}); }
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load contacts."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(1, "", "all", view); }, [load, view]);

  function switchView(next: "contacts" | "queue") {
    setView(next); setFilter("all"); setSearch(""); setSearchInput("");
    window.history.replaceState(null, "", next === "queue" ? "/contacts?view=queue" : "/contacts");
    void load(1, "", "all", next);
  }
  function submitSearch(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); setSearch(searchInput.trim()); void load(1, searchInput.trim(), filter, view); }
  function changeFilter(next: Status) { setFilter(next); void load(1, search, next, view); }
  function changePage(next: number) { if (next < 1 || (pagination.totalPages && next > pagination.totalPages)) return; void load(next, search, filter, view); }

  async function cancelQueue(item: QueueItem) {
    if (!window.confirm("Cancel this queued email? Emails already processing cannot be cancelled.")) return;
    setBusyId(item._id); setError(""); setNotice("");
    try {
      const response = await fetch("/api/email-queue/" + item._id + "/cancel", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not cancel queued email.");
      setNotice("Queued email cancelled.");
      await load(pagination.page, search, filter, view);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not cancel queued email."); }
    finally { setBusyId(""); }
  }

  return (
    <main className="mx-auto min-h-[calc(100vh-57px)] w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-xs font-bold uppercase tracking-[0.22em] text-indigo-600">Contact workspace</p><h1 className="mt-2 text-3xl font-bold tracking-tight">{view === "contacts" ? "Contacts & delivery status" : "Email queue"}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">{view === "contacts" ? "See who was contacted, which messages failed, which are queued, and who has replied — all in one place." : "Review scheduled emails and cancel items that have not started processing."}</p></div>
        <div className="flex flex-wrap gap-2"><button onClick={() => switchView("contacts")} className={"rounded-lg px-4 py-2.5 text-sm font-semibold " + (view === "contacts" ? "bg-indigo-600 text-white" : "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50")}>Contacts</button><button onClick={() => switchView("queue")} className={"rounded-lg px-4 py-2.5 text-sm font-semibold " + (view === "queue" ? "bg-indigo-600 text-white" : "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50")}>Queue</button><Link href="/contacts/import" className="rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-700">Upload CSV</Link>{view === "contacts" && <button type="button" onClick={() => { setShowAddForm((open) => !open); setError(""); setNotice(""); }} className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-100">{showAddForm ? "Close form" : "Add manually"}</button>}<button onClick={() => void load(pagination.page, search, filter, view)} disabled={loading} className="rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold hover:bg-zinc-50 disabled:opacity-50">Refresh</button></div>
      </header>


      {showAddForm && view === "contacts" && (
        <section className="mb-6 rounded-2xl border border-indigo-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-4">
            <h2 className="text-lg font-semibold">Add contact manually</h2>
            <p className="mt-1 text-sm text-zinc-500">Enter the same fields supported by CSV: email, name, company, and website. Email is required.</p>
          </div>
          <form onSubmit={async (event) => {
            event.preventDefault();
            setSavingContact(true); setError(""); setNotice("");
            try {
              const response = await fetch("/api/contacts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(manualContact),
              });
              const data = await response.json();
              if (!response.ok) throw new Error(data.error || "Could not add contact.");
              setNotice(data.message || "Contact added successfully.");
              setManualContact({ email: "", name: "", company: "", website: "" });
              setShowAddForm(false); setFilter("all"); setSearch(""); setSearchInput("");
              await load(1, "", "all", "contacts");
            } catch (e) {
              setError(e instanceof Error ? e.message : "Could not add contact.");
            } finally {
              setSavingContact(false);
            }
          }} className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-zinc-700">Email address <span className="text-red-600">*</span>
              <input required type="email" maxLength={254} value={manualContact.email} onChange={(e) => setManualContact((prev) => ({ ...prev, email: e.target.value }))} placeholder="person@example.com" className="mt-1.5 w-full rounded-lg border border-zinc-300 px-3 py-2.5 font-normal outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
            </label>
            <label className="text-sm font-medium text-zinc-700">Full name
              <input maxLength={200} value={manualContact.name} onChange={(e) => setManualContact((prev) => ({ ...prev, name: e.target.value }))} placeholder="Full name" className="mt-1.5 w-full rounded-lg border border-zinc-300 px-3 py-2.5 font-normal outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
            </label>
            <label className="text-sm font-medium text-zinc-700">Company
              <input maxLength={200} value={manualContact.company} onChange={(e) => setManualContact((prev) => ({ ...prev, company: e.target.value }))} placeholder="Company name" className="mt-1.5 w-full rounded-lg border border-zinc-300 px-3 py-2.5 font-normal outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
            </label>
            <label className="text-sm font-medium text-zinc-700">Website
              <input type="url" maxLength={2048} value={manualContact.website} onChange={(e) => setManualContact((prev) => ({ ...prev, website: e.target.value }))} placeholder="https://example.com" className="mt-1.5 w-full rounded-lg border border-zinc-300 px-3 py-2.5 font-normal outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
            </label>
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <button type="submit" disabled={savingContact} className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">{savingContact ? "Adding contact..." : "Add contact"}</button>
              <button type="button" onClick={() => setShowAddForm(false)} disabled={savingContact} className="rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50">Cancel</button>
            </div>
          </form>
        </section>
      )}
      {error && <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
      {notice && <div role="status" className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</div>}

      {view === "contacts" ? (
        <>
          <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {[["All", counts.all ?? 0], ["Sent", counts.sent ?? 0], ["Failed", counts.failed ?? 0], ["Queued", counts.queued ?? 0], ["Sending", counts.sending ?? 0], ["Replies", counts.reply_received ?? 0], ["Did not send", counts.not_sent ?? 0]].map(([label, value]) => <button key={String(label)} onClick={() => changeFilter(({ All: "all", Sent: "sent", Failed: "failed", Queued: "queued", Sending: "sending", Replies: "reply_received", "Did not send": "not_sent" } as Record<string, Status>)[String(label)])} className={"rounded-xl border bg-white p-4 text-left shadow-sm transition hover:border-indigo-300 " + ((({ All: "all", Sent: "sent", Failed: "failed", Queued: "queued", Sending: "sending", Replies: "reply_received", "Did not send": "not_sent" } as Record<string, Status>)[String(label)]) === filter ? "border-indigo-400 ring-2 ring-indigo-100" : "border-zinc-200")}><p className="text-xs font-medium text-zinc-500">{label}</p><p className="mt-2 text-2xl font-bold tabular-nums">{Number(value).toLocaleString()}</p></button>)}
          </section>
          <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <div className="flex flex-col gap-4 border-b border-zinc-200 p-5 lg:flex-row lg:items-center lg:justify-between"><div><h2 className="text-lg font-semibold">Email contact list</h2><p className="mt-1 text-sm text-zinc-500">Delivery status is based on the latest send, queue, and reply records.</p></div><form onSubmit={submitSearch} className="flex w-full gap-2 lg:max-w-lg"><label htmlFor="contact-search" className="sr-only">Search contacts</label><input id="contact-search" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Search email, name, or company…" className="min-w-0 flex-1 rounded-lg border border-zinc-300 px-3 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"/><button className="rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white">Search</button>{search && <button type="button" onClick={() => {setSearch("");setSearchInput("");void load(1,"",filter,view)}} className="rounded-lg border border-zinc-300 px-3 py-2.5 text-sm">Clear</button>}</form></div>
            <div className="flex flex-wrap gap-2 border-b border-zinc-100 px-5 py-3">{filters.map((item) => <button key={item.value} onClick={() => changeFilter(item.value)} className={"rounded-full px-3 py-1.5 text-xs font-semibold " + (filter === item.value ? "bg-indigo-600 text-white" : "border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50")}>{item.label}</button>)}</div>
            {loading ? <p className="px-5 py-16 text-center text-sm text-zinc-500">Loading contact status…</p> : contacts.length === 0 ? <div className="px-5 py-16 text-center"><h3 className="font-semibold">{search || filter !== "all" ? "No matching contacts" : "No contacts yet"}</h3><p className="mt-2 text-sm text-zinc-500">Import a CSV to populate this list.</p><Link href="/contacts/import" className="mt-4 inline-flex rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white">Upload CSV</Link></div> : (
              <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-sm"><thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500"><tr><th className="px-5 py-3">Contact</th><th className="px-5 py-3">Company</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Last activity</th><th className="px-5 py-3">Details</th></tr></thead><tbody className="divide-y divide-zinc-100">{contacts.map((contact) => { const activity = contact.latestReply?.receivedAt || contact.latestSend?.sentAt || contact.latestSend?.attemptedAt || contact.latestQueue?.scheduledFor; const detail = contact.latestReply ? "Reply from " + (contact.latestReply.fromEmail || contact.email) + (contact.latestReply.subject ? " · " + contact.latestReply.subject : "") : contact.latestSend?.errorMessage || contact.latestQueue?.lastError || (contact.latestQueue?.status === "queued" ? "Scheduled: " + date(contact.latestQueue.scheduledFor) : contact.latestSend?.senderEmail ? "Sent using " + contact.latestSend.senderEmail : "No send attempt recorded"); return <tr key={contact._id} className="align-top hover:bg-zinc-50/70"><td className="px-5 py-4"><p className="font-semibold text-zinc-900">{contact.name || "Contact"}</p><p className="mt-1 break-all text-zinc-600">{contact.email}</p>{contact.sourceFile && <p className="mt-1 text-xs text-zinc-400">{contact.sourceFile}</p>}</td><td className="px-5 py-4 text-zinc-600">{contact.company || "—"}</td><td className="px-5 py-4"><span className={"inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset " + (statusStyle[contact.contactStatus] || statusStyle.not_sent)}>{prettyStatus(contact.contactStatus)}</span>{contact.latestQueue?.status === "queued" && <p className="mt-2 text-xs text-zinc-500">Queue: {date(contact.latestQueue.scheduledFor)}</p>}</td><td className="whitespace-nowrap px-5 py-4 text-zinc-600">{date(activity)}</td><td className="max-w-sm whitespace-normal break-words px-5 py-4 text-zinc-500">{detail}{contact.latestReply?.snippet && <p className="mt-2 line-clamp-3 text-zinc-700">{contact.latestReply.snippet}</p>}</td></tr>})}</tbody></table></div>
            )}
            {!loading && pagination.total > 0 && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 px-5 py-4"><p className="text-sm text-zinc-500">{pagination.total.toLocaleString()} contacts · Page {pagination.page} of {pagination.totalPages}</p><div className="flex gap-2"><button disabled={pagination.page <= 1} onClick={() => changePage(pagination.page - 1)} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm disabled:opacity-40">Previous</button><button disabled={pagination.page >= pagination.totalPages} onClick={() => changePage(pagination.page + 1)} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm disabled:opacity-40">Next</button></div></div>}
          </section>
        </>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 p-5"><div><h2 className="text-lg font-semibold">Scheduled email queue</h2><p className="mt-1 text-sm text-zinc-500">Cancel an email while it is still queued.</p></div><div className="flex flex-wrap gap-2">{["all","queued","processing","sent","failed","unknown","cancelled"].map((item) => <button key={item} onClick={() => changeFilter(item === "all" ? "all" : item as Status)} className={"rounded-full px-3 py-1.5 text-xs font-semibold capitalize " + (filter === item ? "bg-indigo-600 text-white" : "border border-zinc-200 text-zinc-600")}>{item}</button>)}</div></div>
          {loading ? <p className="p-12 text-center text-sm text-zinc-500">Loading queue…</p> : queueItems.length === 0 ? <p className="p-12 text-center text-sm text-zinc-500">No queue items for this filter.</p> : <div className="divide-y divide-zinc-100">{queueItems.map((item) => { const contact = typeof item.contactId === "object" && item.contactId ? item.contactId : {}; const subject = typeof item.emailDraftId === "object" && item.emailDraftId ? item.emailDraftId.subject : "Email draft"; const campaign = typeof item.campaignDraftId === "object" && item.campaignDraftId ? item.campaignDraftId.name : "Campaign"; return <article key={item._id} className="p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">{contact.name || contact.email || "Queued email"}</h3><p className="mt-1 break-all text-sm text-zinc-600">{contact.email || "Recipient unavailable"}</p><p className="mt-2 text-sm">{subject || "Email draft"} · {campaign || "Campaign"}</p><p className="mt-1 text-xs text-zinc-500">Scheduled {date(item.scheduledFor)} · Attempts {item.attempts} · Sender {item.senderEmail}</p>{item.lastError && <p className="mt-2 text-sm text-red-700">{item.lastError}</p>}</div><span className={"rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset " + (statusStyle[item.status] || statusStyle.unknown)}>{prettyStatus(item.status)}</span></div>{item.status === "queued" && <button disabled={busyId === item._id} onClick={() => void cancelQueue(item)} className="mt-4 rounded-lg border border-red-300 px-3 py-2 text-sm font-semibold text-red-700 disabled:opacity-50">{busyId === item._id ? "Cancelling…" : "Cancel queued email"}</button>}</article>})}</div>}
          {!loading && pagination.total > 0 && <div className="flex items-center justify-between border-t border-zinc-200 px-5 py-4"><p className="text-sm text-zinc-500">{pagination.total} queue items · Page {pagination.page} of {pagination.totalPages}</p><div className="flex gap-2"><button disabled={pagination.page <= 1} onClick={() => changePage(pagination.page - 1)} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm disabled:opacity-40">Previous</button><button disabled={pagination.page >= pagination.totalPages} onClick={() => changePage(pagination.page + 1)} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm disabled:opacity-40">Next</button></div></div>}
        </section>
      )}
    </main>
  );
}

export default function ContactsPage() {
  return (
    <Suspense fallback={<main className="mx-auto min-h-[calc(100vh-57px)] w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8" aria-label="Loading contacts" />}>
      <ContactsContent />
    </Suspense>
  );
}
