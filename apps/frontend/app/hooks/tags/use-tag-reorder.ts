import { useEffect, useMemo, useState, type DragEvent } from "react";
import { reorderWrites } from "@cadence/domain/ordering";
import type { Tag } from "@cadence/contracts/tag";
import { useUpdateTag } from "./use-update-tag";

type Drag = { id: string; to: number; settling?: boolean };

export function useTagReorder(tags: Tag[]) {
    const update = useUpdateTag();
    const [drag, setDrag] = useState<Drag | null>(null);
    const moveTo = (id: string, to: number) => {
        for (const write of reorderWrites(
            tags.map((t) => ({ id: t.id, order: t.sortOrder })),
            id,
            to,
        )) {
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

    const dragging = Boolean(drag && !drag.settling);
    useEffect(() => {
        if (!dragging) return;
        const cancel = () => setDrag((d) => (d && !d.settling ? { id: d.id, to: from, settling: true } : d));
        window.addEventListener("dragend", cancel);
        return () => window.removeEventListener("dragend", cancel);
    }, [dragging, from]);
    useEffect(() => {
        if (!drag?.settling) return;
        const timer = setTimeout(() => setDrag(null), 600);
        return () => clearTimeout(timer);
    }, [drag?.settling]);

    return {
        ordered,
        active: drag !== null,
        draggingId: dragging ? drag!.id : null,
        move: (id: string, by: -1 | 1) => moveTo(id, tags.findIndex((t) => t.id === id) + by),
        start: (id: string) => setDrag({ id, to: tags.findIndex((t) => t.id === id) }),
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
