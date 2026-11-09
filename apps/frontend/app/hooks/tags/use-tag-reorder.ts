import { useEffect, useMemo, useState, type DragEvent } from "react";
import { reorderWrites } from "@cadence/domain/ordering";
import type { Tag } from "@cadence/contracts/tag";
import { useUpdateTag } from "./use-update-tag";

type Drag = { id: string; to: number; settling?: boolean };

/**
 * Move a tag: by dragging (the others make room live, it's written on drop) or one step (the menu).
 * `tags` come in the person's order; render `ordered`, which shows a drag in progress.
 * The drag is native HTML drag, so the same chip can still be dropped onto a capture row to tag it.
 */
export function useTagReorder(tags: Tag[]) {
    const update = useUpdateTag();
    const [drag, setDrag] = useState<Drag | null>(null);
    const moveTo = (id: string, to: number) => {
        for (const write of reorderWrites(tags.map((t) => ({ id: t.id, order: t.sortOrder })), id, to)) {
            update.mutate({ id: write.id, sortOrder: write.order });
        }
    };

    const from = drag ? tags.findIndex((t) => t.id === drag.id) : -1;
    const ordered = useMemo(() => {
        if (!drag || from < 0) return tags;
        const next = [...tags];
        next.splice(drag.to, 0, next.splice(from, 1)[0]);
        return next;
    }, [tags, drag, from]);

    // Dropped elsewhere (a capture row, outside) or cancelled: glide back to where it was.
    const dragging = Boolean(drag && !drag.settling);
    useEffect(() => {
        if (!dragging) return;
        const cancel = () => setDrag((d) => (d && !d.settling ? { id: d.id, to: from, settling: true } : d));
        window.addEventListener("dragend", cancel);
        return () => window.removeEventListener("dragend", cancel);
    }, [dragging, from]);
    // Layout springs stay on until they've settled; by then the written order matches what's shown.
    useEffect(() => {
        if (!drag?.settling) return;
        const timer = setTimeout(() => setDrag(null), 600);
        return () => clearTimeout(timer);
    }, [drag?.settling]);

    return {
        ordered,
        /** True from pick-up until the drop has settled: animate layout while it is. */
        active: drag !== null,
        draggingId: dragging ? drag!.id : null,
        move: (id: string, by: -1 | 1) => moveTo(id, tags.findIndex((t) => t.id === id) + by),
        start: (id: string) => setDrag({ id, to: tags.findIndex((t) => t.id === id) }),
        /** Over the cloud: a chip makes room once the pointer crosses its middle toward it. */
        onDragOver: (e: DragEvent) => {
            if (!drag || drag.settling) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            const chip = (e.target as Element).closest<HTMLElement>("[data-tag-id]");
            const id = chip?.dataset.tagId;
            if (!chip || !id || id === drag.id) return;
            const to = ordered.findIndex((t) => t.id === id);
            const box = chip.getBoundingClientRect();
            const past = to > drag.to ? e.clientX > box.left + box.width / 2 : e.clientX < box.left + box.width / 2;
            if (to >= 0 && past) setDrag({ id: drag.id, to });
        },
        onDrop: (e: DragEvent) => {
            if (!drag || drag.settling) return;
            e.preventDefault();
            if (drag.to !== from) moveTo(drag.id, drag.to);
            setDrag({ ...drag, settling: true });
        },
    };
}
