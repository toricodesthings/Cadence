import { useEffect, useRef } from "react";
import { useNavigate } from "react-router";

interface ShortcutOptions {
    onCommandPalette?: () => void;
    onCreateTask?: () => void;
}

/**
 * Global keyboard shortcuts (Feature 8.2).
 *
 * | Key          | Action              |
 * |--------------|---------------------|
 * | Cmd/Ctrl+K   | Command Palette     |
 * | N            | New task            |
 * | G then T     | Go → Today          |
 * | G then S     | Go → Schedule       |
 * | G then B     | Go → Board          |
 * | G then I     | Go → Inbox          |
 * | G then H     | Go → Habits         |
 *
 * All letter shortcuts are ignored when focus is in an input/textarea.
 */
export function useKeyboardShortcuts(options: ShortcutOptions = {}) {
    const navigate = useNavigate();
    const goPending = useRef(false);
    const goTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ignore when user is typing in an input/textarea/contentEditable
            const target = e.target as HTMLElement;
            if (
                target instanceof HTMLInputElement ||
                target instanceof HTMLTextAreaElement ||
                target.isContentEditable
            ) {
                return;
            }

            // ── Meta shortcuts (always active) ──────────────────────
            // Command Palette: Cmd+K or Ctrl+K
            if ((e.metaKey || e.ctrlKey) && e.key === "k") {
                e.preventDefault();
                options.onCommandPalette?.();
                return;
            }

            // Skip if any modifier key is held for letter shortcuts
            if (e.metaKey || e.ctrlKey || e.altKey) return;

            const key = e.key.toLowerCase();

            // ── G-prefix navigation (two-key chord) ─────────────────
            if (goPending.current) {
                goPending.current = false;
                clearTimeout(goTimeout.current);

                const routes: Record<string, string> = {
                    t: "/",
                    s: "/schedule",
                    i: "/inbox",
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

            if (key === "g") {
                e.preventDefault();
                goPending.current = true;
                // Reset after 800ms if no second key
                goTimeout.current = setTimeout(() => {
                    goPending.current = false;
                }, 800);
                return;
            }

            // ── Single-key shortcuts ────────────────────────────────
            if (key === "n") {
                e.preventDefault();
                options.onCreateTask?.();
                return;
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            clearTimeout(goTimeout.current);
        };
    }, [options, navigate]);
}
