/** On <html> while nobody is looking: the tab is hidden or the window has lost focus. */
const AWAY = "data-away";

/**
 * Flags the page as away so every idle loop holds its frame (`--hero-loop` in app.css) and resumes where it
 * left off on return. Scroll-bound motion keeps running, since an unfocused window can still be scrolled. The
 * page counts as focused until the window says otherwise, so a page that opens without focus still plays.
 * Call from an effect; returns a cleanup.
 */
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
