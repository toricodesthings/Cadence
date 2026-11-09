import { reorderWrites } from "@cadence/domain/ordering";
import type { Tag } from "@cadence/contracts/tag";
import { useUpdateTag } from "./use-update-tag";

/** Move a tag: next to another (a drop), or one step (the menu). `tags` come in the person's order. */
export function useTagReorder(tags: Tag[]) {
    const update = useUpdateTag();
    const moveTo = (id: string, to: number) => {
        for (const write of reorderWrites(tags.map((t) => ({ id: t.id, order: t.sortOrder })), id, to)) {
            update.mutate({ id: write.id, sortOrder: write.order });
        }
    };
    return {
        move: (id: string, by: -1 | 1) => moveTo(id, tags.findIndex((t) => t.id === id) + by),
        dropNear: (id: string, targetId: string, side: "before" | "after") => {
            const target = tags.filter((t) => t.id !== id).findIndex((t) => t.id === targetId);
            if (target >= 0) moveTo(id, target + (side === "after" ? 1 : 0));
        },
    };
}
