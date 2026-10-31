
"use client";

import { useCallback, useEffect, useState } from "react";
type ContactInfo = {
  _id?: string;
  name?: string;
  email?: string;
  company?: string;
};

type CampaignInfo = {
  _id?: string;
  name?: string;
};

type EmailDraftItem = {
  _id: string;
  subject: string;
  body: string;
  status: "pending_review" | "approved" | "rejected";
  queueStatus?: "queued" | "processing" | "sent" | "failed" | "unknown" | "cancelled" | null;
  contactId: ContactInfo | string;
  campaignDraftId: CampaignInfo | string;
  createdAt: string;
};

type FilterStatus = "all" | "pending_review" | "approved" | "rejected";

function getContact(draft: EmailDraftItem): ContactInfo {
  return typeof draft.contactId === "object" && draft.contactId !== null
    ? draft.contactId
    : {};
}

function getCampaignName(draft: EmailDraftItem): string {
  return typeof draft.campaignDraftId === "object" &&
    draft.campaignDraftId !== null
    ? draft.campaignDraftId.name || "Unnamed campaign"
    : "Campaign";
}

function getCampaignId(draft: EmailDraftItem): string {
  return typeof draft.campaignDraftId === "object" && draft.campaignDraftId !== null
    ? draft.campaignDraftId._id || ""
    : draft.campaignDraftId;
}

