import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SharedEvent } from "@cadence/contracts/personal-event";
import type { ListPerson } from "@cadence/contracts/sharing";

const mocks = vi.hoisted(() => ({
    people: [] as ListPerson[],
    createLink: vi.fn(),
    removeFromEvent: vi.fn(),
    resetLinks: vi.fn(),
    stopSharing: vi.fn(),
}));

vi.mock("../../../app/hooks/ui/use-shell-mode", () => ({
    useShellMode: () => ({ isPhone: false, isTouch: false, isCompact: false, isWide: true }),
}));
vi.mock("../../../app/hooks/auth/use-auth-state", () => ({
    useAuthState: () => ({
        authReady: true,
        isAuthenticated: true,
        session: { user: { id: "11111111-1111-4111-8111-111111111111", name: "Tori", image: null } },
    }),
}));
vi.mock("../../../app/hooks/sharing/use-share-event", async (orig) => {
    const actual = await orig<typeof import("../../../app/hooks/sharing/use-share-event")>();
    return {
        ...actual,
        useEventPeople: () => ({ data: mocks.people }),
        useCreateEventLink: () => ({ mutate: mocks.createLink, isPending: false }),
        useRemoveFromEvent: () => ({ mutate: mocks.removeFromEvent, isPending: false }),
        useResetEventLinks: () => ({ mutate: mocks.resetLinks, isPending: false }),
        useStopSharingEvent: () => ({ mutate: mocks.stopSharing, isPending: false }),
    };
});

import { ShareEventSheet } from "../../../app/components/sharing/ShareEventSheet";
import { SharedEventMark } from "../../../app/components/sharing/SharedEventMark";
import { EventMenuItems } from "../../../app/components/events/EventMenuItems";
import * as Tooltip from "../../../app/components/primitives/Tooltip";

const OWNER = "11111111-1111-4111-8111-111111111111";
const SAM = "22222222-2222-4222-8222-222222222222";

const ownedShared: SharedEvent = {
    id: "33333333-3333-4333-8333-333333333333",
    label: "Our anniversary",
    monthDay: "06-14",
    emoji: "💍",
    notify: true,
    startedOn: "2019-06-14",
    color: "rose",
    access: "owner",
    members: [{ userId: SAM, role: "edit", invitedBy: OWNER }],
};

const memberShared: SharedEvent = { ...ownedShared, access: "edit" };
const unshared: SharedEvent = { ...ownedShared, members: [] };

beforeEach(() => {
    mocks.people = [
        { userId: OWNER, name: "Tori", image: null, pronouns: null, role: "owner" },
        { userId: SAM, name: "Sam", image: null, pronouns: null, role: "edit" },
    ];
    mocks.createLink.mockReset();
    mocks.removeFromEvent.mockReset();
    mocks.resetLinks.mockReset();
    mocks.stopSharing.mockReset();
});

const FakeMenu = {
    Item: ({ children, onSelect }: { children: React.ReactNode; onSelect?: () => void }) => (
        <button type="button" onClick={onSelect}>
            {children}
        </button>
    ),
    Separator: () => <hr />,
} as never;

describe("SharedEventMark", () => {
    it("renders nothing for unshared events and shows owner/member tooltips for shared events", () => {
        const { rerender, container } = render(
            <Tooltip.Provider>
                <SharedEventMark event={unshared} />
            </Tooltip.Provider>,
        );
        expect(container.querySelector("[aria-label]")).toBeNull();

        rerender(
            <Tooltip.Provider>
                <SharedEventMark event={ownedShared} />
            </Tooltip.Provider>,
        );
        expect(screen.getByLabelText("Shared with Sam")).toBeTruthy();

        rerender(
            <Tooltip.Provider>
                <SharedEventMark event={memberShared} />
            </Tooltip.Provider>,
        );
        expect(screen.getByLabelText("Shared by Tori")).toBeTruthy();
    });
});

describe("EventMenuItems", () => {
    it("shows Share and Delete for the owner, and Remove from my events without Delete for a member", () => {
        const onShare = vi.fn();
        const onDelete = vi.fn();
        const onRemove = vi.fn();

        const { rerender } = render(
            <EventMenuItems
                Menu={FakeMenu}
                event={unshared}
                onEdit={vi.fn()}
                onShare={onShare}
                onOpenInSchedule={vi.fn()}
                onToggleReminder={vi.fn()}
                onDelete={onDelete}
                onRemoveFromMyEvents={onRemove}
            />,
        );
        expect(screen.getByRole("button", { name: "Share…" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "Delete event" })).toBeTruthy();
        expect(screen.queryByRole("button", { name: "Remove from my events" })).toBeNull();

        rerender(
            <EventMenuItems
                Menu={FakeMenu}
                event={memberShared}
                onEdit={vi.fn()}
                onShare={onShare}
                onOpenInSchedule={vi.fn()}
                onToggleReminder={vi.fn()}
                onDelete={onDelete}
                onRemoveFromMyEvents={onRemove}
            />,
        );
        expect(screen.queryByRole("button", { name: "Delete event" })).toBeNull();
        expect(screen.getByRole("button", { name: "Remove from my events" })).toBeTruthy();
    });
});

describe("ShareEventSheet", () => {
    it("copies a link without role controls", () => {
        render(<ShareEventSheet event={ownedShared} open onOpenChange={vi.fn()} />);
        expect(screen.getByText("Share this date")).toBeTruthy();
        expect(screen.queryByText(/Can view|Can edit/i)).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
        expect(mocks.createLink).toHaveBeenCalledWith(ownedShared.id, expect.any(Object));
    });
});
