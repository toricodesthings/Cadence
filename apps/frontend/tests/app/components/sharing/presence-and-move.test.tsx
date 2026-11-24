// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { Project } from "@cadence/contracts/project";
import type { ListPerson } from "@cadence/contracts/sharing";

const mockOnline = new Set<string>(["u-sam"]);
const mockPeople: ListPerson[] = [
    { userId: "u-ada", name: "Ada Lovelace", image: null, pronouns: "she/her", role: "owner" },
    { userId: "u-sam", name: "Sam Chen", image: null, pronouns: "they/them", role: "edit" },
];
const mockProjects: Project[] = [
    {
        id: "p-house",
        userId: "u-ada",
        name: "Our House",
        emoji: "🏠",
        colorAccent: "lantern",
        createdAt: "2026-01-01T00:00:00.000Z",
        access: "owner",
        members: [{ userId: "u-sam", role: "edit", invitedBy: "u-ada" }],
    },
];

vi.mock("~/hooks/auth/use-auth-state", () => ({
    useAuthState: () => ({ authReady: true, isAuthenticated: true, session: { user: { id: "u-ada" } } }),
}));
vi.mock("~/hooks/sharing/use-list-people", () => ({
    useListPeople: () => ({ data: mockPeople }),
}));
vi.mock("~/hooks/sharing/use-list-presence", () => ({
    useListPresence: () => mockOnline,
    useListOnlineIds: () => mockOnline,
}));
vi.mock("~/hooks/projects/use-projects", () => ({
    useProjects: () => ({ data: mockProjects }),
}));

import { Provider as TooltipProvider } from "~/components/primitives/Tooltip";
import { ShareHeader } from "~/components/sharing/ShareHeader";
import { ProfileCard } from "~/components/sharing/ProfileCard";
import { MoveToSharedConfirm } from "~/components/sharing/MoveToSharedConfirm";

describe("2.4.0 presence, profile viewer, and move-to-shared UI", () => {
    it("shows one button per person with an online dot and no 'here' text for a shared list owner", () => {
        const onOpen = vi.fn();
        render(
            <TooltipProvider>
                <ShareHeader project={mockProjects[0]!} onOpen={onOpen} />
            </TooltipProvider>,
        );
        expect(screen.queryByText("Sam here")).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: /Sam Chen, here now/i }));
        expect(onOpen).toHaveBeenCalledTimes(1);
    });

    it("renders ProfileCard with online status, pronouns, role, and shared lists in common", () => {
        render(<ProfileCard person={mockPeople[1]} userId="u-sam" projectId="p-house" />);
        expect(screen.getByText("Sam Chen")).toBeTruthy();
        expect(screen.getByText("they/them")).toBeTruthy();
        expect(screen.getByText("Can edit")).toBeTruthy();
        expect(screen.getByText("Here now")).toBeTruthy();
        expect(screen.getByText("Shared lists")).toBeTruthy();
        expect(screen.getByText("Our House")).toBeTruthy();
    });

    it("explains visibility on MoveToSharedConfirm and calls onConfirm", () => {
        const onConfirm = vi.fn();
        render(
            <MoveToSharedConfirm
                open
                onOpenChange={() => {}}
                listName="Our House"
                itemLabel="task"
                onConfirm={onConfirm}
            />,
        );
        expect(screen.getByText('Move to "Our House"?')).toBeTruthy();
        expect(screen.getByText(/Everyone in Our House will see this task/i)).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Move to shared list" }));
        expect(onConfirm).toHaveBeenCalledTimes(1);
    });
});
