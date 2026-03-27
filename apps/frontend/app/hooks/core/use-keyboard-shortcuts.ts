import { useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router";
import { useSettings } from "./use-settings";
import { SETTINGS_DEFAULTS } from "../../types/settings";
import { trackUsageEvent } from "../../lib/api/track-event";

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
    // Object-level actions (§10.3)
    onRescheduleTask?: () => void;
    onPinTask?: () => void;
    onOpenMenu?: () => void;
    onEditObject?: () => void;
    onQuickActions?: () => void;
    onCapture?: () => void;
    onQuickAddTask?: () => void;
    // Page-level navigation (§10.3)
    onNextSection?: () => void;
    onPrevSection?: () => void;
    onCollapseExpand?: () => void;
    onSwitchDayView?: () => void;
    onSwitchWeekView?: () => void;
    onJumpToday?: () => void;
    onNextPeriod?: () => void;
    onPrevPeriod?: () => void;
    onNextStep?: () => void;
    onPrevStep?: () => void;
    onExitResume?: () => void;
    onShortcutReference?: () => void;
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
                trackUsageEvent("shortcut.used", { input_method: "keyboard", outcome: "command_palette" });
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
                    trackUsageEvent("shortcut.used", { input_method: "keyboard", outcome: `go_${key}` });
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

            // Object-level actions (§10.3) — only when not in inputs
            const objectBindings: [string, (() => void) | undefined][] = [
                [bindings.rescheduleTask ?? "r", opts.onRescheduleTask],
                [bindings.pinTask ?? "p", opts.onPinTask],
                [bindings.openMenu ?? "m", opts.onOpenMenu],
                [bindings.editObject ?? "e", opts.onEditObject],
                [bindings.quickActions ?? ".", opts.onQuickActions],
                [bindings.capture ?? "q", opts.onCapture],
            ];

            for (const [binding, handler] of objectBindings) {
                if (!handler) continue;
                if (matchesBinding(e, binding)) {
                    e.preventDefault();
                    handler();
                    return;
                }
            }

            // Shift-modified quick add task
            if (opts.onQuickAddTask && matchesBinding(e, bindings.quickAddTask ?? "shift+q")) {
                e.preventDefault();
                opts.onQuickAddTask();
                return;
            }

            // Page-level navigation (§10.3)
            const key = e.key.toLowerCase();

            // Shortcut reference: ? (shift+/ on most keyboards)
            if (e.key === "?" && opts.onShortcutReference) {
                e.preventDefault();
                opts.onShortcutReference();
                return;
            }

            // Section nav: j = next, k = prev, o = collapse/expand
            if (key === "j" && opts.onNextSection) {
                e.preventDefault();
                opts.onNextSection();
                return;
            }
            if (key === "k" && opts.onPrevSection) {
                e.preventDefault();
                opts.onPrevSection();
                return;
            }
            if (key === "o" && opts.onCollapseExpand) {
                e.preventDefault();
                opts.onCollapseExpand();
                return;
            }

            // Schedule view: d = day, w = week, t = today, l/→ = next, h/← = prev
            if (key === "d" && opts.onSwitchDayView) {
                e.preventDefault();
                opts.onSwitchDayView();
                return;
            }
            if (key === "w" && opts.onSwitchWeekView) {
                e.preventDefault();
                opts.onSwitchWeekView();
                return;
            }
            if (key === "t" && opts.onJumpToday) {
                e.preventDefault();
                opts.onJumpToday();
                return;
            }
            if ((key === "l" || e.key === "ArrowRight") && opts.onNextPeriod) {
                e.preventDefault();
                opts.onNextPeriod();
                return;
            }
            if ((key === "h" || e.key === "ArrowLeft") && opts.onPrevPeriod) {
                e.preventDefault();
                opts.onPrevPeriod();
                return;
            }

            // Weekly Reset: →/n = next step, ←/p = prev step, Escape = exit
            if ((e.key === "ArrowRight" || key === "n") && opts.onNextStep) {
                e.preventDefault();
                opts.onNextStep();
                return;
            }
            if ((e.key === "ArrowLeft" || key === "b") && opts.onPrevStep) {
                e.preventDefault();
                opts.onPrevStep();
                return;
            }
            if (e.key === "Escape" && opts.onExitResume) {
                e.preventDefault();
                opts.onExitResume();
                return;
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            clearTimeout(goTimeout.current);
        };
    }, [shortcutsEnabled, bindings, navigate]);
}
