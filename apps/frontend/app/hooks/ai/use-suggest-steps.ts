import { useCallback, useState } from "react";
import { STEP_MAX_CHARS } from "@cadence/contracts/planning";
import { useApiClient } from "../auth/use-api-client";
import { useCreateSubtask, useDeleteSubtask } from "../tasks/use-subtasks";
import { unwrapResponse } from "../../lib/api/helpers";
import { toastUndo } from "../../lib/utils/undo-toast";

export interface DraftStep { key: string; title: string; ticked: boolean }

const norm = (title: string) => title.trim().toLowerCase();

/**
 * Suggest steps for one task: drafted only on a tap, shown as ghost steps (all ticked) that can be unticked or
 * edited, made finer once (Smaller), discarded (×) or kept as subtasks with one Undo. Nothing is stored before Keep;
 * a step the task already has (ignoring case) is dropped here.
 */
export function useSuggestSteps(taskId: string, existing: readonly { title: string; orderIndex: number }[]) {
    const client = useApiClient();
    const create = useCreateSubtask(taskId);
    const remove = useDeleteSubtask(taskId);
    const [draft, setDraft] = useState<DraftStep[] | null>(null);
    const [status, setStatus] = useState<"idle" | "drafting" | "failed">("idle");
    const [smallerUsed, setSmallerUsed] = useState(false);
    const [keeping, setKeeping] = useState(false);

    const ask = useCallback(async (smaller?: string[]) => {
        setStatus("drafting");
        try {
            const { steps } = await unwrapResponse(await client.api.ai.steps.$post({ json: { taskId, ...(smaller ? { smaller } : {}) } }));
            const seen = new Set(existing.map((s) => norm(s.title)));
            const fresh = steps.filter((step) => !seen.has(norm(step)) && seen.add(norm(step)));
            setDraft(fresh.map((title, i) => ({ key: `${Date.now()}-${i}`, title, ticked: true })));
            setStatus("idle");
        } catch (error) {
            // The task is gone: the draft closes quietly. Anything else offers Try again; the field stays usable.
            if ((error as { status?: number }).status === 404) {
                setDraft(null);
                setStatus("idle");
            } else {
                setStatus("failed");
            }
        }
    }, [client, existing, taskId]);

    const keep = useCallback(async () => {
        const titles = (draft ?? []).filter((d) => d.ticked && d.title.trim()).map((d) => d.title.trim().slice(0, STEP_MAX_CHARS));
        if (!titles.length || keeping) return;
        const base = existing.reduce((max, s) => Math.max(max, s.orderIndex), -1) + 1;
        const ids = titles.map(() => crypto.randomUUID());
        setKeeping(true);
        try {
            // One Keep through the one create hook, so "Break into steps?" records its answer once.
            await Promise.all(titles.map((title, i) => create.mutateAsync({ title, orderIndex: base + i, id: ids[i] } as { title: string; orderIndex: number })));
            setDraft(null);
            setSmallerUsed(false);
            toastUndo(`Added ${titles.length} subtask${titles.length === 1 ? "" : "s"}`, () => ids.forEach((id) => remove.mutate(id)));
        } catch (error) {
            if ((error as { status?: number }).status === 404) setDraft(null);
        } finally {
            setKeeping(false);
        }
    }, [create, draft, existing, keeping, remove]);

    return {
        draft,
        status,
        keeping,
        canSmaller: !smallerUsed && !!draft?.length,
        suggest: () => void ask(),
        smaller: () => {
            if (!draft?.length) return;
            setSmallerUsed(true);
            void ask(draft.map((d) => d.title).slice(0, 7));
        },
        edit: (key: string, change: Partial<Pick<DraftStep, "title" | "ticked">>) => setDraft((d) => d && d.map((s) => (s.key === key ? { ...s, ...change } : s))),
        discard: () => { setDraft(null); setSmallerUsed(false); setStatus("idle"); },
        keep: () => void keep(),
    };
}

export type SuggestSteps = ReturnType<typeof useSuggestSteps>;
