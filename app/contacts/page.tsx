"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Contact = {
  _id: string;
  email: string;
  name?: string;
  company?: string;
  website?: string;
  sourceFile?: string;
  createdAt?: string;
};

type Pagination = { page: number; limit: number; total: number; totalPages: number };

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadContacts = useCallback(async (page: number, term: string) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (term.trim()) params.set("search", term.trim());
      const response = await fetch("/api/contacts?" + params.toString(), { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load contacts.");
      setContacts(Array.isArray(data.contacts) ? data.contacts : []);
      setPagination(data.pagination || { page, limit: 20, total: 0, totalPages: 0 });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load contacts.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadContacts(1, ""); }, [loadContacts]);

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearch(searchInput.trim());
    void loadContacts(1, searchInput.trim());
  }

  function changePage(nextPage: number) {
    if (nextPage < 1 || (pagination.totalPages > 0 && nextPage > pagination.totalPages)) return;
    void loadContacts(nextPage, search);
  }

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
        <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link href="/" className="text-sm font-medium text-indigo-600 hover:underline">← Dashboard</Link>
            <p className="mt-5 text-sm font-semibold uppercase tracking-[0.2em] text-indigo-600">Contact manager</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">Email contacts</h1>
            <p className="mt-2 text-sm text-zinc-500">Browse, search, and manage the email addresses imported into Mailer.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void loadContacts(pagination.page, search)} disabled={loading} className="rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50">Refresh</button>
            <Link href="/contacts/import" className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700">Upload CSV</Link>
          </div>
        </header>

        <section className="mb-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-zinc-500">Total contacts</p>
            <p className="mt-2 text-3xl font-bold tabular-nums">{pagination.total.toLocaleString()}</p>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-zinc-500">Showing on this page</p>
            <p className="mt-2 text-3xl font-bold tabular-nums">{contacts.length}</p>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-zinc-500">Current page</p>
            <p className="mt-2 text-3xl font-bold tabular-nums">{pagination.totalPages ? pagination.page + " / " + pagination.totalPages : "—"}</p>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-zinc-200 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Contact list</h2>
              <p className="mt-1 text-sm text-zinc-500">Search by email, name, or company.</p>
            </div>
            <form onSubmit={submitSearch} className="flex w-full gap-2 sm:max-w-md">
              <label className="sr-only" htmlFor="contact-search">Search contacts</label>
              <input id="contact-search" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Search contacts…" className="min-w-0 flex-1 rounded-lg border border-zinc-300 px-3 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
              <button type="submit" className="rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-700">Search</button>
              {search && <button type="button" onClick={() => { setSearchInput(""); setSearch(""); void loadContacts(1, ""); }} className="rounded-lg border border-zinc-300 px-3 py-2.5 text-sm hover:bg-zinc-50">Clear</button>}
            </form>
          </div>

          {error && <div role="alert" className="m-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

          {loading ? (
            <div className="px-5 py-16 text-center text-sm text-zinc-500">Loading contacts…</div>
          ) : contacts.length === 0 ? (
            <div className="px-5 py-16 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-xl">✉</div>
              <h3 className="mt-4 font-semibold">{search ? "No matching contacts" : "No contacts yet"}</h3>
              <p className="mt-2 text-sm text-zinc-500">{search ? "Try a different search term." : "Upload a CSV file to add your first list of email addresses."}</p>
              {!search && <Link href="/contacts/import" className="mt-5 inline-flex rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700">Upload your CSV</Link>}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                    <tr>
                      <th className="px-5 py-3 font-semibold">Email address</th>
                      <th className="px-5 py-3 font-semibold">Name</th>
                      <th className="px-5 py-3 font-semibold">Company</th>
                      <th className="px-5 py-3 font-semibold">Website</th>
                      <th className="px-5 py-3 font-semibold">Imported from</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {contacts.map((contact) => (
                      <tr key={contact._id} className="hover:bg-zinc-50/70">
                        <td className="px-5 py-4 font-medium text-zinc-900">{contact.email}</td>
                        <td className="px-5 py-4 text-zinc-600">{contact.name || "—"}</td>
                        <td className="px-5 py-4 text-zinc-600">{contact.company || "—"}</td>
                        <td className="max-w-48 truncate px-5 py-4 text-zinc-600">{contact.website ? <a href={contact.website} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">{contact.website}</a> : "—"}</td>
                        <td className="px-5 py-4 text-zinc-500">{contact.sourceFile || "Manual import"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-col gap-3 border-t border-zinc-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-zinc-500">Showing {(pagination.page - 1) * pagination.limit + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total.toLocaleString()} contacts</p>
                <div className="flex items-center gap-2">
                  <button type="button" disabled={loading || pagination.page <= 1} onClick={() => changePage(pagination.page - 1)} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium disabled:opacity-40">Previous</button>
                  <span className="px-2 text-sm text-zinc-500">Page {pagination.page} of {pagination.totalPages}</span>
                  <button type="button" disabled={loading || pagination.page >= pagination.totalPages} onClick={() => changePage(pagination.page + 1)} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium disabled:opacity-40">Next</button>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
