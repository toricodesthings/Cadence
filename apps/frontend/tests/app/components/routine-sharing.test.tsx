import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Habit } from "@cadence/contracts/habit";
import type { ListPerson } from "@cadence/contracts/sharing";

const OWNER = "11111111-1111-4111-8111-111111111111";
const SAM = "22222222-2222-4222-8222-222222222222";
const KAI = "33333333-3333-4333-8333-333333333333";

const mocks = vi.hoisted(() => ({
    people: [] as ListPerson[],
    createLink: vi.fn(),
    setTurnOrder: vi.fn(),
    cheer: vi.fn(),
    select: vi.fn(),
}));

vi.mock("../../../app/hooks/ui/use-shell-mode", () => ({
    useShellMode: () => ({ isPhone: false, isTouch: false, isCompact: false, isWide: true }),
}));
vi.mock("../../../app/hooks/auth/use-auth-state", () => ({
    useAuthState: () => ({
        authReady: true,
        isAuthenticated: true,
        session: { user: { id: OWNER, name: "Tori", image: null } },
    }),
}));
vi.mock("../../../app/hooks/sharing/use-share-routine", async (orig) => {
    const actual = await orig<typeof import("../../../app/hooks/sharing/use-share-routine")>();
    return {
        ...actual,
        useRoutinePeople: () => ({ data: mocks.people }),
        useCreateRoutineLink: () => ({ mutate: mocks.createLink, isPending: false }),
        useResetRoutineLinks: () => ({ mutate: vi.fn(), isPending: false }),
        useSetRoutineMode: () => ({ mutate: vi.fn(), isPending: false }),
        useSetTurnOrder: () => ({ mutate: mocks.setTurnOrder, isPending: false }),
        useRemoveFromRoutine: () => ({ mutate: vi.fn(), isPending: false }),
        useStopSharingRoutine: () => ({ mutate: vi.fn(), isPending: false }),
        useCheer: () => ({ mutate: mocks.cheer, isPending: false }),
    };
});

import { ShareRoutineSheet } from "../../../app/components/sharing/ShareRoutineSheet";
import { CheeringOnSection, RoutineShareMeta } from "../../../app/components/habits/RoutineShareMeta";
import { Provider as TooltipProvider } from "../../../app/components/primitives/Tooltip";
import { CheeringPanel } from "../../../app/components/habits/CheeringPanel";

const baseHabit: Habit = {
    id: "44444444-4444-4444-8444-444444444444",
    userId: OWNER,
    title: "Clean kitchen",
    description: null,
    recurrenceRule: "FREQ=DAILY",
    targetTime: null,
    targetTimes: null,
    emoji: "🧹",
    reminderEnabled: false,
    projectId: null,
    sortOrder: 0,
    pausedUntil: null,
    totalCompletions: 0,
    totalSkips: 0,
    currentStreak: 0,
    longestStreak: 0,
    colorAccent: "lantern",
    archived: false,
    notes: null,
    steps: null,
    times: null,
    linkedAppId: null,
    linkedUrl: null,
    shareMode: "turns",
    turnOrder: [OWNER, SAM],
    turnsFrom: "2026-11-24",
    access: "owner",
    members: [
        { userId: SAM, role: "edit", invitedBy: OWNER },
        { userId: KAI, role: "view", invitedBy: OWNER },
    ],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
};

beforeEach(() => {
    mocks.people = [
        { userId: OWNER, name: "Tori", image: null, pronouns: null, role: "owner" },
        { userId: SAM, name: "Sam", image: null, pronouns: null, role: "edit" },
        { userId: KAI, name: "Kai", image: null, pronouns: null, role: "view" },
    ];
    mocks.createLink.mockReset();
    mocks.setTurnOrder.mockReset();
    mocks.cheer.mockReset();
});

