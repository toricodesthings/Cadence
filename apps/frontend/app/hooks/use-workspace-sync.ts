import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { hardRefreshWorkspaceCaches } from "../lib/api/workspace-cache";

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
        } catch {
            toast.error("Sync failed. Try again.");
        } finally {
            setIsSyncing(false);
        }
    }, [isSyncing, queryClient]);

    return { sync, isSyncing, lastSyncedAt };
}
