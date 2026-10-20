
"use client";

import { useCallback, useEffect, useState } from "react";

type SendStatus = "sending" | "sent" | "failed" | "unknown";

type EmailSendItem = {
  _id: string;
  senderEmail: string;
  recipientEmail: string;
  status: SendStatus;
  gmailMessageId?: string;
  gmailThreadId?: string;
  errorMessage?: string;
  attemptedAt: string;
  sentAt?: string;
};

type StatusFilter = "all" | SendStatus;

const statusStyles: Record<SendStatus, string> = {
  sent: "bg-green-100 text-green-800",
  sending: "bg-blue-100 text-blue-800",
  failed: "bg-red-100 text-red-800",
  unknown: "bg-amber-100 text-amber-800",
};

function formatDate(value?: string) {
  if (!value) return "—";

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString();
}

export default function EmailSendsPage() {
  const [sends, setSends] = useState<EmailSendItem[]>([]);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadHistory = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: "20",
      });

      if (filter !== "all") {
        params.set("status", filter);
      }

      const response = await fetch(`/api/email-sends?${params}`, {
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not load send history.");
      }

      setSends(Array.isArray(data.sends) ? data.sends : []);
      setTotal(data.pagination?.total ?? 0);
      setTotalPages(data.pagination?.totalPages ?? 0);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load send history."
      );
    } finally {
      setLoading(false);
    }
  }, [filter, page]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  function changeFilter(value: StatusFilter) {
    setFilter(value);
    setPage(1);
  }

  return (
    <main className="mx-auto max-w-6xl px-5 py-10">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Send History
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            Track email attempts and the Gmail account used for each one.
          </p>
        </div>

        <a
          href="/"
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50"
        >
          Back to dashboard
        </a>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {(
          [
            ["all", "All"],
            ["sent", "Sent"],
            ["sending", "Sending"],
            ["failed", "Failed"],
            ["unknown", "Uncertain"],
          ] as [StatusFilter, string][]
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => changeFilter(value)}
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
          <button
            type="button"
            onClick={() => void loadHistory()}
            className="ml-3 font-semibold underline"
          >
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <p className="py-12 text-center text-sm text-gray-500">
          Loading send history...
        </p>
      ) : sends.length === 0 ? (
        <div className="rounded-xl border border-gray-200 p-10 text-center">
          <h2 className="font-medium">No send records found</h2>
          <p className="mt-2 text-sm text-gray-500">
            Records will appear here when a send attempt is made.
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {sends.map((send) => (
              <article
                key={send._id}
                className="rounded-xl border border-gray-200 p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-all text-sm text-gray-500">
                      From: {send.senderEmail}
                    </p>
                    <p className="mt-1 break-all font-medium">
                      To: {send.recipientEmail}
                    </p>
                  </div>

                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      statusStyles[send.status]
                    }`}
                  >
                    {send.status}
                  </span>
                </div>

                <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <p className="text-gray-500">Attempted</p>
                    <p className="mt-1">{formatDate(send.attemptedAt)}</p>
                  </div>

                  <div>
                    <p className="text-gray-500">Sent at</p>
                    <p className="mt-1">{formatDate(send.sentAt)}</p>
                  </div>
                </div>

                {send.gmailMessageId && (
                  <div className="mt-4">
                    <p className="text-xs font-medium text-gray-500">
                      Gmail message ID
                    </p>
                    <p className="mt-1 break-all font-mono text-xs">
                      {send.gmailMessageId}
                    </p>
                  </div>
                )}

                {send.gmailThreadId && (
                  <div className="mt-3">
                    <p className="text-xs font-medium text-gray-500">
                      Gmail thread ID
                    </p>
                    <p className="mt-1 break-all font-mono text-xs">
                      {send.gmailThreadId}
                    </p>
                  </div>
                )}

                {send.errorMessage && (
                  <div className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                    {send.errorMessage}
                  </div>
                )}

                {send.status === "unknown" && (
                  <p className="mt-3 text-sm font-medium text-amber-800">
                    Check the sender’s Gmail Sent folder before attempting
                    another send.
                  </p>
                )}
              </article>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-gray-500">
              {total} record{total === 1 ? "" : "s"} · Page {page} of{" "}
              {totalPages}
            </p>

            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((current) => current - 1)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm disabled:opacity-40"
              >
                Previous
              </button>

              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((current) => current + 1)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </main>
  );
}
