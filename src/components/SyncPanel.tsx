"use client";

import { useEffect, useRef, useState } from "react";
import type { StatusResponse } from "@/lib/client-types";
import { Button, Section } from "./ui";

type SyncState =
  | { phase: "idle" }
  | { phase: "running"; message: string; fetched: number; withGps: number; rate: string | null }
  | { phase: "done"; message: string }
  | { phase: "error"; message: string };

export default function SyncPanel({
  status,
  onFinished,
}: {
  status: StatusResponse;
  onFinished: () => void;
}) {
  const [state, setState] = useState<SyncState>({ phase: "idle" });
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => () => sourceRef.current?.close(), []);

  const startSync = (full: boolean) => {
    if (state.phase === "running") return;
    sourceRef.current?.close();

    setState({
      phase: "running",
      message: full ? "Full resync…" : "Looking for new activities…",
      fetched: 0,
      withGps: 0,
      rate: null,
    });

    const source = new EventSource(`/api/sync${full ? "?full=1" : ""}`);
    sourceRef.current = source;
    let finished = false;

    source.onmessage = (event) => {
      const data = JSON.parse(event.data) as {
        type: string;
        message?: string;
        page?: number;
        fetched?: number;
        withGps?: number;
        total?: number;
        rateLimit?: {
          shortTermUsage: number;
          shortTermLimit: number;
          dailyUsage: number;
          dailyLimit: number;
        } | null;
      };

      if (data.type === "progress") {
        setState({
          phase: "running",
          message: `Page ${data.page} · ${data.fetched} activities scanned`,
          fetched: data.fetched ?? 0,
          withGps: data.withGps ?? 0,
          rate: data.rateLimit
            ? `API ${data.rateLimit.shortTermUsage}/${data.rateLimit.shortTermLimit} per 15 min · ${data.rateLimit.dailyUsage}/${data.rateLimit.dailyLimit} today`
            : null,
        });
      } else if (data.type === "done") {
        finished = true;
        source.close();
        setState({
          phase: "done",
          message: `${data.withGps ?? 0} mapped activities from ${data.fetched ?? 0} scanned · ${data.total ?? 0} in total`,
        });
        onFinished();
      } else if (data.type === "error") {
        finished = true;
        source.close();
        setState({ phase: "error", message: data.message ?? "Sync failed" });
        onFinished();
      }
    };

    source.onerror = () => {
      if (finished) return;
      finished = true;
      source.close();
      setState({ phase: "error", message: "Lost connection to the sync stream." });
      onFinished();
    };
  };

  const disconnect = async () => {
    await fetch("/api/auth/disconnect", { method: "POST" });
    onFinished();
  };

  const running = state.phase === "running";

  return (
    <Section title="Strava API sync">
      <div className="flex gap-2">
        <Button variant="primary" onClick={() => startSync(false)} disabled={running} className="flex-1">
          {running ? "Syncing…" : status.activityCount === 0 ? "Import activities" : "Sync new"}
        </Button>
        <Button onClick={() => startSync(true)} disabled={running} title="Re-download everything from scratch">
          Full
        </Button>
      </div>

      {state.phase !== "idle" ? (
        <div
          className={
            "mt-3 rounded-lg border px-2.5 py-2 text-[11px] leading-relaxed " +
            (state.phase === "error"
              ? "border-red-500/30 bg-red-500/10 text-red-200"
              : state.phase === "done"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                : "border-ink-500 bg-ink-800 text-slate-300")
          }
        >
          <div>{state.message}</div>
          {state.phase === "running" && state.withGps > 0 ? (
            <div className="mt-1 text-slate-500">{state.withGps} with GPS traces</div>
          ) : null}
          {state.phase === "running" && state.rate ? (
            <div className="mt-1 text-slate-500">{state.rate}</div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500">
        <span>
          {status.athlete
            ? `Connected as ${status.athlete.firstname} ${status.athlete.lastname}`.trim()
            : "Connected"}
        </span>
        <button type="button" onClick={disconnect} className="hover:text-slate-300">
          disconnect
        </button>
      </div>
    </Section>
  );
}
