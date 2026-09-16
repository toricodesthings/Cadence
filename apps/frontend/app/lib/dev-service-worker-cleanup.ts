// A production preview on the dev origin can leave a worker serving old,
// unhashed CSS and modules. Merely skipping registration in dev doesn't remove it.
// Run before hydration; reload only when unregistering this tab's controller.
export const DEV_SERVICE_WORKER_CLEANUP_SCRIPT = String.raw`
(async function () {
  if (!("serviceWorker" in navigator)) return;
  try {
    var workerUrl = new URL("/sw.js", location.origin).href;
    var controlled = navigator.serviceWorker.controller?.scriptURL === workerUrl;
    var registrations = await navigator.serviceWorker.getRegistrations();
    var removed = false;
    for (var registration of registrations) {
      var workers = [registration.active, registration.waiting, registration.installing];
      if (workers.some(function (worker) { return worker?.scriptURL === workerUrl; })) {
        removed = (await registration.unregister()) || removed;
      }
    }
    if ("caches" in window) {
      var keys = await caches.keys();
      await Promise.all(keys.filter(function (key) {
        return key.startsWith("cadence-shell-");
      }).map(function (key) { return caches.delete(key); }));
    }
    if (controlled && removed) location.reload();
  } catch (error) {
    console.warn("Could not clear the Cadence preview worker for development", error);
  }
})();
`;
