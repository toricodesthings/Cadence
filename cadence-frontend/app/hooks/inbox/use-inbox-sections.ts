import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "../use-api-client";

export function useInboxSections() {
    const api = useApiClient();

    return useQuery({
        queryKey: ["inbox_sections"],
        queryFn: async () => {
            const res = await api.inbox.sections.$get();
            if (!res.ok) throw new Error("Failed to fetch inbox sections");
            const { data } = await res.json();
            return data;
        },
    });
}
