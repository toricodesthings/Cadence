import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTask } from "../../../helpers";

const state = vi.hoisted(() => ({
    isShared: true,
    people: new Map<string, { name: string }>([
        ["ada-1", { name: "Ada" }],
        ["sam-1", { name: "Sam" }],
    ]),
    listName: "Our House",
}));

vi.mock("../../../../app/hooks/sharing/use-list-access", () => ({
    useTaskAccess: () => ({ role: "edit", isShared: state.isShared, canEdit: true, isOwner: false }),
}));
vi.mock("../../../../app/hooks/sharing/use-list-people", () => ({
    usePersonInList: (_projectId: string | null | undefined, userId: string | null | undefined) => ({
        person: userId ? state.people.get(userId) : state.people.get("ada-1"),
        project: { id: "list-1", name: state.listName, userId: "ada-1" },
        former: false,
        loaded: true,
    }),
}));
vi.mock("../../../../app/components/primitives/Tooltip", () => ({
    Tip: ({ label, children }: { label: string; children: ReactNode }) => <span data-tip={label}>{children}</span>,
}));
vi.mock("../../../../app/components/sharing/PersonAvatar", () => ({
    PersonAvatar: ({ userId, tip }: { userId?: string | null; tip?: string }) => (
        <span data-testid="avatar" data-user={userId ?? "owner"} data-tip={tip} />
    ),
}));

import { SharedMark } from "../../../../app/components/sharing/SharedMark";

beforeEach(() => {
    state.isShared = true;
    state.listName = "Our House";
});

describe("SharedMark", () => {
    it("renders nothing for unshared lists", () => {
        state.isShared = false;
        const { container } = render(<SharedMark task={makeTask({ projectId: "list-1" })} />);
        expect(container.firstChild).toBeNull();
    });

    it("shows the Users glyph and creator avatar with 'added by' Tip outside the list", () => {
        const task = makeTask({ projectId: "list-1", createdBy: "ada-1", takenBy: null });
        render(<SharedMark task={task} />);
        const tip = "Shared · Our House · added by Ada";
        expect(screen.getByLabelText(tip)).toBeTruthy();
        expect(screen.getByTestId("avatar").getAttribute("data-user")).toBe("ada-1");
        expect(screen.getByTestId("avatar").getAttribute("data-tip")).toBe(tip);
    });

    it("prefers the taker over the creator and updates the Tip text", () => {
        const task = makeTask({ projectId: "list-1", createdBy: "ada-1", takenBy: "sam-1" });
        render(<SharedMark task={task} />);
        const tip = "Shared · Our House · Sam is doing it";
        expect(screen.getByLabelText(tip)).toBeTruthy();
        expect(screen.getByTestId("avatar").getAttribute("data-user")).toBe("sam-1");
    });

    it("renders avatar only (no Users glyph) when inList is true", () => {
        const task = makeTask({ projectId: "list-1", createdBy: "ada-1", takenBy: "sam-1" });
        render(<SharedMark task={task} inList />);
        expect(screen.queryByLabelText(/Shared ·/)).toBeNull();
        expect(screen.getByTestId("avatar").getAttribute("data-user")).toBe("sam-1");
    });
});
