"use client";

import { useRef, useState } from "react";
import Link from "next/link";

type ImportSummary = {
  totalRows: number;
  imported: number;
  alreadyExists: number;
  duplicateRows: number;
  invalidRows: number;
};
type InvalidDetail = { row: number; email?: string; reason: string };

export default function ImportContactsPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [invalidDetails, setInvalidDetails] = useState<InvalidDetail[]>([]);
  const [notice, setNotice] = useState("");

  function chooseFile(next: File | null) {
    setError("");
    setSummary(null);
    setInvalidDetails([]);
    setNotice("");
    if (!next) { setFile(null); return; }
    if (!next.name.toLowerCase().endsWith(".csv")) {
      setFile(null);
      setError("Choose a .csv file. Excel files must be exported as CSV first.");
      return;
    }
    if (next.size > 2 * 1024 * 1024) {
      setFile(null);
      setError("This file is larger than 2 MB. Please split the list into smaller CSV files.");
      return;
    }
    setFile(next);
  }

  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) { setError("Select a CSV file before importing."); return; }
    setBusy(true);
    setError("");
    setSummary(null);
    setInvalidDetails([]);
    setNotice("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/contacts/import", { method: "POST", body: formData });
      const data = await response.json();
      if (!response.ok) {
        const details = Array.isArray(data.details) ? " " + data.details.map((item: { row?: number; message?: string }) => "Row " + ((item.row ?? 0) + 2) + ": " + (item.message ?? "")).join("; ") : "";
        throw new Error((data.error || "CSV import failed.") + details);
      }
      setSummary(data.summary);
      setInvalidDetails(Array.isArray(data.invalidDetails) ? data.invalidDetails : []);
      setNotice(data.message || "CSV processed.");
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
    } catch (e) {
      setError(e instanceof Error ? e.message : "CSV import failed.");
    } finally {
      setBusy(false);
    }
  }

  function downloadSample() {
    const csv = "email,name,company,website\nfounder@example.com,Alex Morgan,Example Inc,https://example.com\ncto@example.com,Jamie Lee,Sample Labs,https://sample.com\n";
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "mailer-contacts-template.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="mx-auto max-w-4xl px-5 py-10 sm:px-8">
        <header className="mb-8">
          <Link href="/contacts" className="text-sm font-medium text-indigo-600 hover:underline">← Back to contacts</Link>
          <p className="mt-5 text-sm font-semibold uppercase tracking-[0.2em] text-indigo-600">Contact manager</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">Import contacts from CSV</h1>
          <p className="mt-2 text-sm text-zinc-500">Upload a spreadsheet export and add valid email addresses to your Mailer contact list.</p>
        </header>

        {error && <div role="alert" className="mb-6 whitespace-pre-wrap rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
        {notice && <div role="status" className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</div>}

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Choose your CSV file</h2>
              <p className="mt-1 text-sm text-zinc-500">CSV only · Up to 2 MB · Up to 5,000 contact rows per upload</p>
            </div>
            <button type="button" onClick={downloadSample} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-50">Download sample CSV</button>
          </div>

          <form onSubmit={upload}>
            <div onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); chooseFile(event.dataTransfer.files?.[0] ?? null); }} className={"rounded-2xl border-2 border-dashed p-8 text-center transition sm:p-12 " + (dragging ? "border-indigo-500 bg-indigo-50" : "border-zinc-300 bg-zinc-50")}>
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-indigo-600 shadow-sm"><svg viewBox="0 0 24 24" fill="none" className="h-7 w-7" stroke="currentColor" strokeWidth="1.7"><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M4 15.5v3A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5v-3" strokeLinecap="round" strokeLinejoin="round" /></svg></div>
              <h3 className="mt-4 font-semibold">{file ? file.name : "Drag and drop your CSV here"}</h3>
              <p className="mt-2 text-sm text-zinc-500">{file ? (file.size / 1024).toFixed(1) + " KB selected" : "or select a file from your computer"}</p>
              <input ref={inputRef} type="file" accept=".csv,text/csv" onChange={(event) => chooseFile(event.target.files?.[0] ?? null)} className="sr-only" id="csv-file" />
              <label htmlFor="csv-file" className="mt-5 inline-flex cursor-pointer rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold hover:bg-zinc-100">Browse files</label>
            </div>

            <div className="mt-6 rounded-xl bg-indigo-50 p-4 text-sm leading-6 text-indigo-950">
              <p className="font-semibold">Required column</p>
              <p className="mt-1">Your CSV must include an <code className="rounded bg-white px-1.5 py-0.5">email</code> column. Optional columns are <code className="rounded bg-white px-1.5 py-0.5">name</code>, <code className="rounded bg-white px-1.5 py-0.5">company</code>, and <code className="rounded bg-white px-1.5 py-0.5">website</code>. Headers such as “Email Address” and “Company Name” are also accepted.</p>
              <p className="mt-2">Repeated addresses in the file are skipped, and emails already in your database are not imported twice.</p>
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <Link href="/contacts" className="rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-medium hover:bg-zinc-50">Cancel</Link>
              <button type="submit" disabled={!file || busy} className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">{busy ? "Importing contacts…" : "Import CSV"}</button>
            </div>
          </form>
        </section>

        {summary && (
          <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><h2 className="text-lg font-semibold">Import summary</h2><p className="mt-1 text-sm text-zinc-500">Here is what happened to the rows in your file.</p></div>
              <Link href="/contacts" className="rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-700">View contact list →</Link>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {[
                ["Rows read", summary.totalRows, "bg-zinc-50"],
                ["New contacts", summary.imported, "bg-emerald-50"],
                ["Already existed", summary.alreadyExists, "bg-blue-50"],
                ["Duplicate rows", summary.duplicateRows, "bg-amber-50"],
                ["Invalid rows", summary.invalidRows, "bg-red-50"],
              ].map(([label, value, color]) => <div key={String(label)} className={"rounded-xl p-4 " + color}><p className="text-xs text-zinc-600">{label}</p><p className="mt-2 text-2xl font-bold tabular-nums">{Number(value).toLocaleString()}</p></div>)}
            </div>
            {invalidDetails.length > 0 && <div className="mt-6"><h3 className="font-semibold">Invalid rows (first {invalidDetails.length})</h3><div className="mt-3 overflow-x-auto rounded-xl border border-zinc-200"><table className="w-full min-w-[420px] text-left text-sm"><thead className="bg-zinc-50 text-zinc-500"><tr><th className="px-4 py-3">Row</th><th className="px-4 py-3">Email</th><th className="px-4 py-3">Reason</th></tr></thead><tbody className="divide-y divide-zinc-100">{invalidDetails.map((item, index) => <tr key={item.row + "-" + index}><td className="px-4 py-3">{item.row}</td><td className="px-4 py-3">{item.email || "—"}</td><td className="px-4 py-3">{item.reason}</td></tr>)}</tbody></table></div></div>}
          </section>
        )}
      </div>
    </main>
  );
}
