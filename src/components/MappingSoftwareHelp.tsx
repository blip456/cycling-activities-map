"use client";

import { GroupHeader, Section } from "./ui";

/** Applies to every XYZ URL in the sidebar, Squadrats and Strava alike. */
export default function MappingSoftwareHelp() {
  return (
    <div>
      <GroupHeader title="General" color="#9aa4b2" />
      <Section
        title="Using the XYZ URLs"
        hint="Each XYZ server URL above works as an overlay in your mapping software — add Squadrats and Strava as two layers to toggle them separately there."
      >
        <details className="text-xs text-slate-500">
          <summary className="cursor-pointer hover:text-slate-300">
            How to add one to your mapping software
          </summary>
          <ol className="mt-2 list-decimal space-y-1 pl-4 leading-relaxed">
            <li>
              Find where it lets you add a custom map layer — usually called an XYZ, tile or TMS
              layer.
            </li>
            <li>Paste a Live or Fixed URL and set the layer type to “overlay”.</li>
            <li>Max zoom 19; leave the rest default.</li>
            <li>
              Web-based mapping software needs this app on <strong>https</strong>:{" "}
              <code>npm run dev</code> does that via mkcert — load it at{" "}
              <span className="text-slate-400">https://localhost:3000</span>. Chrome blocks{" "}
              <span className="text-slate-400">http://localhost</span> tiles on https pages as
              mixed content.
            </li>
            <li>
              Tiles blank? Check that this app’s terminal logs the tile requests. No requests
              logged = the browser blocked them, so switch to https.
            </li>
          </ol>
        </details>
      </Section>
    </div>
  );
}
