"use client";

import Link from "next/link";
import { useState } from "react";

type ImportSummary = {
  totalRows: number;
  imported: number;
  alreadyExists: number;
  duplicateRows: number;
  invalidRows: number;
};

type InvalidDetail = { row: number; email?: string; reason: string };

const exampleCsv = "email,name,company,website\nada@example.com,Ada Lovelace,Example Co,https://example.com\n";

export default function ImportContactsPage() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [invalidDetails, setInvalidDetails] = useState<InvalidDetail[]>([]);

  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || uploading) return;

    setUploading(true);
    setError("");
    setNotice("");
    setSummary(null);
    setInvalidDetails([]);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/contacts/import", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();

      if (!response.ok) {
        const details = Array.isArray(data.details)
          ? data.details.map((item: { row?: number; message?: string }) => `Row ${item.row ?? "?"}: ${item.message ?? "Invalid data"}`).join("\n")
          : "";
        throw new Error([data.error || "CSV import failed.", details].filter(Boolean).join("\n"));
      }

      setNotice(data.message || "CSV processed successfully.");
      setSummary(data.summary ?? null);
      setInvalidDetails(Array.isArray(data.invalidDetails) ? data.invalidDetails : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "CSV import failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <main className="mx-auto min-h-[calc(100vh-57px)] w-full max-w-3xl space-y-6 px-5 py-10">
      <header>
        <Link href="/contacts" className="text-sm font-medium text-indigo-700 hover:text-indigo-900">← Contacts</Link>
        <p className="mt-6 text-xs font-bold uppercase tracking-[0.22em] text-indigo-600">Contact workspace</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Upload contacts from CSV</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-600">Import up to 5,000 rows per file. Existing contacts are left unchanged; duplicate email addresses are not added twice.</p>
      </header>

      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
        <h2 className="text-lg font-semibold">Choose a CSV file</h2>
        <p className="mt-1 text-sm text-zinc-500">Maximum file size: 2 MB. An email column is required; name, company, and website are optional.</p>
        <div className="mt-4 rounded-xl bg-zinc-50 p-4 text-sm leading-6 text-zinc-700">
          <p>Accepted headers: <code>email</code>, <code>name</code>, <code>company</code>, <code>website</code>.</p>
          <p className="mt-1">Common aliases such as <code>Email Address</code>, <code>Full Name</code>, <code>Company Name</code>, and <code>Website URL</code> also work.</p>
          <a download="contacts-example.csv" href={`data:text/csv;charset=utf-8,${encodeURIComponent(exampleCsv)}`} className="mt-3 inline-flex font-semibold text-indigo-700 underline underline-offset-2">Download example CSV</a>
        </div>

        <form onSubmit={upload} className="mt-6 space-y-4">
          <label className="block text-sm font-medium text-zinc-700">
            CSV file
            <input
              type="file"
              accept=".csv,text/csv"
              required
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setError("");
                setNotice("");
                setSummary(null);
                setInvalidDetails([]);
              }}
              className="mt-2 block w-full rounded-lg border border-zinc-300 p-3 text-sm file:mr-4 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:font-semibold file:text-indigo-700"
            />
          </label>
          {file && <p className="text-xs text-zinc-500">Selected: {file.name} · {(file.size / 1024).toFixed(0)} KB</p>}
          <button type="submit" disabled={!file || uploading} className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">
            {uploading ? "Importing contacts…" : "Import CSV"}
          </button>
        </form>
      </section>

      {error && <div role="alert" className="whitespace-pre-wrap rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}
      {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div>}

      {summary && (
        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="font-semibold">Import results</h2>
          <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
            {([
              ["Rows read", summary.totalRows],
              ["Contacts added", summary.imported],
              ["Already existed", summary.alreadyExists],
              ["Duplicate rows", summary.duplicateRows],
              ["Invalid rows", summary.invalidRows],
            ] as [string, number][]).map(([label, value]) => (
              <div key={label} className="rounded-xl bg-zinc-50 p-4">
                <dt className="text-xs font-medium text-zinc-500">{label}</dt>
                <dd className="mt-1 text-2xl font-bold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          {invalidDetails.length > 0 && <div className="mt-5"><h3 className="text-sm font-semibold">Some rows need attention</h3><ul className="mt-2 space-y-1 text-sm text-zinc-600">{invalidDetails.map((item, index) => <li key={`${item.row}-${index}`}>Row {item.row}{item.email ? ` (${item.email})` : ""}: {item.reason}</li>)}</ul></div>}
          <Link href="/contacts" className="mt-5 inline-flex rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold hover:bg-zinc-50">View contacts</Link>
        </section>
      )}
    </main>
  );
}
