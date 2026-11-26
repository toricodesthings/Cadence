if (window.location.hostname === "127.0.0.1") {
    var url = new URL(window.location.href);
    url.hostname = "localhost";
    window.location.replace(url.toString());
}
