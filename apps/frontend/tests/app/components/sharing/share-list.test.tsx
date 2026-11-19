import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@cadence/contracts/project";
import { Provider } from "../../../../app/components/primitives/Tooltip";

const OWNER = "22222222-2222-4222-8222-222222222222";
const BEN = "33333333-3333-4333-8333-333333333333";
const state = vi.hoisted(() => ({
    people: undefined as unknown,
    setRole: vi.fn(),
    leave: vi.fn(),
    invite: vi.fn(),
    reset: vi.fn(),
}));

vi.mock("../../../../app/hooks/sharing/use-list-people", () => ({ useListPeople: () => ({ data: state.people }) }));
vi.mock("../../../../app/hooks/auth/use-auth-state", () => ({
    useAuthState: () => ({ session: { user: { id: OWNER, name: "Ada", image: null } } }),
}));
vi.mock("../../../../app/hooks/sharing/use-share-list", () => ({
    useCreateInvite: () => ({ mutate: state.invite, isPending: false }),
    useResetInvites: () => ({ mutate: state.reset, isPending: false }),
    useSetMemberRole: () => ({ mutate: state.setRole }),
    useRemoveMember: () => ({ mutate: vi.fn() }),
    useStopSharing: () => ({ mutate: vi.fn() }),
    useLeaveList: () => ({ mutate: state.leave }),
}));

import { ShareListPanel } from "../../../../app/components/sharing/ShareListDialog";

const people = [
    { userId: OWNER, name: "Ada", image: null, pronouns: null, role: "owner" },
    { userId: BEN, name: "Ben", image: null, pronouns: "he/him", role: "view" },
];
const project = (access: Project["access"]): Project => ({
    id: "11111111-1111-4111-8111-111111111111",
    userId: OWNER,
    name: "Our House",
    colorAccent: null,
    emoji: null,
    createdAt: "2026-03-09T00:00:00.000Z",
    access,
    members: [{ userId: BEN, role: "view", invitedBy: OWNER }],
});
const renderPanel = (access: Project["access"]) =>
    render(
        <Provider>
            <ShareListPanel project={project(access)} onClose={vi.fn()} />
        </Provider>,
    );

beforeEach(() => {
    state.people = people;
    for (const fn of [state.setRole, state.leave, state.invite, state.reset]) fn.mockReset();
});

describe("the share surface", () => {
    it("gives the owner people with access, a role picker for each person but themselves, link access and Done", () => {
        renderPanel("owner");
        fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
        expect(state.invite).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111");
        expect(screen.getByRole("list", { name: "People in this list" })).toBeTruthy();
        expect(screen.getByText("(you)")).toBeTruthy();
        expect(screen.getByRole("button", { name: "What Ben can do: Can view" })).toBeTruthy();
        expect(screen.queryByRole("button", { name: /What Ada can do/ })).toBeNull();
        expect(screen.getByText("Anyone with the link can view")).toBeTruthy();
        expect(screen.getByRole("button", { name: "Done" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "Reset links" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "Stop sharing" })).toBeTruthy();
        expect(screen.queryByRole("button", { name: "Leave list" })).toBeNull();
        expect(screen.getByText("#3333 · he/him")).toBeTruthy();
    });

    it("shows the owner their own row before anyone has joined", () => {
        state.people = undefined;
        render(
            <Provider>
                <ShareListPanel project={{ ...project("owner"), members: [] }} onClose={vi.fn()} />
            </Provider>,
        );
        expect(screen.getByText("Ada")).toBeTruthy();
        expect(screen.getByText("Owner")).toBeTruthy();
        expect(screen.queryByRole("button", { name: "Stop sharing" })).toBeNull();
    });

    it("shows a member the people read-only, with Leave list and nothing to change", () => {
        renderPanel("view");
        expect(screen.getByText("Ada")).toBeTruthy();
        expect(screen.getByText("Ben")).toBeTruthy();
        expect(screen.getByText("Owner")).toBeTruthy();
        expect(screen.queryByRole("button", { name: "Copy link" })).toBeNull();
        expect(screen.queryByRole("button", { name: /What Ben can do/ })).toBeNull();
        expect(screen.queryByRole("button", { name: /Remove/ })).toBeNull();
        expect(screen.queryByRole("button", { name: "Stop sharing" })).toBeNull();
        expect(screen.getByRole("button", { name: "Leave list" })).toBeTruthy();
        expect(screen.getByText("Can view")).toBeTruthy();
    });

    it("shows a member what they can do on their own row", () => {
        state.people = [people[0], { ...people[1], role: "edit" }];
        renderPanel("edit");
        expect(screen.getByText("Can edit")).toBeTruthy();
    });
});
