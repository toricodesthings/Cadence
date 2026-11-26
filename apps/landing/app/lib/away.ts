const AWAY = "data-away";

export function watchAway(): () => void {
    const root = document.documentElement;
    let focused = true;
    const update = () => root.toggleAttribute(AWAY, document.hidden || !focused);
    const onBlur = () => {
        focused = false;
        update();
    };
    const onFocus = () => {
        focused = true;
        update();
    };
    update();
    document.addEventListener("visibilitychange", update);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    return () => {
        document.removeEventListener("visibilitychange", update);
        window.removeEventListener("blur", onBlur);
        window.removeEventListener("focus", onFocus);
        root.removeAttribute(AWAY);
    };
}
