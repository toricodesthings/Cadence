import { useCallback } from "react";
import { useNavigate } from "react-router";
import { useNoteRoomStore } from "../../stores/note-room-store";
import { useFocusViewStore } from "../../stores/focus-view-store";
import { buildFocusSearchParams } from "./use-route-focus";
import { trackUsageEvent } from "../../lib/api/track-event";
import type { SearchResult } from "./use-universal-search";

/**
 * Shared routing for a universal-search result.
 *
 * Used by both the desktop command palette and the compact MobileSearchSheet so
 * a result resolves to the exact same destination regardless of surface — only
 * the presentation differs (§4.5 Mobile Translation Rule). `onDone` runs first
 * (typically closing the surface) so the navigation lands on a clean shell.
 */
export function useSearchNavigation() {
    const navigate = useNavigate();
    const openNoteRoom = useNoteRoomStore((s) => s.open);
    const applySavedView = useFocusViewStore((s) => s.applySavedView);

    return useCallback(
        (result: SearchResult, onDone?: () => void) => {
            onDone?.();
            trackUsageEvent("command_palette.result_opened", { object_type: result.kind as never });

            // A match inside notes/headings opens the note room rather than navigating.
            if (result.noteAction) {
                openNoteRoom(
                    result.noteAction.taskId,
                    result.noteAction.taskTitle,
                    result.noteAction.scrollToHeading,
                );
                return;
            }

            if (result.kind === "focus-view") {
                const realId = result.id.replace(/^focus-view-/, "");
                applySavedView(realId);
                navigate("/today");
                return;
            }

            if (result.kind === "page") {
                navigate(result.route);
                return;
            }

            const realId = result.id.replace(/^(task|habit|inbox|project)-/, "");
            const focusParams = buildFocusSearchParams({
                focusKind: result.focusKind,
                focusId: realId,
                focusScope: result.focusScope,
                focusSource: "search",
            });
            navigate(`${result.route}?${focusParams}`);
        },
        [applySavedView, navigate, openNoteRoom],
    );
}
