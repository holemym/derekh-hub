/**
 * Derech service worker — Phase 0 stub.
 *
 * TODO(offline-phase): full offline-first sync per PLANNING.md §3 —
 *   - precache the app shell + fonts,
 *   - runtime-cache case data into IndexedDB (Dexie),
 *   - outbox: queue mutations offline, replay on reconnect (Background Sync),
 *   - client-side pdf-lib document generation stays fully offline.
 *
 * For now this worker only makes the app installable; all fetches pass through.
 */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Intentionally no fetch handler yet — network passthrough.
