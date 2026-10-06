/** The modifier key as this device labels it: ⌘ on Apple, Ctrl elsewhere (Windows, Linux, the desktop app there). */
export const MOD_KEY = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";
