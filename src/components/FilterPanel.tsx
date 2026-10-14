"use client";

import { useMemo } from "react";
import {
  CATEGORY_COLORS,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  categoryOf,
  humanizeSportType,
  type Category,
} from "@/lib/activityTypes";
import { DEFAULT_FILTERS, type CommuteMode, type Filters } from "@/lib/filters";
import { Checkbox, Chip, NumberField, Section, Segmented } from "./ui";

export type SportTypeCount = { type: string; count: number };

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

export default function FilterPanel({
  filters,
  onChange,
  sportTypes,
  commuteCount,
}: {
  filters: Filters;
  onChange: (next: Filters) => void;
  sportTypes: SportTypeCount[];
  commuteCount: number;
}) {
  const allTypes = useMemo(() => sportTypes.map((s) => s.type), [sportTypes]);

  /** `filters.types === []` means "everything", so render it as all-checked. */
  const selected = useMemo(
    () => new Set(filters.types.length ? filters.types : allTypes),
    [filters.types, allTypes]
  );

  const grouped = useMemo(() => {
    const map = new Map<Category, SportTypeCount[]>();
    for (const entry of sportTypes) {
      const category = categoryOf(entry.type);
      const list = map.get(category) ?? [];
      list.push(entry);
      map.set(category, list);
    }
    return CATEGORY_ORDER.filter((c) => map.has(c)).map((category) => ({
      category,
      types: (map.get(category) ?? []).sort((a, b) => b.count - a.count),
    }));
  }, [sportTypes]);

  const setTypes = (next: Set<string>) => {
    // Collapse "everything selected" back to the empty = all representation.
    const list = allTypes.filter((t) => next.has(t));
    onChange({ ...filters, types: list.length === allTypes.length ? [] : list });
  };

  const toggleType = (type: string) => {
    const next = new Set(selected);
    if (next.has(type)) next.delete(type);
    else next.add(type);
    setTypes(next);
  };

  const toggleCategory = (category: Category, types: SportTypeCount[]) => {
    const inCategory = types.map((t) => t.type);
    const allOn = inCategory.every((t) => selected.has(t));
    const next = new Set(selected);
    for (const t of inCategory) {
      if (allOn) next.delete(t);
      else next.add(t);
    }
    setTypes(next);
  };

  const onlyCategory = (category: Category) => {
    const next = new Set(allTypes.filter((t) => categoryOf(t) === category));
    setTypes(next);
  };

  return (
    <>
      <Section
        title="Activity type"
        right={
          <div className="flex gap-2">
            <button
              type="button"
              className="text-[11px] text-slate-500 hover:text-slate-300"
              onClick={() => onlyCategory("cycling")}
            >
              cycling only
            </button>
            <button
              type="button"
              className="text-[11px] text-slate-500 hover:text-slate-300"
              onClick={() => onChange({ ...filters, types: [] })}
            >
              all
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          {grouped.map(({ category, types }) => {
            const inCategory = types.map((t) => t.type);
            const on = inCategory.filter((t) => selected.has(t)).length;
            return (
              <div key={category}>
                <Checkbox
                  checked={on === inCategory.length}
                  indeterminate={on > 0 && on < inCategory.length}
                  onChange={() => toggleCategory(category, types)}
                  color={CATEGORY_COLORS[category]}
                  count={types.reduce((sum, t) => sum + t.count, 0)}
                >
                  <span className="font-medium text-slate-200">{CATEGORY_LABELS[category]}</span>
                </Checkbox>
                {types.length > 1 ? (
                  <div className="ml-5 mt-0.5 space-y-0.5">
                    {types.map((entry) => (
                      <Checkbox
                        key={entry.type}
                        checked={selected.has(entry.type)}
                        onChange={() => toggleType(entry.type)}
                        count={entry.count}
                      >
                        {humanizeSportType(entry.type)}
                      </Checkbox>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
          {grouped.length === 0 ? (
            <p className="text-xs text-slate-500">Sync to see your activity types.</p>
          ) : null}
        </div>
      </Section>

      <Section
        title="Date range"
        right={
          filters.from || filters.to ? (
            <button
              type="button"
              className="text-[11px] text-slate-500 hover:text-slate-300"
              onClick={() => onChange({ ...filters, from: "", to: "" })}
            >
              clear
            </button>
          ) : null
        }
      >
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={filters.from}
            max={filters.to || undefined}
            onChange={(event) => onChange({ ...filters, from: event.target.value })}
            className="flex-1 rounded-lg border border-ink-500 bg-ink-700 px-2 py-1.5 text-sm text-slate-200 outline-none focus:border-strava/60"
          />
          <span className="text-slate-500">→</span>
          <input
            type="date"
            value={filters.to}
            min={filters.from || undefined}
            onChange={(event) => onChange({ ...filters, to: event.target.value })}
            className="flex-1 rounded-lg border border-ink-500 bg-ink-700 px-2 py-1.5 text-sm text-slate-200 outline-none focus:border-strava/60"
          />
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Chip
            active={!filters.from && !filters.to}
            onClick={() => onChange({ ...filters, from: "", to: "" })}
          >
            All time
          </Chip>
          <Chip onClick={() => onChange({ ...filters, from: daysAgo(365), to: today() })}>
            12 months
          </Chip>
          <Chip onClick={() => onChange({ ...filters, from: daysAgo(365 * 3), to: today() })}>
            3 years
          </Chip>
          <Chip
            onClick={() =>
              onChange({ ...filters, from: `${new Date().getFullYear()}-01-01`, to: today() })
            }
          >
            This year
          </Chip>
        </div>
      </Section>

      <Section title="Distance">
        <div className="flex items-center gap-2">
          <NumberField
            value={filters.minDistance}
            onChange={(minDistance) => onChange({ ...filters, minDistance })}
            placeholder="min"
            suffix="km"
          />
          <span className="text-slate-500">→</span>
          <NumberField
            value={filters.maxDistance}
            onChange={(maxDistance) => onChange({ ...filters, maxDistance })}
            placeholder="max"
            suffix="km"
          />
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {[30, 50, 80, 120].map((km) => (
            <Chip
              key={km}
              active={filters.minDistance === km}
              onClick={() =>
                onChange({ ...filters, minDistance: filters.minDistance === km ? null : km })
              }
            >
              ≥ {km} km
            </Chip>
          ))}
        </div>
      </Section>

      <Section title="Elevation gain">
        <div className="flex items-center gap-2">
          <NumberField
            value={filters.minElevation}
            onChange={(minElevation) => onChange({ ...filters, minElevation })}
            placeholder="min"
            suffix="m"
          />
          <span className="text-slate-500">→</span>
          <NumberField
            value={filters.maxElevation}
            onChange={(maxElevation) => onChange({ ...filters, maxElevation })}
            placeholder="max"
            suffix="m"
          />
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {[500, 1000, 1500].map((m) => (
            <Chip
              key={m}
              active={filters.minElevation === m}
              onClick={() =>
                onChange({ ...filters, minElevation: filters.minElevation === m ? null : m })
              }
            >
              ≥ {m} m
            </Chip>
          ))}
        </div>
      </Section>

      <Section
        title="Commutes"
        hint={
          commuteCount > 0
            ? `${commuteCount} activities are flagged as commutes. Hiding them stops the same road-to-work showing up as "explored".`
            : "No activities flagged as commutes yet."
        }
      >
        <Segmented<CommuteMode>
          value={filters.commute}
          options={[
            { value: "include", label: "Include" },
            { value: "exclude", label: "Hide" },
            { value: "only", label: "Only" },
          ]}
          onChange={(commute) => onChange({ ...filters, commute })}
        />
      </Section>

      <Section title="Reset">
        <button
          type="button"
          onClick={() => onChange({ ...DEFAULT_FILTERS })}
          className="text-xs text-slate-400 hover:text-slate-200"
        >
          Clear all filters
        </button>
      </Section>
    </>
  );
}
