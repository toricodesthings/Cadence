import { toastName, toastUndo } from "../../lib/utils/undo-toast";
import type { InboxItem } from "@cadence/contracts/inbox";
import { useUpdateInboxItem } from "./use-update-inbox-item";

/** Reversible status transitions, shared by row, details and bulk actions. */
export function useCaptureActions() {
    const update = useUpdateInboxItem();
    const setStatus = (item: InboxItem, status: "discarded" | "kept" | "clarifying") =>
        update
            .mutateAsync({
                id: item.id,
                captureStatus: status,
            })
            .then(() => {
                // It leaves this list, so the toast names it and says where it went.
                toastUndo(toastName(item.rawText), () => update.mutate({ id: item.id, captureStatus: item.captureStatus }), {
                    description: status === "discarded" ? "Discarded" : status === "kept" ? "Kept as a note" : "Back in New",
                });
            });
    return { setStatus, isPending: update.isPending };
}
