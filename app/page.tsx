"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";

type GmailAccount = {
  id: string;
  email: string;
  status: "connected" | "disconnected";
  connectedAt: string;
};

type ApiError = {
  error?: string;
};

export default function Home() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [accounts, setAccounts] = useState<GmailAccount[]>([]);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">(
    "success",
  );

  const searchParams = useSearchParams();

  const gmailStatus = searchParams.get("gmail");
  const reason = searchParams.get("reason");

  const oauthMessages: Record<string, string> = {
    email_mismatch:
      "The Google account you authorized does not match the email you entered.",
    consent_denied: "Google authorization was cancelled.",
    invalid_state:
      "The authorization session expired or was invalid. Try again.",
    invalid_callback: "The authorization response was incomplete. Try again.",
    account_not_verified: "Google could not verify the selected email.",
    missing_refresh_token:
      "Google did not provide a refresh token. Reconnect and grant consent.",
    connection_failed: "Gmail connection failed. Check your server logs.",
  };

  const oauthMessage =
    gmailStatus === "connected"
      ? "Gmail account verified and configured successfully."
      : gmailStatus === "error"
        ? (oauthMessages[reason ?? ""] ?? "Gmail configuration failed.")
        : "";

  const loadAccounts = useCallback(async () => {
    try {
      const [accountsResponse, activeResponse] = await Promise.all([
        fetch("/api/auth/google/accounts", { cache: "no-store" }),
        fetch("/api/auth/google/active", { cache: "no-store" }),
      ]);

      if (!accountsResponse.ok || !activeResponse.ok) {
        throw new Error("Unable to load Gmail configuration.");
      }

      const accountsData = await accountsResponse.json();
      const activeData = await activeResponse.json();

      setAccounts(accountsData.accounts ?? []);
      setActiveAccountId(activeData.activeAccount?.id ?? null);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Failed to load accounts.",
      );
      setMessageType("error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function fetchAccounts() {
      try {
        const [accountsResponse, activeResponse] = await Promise.all([
          fetch("/api/auth/google/accounts", { cache: "no-store" }),
          fetch("/api/auth/google/active", { cache: "no-store" }),
        ]);

        if (!accountsResponse.ok || !activeResponse.ok) {
          throw new Error("Unable to load Gmail configuration.");
        }

        const accountsData = await accountsResponse.json();
        const activeData = await activeResponse.json();

        if (cancelled) return;

        setAccounts(accountsData.accounts ?? []);
        setActiveAccountId(activeData.activeAccount?.id ?? null);
      } catch (error) {
        if (cancelled) return;

        setMessage(
          error instanceof Error ? error.message : "Failed to load accounts.",
        );
        setMessageType("error");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void fetchAccounts();

    return () => {
      cancelled = true;
    };
  }, []);

  async function configureGmail() {
    const normalizedEmail = email.trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setMessage("Enter a valid Gmail address.");
      setMessageType("error");
      return;
    }

    if (!normalizedEmail.endsWith("@gmail.com")) {
      setMessage("Please enter a Gmail address ending in @gmail.com.");
      setMessageType("error");
      return;
    }

    setMessage("");
    router.push(
      `/api/auth/google/connect?email=${encodeURIComponent(normalizedEmail)}`,
    );
  }

  async function selectActiveAccount(accountId: string) {
    setBusy(true);
    setMessage("");

    try {
      const response = await fetch("/api/auth/google/active", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId }),
      });

      const data: ApiError = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Could not select this account.");
      }

      setActiveAccountId(accountId);
      setMessage("Active sending account updated.");
      setMessageType("success");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Failed to select account.",
      );
      setMessageType("error");
    } finally {
      setBusy(false);
    }
  }

  async function disconnectAccount(account: GmailAccount) {
    const confirmed = window.confirm(
      `Disconnect ${account.email}? This removes its saved OAuth tokens.`,
    );

    if (!confirmed) return;

    setBusy(true);
    setMessage("");

    try {
      const response = await fetch("/api/auth/google/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: account.email }),
      });

      const data: ApiError = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Could not disconnect account.");
      }

      if (activeAccountId === account.id) {
        setActiveAccountId(null);
      }

      setAccounts((previous) =>
        previous.filter((item) => item.id !== account.id),
      );

      setMessage(`${account.email} has been disconnected.`);
      setMessageType("success");

      await loadAccounts();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Failed to disconnect account.",
      );
      setMessageType("error");
    } finally {
      setBusy(false);
    }
  }
  const visibleMessage = message || oauthMessage;

  const visibleMessageType = message
    ? messageType
    : gmailStatus === "error"
      ? "error"
      : "success";
  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="mx-auto max-w-5xl px-5 py-10 sm:px-8">
        <header className="mb-10 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-600">
              Mailer
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">
              Email automation
            </h1>
            <p className="mt-2 text-sm text-zinc-500">
              Manage your sending accounts and campaign setup.
            </p>
          </div>

          <div className="hidden rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-600 sm:block">
            <span className="mr-2 inline-block h-2 w-2 rounded-full bg-emerald-500" />
            Local workspace
          </div>
        </header>

        <div className="mb-8 flex flex-wrap gap-3">
          <a
            href="/email-drafts"
            className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Email Drafts
          </a>

          <a
            href="/email-sends"
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50"
          >
            Send History
          </a>
          <a
            href="/schedule"
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50"
          >
            Schedule
          </a>
          <a
            href="/replies"
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50"
          >
            Replies
          </a>
        </div>

        {visibleMessage && (
          <div
            role="status"
            className={`mb-6 rounded-xl border px-4 py-3 text-sm ${
              visibleMessageType === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-red-200 bg-red-50 text-red-800"
            }`}
          >
            {visibleMessage}
          </div>
        )}

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="mb-6">
            <p className="text-sm font-medium text-indigo-600">
              Step 01 · Gmail
            </p>
            <h2 className="mt-2 text-xl font-semibold">
              Configure sending account
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
              Enter the Gmail address you want to use. Google will ask you to
              authorize access, and Mailer will verify the selected account.
            </p>
          </div>

          <form
            className="flex flex-col gap-3 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault();
              void configureGmail();
            }}
          >
            <label className="sr-only" htmlFor="gmail-email">
              Gmail address
            </label>
            <input
              id="gmail-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@gmail.com"
              className="min-w-0 flex-1 rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
              required
            />
            <button
              type="submit"
              className="rounded-xl bg-red-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-red-700 focus:outline-none focus:ring-4 focus:ring-red-100"
            >
              Configure with Google
            </button>
          </form>

          <p className="mt-3 text-xs leading-5 text-zinc-500">
            You will be redirected to Google. Mailer will not mark an account
            configured unless the authorized address matches the address
            entered.
          </p>
        </section>

        <section className="mt-8 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Connected accounts</h2>
              <p className="mt-1 text-sm text-zinc-500">
                Choose which authorized account should be used for future
                sending.
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setLoading(true);
                void loadAccounts();
              }}
              disabled={loading || busy}
              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50"
            >
              Refresh
            </button>
          </div>

          {loading ? (
            <p className="py-8 text-center text-sm text-zinc-500">
              Loading Gmail accounts...
            </p>
          ) : accounts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-300 px-5 py-10 text-center">
              <p className="font-medium text-zinc-700">
                No connected accounts yet
              </p>
              <p className="mt-2 text-sm text-zinc-500">
                Configure a Gmail account above to get started.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {accounts.map((account) => {
                const isActive = activeAccountId === account.id;

                return (
                  <div
                    key={account.id}
                    className="flex flex-col gap-4 rounded-xl border border-zinc-200 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-50 font-semibold text-indigo-700">
                        {account.email.charAt(0).toUpperCase()}
                      </div>

                      <div className="min-w-0">
                        <p className="break-all font-medium">{account.email}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                          <span className="rounded-full bg-emerald-50 px-2 py-1 font-medium text-emerald-700">
                            Configured
                          </span>
                          {isActive && (
                            <span className="rounded-full bg-indigo-50 px-2 py-1 font-medium text-indigo-700">
                              Active sender
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 sm:shrink-0">
                      {!isActive && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void selectActiveAccount(account.id)}
                          className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                        >
                          Set active
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void disconnectAccount(account)}
                        className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                      >
                        Disconnect
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="mt-8 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-zinc-200 bg-white p-5">
            <p className="text-sm font-medium text-zinc-500">Email sending</p>
            <p className="mt-2 font-semibold">Not enabled</p>
            <p className="mt-1 text-sm leading-5 text-zinc-500">
              Sending will be implemented after account configuration and
              approval workflows are verified.
            </p>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-5">
            <p className="text-sm font-medium text-zinc-500">Reply tracking</p>
            <p className="mt-2 font-semibold">Not enabled</p>
            <p className="mt-1 text-sm leading-5 text-zinc-500">
              Reply status will be connected to the account that originally sent
              each message.
            </p>
          </div>
        </section>

        <footer className="mt-10 text-center text-xs leading-5 text-zinc-400">
          Mailer · Gmail configuration
        </footer>
      </div>
    </main>
  );
}