export default function EmailDraftsPage() {
  const [drafts, setDrafts] = useState<EmailDraftItem[]>([]);
  const [filter, setFilter] = useState<FilterStatus>("pending_review");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedDraftIds, setSelectedDraftIds] = useState<string[]>([]);
  const [bulkQueueing, setBulkQueueing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadDrafts = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (filter !== "all") params.set("status", filter);

      const response = await fetch(`/api/email-drafts?${params.toString()}`, {
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not load email drafts.");
      }

      setDrafts(Array.isArray(data.drafts) ? data.drafts : []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load email drafts."
      );
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadDrafts(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadDrafts]);

  async function updateStatus(
    draft: EmailDraftItem,
    status: "approved" | "rejected"
  ) {
    const action = status === "approved" ? "approve" : "reject";

    if (
      !window.confirm(
        `Are you sure you want to ${action} this email draft?`
      )
    ) {
      return;
    }

    setBusyId(draft._id);
    setError("");
    setNotice("");

    try {
      const response = await fetch(`/api/email-drafts/${draft._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `Could not ${action} the draft.`);
      }

      setNotice(`Draft ${status === "approved" ? "approved" : "rejected"}.`);
      await loadDrafts();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : `Could not ${action} the draft.`
      );
    } finally {
      setBusyId(null);
    }
  }

  async function regenerateDraft(draft: EmailDraftItem) {
    const campaignDraftId = getCampaignId(draft);
    const contact = getContact(draft);
    const contactId = typeof draft.contactId === "string" ? draft.contactId : draft.contactId._id;
    if (!campaignDraftId || !contactId) {
      setError("This draft is missing its campaign or contact reference.");
      return;
    }

    setBusyId(draft._id);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/campaign-drafts/${campaignDraftId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId, regenerateDraftId: draft._id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not regenerate this draft.");
      setNotice(`Draft regenerated for ${contact.email || "the contact"} and returned to pending review.`);
      await loadDrafts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not regenerate this draft.");
    } finally {
      setBusyId(null);
    }
  }

  async function queueEmail(draft: EmailDraftItem) {
    const contact = getContact(draft);
    if (!window.confirm(
      `Queue this approved email to ${contact.email || "the selected recipient"} for scheduled delivery? It will only send when the configured schedule is enabled.`
    )) return;

    setBusyId(draft._id);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/email-queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailDraftId: draft._id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not queue this email.");
      setNotice(`Email queued for ${contact.email || "the recipient"}.`);
      await loadDrafts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not queue this email.");
    } finally {
      setBusyId(null);
    }
  }

  async function queueSelectedEmails() {
    const ids = selectedDraftIds.filter((id) => {
      const draft = drafts.find((item) => item._id === id);
      return draft?.status === "approved" && !draft.queueStatus;
    });
    if (!ids.length || bulkQueueing) return;
    if (!window.confirm(`Queue ${ids.length} approved email${ids.length === 1 ? "" : "s"} for scheduled delivery? They will send only when your configured schedule allows.`)) return;

    setBulkQueueing(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/email-queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailDraftIds: ids }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not queue the selected emails.");
      const queuedCount = Number(data.queuedCount) || 0;
      const failedCount = Array.isArray(data.results)
        ? data.results.filter((item: { status?: string }) => item.status === "failed").length
        : 0;
      const skippedCount = Array.isArray(data.results)
        ? data.results.filter((item: { status?: string }) => item.status === "skipped" || item.status === "already_queued").length
        : 0;
      setNotice(`${queuedCount} email${queuedCount === 1 ? "" : "s"} queued${skippedCount ? `; ${skippedCount} already queued or skipped` : ""}.`);
      if (failedCount) setError(`${failedCount} selected email${failedCount === 1 ? "" : "s"} could not be queued. Refresh to check their status, then retry if needed.`);
      setSelectedDraftIds([]);
      await loadDrafts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not queue the selected emails.");
    } finally {
      setBulkQueueing(false);
    }
  }

  function toggleSelectedDraft(draftId: string) {
    setSelectedDraftIds((selected) => selected.includes(draftId)
      ? selected.filter((id) => id !== draftId)
      : [...selected, draftId]);
  }

  async function sendEmail(draft: EmailDraftItem) {
    const contact = getContact(draft);
    const recipient = contact.email || "the selected recipient";

    if (
      !window.confirm(
        `Send this email to ${recipient} using your active Gmail account?\n\nSubject: ${draft.subject}\n\nThis action may send a real email.`
      )
    ) {
      return;
    }

    setBusyId(draft._id);
    setError("");
    setNotice("");

    try {
      const response = await fetch(`/api/email-drafts/${draft._id}/send`, {
        method: "POST",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "The email could not be confirmed as sent."
        );
      }

      setNotice(
        `Email sent to ${data.send?.recipientEmail || recipient}.`
      );
      await loadDrafts();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to send the email."
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-5 py-10">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Email Drafts
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            Review AI-generated emails before sending them.
          </p>
        </div>

      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {(
          [
            ["pending_review", "Pending review"],
            ["approved", "Approved"],
            ["rejected", "Rejected"],
            ["all", "All drafts"],
          ] as [FilterStatus, string][]
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => { setFilter(value); setSelectedDraftIds([]); }}
            className={`rounded-full px-4 py-2 text-sm font-medium ${
              filter === value
                ? "bg-black text-white"
                : "border border-gray-300 hover:bg-gray-50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <div
          role="alert"
          className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      {notice && (
        <div
          role="status"
          className="mb-5 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800"
        >
          {notice}
        </div>
      )}

      {loading ? (
        <p className="py-12 text-center text-sm text-gray-500">
          Loading drafts...
        </p>
      ) : drafts.length === 0 ? (
        <div className="rounded-xl border border-gray-200 p-10 text-center">
          <h2 className="font-medium">No drafts found</h2>
          <p className="mt-2 text-sm text-gray-500">
            Try another filter or generate email drafts from a campaign.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {drafts.some((draft) => draft.status === "approved") && (() => {
            const queueable = drafts.filter((draft) => draft.status === "approved" && !draft.queueStatus);
            const selectedCount = selectedDraftIds.filter((id) => queueable.some((draft) => draft._id === id)).length;
            return (
              <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-100 bg-indigo-50 p-4">
                <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-indigo-950">
                  <input
                    type="checkbox"
                    checked={queueable.length > 0 && selectedCount === queueable.length}
                    disabled={bulkQueueing || queueable.length === 0}
                    onChange={(event) => setSelectedDraftIds(event.target.checked ? queueable.map((draft) => draft._id) : [])}
                    className="h-4 w-4 rounded border-zinc-300"
                  />
                  Select all queueable approved drafts on this page ({queueable.length})
                </label>
                <button
                  type="button"
                  disabled={bulkQueueing || selectedCount === 0}
                  onClick={() => void queueSelectedEmails()}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {bulkQueueing ? "Queueing selected…" : `Queue selected (${selectedCount})`}
                </button>
              </section>
            );
          })()}
          {drafts.map((draft) => {
            const contact = getContact(draft);
            const isBusy = busyId === draft._id || bulkQueueing;

            return (
              <article
                key={draft._id}
                aria-busy={isBusy}
                className={`relative rounded-xl border border-gray-200 p-5 shadow-sm transition-opacity ${isBusy ? "opacity-60" : ""}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    {draft.status === "approved" && !draft.queueStatus && (
                      <label className="mb-2 inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-indigo-700">
                        <input type="checkbox" checked={selectedDraftIds.includes(draft._id)} disabled={bulkQueueing} onChange={() => toggleSelectedDraft(draft._id)} className="h-4 w-4 rounded border-zinc-300" />
                        Select for queue
                      </label>
                    )}
                    <p className="text-sm text-gray-500">
                      {contact.name || "Contact"}
                      {contact.company ? ` · ${contact.company}` : ""}
                    </p>
                    <p className="mt-1 text-sm">
                      {contact.email || "Recipient email unavailable"}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      {getCampaignName(draft)}
                    </p>
                  </div>

                  <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium">
                    {draft.queueStatus ? draft.queueStatus.replace("_", " ") : draft.status.replace("_", " ")}
                  </span>
                </div>

                <div className="mt-5 border-t border-gray-100 pt-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Subject
                  </p>
                  <h2 className="mt-1 text-lg font-semibold">
                    {draft.subject}
                  </h2>

                  <p className="mt-5 text-xs font-medium uppercase tracking-wide text-gray-500">
                    Email body
                  </p>
                  <p className="mt-2 whitespace-pre-wrap wrap-break-word text-sm leading-6 text-gray-800">
                    {draft.body}
                  </p>
                </div>

                <div className="mt-5 flex flex-wrap gap-3 border-t border-gray-100 pt-4">
                  {draft.status === "pending_review" && (
                    <>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void updateStatus(draft, "approved")}
                        className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                      >
                        {isBusy ? "Please wait..." : "Approve"}
                      </button>

                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void updateStatus(draft, "rejected")}
                        className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium disabled:opacity-50"
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void regenerateDraft(draft)}
                        className="rounded-lg border border-indigo-300 px-4 py-2 text-sm font-medium text-indigo-700 disabled:opacity-50"
                      >
                        Regenerate
                      </button>
                    </>
                  )}

                  {draft.status === "approved" && (
                    <>
                      <button
                        type="button"
                        disabled={isBusy || !contact.email || Boolean(draft.queueStatus)}
                        onClick={() => void queueEmail(draft)}
                        className={`rounded-lg px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 ${draft.queueStatus ? "bg-emerald-700" : "bg-indigo-600"}`}
                      >
                        {isBusy ? "Processing..." : draft.queueStatus === "queued" ? "Queued" : draft.queueStatus ? `Queue ${draft.queueStatus}` : "Queue for schedule"}
                      </button>
                      <button
                        type="button"
                        disabled={isBusy || !contact.email}
                        onClick={() => void sendEmail(draft)}
                        className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium disabled:opacity-50"
                      >
                        {isBusy ? "Processing..." : "Send now"}
                      </button>
                    </>
                  )}

                  {draft.status === "rejected" && (
                    <>
                      <p className="self-center text-sm text-gray-500">This draft was rejected and cannot be sent.</p>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void regenerateDraft(draft)}
                        className="rounded-lg border border-indigo-300 px-4 py-2 text-sm font-medium text-indigo-700 disabled:opacity-50"
                      >
                        Regenerate
                      </button>
                    </>
                  )}
                </div>
                {isBusy && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-white/75 backdrop-blur-[1px]" aria-live="polite">
                    <span className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 shadow-sm">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" aria-hidden="true" />
                      Working on this draft…
                    </span>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}
