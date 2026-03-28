import { describe, expect, it, vi } from "vitest";
import { hardRefreshWorkspaceCaches } from "../../../../app/lib/api/workspace-cache";

describe("hardRefreshWorkspaceCaches", () => {
    it("refreshes settings alongside workspace data after debug seed operations", async () => {
        const removeQueries = vi.fn().mockResolvedValue(undefined);
        const invalidateQueries = vi.fn().mockResolvedValue(undefined);

        await hardRefreshWorkspaceCaches({
            removeQueries,
            invalidateQueries,
        } as any);

        expect(removeQueries).toHaveBeenCalledWith({ queryKey: ["settings"], type: "inactive" });
        expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["settings"], refetchType: "active" });
    });
});
