import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { hardRefreshWorkspaceCaches } from "../../lib/api/workspace-cache";
import { toastError } from "../../lib/utils/error-toast";
import { checkForAppUpdate, IS_DESKTOP_RUNTIME } from "../../platform/runtime";
import { publishAvailableDesktopUpdate } from "../../platform/desktop-update-state";

export function useWorkspaceSync() {
    const queryClient = useQueryClient();
    const [isSyncing, setIsSyncing] = useState(false);
    const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

    const sync = useCallback(async () => {
        if (isSyncing) return;
        setIsSyncing(true);
        try {
            await hardRefreshWorkspaceCaches(queryClient);
            setLastSyncedAt(new Date());
            toast.success("Everything is up to date.");
            if (IS_DESKTOP_RUNTIME) {
                // Same check as startup; a failed check stays quiet since the sync itself worked.
                void checkForAppUpdate().then((update) => {
                    publishAvailableDesktopUpdate(update);
                    if (update) {
                        toast.info(`Cadence ${update.version} is ready to install.`, {
                            description: "Open Settings > About Cadence to review release notes and apply the update.",
                        });
                    }
                }).catch(() => {});
            }
        } catch (error) {
            toastError(error, "Couldn't sync");
        } finally {
            setIsSyncing(false);
        }
    }, [isSyncing, queryClient]);

    return { sync, isSyncing, lastSyncedAt };
}
