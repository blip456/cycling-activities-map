"use client";

import type { OverlayStyle } from "@/lib/overlay";
import { Section, Segmented } from "./ui";

export default function LineStylePanel({
  style,
  onStyleChange,
}: {
  style: OverlayStyle;
  onStyleChange: (style: OverlayStyle) => void;
}) {
  return (
    <Section
      title="Line style"
      hint="How the XYZ tiles draw your activities. The lines on this map are coloured by activity type instead — use Preview below to see the tiles."
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-slate-400">Colour</span>
          <div className="flex items-center gap-2">
            {["#fc5200", "#ff1e6f", "#00d2ff", "#7cff4f", "#ffffff"].map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => onStyleChange({ ...style, color })}
                className={
                  "h-5 w-5 rounded-full border-2 transition-transform " +
                  (style.color === color ? "scale-110 border-white" : "border-transparent")
                }
                style={{ background: color }}
                aria-label={color}
              />
            ))}
            <input
              type="color"
              value={style.color}
              onChange={(event) => onStyleChange({ ...style, color: event.target.value })}
              className="h-5 w-6 cursor-pointer rounded border border-ink-500 bg-transparent"
            />
          </div>
        </div>

        <div>
          <div className="mb-1 flex justify-between text-xs text-slate-400">
            <span>Line weight</span>
            <span className="tabular-nums text-slate-500">{style.weight.toFixed(2)}×</span>
          </div>
          <input
            type="range"
            min={0.5}
            max={3}
            step={0.25}
            value={style.weight}
            onChange={(event) =>
              onStyleChange({ ...style, weight: Number(event.target.value) })
            }
            className="w-full"
          />
        </div>

        <div>
          <div className="mb-1 flex justify-between text-xs text-slate-400">
            <span>Opacity</span>
            <span className="tabular-nums text-slate-500">
              {Math.round(style.opacity * 100)}%
            </span>
          </div>
          <input
            type="range"
            min={0.2}
            max={1}
            step={0.05}
            value={style.opacity}
            onChange={(event) =>
              onStyleChange({ ...style, opacity: Number(event.target.value) })
            }
            className="w-full"
          />
        </div>

        <div>
          <div className="mb-1 text-xs text-slate-400">Glow halo</div>
          <Segmented<"on" | "off">
            value={style.glow ? "on" : "off"}
            options={[
              { value: "on", label: "On", title: "Easier to spot at low zoom" },
              { value: "off", label: "Off", title: "Crisper for tracing exact roads" },
            ]}
            onChange={(value) => onStyleChange({ ...style, glow: value === "on" })}
          />
        </div>
      </div>
    </Section>
  );
}