describe("ShareRoutineSheet", () => {
    it("disables the clashing participant way, copies links, and reorders turns", () => {
        const { rerender } = render(<ShareRoutineSheet habit={baseHabit} open onOpenChange={vi.fn()} />);
        expect(screen.getByText("Share this routine")).toBeTruthy();
        expect((screen.getByRole("radio", { name: /Do it together/i }) as HTMLButtonElement).disabled).toBe(true);
        expect(screen.getByText("Next: Sam")).toBeTruthy();

        // When today is Sam's turn (index 1), Next rotates around to Tori (index 0).
        rerender(
            <ShareRoutineSheet
                habit={{ ...baseHabit, today: { turn: SAM, others: [], cheers: [] } }}
                open
                onOpenChange={vi.fn()}
            />,
        );
        expect(screen.getByText("Next: Tori")).toBeTruthy();

        fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
        expect(mocks.createLink).toHaveBeenCalledWith({ habitId: baseHabit.id, way: "turns" }, expect.any(Object));

        fireEvent.click(screen.getByRole("button", { name: "Move Sam earlier" }));
        expect(mocks.setTurnOrder).toHaveBeenCalledWith({
            habitId: baseHabit.id,
            order: [SAM, OWNER],
        });
    });
});

describe("RoutineShareMeta & CheeringOnSection", () => {
    it("renders turn labels, completed others, and cheer lines", () => {
        const habit: Habit = {
            ...baseHabit,
            shareMode: "together",
            today: {
                turn: null,
                others: [{ userId: SAM, status: "COMPLETED" }],
                cheers: [KAI],
            },
        };
        render(<RoutineShareMeta habit={habit} today="2026-11-24" />);
        expect(screen.getByText("Sam did it")).toBeTruthy();
        expect(screen.getByText("Kai is cheering you on")).toBeTruthy();
    });

    it("renders Cheering on section with Cheer -> Cheered button and done days only", () => {
        const supporterHabit: Habit = {
            ...baseHabit,
            access: "view",
            logs: [
                { id: "l1", habitId: baseHabit.id, status: "COMPLETED", targetDate: "2026-11-24", completedAt: null },
            ],
        };
        render(
            <TooltipProvider>
                <CheeringOnSection
                    habits={[supporterHabit]}
                    days={[{ iso: "2026-11-24", short: "Tue", initial: "T", dayNum: 24 }]}
                    today="2026-11-24"
                    selectedHabitId={null}
                    onSelectHabit={mocks.select}
                />
            </TooltipProvider>,
        );
        expect(screen.getByText("Cheering on")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Clean kitchen, details" }));
        expect(mocks.select).toHaveBeenCalledWith(baseHabit.id);
        const btn = screen.getByRole("button", { name: "Cheer" });
        fireEvent.click(btn);
        expect(mocks.cheer).toHaveBeenCalledWith(
            { habitId: baseHabit.id, title: "Clean kitchen", targetDate: "2026-11-24" },
            expect.any(Object),
        );
        expect(screen.getByRole("button", { name: "Cheered" })).toBeTruthy();
    });
});

vi.mock("../../../app/hooks/core/use-settings", () => ({ useSettings: () => ({ data: undefined }) }));
vi.mock("../../../app/hooks/habits/use-habits", () => ({ useHabitsRange: () => ({ data: undefined }) }));
vi.mock("../../../app/lib/utils/user-zone", async (orig) => ({
    ...(await orig<typeof import("../../../app/lib/utils/user-zone")>()),
    useToday: () => "2026-11-24",
}));

describe("CheeringPanel", () => {
    it("shows the month's done days and whose routine it is, never a streak", () => {
        mocks.people = [{ userId: OWNER, name: "Tori", image: null, pronouns: null, role: "owner" }];
        const habit: Habit = {
            ...baseHabit,
            access: "view",
            currentStreak: 0,
            logs: [
                { id: "l1", habitId: baseHabit.id, status: "COMPLETED", targetDate: "2026-11-20", completedAt: null },
                { id: "l2", habitId: baseHabit.id, status: "COMPLETED", targetDate: "2026-11-24", completedAt: null },
            ],
        };
        render(
            <TooltipProvider>
                <CheeringPanel habit={habit} onClose={vi.fn()} />
            </TooltipProvider>,
        );
        expect(screen.getByRole("heading", { name: "Clean kitchen" })).toBeTruthy();
        expect(screen.getByText("Done 2 days")).toBeTruthy();
        expect(screen.getByLabelText("2026-11-20: done")).toBeTruthy();
        expect(screen.getByText("Cheering Tori on")).toBeTruthy();
        expect(screen.queryByText(/in a row|run|missed/i)).toBeNull();
    });
});
