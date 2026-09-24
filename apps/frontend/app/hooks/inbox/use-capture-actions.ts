import { toast } from "sonner";
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
                toast.success(
                    status === "discarded" ? "Discarded" : status === "kept" ? "Kept as a note" : "Back in New",
                    {
                        action: {
                            label: "Undo",
                            onClick: () => update.mutate({ id: item.id, captureStatus: item.captureStatus }),
                        },
                    },
                );
            });
    return { setStatus, isPending: update.isPending };
}
