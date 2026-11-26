import { refetchAfterWrites } from "../../lib/api/write-gate";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    type DurationReport,
    type DurationReportView,
    type DurationValue,
    type MemoryMode,
    type MemoryPage,
    type RoutineDurationView,
} from "@cadence/contracts/memory";
import { useApiClient } from "../auth/use-api-client";
import { useAuthState } from "../auth/use-auth-state";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys } from "../../lib/api/query-keys";
import { toastError } from "../../lib/utils/error-toast";
import { useSettingsCache } from "../core/use-settings";

export function useMemoryPage(enabled = true) {
    const client = useApiClient();
    const { authReady, isAuthenticated } = useAuthState();
    return useQuery({
        queryKey: queryKeys.ai.memory,
        enabled: enabled && authReady && isAuthenticated,
        staleTime: 30_000,
        queryFn: async () => unwrapResponse(await client.api.ai.memory.$get({ query: {} })),
    });
}

export function useOlderMemory() {
    const client = useApiClient();
    return useMutation({
        mutationFn: async (cursor: string) => unwrapResponse(await client.api.ai.memory.$get({ query: { cursor } })),
        onError: (error) => toastError(error, "Couldn’t load more"),
    });
}

function useRefreshPage() {
    const queryClient = useQueryClient();
    const settings = useSettingsCache();
    return (page: MemoryPage) => {
        queryClient.setQueryData(queryKeys.ai.memory, page);
        queryClient.removeQueries({ queryKey: queryKeys.ai.durationEvidence });
        const current = settings.read();
        if (current) settings.write({ ...current, assistant: { ...current.assistant, memoryMode: page.mode } });
    };
}

export function useSetMemoryMode() {
    const client = useApiClient();
    const refresh = useRefreshPage();
    return useMutation({
        mutationFn: async (mode: MemoryMode) =>
            unwrapResponse(await client.api.ai.memory.mode.$post({ json: { mode } })),
        onSuccess: refresh,
        onError: (error) => toastError(error, "Couldn’t change memory"),
    });
}

export function useForgetMemory() {
    const client = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, undo = false }: { id: string; undo?: boolean }) =>
            unwrapResponse(
                await client.api.ai.memory[":id"].$delete({ param: { id }, query: { undo: undo ? "true" : "false" } }),
            ),
        onMutate: async ({ id }) => {
            await queryClient.cancelQueries({ queryKey: queryKeys.ai.memory });
            const before = queryClient.getQueryData<MemoryPage>(queryKeys.ai.memory);
            if (before)
                queryClient.setQueryData<MemoryPage>(queryKeys.ai.memory, {
                    ...before,
                    facts: before.facts.filter((f) => f.id !== id),
                });
            return { before };
        },
        onError: (error, _input, context) => {
            if (context?.before) queryClient.setQueryData(queryKeys.ai.memory, context.before);
            toastError(error, "Couldn’t forget that");
        },
        onSettled: () => {
            void refetchAfterWrites(queryClient, queryKeys.ai.memory);
            void queryClient.invalidateQueries({ queryKey: queryKeys.ai.durationEvidence });
        },
    });
}

export function useRestoreMemory() {
    const client = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) =>
            unwrapResponse(await client.api.ai.memory[":id"].restore.$post({ param: { id } })),
        onSettled: () => {
            void refetchAfterWrites(queryClient, queryKeys.ai.memory);
            void queryClient.invalidateQueries({ queryKey: queryKeys.ai.durationEvidence });
        },
        onError: (error) => toastError(error, "Couldn’t bring that back"),
    });
}

export function useClearMemory() {
    const client = useApiClient();
    const refresh = useRefreshPage();
    return useMutation({
        mutationFn: async (turnOff: boolean) =>
            unwrapResponse(await client.api.ai.memory.$delete({ query: { turnOff: turnOff ? "true" : "false" } })),
        onSuccess: refresh,
        onError: (error) => toastError(error, "Couldn’t clear memory"),
    });
}

export function useDurationApi() {
    const client = useApiClient();
    const queryClient = useQueryClient();
    return {
        ask: async (taskId: string) =>
            unwrapResponse(await client.api.ai.memory.duration.ask.$post({ json: { taskId } })),
        shown: async (token: string) =>
            void unwrapResponse(await client.api.ai.memory.duration.shown.$post({ json: { token } })),
        report: async (input: DurationReport) => {
            const view = await unwrapResponse(await client.api.ai.memory.duration.$post({ json: input }));
            if (view) {
                queryClient.setQueryData(queryKeys.ai.duration(input.taskId, view.completedAt), view);
                queryClient.setQueryData(queryKeys.ai.duration(input.taskId), view);
            }
            void queryClient.invalidateQueries({ queryKey: queryKeys.ai.durationEvidence });
            return view;
        },
    };
}

export function useReportedDuration(taskId: string, completedAt: string | null | undefined, enabled: boolean) {
    const client = useApiClient();
    return useQuery({
        queryKey: queryKeys.ai.duration(taskId, completedAt),
        enabled,
        staleTime: 30_000,
        queryFn: async () =>
            unwrapResponse(
                await client.api.ai.memory.duration.$get({ query: { taskId, ...(completedAt && { completedAt }) } }),
            ),
    });
}

export function useSetReportedDuration(taskId: string, completedAt: string | null | undefined) {
    const client = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (
            input: { value: DurationValue; anchored: boolean } | null,
        ): Promise<DurationReportView | null> => {
            if (input === null) {
                unwrapResponse(
                    await client.api.ai.memory.duration.$delete({
                        json: { taskId, ...(completedAt && { completedAt }) },
                    }),
                );
                return null;
            }
            if (!completedAt) throw new Error("No completion to answer for");
            return unwrapResponse(
                await client.api.ai.memory.duration.$post({ json: { taskId, completedAt, ...input } }),
            );
        },
        onSuccess: (view) => {
            queryClient.setQueryData(queryKeys.ai.duration(taskId, completedAt), view);
            void queryClient.invalidateQueries({ queryKey: queryKeys.ai.durationEvidence });
        },
    });
}

export function useReportedRoutineDuration(habitId: string, day: string, time: string | null, enabled: boolean) {
    const client = useApiClient();
    return useQuery({
        queryKey: queryKeys.ai.routineDuration(habitId, day, time),
        enabled,
        staleTime: 30_000,
        queryFn: async () =>
            unwrapResponse(
                await client.api.ai.memory.duration.routine.$get({ query: { habitId, day, ...(time && { time }) } }),
            ),
    });
}

export function useSetReportedRoutineDuration(habitId: string, day: string, time: string | null) {
    const client = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (
            input: { value: DurationValue; anchored: boolean } | null,
        ): Promise<RoutineDurationView | null> => {
            if (input === null) {
                unwrapResponse(
                    await client.api.ai.memory.duration.routine.$delete({
                        json: { habitId, day, ...(time && { time }) },
                    }),
                );
                return null;
            }
            return unwrapResponse(
                await client.api.ai.memory.duration.routine.$post({
                    json: { habitId, day, ...(time && { time }), ...input },
                }),
            );
        },
        onSuccess: (view) => {
            queryClient.setQueryData(queryKeys.ai.routineDuration(habitId, day, time), view);
            void queryClient.invalidateQueries({ queryKey: queryKeys.ai.durationEvidence });
        },
    });
}
