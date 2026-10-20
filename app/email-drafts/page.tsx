
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
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

export default function EmailDraftsPage() {
  const [drafts, setDrafts] = useState<EmailDraftItem[]>([]);
  const [filter, setFilter] = useState<FilterStatus>("pending_review");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadDrafts = useCallback(async () => {
    try {
      const query =
        filter === "all" ? "" : `?status=${encodeURIComponent(filter)}`;

      const response = await fetch(`/api/email-drafts${query}`, {
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
    void loadDrafts();
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not queue this email.");
    } finally {
      setBusyId(null);
    }
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

        <Link
          href="/"
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50"
        >
          Back to dashboard
        </Link>
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
            onClick={() => setFilter(value)}
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
          {drafts.map((draft) => {
            const contact = getContact(draft);
            const isBusy = busyId === draft._id;

            return (
              <article
                key={draft._id}
                className="rounded-xl border border-gray-200 p-5 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
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
                    {draft.status.replace("_", " ")}
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
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-gray-800">
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
                    </>
                  )}

                  {draft.status === "approved" && (
                    <>
                      <button
                        type="button"
                        disabled={isBusy || !contact.email}
                        onClick={() => void queueEmail(draft)}
                        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                      >
                        {isBusy ? "Processing..." : "Queue for schedule"}
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
                    <p className="text-sm text-gray-500">
                      This draft was rejected and cannot be sent.
                    </p>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}
