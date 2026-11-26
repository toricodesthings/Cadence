import { toastName, toastUndo } from "../../lib/utils/undo-toast";
import type { InboxItem } from "@cadence/contracts/inbox";
import { useUpdateInboxItem } from "./use-update-inbox-item";

export function useCaptureActions() {
    const update = useUpdateInboxItem();
    const setStatus = (item: InboxItem, status: "discarded" | "kept" | "clarifying") =>
        update
            .mutateAsync({
                id: item.id,
                captureStatus: status,
            })
            .then(() => {
                toastUndo(
                    toastName(item.rawText),
                    () =>
                        update.mutate({
                            id: item.id,
                            captureStatus: item.captureStatus === "placed" ? "clarifying" : item.captureStatus,
                        }),
                    {
                        description:
                            status === "discarded" ? "Discarded" : status === "kept" ? "Kept as a note" : "Back in New",
                    },
                );
            });
    return { setStatus, isPending: update.isPending };
}
