"use client";

import { useEffect } from "react";

/**
 * Minimal service-worker registration.
 * TODO(offline-phase): full offline sync — precache the app shell, Dexie
 * (IndexedDB) case cache + outbox replay, background sync on reconnect.
 * See PLANNING.md §3. The current sw.js is a pass-through stub.
 */
export default function SWRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* non-fatal in dev */
      });
    }
  }, []);
  return null;
}
