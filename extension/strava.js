/**
 * Copies your Strava activities and their GPS streams into the local app.
 *
 * Runs inside a strava.com page — either injected by the extension or pasted
 * straight into the DevTools console on strava.com, which is handy for a
 * one-off. Because it runs in the page, requests to Strava are same-origin and
 * your existing session cookie is used as-is; the script never sees or handles
 * credentials.
 *
 * It reads your own activity list and the GPS streams of activities the local
 * app doesn't have yet, then posts them to the app. Nothing leaves your machine
 * apart from the requests Strava's own web app already makes.
 */
(async () => {
  "use strict";

  if (window.__stravaSyncRunning) {
    console.warn("[cycling-explorer] a sync is already running in this tab");
    return;
  }
  window.__stravaSyncRunning = true;

  // ------------------------------------------------------------------ config
  // Set window.__CYCLING_EXPLORER_ORIGIN before running if the app is on
  // another port.
  const APP_ORIGINS = window.__CYCLING_EXPLORER_ORIGIN
    ? [window.__CYCLING_EXPLORER_ORIGIN]
    : ["https://localhost:3000", "http://localhost:3000"];
  /** Pause between requests to Strava. Their own pages burst harder than this. */
  const REQUEST_DELAY_MS = 700;
  /** Post to the app every N activities so a stopped run keeps its progress. */
  const BATCH_SIZE = 20;
  const LIST_PER_PAGE = 20;
  const MAX_LIST_PAGES = 400;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ----------------------------------------------------------------- overlay
  const ui = document.createElement("div");
  ui.style.cssText = [
    "position:fixed",
    "right:16px",
    "bottom:16px",
    "z-index:2147483647",
    "width:320px",
    "padding:14px 16px",
    "border-radius:12px",
    "background:#11151d",
    "color:#e6e9ef",
    "font:13px/1.45 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
    "box-shadow:0 12px 40px rgba(0,0,0,.5)",
    "border:1px solid #2c3543",
  ].join(";");
  ui.innerHTML =
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">' +
    '<span style="width:8px;height:8px;border-radius:99px;background:#fc5200"></span>' +
    '<strong style="font-size:13px">Cycling Explorer</strong>' +
    '<button id="se-stop" style="margin-left:auto;background:none;border:1px solid #2c3543;' +
    'color:#9aa4b2;border-radius:6px;padding:2px 8px;cursor:pointer;font-size:11px">Stop</button>' +
    "</div>" +
    '<div id="se-status" style="color:#9aa4b2">Starting…</div>' +
    '<div id="se-detail" style="color:#69727f;font-size:11px;margin-top:6px"></div>';
  document.body.appendChild(ui);

  const statusEl = ui.querySelector("#se-status");
  const detailEl = ui.querySelector("#se-detail");
  let stopped = false;
  ui.querySelector("#se-stop").addEventListener("click", () => {
    stopped = true;
    statusEl.textContent = "Stopping after the current activity…";
  });

  const setStatus = (text, detail) => {
    statusEl.textContent = text;
    if (detail !== undefined) detailEl.textContent = detail;
    console.log("[cycling-explorer]", text, detail ?? "");
  };
  const finish = (text, detail) => {
    setStatus(text, detail);
    ui.querySelector("#se-stop").textContent = "Close";
    ui.querySelector("#se-stop").onclick = () => ui.remove();
    window.__stravaSyncRunning = false;
  };

  // ------------------------------------------------------------ app handshake
  async function findApp() {
    for (const origin of APP_ORIGINS) {
      try {
        const res = await fetch(`${origin}/api/import`, { mode: "cors" });
        if (res.ok) return { origin, state: await res.json() };
      } catch {
        /* not this one */
      }
    }
    return null;
  }

  setStatus("Looking for the local app…");
  const app = await findApp();
  if (!app) {
    finish(
      "Couldn't reach the app.",
      `Start it with \`npm run dev\` and make sure it's on one of: ${APP_ORIGINS.join(", ")}`
    );
    return;
  }

  const known = new Set(app.state.knownIds || []);
  setStatus(`App found at ${app.origin}`, `${known.size} activities already stored`);
  await sleep(400);

  // ------------------------------------------------------- strava list paging
  function pick(obj, names) {
    for (const name of names) {
      if (obj && obj[name] !== undefined && obj[name] !== null) return obj[name];
    }
    return undefined;
  }

  async function fetchJson(url) {
    const res = await fetch(url, {
      credentials: "same-origin",
      headers: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" },
    });
    if (res.status === 401 || res.status === 403) {
      throw new Error("Strava says you're not logged in — sign in and run this again.");
    }
    if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`${url} returned HTML, not JSON (are you logged in?)`);
    }
  }

  /** Reads one page of the "My Activities" list, newest first. */
  async function fetchActivityPage(page) {
    const url =
      `https://www.strava.com/athlete/training_activities` +
      `?page=${page}&per_page=${LIST_PER_PAGE}&keywords=&new_activity_only=false`;
    const data = await fetchJson(url);
    const rows = Array.isArray(data)
      ? data
      : pick(data, ["models", "activities", "results"]) || [];
    return rows;
  }

  /** Full-resolution GPS + altitude + cumulative distance for one activity. */
  async function fetchStreams(id) {
    const url =
      `https://www.strava.com/activities/${id}/streams` +
      `?stream_types[]=latlng&stream_types[]=altitude&stream_types[]=distance`;
    return fetchJson(url);
  }

  function summarize(row) {
    const id = Number(pick(row, ["id", "activity_id"]));
    if (!Number.isFinite(id)) return null;
    const movingTime = Number(pick(row, ["moving_time_raw", "elapsed_time_raw"]));
    return {
      id,
      name: pick(row, ["name", "display_name"]) ?? null,
      type: pick(row, ["sport_type", "type", "activity_type", "activity_type_display_name"]) ?? null,
      startDateLocalRaw: Number(pick(row, ["start_date_local_raw", "start_date_raw"])) || null,
      startDateLocal: pick(row, ["start_date_local", "start_time"]) ?? null,
      movingTime: Number.isFinite(movingTime) ? movingTime : null,
      commute: Boolean(pick(row, ["commute", "is_commute"])),
      trainer: Boolean(pick(row, ["trainer", "is_trainer"])),
    };
  }

  // ------------------------------------------------------------------- run it
  let batch = [];
  let imported = 0;
  let scanned = 0;
  let noGps = 0;
  let failed = 0;
  let loggedShape = false;

  async function flush() {
    if (batch.length === 0) return;
    const res = await fetch(`${app.origin}/api/import`, {
      method: "POST",
      mode: "cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activities: batch }),
    });
    if (!res.ok) throw new Error(`app import failed: HTTP ${res.status}`);
    const result = await res.json();
    imported += result.imported;
    for (const a of batch) known.add(a.id);
    batch = [];
    setStatus(
      `Imported ${imported} activities`,
      `${scanned} scanned · ${noGps} without GPS · ${failed} failed`
    );
  }

  try {
    for (let page = 1; page <= MAX_LIST_PAGES && !stopped; page++) {
      setStatus(`Reading activity list — page ${page}`, `${imported} imported so far`);
      const rows = await fetchActivityPage(page);

      if (!loggedShape && rows.length > 0) {
        loggedShape = true;
        // Endpoint field names are undocumented; this makes mismatches obvious.
        console.log("[cycling-explorer] first list row:", rows[0]);
      }

      if (rows.length === 0) {
        setStatus("Reached the end of your activity list");
        break;
      }

      for (const row of rows) {
        if (stopped) break;

        const summary = summarize(row);
        if (!summary) continue;
        scanned++;

        if (known.has(summary.id)) continue;

        setStatus(
          `Fetching ${summary.name || summary.id}`,
          `${imported} imported · ${scanned} scanned`
        );

        try {
          await sleep(REQUEST_DELAY_MS);
          const streams = await fetchStreams(summary.id);
          const latlng = streams && streams.latlng;

          if (!Array.isArray(latlng) || latlng.length < 2) {
            noGps++;
            known.add(summary.id);
            continue;
          }

          batch.push({
            ...summary,
            latlng,
            altitudeStream: streams.altitude || null,
            distanceStream: streams.distance || null,
          });
        } catch (error) {
          failed++;
          console.warn("[cycling-explorer]", summary.id, error.message);
          // A 404/410 is usually a deleted or hidden activity; keep going.
        }

        if (batch.length >= BATCH_SIZE) await flush();
      }

      if (rows.length < LIST_PER_PAGE) {
        setStatus("Reached the end of your activity list");
        break;
      }
    }

    await flush();
    finish(
      stopped ? `Stopped — ${imported} imported` : `Done — ${imported} imported`,
      `${scanned} scanned · ${noGps} without GPS · ${failed} failed · reload the app to see them`
    );
  } catch (error) {
    try {
      await flush();
    } catch {
      /* keep the original error */
    }
    finish("Sync failed", `${error.message} — ${imported} activities were saved before this`);
    console.error(error);
  }
})();
