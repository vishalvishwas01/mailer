"use client";

import { useEffect, useState } from "react";

type Template = {
  _id: string;
  name: string;
  subject: string;
  body: string;
  updatedAt?: string;
  attachment?: { originalName: string; mimeType: string; size: number } | null;
};

const emptyTemplate: Pick<Template, "name" | "subject" | "body"> & { attachment?: Template["attachment"] } = { name: "", subject: "", body: "", attachment: null };

export default function SettingsPage() {
  const [instructions, setInstructions] = useState("");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [template, setTemplate] = useState(emptyTemplate);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);

  const notify = (text: string, isError = false) => {
    setMessage(text);
    setError(isError);
  };

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [promptResponse, templateResponse] = await Promise.all([
          fetch("/api/ai-instructions", { cache: "no-store" }),
          fetch("/api/templates", { cache: "no-store" }),
        ]);
        const [promptData, templateData] = await Promise.all([promptResponse.json(), templateResponse.json()]);
        if (!promptResponse.ok) throw new Error(promptData.error ?? "Could not load AI instructions.");
        if (!templateResponse.ok) throw new Error(templateData.error ?? "Could not load templates.");
        if (cancelled) return;
        setInstructions(promptData.emailInstructions ?? "");
        const items: Template[] = templateData.templates ?? [];
        setTemplates(items);
        if (items.length) {
          setSelectedId(items[0]._id);
          setTemplate({ name: items[0].name, subject: items[0].subject, body: items[0].body, attachment: items[0].attachment });
        }
      } catch (e) {
        if (!cancelled) notify(e instanceof Error ? e.message : "Unable to load settings.", true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  function chooseTemplate(id: string) {
    setSelectedId(id);
    const found = templates.find((item) => item._id === id);
    setTemplate(found ? { name: found.name, subject: found.subject, body: found.body, attachment: found.attachment } : emptyTemplate);
    setAttachmentFile(null);
    notify("");
  }

  async function saveInstructions() {
    setBusy(true);
    try {
      const response = await fetch("/api/ai-instructions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailInstructions: instructions }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not save instructions.");
      notify("AI instructions saved. New generations will use them.");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Could not save instructions.", true);
    } finally { setBusy(false); }
  }

  async function saveTemplate() {
    setBusy(true);
    try {
      const isExisting = Boolean(selectedId);
      const response = await fetch(isExisting ? `/api/templates/${selectedId}` : "/api/templates", {
        method: isExisting ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: template.name, subject: template.subject, body: template.body }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not save template.");
      const saved: Template = data.template;
      if (attachmentFile) {
        const form = new FormData();
        form.append("attachment", attachmentFile);
        const upload = await fetch(`/api/templates/${saved._id}/attachment`, { method: "POST", body: form });
        const uploadData = await upload.json();
        if (!upload.ok) throw new Error(uploadData.error ?? "Template saved, but attachment upload failed.");
      }
      const items = await (async () => {
        const r = await fetch("/api/templates", { cache: "no-store" });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Template saved, but refresh failed.");
        return d.templates as Template[];
      })();
      setTemplates(items);
      setSelectedId(saved._id);
      setTemplate({ name: saved.name, subject: saved.subject, body: saved.body, attachment: saved.attachment });
      setAttachmentFile(null);
      notify(isExisting ? "Template updated." : "Template created.");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Could not save template.", true);
    } finally { setBusy(false); }
  }

  if (loading) return <main className="mx-auto min-h-[calc(100vh-57px)] max-w-5xl p-8 text-zinc-600">Loading settings…</main>;

  return (
    <main className="min-h-[calc(100vh-57px)] bg-zinc-50 text-zinc-900">
      <div className="mx-auto max-w-5xl px-5 py-10 sm:px-8">
        <header className="mb-8">
          <p className="mt-5 text-sm font-semibold uppercase tracking-[0.2em] text-indigo-600">Mailer Settings</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">AI instructions & email templates</h1>
          <p className="mt-2 text-sm text-zinc-600">Changes are stored in MongoDB and apply to future email generations. Already generated drafts are unchanged.</p>
        </header>

        {message && <div role="status" className={`mb-6 rounded-xl border px-4 py-3 text-sm ${error ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{message}</div>}

        <section className="mb-8 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="mb-4">
            <h2 className="text-xl font-semibold">OpenAI system instructions</h2>
            <p className="mt-1 text-sm text-zinc-500">Edit how the model writes, personalizes, and formats outreach emails.</p>
          </div>
          <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={12} maxLength={20000} className="w-full rounded-xl border border-zinc-300 p-4 font-mono text-sm leading-6 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" placeholder="Enter instructions for email generation…" />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-zinc-500">{instructions.length}/20,000 characters</span>
            <button disabled={busy || !instructions.trim()} onClick={saveInstructions} className="rounded-lg bg-black px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50">{busy ? "Saving…" : "Save instructions"}</button>
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="mb-5">
            <h2 className="text-xl font-semibold">Email templates</h2>
            <p className="mt-1 text-sm text-zinc-500">Edit the subject and body used as the starting point for personalized emails.</p>
          </div>
          <div className="mb-5 flex flex-wrap gap-3">
            <select value={selectedId} onChange={(e) => chooseTemplate(e.target.value)} className="min-w-64 flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm">
              <option value="">Create a new template…</option>
              {templates.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
            </select>
            <button type="button" onClick={() => chooseTemplate("")} className="rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-medium hover:bg-zinc-50">New template</button>
          </div>
          <div className="space-y-4">
            <label className="block text-sm font-medium">Template name
              <input value={template.name} onChange={(e) => setTemplate({ ...template, name: e.target.value })} maxLength={100} className="mt-1.5 w-full rounded-lg border border-zinc-300 px-3 py-2.5 font-normal outline-none focus:border-indigo-500" placeholder="Founder outreach" />
            </label>
            <label className="block text-sm font-medium">Email subject
              <input value={template.subject} onChange={(e) => setTemplate({ ...template, subject: e.target.value })} maxLength={200} className="mt-1.5 w-full rounded-lg border border-zinc-300 px-3 py-2.5 font-normal outline-none focus:border-indigo-500" placeholder="Quick introduction, {{name}}" />
            </label>
            <label className="block text-sm font-medium">Email body / template
              <textarea value={template.body} onChange={(e) => setTemplate({ ...template, body: e.target.value })} rows={12} maxLength={20000} className="mt-1.5 w-full rounded-xl border border-zinc-300 p-4 font-mono text-sm leading-6 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" placeholder={"Hi {{name}},\n\nI wanted to reach out about…"} />
            </label>
            <label className="block text-sm font-medium">PDF/DOCX attachment
              <input type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(e) => setAttachmentFile(e.target.files?.[0] ?? null)} className="mt-1.5 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm" />
              <span className="mt-1 block text-xs font-normal text-zinc-500">Optional, up to 5 MB. It will be attached to every email generated from this template.</span>
              {template.attachment && !attachmentFile && <span className="mt-1 block text-xs font-medium text-indigo-700">Current: {template.attachment.originalName}</span>}
            </label>
            <p className="text-xs leading-5 text-zinc-500">Supported placeholders: <code>{"{{name}}"}</code>, <code>{"{{email}}"}</code>, <code>{"{{company}}"}</code>, <code>{"{{website}}"}</code>, <code>{"{{role}}"}</code>, <code>{"{{sender_name}}"}</code>. Role is inferred during AI generation; sender name is derived from the active Gmail address.</p>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-zinc-500">{template.body.length}/20,000 body characters</span>
              <button disabled={busy || !template.name.trim() || !template.subject.trim() || !template.body.trim()} onClick={saveTemplate} className="rounded-lg bg-black px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50">{busy ? "Saving…" : selectedId ? "Save template" : "Create template"}</button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
