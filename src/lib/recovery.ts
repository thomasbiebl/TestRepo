/** Removes everything this app stored in the browser (demo data, login, theme) and reloads. */
export function resetLocalDataAndReload() {
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith('fanclub.')) localStorage.removeItem(key);
  } catch {
    /* storage not available */
  }
  window.location.reload();
}

/** Unregisters the offline service worker and clears its cache, then reloads. Fixes an outdated cached version. */
export async function resetOfflineCacheAndReload() {
  try {
    const registrations = await navigator.serviceWorker?.getRegistrations();
    await Promise.all((registrations ?? []).map((r) => r.unregister()));
    const keys = await caches?.keys();
    await Promise.all((keys ?? []).map((k) => caches.delete(k)));
  } catch {
    /* not supported */
  }
  window.location.reload();
}
