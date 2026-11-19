import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ projects: undefined as unknown, success: vi.fn() }));

vi.mock("sonner", () => ({ toast: { success: state.success } }));
vi.mock("../../../../app/hooks/auth/use-api-client", () => ({ useApiClient: () => ({}) }));
vi.mock("../../../../app/hooks/projects/use-projects", () => ({ useProjects: () => ({ data: state.projects }) }));
vi.mock("../../../../app/hooks/sharing/use-list-people", () => ({
    listPeopleQuery: (_client: unknown, project: { id: string }) => ({
        queryKey: ["people", project.id],
        queryFn: async () => [{ userId: "ben", name: "Ben" }],
    }),
}));

import { useJoinAnnouncements } from "../../../../app/hooks/sharing/use-join-announcements";

const list = (members: string[], access?: "owner" | "view") => ({
    id: "l1",
    name: "Q3 Planning",
    access,
    members: members.map((userId) => ({ userId, role: "view", invitedBy: null })),
});

function setup() {
    const queryClient = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    return renderHook(() => useJoinAnnouncements(), { wrapper });
}

beforeEach(() => state.success.mockReset());

describe("join announcements", () => {
    it("tells the owner who just joined, by name", async () => {
        state.projects = [list([])];
        const { rerender } = setup();
        state.projects = [list(["ben"])];
        rerender();
        await waitFor(() =>
            expect(state.success).toHaveBeenCalledWith("Ben has accepted your list invite", {
                description: "Q3 Planning",
            }),
        );
    });

    it("stays quiet about people already there, someone coming back after a rollback, and lists shared with me", async () => {
        state.projects = [list(["ben"]), { ...list([]), id: "l2", access: "view" as const }];
        const { rerender } = setup();
        state.projects = [list([])];
        rerender();
        state.projects = [list(["ben"]), { ...list(["cy"]), id: "l2", access: "view" as const }];
        rerender();
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(state.success).not.toHaveBeenCalled();
    });
});
