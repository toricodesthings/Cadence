import { useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router";
import { useSettings } from "./use-settings";
import { SETTINGS_DEFAULTS } from "../../types/settings";

interface ShortcutOptions {
    onCommandPalette?: () => void;
    onQuickAdd?: () => void;
    onFocusSearch?: () => void;
    onToggleView?: () => void;
    onCompleteTask?: () => void;
    onArchiveTask?: () => void;
    onLayoutScaleIncrease?: () => void;
    onLayoutScaleDecrease?: () => void;
    onLayoutScaleReset?: () => void;
}

function hasPrimaryModifier(e: KeyboardEvent) {
    return (e.metaKey || e.ctrlKey) && !e.altKey;
}

function matchesLayoutScaleShortcut(e: KeyboardEvent, direction: "increase" | "decrease" | "reset") {
    if (!hasPrimaryModifier(e)) {
        return false;
    }

    if (direction === "increase") {
        return e.key === "+" || e.key === "=";
    }

    if (direction === "decrease") {
        return e.key === "-";
    }

    return e.key === "0";
}

/** Parse a binding string like "mod+k" and test against a KeyboardEvent */
function matchesBinding(e: KeyboardEvent, binding: string): boolean {
    const parts = binding.toLowerCase().split("+");
    const key = parts[parts.length - 1];
    const needsMod = parts.includes("mod");
    const needsAlt = parts.includes("alt");
    const needsShift = parts.includes("shift");

    const hasMod = e.metaKey || e.ctrlKey;
    if (needsMod !== hasMod) return false;
    if (needsAlt !== e.altKey) return false;
    if (needsShift !== e.shiftKey) return false;

    return e.key.toLowerCase() === key;
}

function isMetaBinding(binding: string): boolean {
    const parts = binding.toLowerCase().split("+");
    return parts.includes("mod") || parts.includes("ctrl") || parts.includes("alt");
}

/**
 * Global keyboard shortcuts — reads bindings from user settings.
 *
 * Fixed (always active):
 * G then T → Today, G then S → Schedule, G then I → Inbox,
 * G then H → Habits, G then U → Upcoming, G then W → Weekly Review
 *
 * Configurable (from settings.shortcuts.bindings):
 * commandPalette, newTask, focusSearch, toggleView, completeTask, archiveTask
 */
export function useKeyboardShortcuts(options: ShortcutOptions = {}) {
    const navigate = useNavigate();
    const { data: settings } = useSettings();
    const goPending = useRef(false);
    const goTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    const optionsRef = useRef(options);
    optionsRef.current = options;

    const shortcutsEnabled = settings?.shortcuts?.enabled ?? true;
    const bindings = settings?.shortcuts?.bindings ?? SETTINGS_DEFAULTS.shortcuts.bindings;

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const opts = optionsRef.current;
            const target = e.target as HTMLElement;
            const inInput =
                target instanceof HTMLInputElement ||
                target instanceof HTMLTextAreaElement ||
                target.isContentEditable;

            // Command palette — always active even in inputs
            if (shortcutsEnabled && matchesBinding(e, bindings.commandPalette)) {
                e.preventDefault();
                opts.onCommandPalette?.();
                return;
            }

            if (matchesLayoutScaleShortcut(e, "increase")) {
                e.preventDefault();
                opts.onLayoutScaleIncrease?.();
                return;
            }

            if (matchesLayoutScaleShortcut(e, "decrease")) {
                e.preventDefault();
                opts.onLayoutScaleDecrease?.();
                return;
            }

            if (matchesLayoutScaleShortcut(e, "reset")) {
                e.preventDefault();
                opts.onLayoutScaleReset?.();
                return;
            }

            if (!shortcutsEnabled) return;

            // Meta-bindings (mod+key) work even in inputs
            const metaBindings: [string, (() => void) | undefined][] = [
                [bindings.focusSearch, opts.onFocusSearch],
                [bindings.toggleView, opts.onToggleView],
                [bindings.newTask, opts.onQuickAdd],
                [bindings.completeTask, opts.onCompleteTask],
                [bindings.archiveTask, opts.onArchiveTask],
            ];

            for (const [binding, handler] of metaBindings) {
                if (!handler || !isMetaBinding(binding)) continue;
                if (matchesBinding(e, binding)) {
                    e.preventDefault();
                    handler();
                    return;
                }
            }

            // Skip letter shortcuts when typing in inputs
            if (inInput) return;

            // G-prefix navigation (two-key chord)
            if (goPending.current) {
                goPending.current = false;
                clearTimeout(goTimeout.current);
                if (e.metaKey || e.ctrlKey || e.altKey) return;

                const key = e.key.toLowerCase();
                const routes: Record<string, string> = {
                    t: "/today",
                    s: "/schedule",
                    i: "/",
                    h: "/habits",
                    u: "/upcoming",
                    w: "/weekly-review",
                };
                if (routes[key]) {
                    e.preventDefault();
                    navigate(routes[key]);
                }
                return;
            }

            if (e.key.toLowerCase() === "g" && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
                e.preventDefault();
                goPending.current = true;
                goTimeout.current = setTimeout(() => { goPending.current = false; }, 800);
                return;
            }

            // Non-meta configurable bindings
            for (const [binding, handler] of metaBindings) {
                if (!handler || isMetaBinding(binding)) continue;
                if (matchesBinding(e, binding)) {
                    e.preventDefault();
                    handler();
                    return;
                }
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            clearTimeout(goTimeout.current);
        };
    }, [shortcutsEnabled, bindings, navigate]);
}
