// Register the Cadence service worker for offline shell caching.
// This script is only loaded in production (excluded in dev via root.tsx).
if ("serviceWorker" in navigator) {
    window.addEventListener("load", function() {
        navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).then(function(registration) {
            const warm = function() {
                if (navigator.onLine && document.visibilityState === "visible") {
                    registration.active?.postMessage({ type: "cadence-precache" });
                }
            };
            navigator.serviceWorker.ready.then(warm).catch(function() {});
            window.addEventListener("online", function() { warm(); void registration.update().catch(function() {}); });
            document.addEventListener("visibilitychange", warm);
        }).catch(function() {});
    });
}
