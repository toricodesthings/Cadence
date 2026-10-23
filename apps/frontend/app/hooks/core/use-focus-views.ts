import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../auth/use-api-client";
import { useAuthState } from "../auth/use-auth-state";
import { unwrapResponse } from "../../lib/api/helpers";
import { useFocusViewStore, type SavedFocusView } from "../../stores/focus-view-store";
import type { FocusViewDefinitionInput } from "@cadence/contracts/settings";
import { queryKeys } from "../../lib/api/query-keys";

interface FocusViewInput {
    name: string;
    definition: SavedFocusView["definition"];
    isPinned?: boolean;
    source?: SavedFocusView["source"];
    orderIndex?: number;
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
function useFocusViewWrite<TInput, TResult>(write: (client: ReturnType<typeof useApiClient>, input: TInput) => Promise<TResult>) {
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

// "custom" is a FE-only source; it is never persisted (DB enum is preset|composed|manual), so it is written as
// "manual". The nlp definition types `states` as the loose `string[]`; the values are valid task states, so it
// narrows to the contract shape.
const toWire = <T extends Partial<FocusViewInput>>(view: T) => ({
    ...view,
    source: view.source === "custom" ? "manual" as const : view.source,
    definition: view.definition as FocusViewDefinitionInput,
});

export const useCreateFocusView = () =>
    useFocusViewWrite(async (client, input: FocusViewInput) => unwrapResponse(await client.api.settings["focus-views"].$post({ json: toWire(input) })));

export const useUpdateFocusView = () =>
    useFocusViewWrite(async (client, { id, ...patch }: FocusViewPatch) =>
        unwrapResponse(await client.api.settings["focus-views"][":id"].$patch({ param: { id }, json: { ...toWire(patch), definition: patch.definition as FocusViewDefinitionInput | undefined } })));

export const useDeleteFocusView = () =>
    useFocusViewWrite(async (client, id: string) => unwrapResponse(await client.api.settings["focus-views"][":id"].$delete({ param: { id } })));
