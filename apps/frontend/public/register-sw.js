// Register the Cadence service worker for offline shell caching.
// This script is only loaded in production (excluded in dev via root.tsx).
if ("serviceWorker" in navigator) {
    window.addEventListener("load", function() {
        navigator.serviceWorker.register("/sw.js").catch(function() {});
    });
}
