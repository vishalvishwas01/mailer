"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Contact = { _id: string; name?: string; email: string; company?: string };
type Resume = { _id: string; originalName: string; mimeType: string; size: number };
type Template = { _id: string; name: string; subject: string };
type Campaign = {
  _id: string;
  name: string;
  resumeId: Resume | string;
  templateId: Template | string;
  createdAt: string;
};
type EmailDraft = {
  _id: string;
  status: "pending_review" | "approved" | "rejected";
  campaignDraftId: { _id: string; name: string } | string;
  contactId: Contact | string;
};

function idOf(value: { _id: string } | string) {
  return typeof value === "string" ? value : value._id;
}

function formatSize(size: number) {
  return size < 1024 * 1024 ? `${Math.ceil(size / 1024)} KB` : `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [drafts, setDrafts] = useState<EmailDraft[]>([]);
  const [campaignName, setCampaignName] = useState("");
  const [resumeId, setResumeId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [activeCampaignId, setActiveCampaignId] = useState("");
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadData = useCallback(async () => {
    setError("");
    try {
      const responses = await Promise.all([
        fetch("/api/campaign-drafts", { cache: "no-store" }),
        fetch("/api/contacts?limit=100", { cache: "no-store" }),
        fetch("/api/resumes", { cache: "no-store" }),
        fetch("/api/templates", { cache: "no-store" }),
        fetch("/api/email-drafts?limit=100", { cache: "no-store" }),
      ]);
      const data = await Promise.all(responses.map((response) => response.json()));
      const failed = responses.findIndex((response) => !response.ok);
      if (failed >= 0) throw new Error(data[failed].error ?? "Unable to load campaign setup.");
      const nextCampaigns: Campaign[] = data[0].drafts ?? [];
      setCampaigns(nextCampaigns);
      setContacts(data[1].contacts ?? []);
      setResumes(data[2].resumes ?? []);
      setTemplates(data[3].templates ?? []);
      setDrafts(data[4].drafts ?? []);
      setResumeId((current) => current || data[2].resumes?.[0]?._id || "");
      setTemplateId((current) => current || data[3].templates?.[0]?._id || "");
      setActiveCampaignId((current) => current || nextCampaigns[0]?._id || "");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load campaign setup.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadData(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  const activeCampaign = campaigns.find((campaign) => campaign._id === activeCampaignId);
  const draftByContact = useMemo(() => {
    const map = new Map<string, EmailDraft>();
    for (const draft of drafts) map.set(`${idOf(draft.campaignDraftId)}:${idOf(draft.contactId)}`, draft);
    return map;
  }, [drafts]);

  async function createCampaign(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!resumeId || !templateId) return;
    setCreating(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/campaign-drafts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: campaignName, resumeId, templateId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not create campaign.");
      setCampaignName("");
      setActiveCampaignId(data.draft._id);
      setSelectedContacts([]);
      setNotice("Campaign created. Select contacts below, then generate their drafts.");
      await loadData();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create campaign.");
    } finally { setCreating(false); }
  }

  async function uploadResume(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true); setError(""); setNotice("");
    try {
      const form = new FormData(); form.append("resume", file);
      const response = await fetch("/api/resumes/upload", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not upload resume.");
      setResumeId(data.resume.id);
      setNotice(`${data.resume.originalName} uploaded and ready to use.`);
      await loadData();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not upload resume.");
    } finally { setUploading(false); event.target.value = ""; }
  }

  function toggleContact(contactId: string) {
    setSelectedContacts((selected) => selected.includes(contactId)
      ? selected.filter((id) => id !== contactId)
      : [...selected, contactId]);
  }

  async function generateDrafts() {
    if (!activeCampaign || !selectedContacts.length || generating) return;
    setGenerating(true); setError(""); setNotice("");
    const failures: string[] = [];
    let created = 0;
    const pending = selectedContacts.filter((contactId) => {
      const existing = draftByContact.get(`${activeCampaign._id}:${contactId}`);
      return !existing || existing.status === "rejected";
    });
    for (let index = 0; index < pending.length; index += 1) {
      const contact = contacts.find((item) => item._id === pending[index]);
      setProgress(`Generating ${index + 1} of ${pending.length}${contact ? ` · ${contact.email}` : ""}`);
      try {
        const response = await fetch(`/api/campaign-drafts/${activeCampaign._id}/generate`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contactId: pending[index],
            ...(draftByContact.get(`${activeCampaign._id}:${pending[index]}`)?.status === "rejected"
              ? { regenerateDraftId: draftByContact.get(`${activeCampaign._id}:${pending[index]}`)?._id }
              : {}),
          }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Draft generation failed.");
        created += 1;
      } catch (cause) {
        failures.push(`${contact?.email ?? pending[index]}: ${cause instanceof Error ? cause.message : "Draft generation failed."}`);
      }
    }
    setProgress("");
    setSelectedContacts([]);
    setNotice(`${created} draft${created === 1 ? "" : "s"} generated${failures.length ? `; ${failures.length} failed` : ""}. Generated drafts are not sent automatically.`);
    if (failures.length) setError(failures.slice(0, 3).join("\n"));
    await loadData();
    setGenerating(false);
  }

  if (loading) return <main className="mx-auto min-h-[calc(100vh-57px)] max-w-6xl px-5 py-10 text-sm text-zinc-500">Loading campaign workspace…</main>;

  return (
    <main className="mx-auto min-h-[calc(100vh-57px)] w-full max-w-6xl space-y-8 px-5 py-10">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-indigo-600">Outreach workspace</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Campaigns</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">Choose a resume and email template, then generate personalized drafts for selected contacts. Drafts require review and approval before queueing.</p>
      </header>

      {error && <div role="alert" className="whitespace-pre-wrap rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}
      {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div>}

      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-5"><h2 className="text-xl font-semibold">Create a campaign</h2><p className="mt-1 text-sm text-zinc-500">The resume is used as the source of truth for AI personalization. It is never attached to outgoing email.</p></div>
        <form onSubmit={createCampaign} className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium sm:col-span-2">Campaign name<input required maxLength={100} value={campaignName} onChange={(e) => setCampaignName(e.target.value)} placeholder="Product engineer outreach" className="mt-1.5 w-full rounded-lg border border-zinc-300 px-3 py-2.5 font-normal" /></label>
          <label className="text-sm font-medium">Resume<select required value={resumeId} onChange={(e) => setResumeId(e.target.value)} className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 font-normal"><option value="">Select a resume</option>{resumes.map((resume) => <option key={resume._id} value={resume._id}>{resume.originalName} · {formatSize(resume.size)}</option>)}</select></label>
          <label className="text-sm font-medium">Email template<select required value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 font-normal"><option value="">Select a template</option>{templates.map((template) => <option key={template._id} value={template._id}>{template.name}</option>)}</select></label>
          <div className="flex flex-wrap items-center justify-between gap-3 sm:col-span-2">
            <label className="text-sm font-medium">Add resume PDF/DOCX<input type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(e) => void uploadResume(e)} disabled={uploading} className="mt-1.5 block max-w-full text-sm font-normal" /><span className="mt-1 block text-xs font-normal text-zinc-500">Maximum 5 MB. {uploading ? "Uploading…" : "Upload it here if it is not listed above."}</span></label>
            <button type="submit" disabled={creating || !resumeId || !templateId} className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">{creating ? "Creating…" : "Create campaign"}</button>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div><h2 className="text-xl font-semibold">Generate email drafts</h2><p className="mt-1 text-sm text-zinc-500">Select a campaign and contacts. Rejected drafts can be generated again.</p></div>
          <button type="button" onClick={() => void loadData()} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-50">Refresh</button>
        </div>
        {campaigns.length === 0 ? <p className="rounded-xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">Create your first campaign above to start generating drafts.</p> : <>
          <label className="block max-w-xl text-sm font-medium">Campaign<select value={activeCampaignId} onChange={(e) => { setActiveCampaignId(e.target.value); setSelectedContacts([]); }} className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5">{campaigns.map((campaign) => <option key={campaign._id} value={campaign._id}>{campaign.name}</option>)}</select></label>
          {contacts.length === 0 ? <p className="mt-5 rounded-xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">No contacts yet. Add or import contacts first.</p> : <>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-zinc-600">{selectedContacts.length} selected · Showing up to 100 contacts</p><div className="flex gap-2"><button type="button" onClick={() => setSelectedContacts(contacts.filter((contact) => { const existing = activeCampaign ? draftByContact.get(`${activeCampaign._id}:${contact._id}`) : undefined; return !existing || existing.status === "rejected"; }).map((contact) => contact._id))} className="rounded-lg border border-zinc-300 px-3 py-2 text-xs font-semibold">Select all eligible</button><button type="button" onClick={() => setSelectedContacts([])} className="rounded-lg border border-zinc-300 px-3 py-2 text-xs font-semibold">Clear</button></div></div>
            <div className="mt-3 max-h-80 divide-y divide-zinc-100 overflow-y-auto rounded-xl border border-zinc-200">{contacts.map((contact) => {
              const existing = activeCampaign ? draftByContact.get(`${activeCampaign._id}:${contact._id}`) : undefined;
              return <label key={contact._id} className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-zinc-50"><input type="checkbox" checked={selectedContacts.includes(contact._id)} onChange={() => toggleContact(contact._id)} disabled={(Boolean(existing) && existing?.status !== "rejected") || generating} className="h-4 w-4 rounded border-zinc-300" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{contact.name || contact.email}{contact.company ? ` · ${contact.company}` : ""}</span><span className="block truncate text-xs text-zinc-500">{contact.email}</span></span>{existing ? <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">Draft: {existing.status.replace("_", " ")}{existing.status === "rejected" ? " · selectable to regenerate" : ""}</span> : <span className="shrink-0 text-xs text-zinc-400">No draft</span>}</label>;
            })}</div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p role="status" className="text-sm text-indigo-700">{progress}</p><button type="button" onClick={() => void generateDrafts()} disabled={!selectedContacts.some((contactId) => { const existing = draftByContact.get(`${activeCampaignId}:${contactId}`); return !existing || existing.status === "rejected"; }) || generating} className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">{generating ? "Generating…" : `Generate drafts${selectedContacts.length ? ` (${selectedContacts.filter((contactId) => { const existing = draftByContact.get(`${activeCampaignId}:${contactId}`); return !existing || existing.status === "rejected"; }).length})` : ""}`}</button></div>
          </>}
        </>}
      </section>

      <p className="text-xs leading-5 text-zinc-500">Generating creates drafts only. Review them under Email drafts, approve the ones you want, and explicitly queue or send them later.</p>
    </main>
  );
}
