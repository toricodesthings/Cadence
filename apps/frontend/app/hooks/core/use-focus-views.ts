import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../auth/use-api-client";
import { useAuthState } from "../auth/use-auth-state";
import { unwrapResponse } from "../../lib/api/helpers";
import { useFocusViewStore, type SavedFocusView } from "../../stores/focus-view-store";
import type {
    FocusViewColor,
    FocusViewDefinitionInput,
    FocusViewIcon,
    SavedFocusView as SavedFocusViewRow,
} from "@cadence/contracts/settings";
import { toastError } from "../../lib/utils/error-toast";
import { isUndone, undoWindow } from "../../lib/utils/undo-toast";
import { queryKeys } from "../../lib/api/query-keys";

interface FocusViewInput {
    name: string;
    definition: SavedFocusView["definition"];
    isPinned?: boolean;
    source?: SavedFocusView["source"];
    orderIndex?: number;
    icon?: FocusViewIcon | null;
    color?: FocusViewColor | null;
}

interface FocusViewPatch extends Partial<FocusViewInput> {
    id: string;
}

export function useFocusViews() {
    const client = useApiClient();
    const { authReady, isAuthenticated, session } = useAuthState();
    const hydrateSavedViews = useFocusViewStore((state) => state.hydrateSavedViews);
    const query = useQuery({
        queryKey: queryKeys.settings.focusViews(session?.user.id),
        enabled: authReady && isAuthenticated,
        queryFn: async () => {
            const res = await client.api.settings["focus-views"].$get();
            return unwrapResponse(res);
        },
        staleTime: 60_000,
    });

    useEffect(() => {
        if (query.data) {
            hydrateSavedViews(query.data);
        }
    }, [hydrateSavedViews, query.data]);

    return query;
}

/** Writes a saved view, then refetches the list. */
function useFocusViewWrite<TInput, TResult>(
    write: (client: ReturnType<typeof useApiClient>, input: TInput) => Promise<TResult>,
) {
    const client = useApiClient();
    const queryClient = useQueryClient();
    const { session } = useAuthState();
    return useMutation({
        mutationFn: (input: TInput) => write(client, input),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.settings.focusViews(session?.user.id) });
        },
    });
}

// The nlp definition types `states` as the loose `string[]`; the values are valid task states, so it narrows to the contract shape.
const toWire = <T extends Partial<FocusViewInput>>(view: T) => ({
    ...view,
    definition: view.definition as FocusViewDefinitionInput,
});

export const useCreateFocusView = () =>
    useFocusViewWrite(async (client, input: FocusViewInput) =>
        unwrapResponse(await client.api.settings["focus-views"].$post({ json: toWire(input) })),
    );

/** Patches the cached list at once (the panel reads it), then refetches once the write lands. */
function useOptimisticFocusViewWrite<TInput>(
    write: (client: ReturnType<typeof useApiClient>, input: TInput) => Promise<unknown>,
    patch: (views: SavedFocusViewRow[], input: TInput) => SavedFocusViewRow[],
    failure: string,
) {
    const client = useApiClient();
    const queryClient = useQueryClient();
    const { session } = useAuthState();
    const key = queryKeys.settings.focusViews(session?.user.id);
    return useMutation({
        mutationFn: (input: TInput) => write(client, input),
        onMutate: async (input) => {
            await queryClient.cancelQueries({ queryKey: key });
            const before = queryClient.getQueryData<SavedFocusViewRow[]>(key);
            if (before) queryClient.setQueryData(key, patch(before, input));
            return { before };
        },
        onError: (err, _input, context) => {
            if (context?.before) queryClient.setQueryData(key, context.before);
            if (!isUndone(err)) toastError(err, failure);
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
    });
}

export const useUpdateFocusView = () =>
    useOptimisticFocusViewWrite(
        async (client, { id, ...patch }: FocusViewPatch) =>
            unwrapResponse(
                await client.api.settings["focus-views"][":id"].$patch({
                    param: { id },
                    json: { ...toWire(patch), definition: patch.definition as FocusViewDefinitionInput | undefined },
                }),
            ),
        (views, { id, definition: _definition, source: _source, ...patch }) =>
            views.map((view) => (view.id === id ? { ...view, ...patch } : view)),
        "Couldn't change the view",
    );

/** Gone at once; the delete is sent once Undo's window closes. A built-in preset is hidden by the server. */
export const useDeleteFocusView = () =>
    useOptimisticFocusViewWrite(
        async (client, view: { id: string; name: string }) => {
            await undoWindow(`Deleted ${view.name}`);
            return unwrapResponse(await client.api.settings["focus-views"][":id"].$delete({ param: { id: view.id } }));
        },
        (views, { id }) => views.filter((view) => view.id !== id),
        "Couldn't delete the view",
    );
