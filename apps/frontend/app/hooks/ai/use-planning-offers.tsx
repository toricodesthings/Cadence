import { createContext, useCallback, useContext, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { planningOffersSchema, type PlanningOffer } from "@cadence/contracts/planning";
import type { Task } from "@cadence/contracts/task";
import { leaveUntil } from "@cadence/domain/planning-offers";
import { dayOf } from "@cadence/domain/time";
import { useApiClient } from "../auth/use-api-client";
import { useAuthState } from "../auth/use-auth-state";
import { useSettings } from "../core/use-settings";
import { useUpdateTask } from "../tasks/use-update-task";
import { queryKeys } from "../../lib/api/query-keys";
import { unwrapResponse } from "../../lib/api/helpers";
import { toastName, toastUndo } from "../../lib/utils/undo-toast";
import { formatShortDateLabel } from "../../lib/utils/date-format";
import { getUserZone, today } from "../../lib/utils/user-zone";
import { useTaskDetailIntentStore } from "../../stores/task-detail-intent-store";

export const OFFER_LABEL: Record<PlanningOffer, string> = { steps: "Break into steps", later: "Leave for later" };

/** The offer a surface is showing right now (at most one), for the ⋯ menu to echo as its last item. */
export interface ShownOffer {
    taskId: string;
    kind: PlanningOffer;
    accept: () => void;
}
export const PlanningOfferContext = createContext<ShownOffer | null>(null);
export const useShownOffer = (taskId: string): ShownOffer | null => {
    const offer = useContext(PlanningOfferContext);
    return offer?.taskId === taskId ? offer : null;
};

/**
 * Planning offers, one at a time: of the tasks a surface lists (in its own order), the first one the server says may
 * show an offer. "Break into steps" puts the cursor in the task's subtask field; "Leave for later" sets Hide until
 * (its check-in day, else a week out) and nothing else, with Undo. Not now is one tap, from the chip or the menu.
 * Nothing is offered outside Full, and nothing is ever done without the tap.
 */
export function usePlanningOffers(ordered: readonly Task[]) {
    const client = useApiClient();
    const queryClient = useQueryClient();
    const updateTask = useUpdateTask();
    const askForSteps = useTaskDetailIntentStore((s) => s.askForSteps);
    const { authReady, isAuthenticated } = useAuthState();
    const { data: settings } = useSettings();
    const full = settings?.assistant?.memoryMode === "full";
    const { data } = useQuery({
        queryKey: queryKeys.ai.planningOffers,
        enabled: full && authReady && isAuthenticated,
        staleTime: 60_000,
        retry: false,
        queryFn: async () => planningOffersSchema.parse(await unwrapResponse(await client.api.ai.memory.planning.offers.$get())),
    });

    const report = useCallback(async (taskId: string, kind: PlanningOffer, outcome: "chosen" | "declined") => {
        try {
            unwrapResponse(await client.api.ai.memory.planning.offer.$post({ json: { taskId, kind, outcome } }));
        } catch {
            // Quiet: an outcome that can't be recorded is not worth an error.
        }
        void queryClient.invalidateQueries({ queryKey: queryKeys.ai.planningOffers });
    }, [client, queryClient]);

    const eligible = full ? data : undefined;
    const task = eligible ? ordered.find((t) => eligible.steps.includes(t.id) || eligible.later.includes(t.id)) : undefined;
    const kind: PlanningOffer | null = task && eligible ? (eligible.steps.includes(task.id) ? "steps" : "later") : null;

    const accept = useCallback(() => {
        if (!task || !kind) return;
        if (kind === "steps") {
            askForSteps(task.id); // chosen is recorded when a step is actually written (`useCreateSubtask`)
            return;
        }
        const before = task.notBefore ?? null;
        const until = leaveUntil({ waitingReminderDay: task.waitingReminder ? dayOf(task.waitingReminder, getUserZone()) : null }, today());
        updateTask.mutate({ id: task.id, notBefore: until });
        toastUndo(toastName(task.title), () => updateTask.mutate({ id: task.id, notBefore: before }), { description: `Hidden until ${formatShortDateLabel(until)}` });
        void report(task.id, "later", "chosen");
    }, [askForSteps, kind, report, task, updateTask]);

    const notNow = useCallback(() => {
        if (task && kind) void report(task.id, kind, "declined");
    }, [kind, report, task]);

    return { task: task ?? null, kind, accept, notNow, shown: task && kind ? { taskId: task.id, kind, accept } satisfies ShownOffer : null };
}

export function PlanningOfferProvider({ shown, children }: { shown: ShownOffer | null; children: ReactNode }) {
    return <PlanningOfferContext.Provider value={shown}>{children}</PlanningOfferContext.Provider>;
}
