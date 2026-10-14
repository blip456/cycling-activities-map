"use client";

import type { StatusResponse } from "@/lib/client-types";

const ERRORS: Record<string, string> = {
  missing_code: "Strava didn't send an authorisation code back. Try again.",
  missing_activity_scope:
    "The “View data about your private activities” box wasn't ticked, so private rides would be missing. Please authorise again and leave it checked.",
  access_denied: "Authorisation was declined on Strava's side.",
};

export default function ConnectScreen({
  status,
  error,
}: {
  status: StatusResponse;
  error: string | null;
}) {
  return (
    <div className="flex h-full items-center justify-center overflow-y-auto p-8">
      <div className="w-full max-w-xl py-8">
        <h1 className="text-2xl font-semibold text-slate-100">Cycling Explorer</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          Every ride, run and hike on one map — so you can see which roads you haven&apos;t done
          yet. Filter it down, then either serve it to your mapping software as a live tile overlay or export
          it as one GPX.
        </p>

        {error ? (
          <div className="mt-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {ERRORS[error] ?? error}
          </div>
        ) : null}

        {/* ---------------------------------------------- extension (default) */}
        <div className="mt-8 rounded-xl border border-ink-500 bg-ink-800 p-5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-semibold text-slate-100">Browser extension</h2>
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-emerald-300">
              no subscription
            </span>
          </div>
          <p className="mt-2 text-[13px] leading-relaxed text-slate-400">
            Reads your own activity list and full-resolution GPS traces from Strava using the
            session you&apos;re already logged in with, and posts them here. Higher detail than the
            official API&apos;s summary polylines.
          </p>
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-[13px] leading-relaxed text-slate-300">
            <li>
              Open <code className="rounded bg-black/30 px-1">chrome://extensions</code>, turn on
              Developer mode, choose <em>Load unpacked</em>, and pick the{" "}
              <code className="rounded bg-black/30 px-1">extension/</code> folder in this project.
            </li>
            <li>Log in to strava.com in that browser.</li>
            <li>
              Click the extension&apos;s toolbar button. A progress panel appears bottom-right; it
              skips anything already imported, so stopping and resuming is safe.
            </li>
            <li>Come back here and reload.</li>
          </ol>
          <p className="mt-3 text-[13px] leading-relaxed text-slate-400">
            Click the same button on squadrats.com to add your Squadrats tiles as a map layer.
          </p>
          <p className="mt-3 text-xs leading-relaxed text-slate-500">
            Strava&apos;s terms don&apos;t sanction reading these endpoints outside the official
            API, even for your own data — worth knowing before you rely on it.
          </p>
        </div>

        {/* ---------------------------------------------------- official API */}
        <div className="mt-4 rounded-xl border border-ink-600 bg-ink-800/60 p-5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-semibold text-slate-200">Official Strava API</h2>
            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-amber-300">
              needs subscription
            </span>
          </div>
          <p className="mt-2 text-[13px] leading-relaxed text-slate-400">
            Since 1 June 2026 a paid Strava subscription is a prerequisite for creating an API
            application. If you have one, this is the sanctioned route and syncs incrementally on
            its own.
          </p>

          {status.credentialsConfigured ? (
            <a
              href="/api/auth/strava"
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-strava px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-orange-600"
            >
              Connect with Strava
            </a>
          ) : (
            <ol className="mt-4 list-decimal space-y-1.5 pl-5 text-[13px] leading-relaxed text-slate-400">
              <li>
                Create an app at{" "}
                <a
                  className="text-slate-300 underline"
                  href="https://www.strava.com/settings/api"
                  target="_blank"
                  rel="noreferrer"
                >
                  strava.com/settings/api
                </a>{" "}
                with callback domain <code className="rounded bg-black/30 px-1">localhost</code>.
              </li>
              <li>
                Put the client ID and secret in{" "}
                <code className="rounded bg-black/30 px-1">.env.local</code>, then restart the dev
                server.
              </li>
            </ol>
          )}
        </div>

        <p className="mt-8 text-xs text-slate-600">
          Runs entirely on your machine. Tokens and activities live in ./data.
        </p>
      </div>
    </div>
  );
}
