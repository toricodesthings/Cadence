import { newRowId } from "../../lib/api/optimistic-id";
import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { refetchAfterWrites } from "../../lib/api/write-gate";
import { useApiClient } from "../auth/use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys } from "../../lib/api/query-keys";
import { reconcileTaskInCaches, removeInboxItemFromCaches, removeTaskFromCaches } from "../../lib/api/cache-sync";
import { taskCache } from "../tasks/optimistic-helpers";
import { buildOptimisticTask } from "../tasks/use-create-task";
import { toastName, toastUndo } from "../../lib/utils/undo-toast";
import type { Task, TaskPriority } from "@cadence/contracts/task";
import type { Project } from "@cadence/contracts/project";
import type { InboxItem } from "@cadence/contracts/inbox";
import { withOfflineSupport } from "../../lib/api/offline-mutation";
import { addDays, type LocalDate } from "@cadence/domain/time";
import { placementLabel, placementReceipt } from "../../lib/utils/date-format";
import { today } from "../../lib/utils/user-zone";
import { useUnprocessInbox } from "./use-unprocess-inbox";
import { toastError } from "../../lib/utils/error-toast";
import type { ProcessInboxPayload } from "../../lib/api/offline-wal";

interface ProcessInboxParams extends ProcessInboxPayload {
    successLabel?: string;
    skipOptimisticRemoval?: boolean;
    silent?: boolean;
}

const toPayload = ({
    successLabel: _label,
    skipOptimisticRemoval: _skip,
    silent: _silent,
    ...payload
}: ProcessInboxParams): ProcessInboxPayload => payload;

const withTaskId = (params: ProcessInboxParams): ProcessInboxParams =>
    params.taskId ? params : { ...params, taskId: newRowId() };

function placedDay(task: Task, variables: ProcessInboxParams) {
    return (
        task.scheduledStart ?? task.dueDate ?? variables.scheduledStart ?? variables.scheduledDay ?? variables.dueDate
    );
}

function optimisticFields(params: ProcessInboxParams) {
    const {
        endDate = null,
        scheduledStart = null,
        scheduledEnd = null,
        projectId = null,
        sectionId = null,
        recurrenceRule = null,
        waitingOn = null,
        reminderAt = null,
        notBefore = null,
        durationEstimate = null,
    } = params;
    return {
        title: params.title?.trim() || params.rawText,
        orderIndex: 0,
        state: waitingOn ? ("WAITING" as const) : ("ACTIVE" as const),
        dueDate: params.dueDate ?? params.scheduledDay ?? null,
        endDate,
        scheduledStart,
        scheduledEnd,
        projectId,
        sectionId,
        tagIds: params.tagIds ?? [],
        priority: (params.priority ?? 0) as TaskPriority,
        recurrenceRule,
        waitingOn,
        reminderAt,
        notBefore,
        durationEstimate,
    };
}

function whereItWent(task: Task, variables: ProcessInboxParams, queryClient: QueryClient): string {
    const day = placedDay(task, variables);
    const listName = task.projectId
        ? queryClient.getQueryData<Project[]>(queryKeys.projects.all)?.find((project) => project.id === task.projectId)
              ?.name
        : null;
    if (!day) return listName ? `In ${listName}` : "No day yet";
    const shown = task.state === "ACTIVE" && !(task.notBefore && task.notBefore > today());
    return shown ? placementReceipt(day, listName) : placementLabel(day);
}

export function useProcessInboxToTask() {
    const client = useApiClient();
    const unprocess = useUnprocessInbox();
    const queryClient = useQueryClient();

    const mutation = useMutation({
        mutationFn: withOfflineSupport<ProcessInboxParams, Task>(
            (params) => ({ type: "process_inbox_to_task", payload: toPayload(params) }),
            async (params) => {
                const { inboxItemId, rawText, title, ...fields } = toPayload(params);
                const res = await client.api.inbox[":id"].process.$post({
                    param: { id: inboxItemId },
                    json: { ...fields, title: title?.trim() || rawText },
                });
                return unwrapResponse(res);
            },
        ),
        onMutate: async (params) => {
            await queryClient.cancelQueries({ queryKey: queryKeys.inbox.all });
            const snapshot = queryClient.getQueriesData<InboxItem[]>({ queryKey: queryKeys.inbox.all });
            if (params.skipOptimisticRemoval) return { snapshot };
            removeInboxItemFromCaches(queryClient, params.inboxItemId);
            if (params.complete) return { snapshot };
            await taskCache.cancel(queryClient);
            const optimistic = buildOptimisticTask(params.taskId ?? newRowId(), optimisticFields(params));
            reconcileTaskInCaches(queryClient, optimistic);
            return { snapshot, optimisticId: optimistic.id };
        },
        onSuccess: (_data, variables, context) => {
            if (!_data) return;
            reconcileTaskInCaches(queryClient, _data, context?.optimisticId);
            void refetchAfterWrites(queryClient, queryKeys.inbox.all);
            const label =
                variables.successLabel ??
                (variables.complete ? "Ticked off" : whereItWent(_data, variables, queryClient));
            if (variables.silent) return;
            toastUndo(
                toastName(_data.title),
                () =>
                    unprocess.mutate({
                        id: variables.inboxItemId,
                        taskId: _data.id,
                        item: context?.snapshot
                            .flatMap(([, items]) => items ?? [])
                            .find((item) => item.id === variables.inboxItemId),
                    }),
                { description: label },
            );
        },
        onError: (err, _variables, context) => {
            if (context?.optimisticId) removeTaskFromCaches(queryClient, context.optimisticId);
            if (context?.snapshot) {
                for (const [key, data] of context.snapshot) {
                    queryClient.setQueryData(key, data);
                }
            }
            toastError(err, "Couldn't process capture");
        },
    });
    return {
        ...mutation,
        mutate: (params: ProcessInboxParams, options?: Parameters<typeof mutation.mutate>[1]) =>
            mutation.mutate(withTaskId(params), options),
        mutateAsync: (params: ProcessInboxParams, options?: Parameters<typeof mutation.mutateAsync>[1]) =>
            mutation.mutateAsync(withTaskId(params), options),
    };
}

export const todayISO = (): LocalDate => today();
export const tomorrowISO = (): LocalDate => addDays(today(), 1);
