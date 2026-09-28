import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { hardRefreshWorkspaceCaches } from "../../lib/api/workspace-cache";
import { toastError } from "../../lib/utils/error-toast";

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
        } catch (error) {
            toastError(error, "Couldn't sync");
        } finally {
            setIsSyncing(false);
        }
    }, [isSyncing, queryClient]);

    return { sync, isSyncing, lastSyncedAt };
}
