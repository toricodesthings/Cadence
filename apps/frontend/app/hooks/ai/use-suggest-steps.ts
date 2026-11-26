import { newRowId } from "../../lib/api/optimistic-id";
import { useCallback, useRef, useState } from "react";
import { STEP_MAX_CHARS } from "@cadence/contracts/planning";
import { useApiClient } from "../auth/use-api-client";
import { useCreateSubtask, useDeleteSubtask } from "../tasks/use-subtasks";
import { unwrapResponse } from "../../lib/api/helpers";
import { toastUndo } from "../../lib/utils/undo-toast";

export interface DraftStep {
    key: string;
    title: string;
    ticked: boolean;
}

const norm = (title: string) => title.trim().toLowerCase();
export const isWanted = (step: DraftStep) => step.ticked && !!step.title.trim();

export function useSuggestSteps(taskId: string, existing: readonly { title: string; orderIndex: number }[]) {
    const client = useApiClient();
    const create = useCreateSubtask(taskId);
    const remove = useDeleteSubtask(taskId);
    const [draft, setDraft] = useState<DraftStep[] | null>(null);
    const [status, setStatus] = useState<"idle" | "drafting" | "failed">("idle");
    const [smallerUsed, setSmallerUsed] = useState(false);
    const [keeping, setKeeping] = useState(false);
    const lastAsk = useRef<string[] | undefined>(undefined);

    const ask = useCallback(
        async (smaller?: string[]) => {
            lastAsk.current = smaller;
            setStatus("drafting");
            try {
                const { steps } = await unwrapResponse(
                    await client.api.ai.steps.$post({ json: { taskId, ...(smaller ? { smaller } : {}) } }),
                );
                const seen = new Set(existing.map((s) => norm(s.title)));
                const fresh = steps.filter((step) => !seen.has(norm(step)) && seen.add(norm(step)));
                setDraft(fresh.map((title, i) => ({ key: `${Date.now()}-${i}`, title, ticked: true })));
                setStatus("idle");
            } catch (error) {
                if ((error as { status?: number }).status === 404) {
                    setDraft(null);
                    setStatus("idle");
                } else {
                    setStatus("failed");
                }
            }
        },
        [client, existing, taskId],
    );

    const keep = useCallback(async () => {
        const kept = (draft ?? []).filter(isWanted);
        if (!kept.length || keeping) return;
        const base = existing.reduce((max, s) => Math.max(max, s.orderIndex), -1) + 1;
        const ids = kept.map(() => newRowId());
        setKeeping(true);
        const results = await Promise.allSettled(
            kept.map((d, i) =>
                create.mutateAsync({
                    title: d.title.trim().slice(0, STEP_MAX_CHARS),
                    orderIndex: base + i,
                    id: ids[i],
                } as { title: string; orderIndex: number }),
            ),
        );
        setKeeping(false);
        const added = ids.filter((_, i) => results[i].status === "fulfilled");
        const gone = results.some((r) => r.status === "rejected" && (r.reason as { status?: number }).status === 404);
        const left = gone ? [] : kept.filter((_, i) => results[i].status === "rejected");
        setDraft(left.length ? left : null);
        if (!left.length) setSmallerUsed(false);
        if (added.length)
            toastUndo(`Added ${added.length} subtask${added.length === 1 ? "" : "s"}`, () =>
                added.forEach((id) => remove.mutate(id)),
            );
    }, [create, draft, existing, keeping, remove]);

    return {
        draft,
        status,
        keeping,
        canSmaller: !smallerUsed && !!draft?.some(isWanted),
        suggest: () => void ask(),
        retry: () => void ask(lastAsk.current),
        smaller: () => {
            const wanted = (draft ?? [])
                .filter(isWanted)
                .map((d) => d.title.trim())
                .slice(0, 7);
            if (!wanted.length) return;
            setSmallerUsed(true);
            void ask(wanted);
        },
        edit: (key: string, change: Partial<Pick<DraftStep, "title" | "ticked">>) =>
            setDraft((d) => d && d.map((s) => (s.key === key ? { ...s, ...change } : s))),
        discard: () => {
            setDraft(null);
            setSmallerUsed(false);
            setStatus("idle");
        },
        keep: () => void keep(),
    };
}

export type SuggestSteps = ReturnType<typeof useSuggestSteps>;
