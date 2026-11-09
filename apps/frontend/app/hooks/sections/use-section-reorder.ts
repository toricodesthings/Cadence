import { reorderWrites } from "@cadence/domain/ordering";
import type { TaskSection } from "@cadence/contracts/section";
import { useUpdateSection } from "./use-sections";

/**
 * Move a list's sections: to a place (a drop) or one step (a menu's Move up/down). `sections` come in
 * their saved order; each write is optimistic and offline-safe, and the list re-sorts itself.
 */
export function useSectionReorder(projectId: string | null | undefined, sections: TaskSection[]) {
    const update = useUpdateSection(projectId);
    const moveTo = (id: string, to: number) => {
        for (const write of reorderWrites(sections.map((s) => ({ id: s.id, order: s.orderIndex })), id, to)) {
            update.mutate({ id: write.id, orderIndex: write.order });
        }
    };
    const move = (id: string, by: -1 | 1) => moveTo(id, sections.findIndex((s) => s.id === id) + by);
    return { moveTo, move };
}
