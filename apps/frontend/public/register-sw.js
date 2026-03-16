// Register the Cadence service worker for offline shell caching
if ("serviceWorker" in navigator) {
    window.addEventListener("load", function() {
        navigator.serviceWorker.register("/sw.js").catch(function() {});
    });
}
