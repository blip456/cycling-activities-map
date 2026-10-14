"use client";

import { useState, type ReactNode } from "react";
import { relativeTime } from "@/lib/format";

export function Section({
  title,
  hint,
  right,
  children,
}: {
  title: string;
  hint?: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-ink-600/70 px-4 py-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
          {title}
        </h2>
        {right}
      </div>
      {hint ? <p className="mb-3 text-xs leading-relaxed text-slate-500">{hint}</p> : null}
      {children}
    </section>
  );
}

export function Chip({
  active,
  onClick,
  children,
  title,
}: {
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={
        "rounded-full border px-2.5 py-1 text-xs transition-colors " +
        (active
          ? "border-strava/60 bg-strava/15 text-orange-200"
          : "border-ink-500 bg-ink-700 text-slate-300 hover:border-ink-500/80 hover:bg-ink-600")
      }
    >
      {children}
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string; title?: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex overflow-hidden rounded-lg border border-ink-500 bg-ink-700">
      {options.map((option, index) => (
        <button
          key={option.value}
          type="button"
          title={option.title}
          onClick={() => onChange(option.value)}
          className={
            "flex-1 px-2 py-1.5 text-xs transition-colors " +
            (index > 0 ? "border-l border-ink-500 " : "") +
            (value === option.value
              ? "bg-strava/20 text-orange-200"
              : "text-slate-400 hover:bg-ink-600 hover:text-slate-200")
          }
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function NumberField({
  value,
  onChange,
  placeholder,
  suffix,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  placeholder: string;
  suffix?: string;
}) {
  return (
    <label className="flex flex-1 items-center gap-1 rounded-lg border border-ink-500 bg-ink-700 px-2 py-1.5 focus-within:border-strava/60">
      <input
        type="number"
        inputMode="numeric"
        min={0}
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(event) => {
          const raw = event.target.value;
          onChange(raw === "" ? null : Number(raw));
        }}
        className="w-full min-w-0 bg-transparent text-sm text-slate-200 outline-none placeholder:text-slate-500 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
      />
      {suffix ? <span className="text-[11px] text-slate-500">{suffix}</span> : null}
    </label>
  );
}

export function Button({
  onClick,
  children,
  variant = "default",
  disabled,
  title,
  className = "",
}: {
  onClick?: () => void;
  children: ReactNode;
  variant?: "default" | "primary" | "ghost";
  disabled?: boolean;
  title?: string;
  className?: string;
}) {
  const styles = {
    primary:
      "bg-strava text-white hover:bg-orange-600 disabled:bg-ink-600 disabled:text-slate-500",
    default:
      "border border-ink-500 bg-ink-700 text-slate-200 hover:bg-ink-600 disabled:text-slate-500",
    ghost: "text-slate-400 hover:text-slate-200",
  }[variant];

  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

export function Checkbox({
  checked,
  indeterminate,
  onChange,
  children,
  count,
  color,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
  count?: ReactNode;
  color?: string;
}) {
  const mark = indeterminate ? "–" : checked ? "✓" : "";
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left text-sm hover:bg-ink-700"
    >
      <span
        className={
          "flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] leading-none " +
          (checked || indeterminate
            ? "border-strava/70 bg-strava/25 text-orange-100"
            : "border-ink-500 bg-ink-800 text-transparent")
        }
      >
        {mark}
      </span>
      {color ? (
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
      ) : null}
      <span className="min-w-0 flex-1 truncate text-slate-300">{children}</span>
      {count !== undefined ? (
        <span className="shrink-0 text-[11px] tabular-nums text-slate-500">{count}</span>
      ) : null}
    </button>
  );
}

export function CopyUrl({ label, hint, url }: { label: string; hint?: string; url: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-slate-300">{label}</span>
        <button
          type="button"
          onClick={copy}
          className="text-[11px] text-strava hover:text-orange-300"
        >
          {copied ? "Copied ✓" : "Copy"}
        </button>
      </div>
      {hint ? <p className="mb-1.5 text-[11px] leading-relaxed text-slate-500">{hint}</p> : null}
      <div className="rounded-lg border border-ink-500 bg-ink-800 p-2">
        <code className="block max-h-24 overflow-y-auto break-all text-[10.5px] leading-relaxed text-slate-400">
          {url}
        </code>
      </div>
    </div>
  );
}

// ------------------------------------------------- sidebar group skeleton
// Squadrats and Strava are both a Group: the same header, visibility toggle,
// XYZ URLs and sync help, with their own sections in between.

/** Sticks to the top of the sidebar while its group scrolls past. */
export function GroupHeader({
  title,
  color,
  children,
}: {
  title: string;
  color: string;
  children?: ReactNode;
}) {
  return (
    <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-ink-600 bg-ink-700 px-4 py-3">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
      <h2 className="text-sm font-semibold tracking-tight text-slate-100">{title}</h2>
      {children ? <span className="ml-auto text-[11px] text-slate-500">{children}</span> : null}
    </div>
  );
}

export function Group({
  title,
  color,
  syncedAt,
  visible,
  onVisibleChange,
  children,
}: {
  title: string;
  color: string;
  syncedAt: string | null;
  visible: boolean;
  onVisibleChange: (visible: boolean) => void;
  children: ReactNode;
}) {
  return (
    <div className="border-b-8 border-ink-900">
      <GroupHeader title={title} color={color}>
        synced {relativeTime(syncedAt)}
      </GroupHeader>
      <div className="border-b border-ink-600/70 px-4 py-3">
        <Segmented<"on" | "off">
          value={visible ? "on" : "off"}
          options={[
            { value: "on", label: "Show on map" },
            { value: "off", label: "Hide" },
          ]}
          onChange={(value) => onVisibleChange(value === "on")}
        />
      </div>
      {children}
    </div>
  );
}

export function XyzUrls({
  liveUrl,
  fixedUrl,
  children,
}: {
  liveUrl: string;
  fixedUrl: string | null;
  children?: ReactNode;
}) {
  return (
    <Section title="XYZ server URL">
      <div className="space-y-3">
        <CopyUrl
          label="Live URL"
          hint="Add once. Always renders what's selected above — reload your mapping software after a change to redraw tiles it already loaded."
          url={liveUrl}
        />
        {fixedUrl ? (
          <CopyUrl
            label="Fixed URL"
            hint="Pinned to the current selection, so it keeps looking the same."
            url={fixedUrl}
          />
        ) : null}
      </div>
      {children}
    </Section>
  );
}

export function SyncHelp({ children }: { children: ReactNode }) {
  return (
    <section className="px-4 py-3">
      <details className="text-xs text-slate-500">
        <summary className="cursor-pointer hover:text-slate-300">How syncing works</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-4 leading-relaxed">{children}</ol>
      </details>
    </section>
  );
}
