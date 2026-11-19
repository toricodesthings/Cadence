import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Location } from "../../helpers";

const state = vi.hoisted(() => ({
    auth: { authReady: true, isAuthenticated: true },
    preview: { data: undefined as unknown, isPending: false, isError: false },
    projects: [] as { id: string }[],
    join: vi.fn(),
}));

vi.mock("../../../app/hooks/auth/use-auth-state", () => ({ useAuthState: () => state.auth }));
vi.mock("../../../app/hooks/core/use-document-title", () => ({ useDocumentTitle: vi.fn() }));
vi.mock("../../../app/hooks/projects/use-projects", () => ({ useProjects: () => ({ data: state.projects }) }));
vi.mock("../../../app/hooks/sharing/use-share-list", () => ({
    useInvitePreview: () => state.preview,
    useJoinList: () => ({ mutate: state.join, isPending: false }),
}));
vi.mock("../../../app/components/shared/CardPage", () => ({
    CardPage: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
    rise: {},
    stagger: {},
}));

import JoinRoute from "../../../app/routes/join";

const TOKEN = "A".repeat(43);
const preview = {
    listId: "11111111-1111-4111-8111-111111111111",
    name: "Our House",
    emoji: "🏠",
    colorAccent: "luminous-amber",
    ownerId: "22222222-2222-4222-8222-222222222222",
    ownerName: "Ada",
    ownerImage: null,
};

function renderJoin() {
    return render(
        <MemoryRouter initialEntries={[`/join/${TOKEN}`]}>
            <Routes>
                <Route path="/join/:token" element={<JoinRoute />} />
                <Route path="*" element={<Location />} />
            </Routes>
        </MemoryRouter>,
    );
}

beforeEach(() => {
    state.auth = { authReady: true, isAuthenticated: true };
    state.preview = { data: preview, isPending: false, isError: false };
    state.projects = [];
    state.join.mockReset();
});

describe("the join screen", () => {
    it("shows the list and who shared it, and says what joining shows, before anything is joined", () => {
        renderJoin();
        expect(screen.getByRole("heading", { name: "Our House" })).toBeTruthy();
        expect(screen.getByText("Shared by Ada")).toBeTruthy();
        expect(
            screen.getByText("Joining shows you this list. People in it will see your name, picture and pronouns."),
        ).toBeTruthy();
        expect(state.join).not.toHaveBeenCalled();
    });

    it("joins on the button and opens the list", async () => {
        state.join.mockImplementation((_token: string, options: { onSuccess: (id: string) => void }) =>
            options.onSuccess(preview.listId),
        );
        renderJoin();
        fireEvent.click(screen.getByRole("button", { name: "Join list" }));
        expect(state.join.mock.calls[0][0]).toBe(TOKEN);
        await waitFor(() =>
            expect(screen.getByLabelText("Current location").textContent).toBe(`/project/${preview.listId}`),
        );
    });

    it("leaves for Today on Not now, joining nothing", () => {
        renderJoin();
        fireEvent.click(screen.getByRole("button", { name: "Not now" }));
        expect(screen.getByLabelText("Current location").textContent).toBe("/today");
        expect(state.join).not.toHaveBeenCalled();
    });

    it("goes straight to a list the person is already in", async () => {
        state.projects = [{ id: preview.listId }];
        renderJoin();
        await waitFor(() =>
            expect(screen.getByLabelText("Current location").textContent).toBe(`/project/${preview.listId}`),
        );
    });

    it("says a dead link was reset or expired, and asks for a new one", () => {
        state.preview = { data: undefined, isPending: false, isError: true };
        renderJoin();
        expect(screen.getByText("This link has expired or was reset.")).toBeTruthy();
        expect(screen.getByText("Ask for a new one.")).toBeTruthy();
        expect(screen.queryByRole("button", { name: "Join list" })).toBeNull();
    });

    it("sends a signed-out visitor to sign in and back", async () => {
        state.auth = { authReady: true, isAuthenticated: false };
        renderJoin();
        await waitFor(() =>
            expect(screen.getByLabelText("Current location").textContent).toBe(
                `/auth/sign-in?redirectTo=${encodeURIComponent(`/join/${TOKEN}`)}`,
            ),
        );
    });
});
