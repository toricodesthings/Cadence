import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../auth/use-api-client";
import { useAuthState } from "../auth/use-auth-state";
import { unwrapResponse } from "../../lib/api/helpers";
import { useFocusViewStore, type SavedFocusView } from "../../stores/focus-view-store";

const FOCUS_VIEWS_KEY = (userId: string | undefined) => ["settings", userId ?? "anonymous", "focusViews"] as const;

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
        queryKey: FOCUS_VIEWS_KEY(session?.user.id),
        enabled: authReady && isAuthenticated,
        queryFn: async () => {
            const res = await client.api.settings["focus-views"].$get();
            return unwrapResponse<SavedFocusView[]>(res);
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

export function useCreateFocusView() {
    const client = useApiClient();
    const queryClient = useQueryClient();
    const { session } = useAuthState();

    return useMutation({
        mutationFn: async (input: FocusViewInput) => {
            const res = await client.api.settings["focus-views"].$post({
                json: {
                    ...input,
                    clientMutationId: crypto.randomUUID(),
                },
            });
            return unwrapResponse<SavedFocusView>(res);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: FOCUS_VIEWS_KEY(session?.user.id) });
        },
    });
}

export function useUpdateFocusView() {
    const client = useApiClient();
    const queryClient = useQueryClient();
    const { session } = useAuthState();

    return useMutation({
        mutationFn: async ({ id, ...patch }: FocusViewPatch) => {
            const res = await client.api.settings["focus-views"][":id"].$patch({
                param: { id },
                json: {
                    ...patch,
                    clientMutationId: crypto.randomUUID(),
                },
            });
            return unwrapResponse<SavedFocusView>(res);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: FOCUS_VIEWS_KEY(session?.user.id) });
        },
    });
}

export function useDeleteFocusView() {
    const client = useApiClient();
    const queryClient = useQueryClient();
    const { session } = useAuthState();

    return useMutation({
        mutationFn: async (id: string) => {
            const res = await client.api.settings["focus-views"][":id"].$delete({
                param: { id },
            });
            return unwrapResponse<SavedFocusView>(res);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: FOCUS_VIEWS_KEY(session?.user.id) });
        },
    });
}
