
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type ScheduleSettings = {
  enabled: boolean;
  timezone: string;
  startTime: string;
  endTime: string;
  intervalMinutes: number;
  dailyLimit: number;
};

const defaults: ScheduleSettings = {
  enabled: false,
  timezone: "Asia/Kolkata",
  startTime: "23:00",
  endTime: "01:00",
  intervalMinutes: 30,
  dailyLimit: 4,
};

export default function SchedulePage() {
  const [settings, setSettings] = useState<ScheduleSettings>(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadSettings() {
      try {
        const response = await fetch("/api/mailer-schedule");
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Unable to load schedule settings.");
        }

        if (data.schedule) {
          setSettings({
            enabled: data.schedule.enabled ?? false,
            timezone: data.schedule.timezone ?? "Asia/Kolkata",
            startTime: data.schedule.startTime ?? "23:00",
            endTime: data.schedule.endTime ?? "01:00",
            intervalMinutes: data.schedule.intervalMinutes ?? 30,
            dailyLimit: data.schedule.dailyLimit ?? 4,
          });
        }
      } catch (error) {
        setMessage(
          error instanceof Error ? error.message : "Unable to load settings."
        );
      } finally {
        setLoading(false);
      }
    }

    void loadSettings();
  }, []);

  function update<K extends keyof ScheduleSettings>(
    key: K,
    value: ScheduleSettings[K]
  ) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  async function saveSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    try {
      const response = await fetch("/api/mailer-schedule", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to save schedule settings.");
      }

      setSettings({
        enabled: data.schedule.enabled,
        timezone: data.schedule.timezone,
        startTime: data.schedule.startTime,
        endTime: data.schedule.endTime,
        intervalMinutes: data.schedule.intervalMinutes,
        dailyLimit: data.schedule.dailyLimit,
      });

      setMessage(data.schedule.enabled ? "Schedule saved and enabled. Queued approved emails may send automatically during the configured window." : "Schedule saved and disabled. Future scheduled sends are paused.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to save settings."
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <main className="mx-auto max-w-2xl p-8">Loading schedule settings...</main>;
  }

  return (
    <main className="mx-auto max-w-2xl p-6 sm:p-8">
      <Link href="/" className="text-sm text-blue-700 hover:underline">
        ← Back to dashboard
      </Link>

      <h1 className="mt-5 text-3xl font-bold">Email Schedule</h1>
      <p className="mt-2 text-sm text-zinc-600">
        Configure when emails should be eligible for sending.
      </p>

      <div className="mt-5 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        When enabled in a deployment with CRON_SECRET configured, approved items in the queue can send real emails automatically during this window. Keep this disabled until your credentials and test recipient are verified.
      </div>

      <form onSubmit={saveSettings} className="mt-6 space-y-6">
        <label className="flex items-center gap-3 rounded-lg border p-4">
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(event) => update("enabled", event.target.checked)}
          />
          <span>
            <span className="block font-medium">Enable schedule</span>
            <span className="block text-sm text-zinc-600">
              Disabling this pauses future scheduled sends; in-progress provider requests may still finish.
            </span>
          </span>
        </label>

        <div>
          <label htmlFor="timezone" className="mb-2 block text-sm font-medium">
            Timezone
          </label>
          <select
            id="timezone"
            value={settings.timezone}
            onChange={(event) => update("timezone", event.target.value)}
            className="w-full rounded-lg border p-3"
          >
            <option value="Asia/Kolkata">India Standard Time (IST)</option>
            <option value="UTC">UTC</option>
            <option value="America/New_York">America/New_York</option>
            <option value="Europe/London">Europe/London</option>
          </select>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="startTime" className="mb-2 block text-sm font-medium">
              Start time
            </label>
            <input
              id="startTime"
              type="time"
              required
              value={settings.startTime}
              onChange={(event) => update("startTime", event.target.value)}
              className="w-full rounded-lg border p-3"
            />
          </div>

          <div>
            <label htmlFor="endTime" className="mb-2 block text-sm font-medium">
              End time
            </label>
            <input
              id="endTime"
              type="time"
              required
              value={settings.endTime}
              onChange={(event) => update("endTime", event.target.value)}
              className="w-full rounded-lg border p-3"
            />
          </div>
        </div>

        <div>
          <label htmlFor="interval" className="mb-2 block text-sm font-medium">
            Interval between emails (minutes)
          </label>
          <input
            id="interval"
            type="number"
            min={5}
            max={1440}
            required
            value={settings.intervalMinutes}
            onChange={(event) =>
              update("intervalMinutes", Number(event.target.value))
            }
            className="w-full rounded-lg border p-3"
          />
        </div>

        <div>
          <label htmlFor="dailyLimit" className="mb-2 block text-sm font-medium">
            Maximum emails per day
          </label>
          <input
            id="dailyLimit"
            type="number"
            min={1}
            max={500}
            required
            value={settings.dailyLimit}
            onChange={(event) =>
              update("dailyLimit", Number(event.target.value))
            }
            className="w-full rounded-lg border p-3"
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-black px-5 py-3 font-medium text-white disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save schedule"}
        </button>

        {message && (
          <p role="status" className="text-sm">
            {message}
          </p>
        )}
      </form>
    </main>
  );
}
