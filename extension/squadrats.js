/**
 * Copies your Squadrats tiles into the local app.
 *
 * Runs inside a squadrats.com page — injected by the extension, or pasted into
 * the DevTools console. Squadrats serves every user's visited tiles from an
 * anonymous, CORS-open endpoint keyed by user id, so this needs no session or
 * credentials: it works out your user id, downloads your tiles plus the
 * "trophies" GeoJSON (yard, übersquadrat, …), and posts both to the local app.
 * Every run is a full snapshot that replaces the previous one.
 */
(async () => {
  "use strict";

  if (window.__squadratsSyncRunning) {
    console.warn("[cycling-explorer] a Squadrats sync is already running in this tab");
    return;
  }
  window.__squadratsSyncRunning = true;

  // ------------------------------------------------------------------ config
  // Set window.__CYCLING_EXPLORER_ORIGIN before running if the app is on
  // another port.
  const APP_ORIGINS = window.__CYCLING_EXPLORER_ORIGIN
    ? [window.__CYCLING_EXPLORER_ORIGIN]
    : ["https://localhost:3000", "http://localhost:3000"];
  // Unofficial and unversioned — note the "squadrants" spelling. If this
  // stops working, check what squadrats.com itself requests in the Network tab.
  const SQUADRATS_API = "https://mainframe-api.squadrats.com/anonymous/squadrants/";
  const UID_RE = /^[A-Za-z0-9]{8,40}$/;
  /** squadrats.com/u/<uid> (profile) or squadrats.com/map/<uid>/… */
  const UID_IN_PATH = /\/(?:u|map)\/([A-Za-z0-9]{8,40})(?:[/?#]|$)/;

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
    '<span style="width:8px;height:8px;border-radius:2px;background:#3b82f6"></span>' +
    '<strong style="font-size:13px">Cycling Explorer</strong>' +
    '<button id="sq-close" style="margin-left:auto;background:none;border:1px solid #2c3543;' +
    'color:#9aa4b2;border-radius:6px;padding:2px 8px;cursor:pointer;font-size:11px">Close</button>' +
    "</div>" +
    '<div id="sq-status" style="color:#9aa4b2">Starting…</div>' +
    '<div id="sq-detail" style="color:#69727f;font-size:11px;margin-top:6px"></div>';
  document.body.appendChild(ui);
  ui.querySelector("#sq-close").addEventListener("click", () => ui.remove());

  const setStatus = (text, detail) => {
    ui.querySelector("#sq-status").textContent = text;
    ui.querySelector("#sq-detail").textContent = detail ?? "";
    console.log("[cycling-explorer]", text, detail ?? "");
  };

  async function getJson(url, init) {
    const res = await fetch(url, { mode: "cors", ...init });
    if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
    return res.json();
  }

  // ------------------------------------------------------------ app handshake
  async function findApp() {
    for (const origin of APP_ORIGINS) {
      try {
        return { origin, state: await getJson(`${origin}/api/squadrats`) };
      } catch {
        /* not this one */
      }
    }
    return null;
  }

  /**
   * The signed-in user. Squadrats signs in with Firebase, which keeps the
   * current user (uid included) in this origin's localStorage or IndexedDB.
   * Only the uid is read; the tokens next to it are left alone.
   */
  async function signedInUid() {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith("firebase:authUser:")) continue;
      try {
        const uid = JSON.parse(localStorage.getItem(key)).uid;
        if (UID_RE.test(uid)) return uid;
      } catch {
        /* not JSON — keep looking */
      }
    }

    const databases = indexedDB.databases ? await indexedDB.databases() : [];
    if (!databases.some((d) => d.name === "firebaseLocalStorageDb")) return null;
    const rows = await new Promise((resolve) => {
      const open = indexedDB.open("firebaseLocalStorageDb");
      open.onerror = () => resolve([]);
      open.onsuccess = () => {
        const db = open.result;
        if (!db.objectStoreNames.contains("firebaseLocalStorage")) {
          db.close();
          return resolve([]);
        }
        const request = db.transaction("firebaseLocalStorage").objectStore("firebaseLocalStorage").getAll();
        request.onsuccess = () => {
          db.close();
          resolve(request.result || []);
        };
        request.onerror = () => {
          db.close();
          resolve([]);
        };
      };
    });
    for (const row of rows) {
      const uid = row && row.value && row.value.uid;
      if (String(row && row.fbase_key).startsWith("firebase:authUser:") && UID_RE.test(uid)) {
        return uid;
      }
    }
    return null;
  }

  /** A profile or map link on the page — only trusted when there's exactly one user in them. */
  function uidFromLinks() {
    const ids = new Set();
    for (const a of document.querySelectorAll('a[href*="/u/"], a[href*="/map/"]')) {
      const match = new URL(a.href, location.href).pathname.match(UID_IN_PATH);
      if (match) ids.add(match[1]);
    }
    return ids.size === 1 ? [...ids][0] : null;
  }

  /**
   * Your own user id, from the most to the least certain source. A URL id that
   * differs from the stored one is probably someone else's profile, so that
   * one is confirmed first.
   */
  async function resolveUid(storedUid) {
    const fromPath = (location.pathname.match(UID_IN_PATH) || [])[1];
    if (fromPath) {
      if (!storedUid || fromPath === storedUid) return { uid: fromPath, source: "page URL" };
      const replace = confirm(
        `This page belongs to Squadrats user ${fromPath}, but the app has ${storedUid}.\n\n` +
          `OK = import ${fromPath} instead · Cancel = keep ${storedUid}`
      );
      return replace ? { uid: fromPath, source: "page URL" } : { uid: storedUid, source: "app" };
    }

    const signedIn = await signedInUid().catch(() => null);
    if (signedIn) return { uid: signedIn, source: "signed-in user" };
    if (storedUid) return { uid: storedUid, source: "app" };
    const linked = uidFromLinks();
    if (linked) return { uid: linked, source: "page link" };

    const typed = prompt(
      "Couldn't find your Squadrats user id on this page.\n" +
        "Paste it here — it's the long id in a squadrats.com/u/<id> or /map/<id>/… link."
    );
    return typed ? { uid: typed.trim(), source: "typed" } : null;
  }

  // ------------------------------------------------------------------- run it
  try {
    setStatus("Looking for the local app…");
    const app = await findApp();
    if (!app) {
      setStatus(
        "Couldn't reach the app.",
        `Start it with \`npm run dev\` and make sure it's on one of: ${APP_ORIGINS.join(", ")}`
      );
      return;
    }

    const found = await resolveUid(app.state.uid);
    const uid = found && found.uid;
    if (!uid || !UID_RE.test(uid)) {
      setStatus("No valid Squadrats user id.", "Make sure you're signed in to squadrats.com and try again.");
      return;
    }
    console.log("[cycling-explorer] Squadrats user id from", found.source + ":", uid);

    setStatus("Downloading your tiles…", `user ${uid}`);
    const data = await getJson(SQUADRATS_API + uid);
    if (!data || !data.raw) {
      setStatus("Squadrats has no data for that user id.", uid);
      return;
    }

    // Best effort: without it you still get squadrats and squadratinhos.
    let trophies = null;
    if (typeof data.geojson === "string") {
      setStatus("Downloading yard and übersquadrat outlines…", `user ${uid}`);
      try {
        trophies = await getJson(data.geojson);
      } catch (error) {
        console.warn("[cycling-explorer] trophies GeoJSON failed:", error.message);
      }
    }

    setStatus("Sending to the app…");
    const summary = await getJson(`${app.origin}/api/squadrats`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid, raw: data.raw, trophies }),
    });

    const sizes = Object.fromEntries(summary.layers.map((l) => [l.id, l.size]));
    setStatus(
      `Done — ${(sizes.squadrats ?? 0).toLocaleString()} squadrats · ` +
        `${(sizes.squadratinhos ?? 0).toLocaleString()} squadratinhos`,
      trophies
        ? "Switch back to the app to see them."
        : "Yard/übersquadrat outlines couldn't be downloaded this time. Switch back to the app to see the rest."
    );
  } catch (error) {
    setStatus("Squadrats sync failed", error.message);
    console.error(error);
  } finally {
    window.__squadratsSyncRunning = false;
  }
})();
