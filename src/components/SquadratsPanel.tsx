"use client";

import {
  SQUADRAT_LAYERS,
  squadratsLiveTileUrl,
  squadratsTileUrl,
  type SquadratLayerId,
  type SquadratsSummary,
} from "@/lib/squadrats";
import { Checkbox, Group, Section, SyncHelp, XyzUrls } from "./ui";

/** Übersquadrat sizes are edge lengths; everything else is a tile count. */
function formatSize(id: SquadratLayerId, size: number | null): string {
  if (size === null) return "";
  return id.startsWith("ubersquadrat") ? `${size}×${size}` : size.toLocaleString();
}

export default function SquadratsPanel({
  appUrl,
  summary,
  visible,
  onVisibleChange,
  layers,
  onLayersChange,
}: {
  appUrl: string;
  summary: SquadratsSummary;
  visible: boolean;
  onVisibleChange: (visible: boolean) => void;
  layers: SquadratLayerId[];
  onLayersChange: (layers: SquadratLayerId[]) => void;
}) {
  const available = SQUADRAT_LAYERS.filter((layer) =>
    summary.layers.some((l) => l.id === layer.id)
  );

  const toggle = (id: SquadratLayerId) => {
    const next = new Set(layers);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    // Keep the canonical draw order so tile URLs (and caches) stay stable.
    onLayersChange(SQUADRAT_LAYERS.filter((l) => next.has(l.id)).map((l) => l.id));
  };

  return (
    <Group
      title="Squadrats"
      color={SQUADRAT_LAYERS[0].color}
      syncedAt={summary.syncedAt}
      visible={visible}
      onVisibleChange={onVisibleChange}
    >
      <Section title="Layers">
        {available.length === 0 ? (
          <p className="text-xs leading-relaxed text-slate-500">
            No Squadrats data yet. Open squadrats.com and click the extension&apos;s toolbar
            button.
          </p>
        ) : (
          <div className="space-y-0.5">
            {available.map((layer) => (
              <Checkbox
                key={layer.id}
                checked={layers.includes(layer.id)}
                onChange={() => toggle(layer.id)}
                color={layer.color}
                count={formatSize(layer.id, summary.layers.find((l) => l.id === layer.id)?.size ?? null)}
              >
                {layer.label}
              </Checkbox>
            ))}
          </div>
        )}
      </Section>

      <XyzUrls
        liveUrl={squadratsLiveTileUrl(appUrl)}
        fixedUrl={layers.length > 0 ? squadratsTileUrl(appUrl, layers, summary.dataVersion) : null}
      />

      <SyncHelp>
        <li>
          Open squadrats.com, signed in, in the browser that has the extension. Any page works —
          it reads your user id from the signed-in session.
        </li>
        <li>Click the extension&apos;s toolbar button.</li>
        <li>
          Switch back here; the new tiles show up on their own. Every sync is a full snapshot of
          your tiles, so there&apos;s no date range to filter on.
        </li>
      </SyncHelp>
    </Group>
  );
}
