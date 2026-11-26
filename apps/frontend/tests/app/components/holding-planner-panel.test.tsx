import { createContext, type ReactNode } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Task } from "@cadence/contracts/task";
import { Provider as TooltipProvider } from "../../../app/components/primitives/Tooltip";
import { HoldingPlannerPanel } from "../../../app/components/holding/HoldingPlannerPanel";
import { setDateFormatConfig } from "../../../app/lib/utils/date-format";
import { setUserZone } from "../../../app/lib/utils/user-zone";

const mocks = vi.hoisted(() => ({
    tasks: [] as Task[],
    feed: { tasks: [] as Task[], thoughts: [] as { id: string; rawText: string }[] },
    shell: { isWide: true, isTouch: false },
    navigate: vi.fn(),
    placeTask: vi.fn(async () => {}),
    placeThought: vi.fn(async () => {}),
    events: [] as { id: string; label: string; monthDay: string; emoji: string | null }[],
    routines: [] as (Task & { habitEmoji?: string | null })[],
}));

vi.mock("react-router", async (orig) => ({
    ...(await orig<typeof import("react-router")>()),
    useNavigate: () => mocks.navigate,
}));
vi.mock("../../../app/lib/utils/user-zone", async (orig) => ({
    ...(await orig<typeof import("../../../app/lib/utils/user-zone")>()),
    useToday: () => "2026-11-25",
}));
vi.mock("../../../app/components/holding/PlaceSheet", () => ({
    PLACE_DROP: "place:",
    dayLabel: (day: string) => day,
    useWeekLoad: () => ({ tasks: mocks.tasks }),
    usePlaceTask: () => mocks.placeTask,
    usePlaceThought: () => mocks.placeThought,
}));
vi.mock("../../../app/hooks/inbox/use-capture-feed", () => ({ useCaptureFeed: () => mocks.feed }));
vi.mock("../../../app/hooks/core/use-settings", () => ({ useSettings: () => ({ data: undefined }) }));
vi.mock("../../../app/hooks/ui/use-shell-mode", () => ({ useShellMode: () => mocks.shell }));
vi.mock("../../../app/hooks/ui/use-reduced-motion", () => ({ useReducedMotionSetting: () => true }));
vi.mock("../../../app/hooks/tasks/use-effort-guess", () => ({ useEffortGuess: () => () => null }));
vi.mock("../../../app/hooks/ai/use-duration-guess", () => ({ useDurationGuesser: () => () => null }));
vi.mock("../../../app/hooks/calendar/use-personal-events", () => ({
    usePersonalEvents: () => ({ enabled: true, items: mocks.events }),
}));
vi.mock("../../../app/hooks/ai/use-planning-offers", () => ({
    usePlanningOffers: () => ({ shown: [], task: null, kind: null }),
    PlanningOfferProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("../../../app/hooks/tasks/use-find-time", () => ({
    canFindTime: () => false,
    FindTimeDayContext: createContext(null),
}));
vi.mock("../../../app/hooks/habits/use-virtual-habit-tasks", () => ({ useVirtualHabitTasks: () => mocks.routines }));
vi.mock("../../../app/components/sharing/SharedMark", () => ({ SharedMark: () => null }));
vi.mock("../../../app/components/tasks/TaskContextMenu", () => ({ TaskContextMenu: () => null }));
vi.mock("../../../app/components/tasks/PlanningOfferChip", () => ({ PlanningOfferChip: () => null }));
vi.mock("../../../app/components/shared/DatePicker", () => ({
    DatePicker: ({ children, onChange }: { children: ReactNode; onChange: (d: string) => void }) => (
        <div>
            {children}
            <button type="button" onClick={() => onChange("2026-12-10")}>
                jump
            </button>
        </div>
    ),
}));

const task = (patch: Partial<Task>) =>
    ({
        id: patch.title,
        title: "Task",
        isHabit: false,
        interactionMode: null,
        state: "ACTIVE",
        dueDate: null,
        endDate: null,
        scheduledStart: null,
        scheduledEnd: null,
        durationEstimate: null,
        effort: null,
        priority: 0,
        projectId: null,
        ...patch,
    }) as Task;
const at = (day: string, hm: string) => `${day}T${hm}:00-05:00`;
const fixed = (title: string, start: string, end: string) =>
    task({
        title,
        interactionMode: "timetable",
        scheduledStart: at("2026-11-25", start),
        scheduledEnd: at("2026-11-25", end),
    } as Partial<Task>);
const routines = ["23", "24", "25", "26", "27", "28", "29"].flatMap((d) =>
    ["Meds", "Water", "Stretch"].map((t) =>
        task({ title: `${t} ${d}`, isHabit: true, scheduledStart: at(`2026-11-${d}`, "08:00") }),
    ),
);

const tile = (day: string) => document.querySelector<HTMLElement>(`[data-day="${day}"]`)!;
const marks = (day: string) => tile(day).querySelectorAll("[aria-hidden='true'] > span, .bg-solstice").length;
const renderPanel = () =>
    render(
        <TooltipProvider>
            <HoldingPlannerPanel onClose={() => {}} />
        </TooltipProvider>,
    );

afterEach(() => vi.useRealTimers());
beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-25T07:00:00-05:00"));
    setUserZone("America/Toronto");
    setDateFormatConfig({ timeDisplay: "12h", dateStyle: "mdy", weekStartsOn: 1 });
    mocks.tasks = [...routines, fixed("COMP3000", "08:35", "09:55"), fixed("COMP3804", "14:35", "15:55")];
    mocks.feed = { tasks: [], thoughts: [] };
    mocks.events = [];
    mocks.routines = [];
    mocks.shell = { isWide: true, isTouch: false };
});

describe("HoldingPlannerPanel", () => {
    it("shows one week, steps weeks, and comes back with Today", () => {
        renderPanel();
        expect(document.querySelectorAll("[data-day]")).toHaveLength(7);
        expect(tile("2026-11-23")).toBeTruthy();
        expect(screen.queryByRole("button", { name: "Today" })).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Next week" }));
        expect(tile("2026-11-30")).toBeTruthy();
        expect(tile("2026-11-23")).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Today" }));
        expect(tile("2026-11-25").getAttribute("aria-pressed")).toBe("true");
    });

    it("previews a picked date in place, and Schedule is the one way out", () => {
        renderPanel();
        fireEvent.click(screen.getByRole("button", { name: "jump" }));
        expect(tile("2026-12-10").getAttribute("aria-pressed")).toBe("true");
        expect(screen.getByRole("heading", { level: 3 }).textContent).toContain("Thursday");
        expect(mocks.navigate).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button", { name: /^Schedule/ }));
        expect(mocks.navigate).toHaveBeenCalledWith("/schedule?date=2026-12-10");
        expect(screen.queryByText(/Pick a date/)).toBeNull();
    });

    it("lets routines add nothing: two classes read Free after 4:00 PM with one Fixed mark", () => {
        renderPanel();
        expect(screen.getByText("Free after 4:00 PM")).toBeTruthy();
        expect(tile("2026-11-25").getAttribute("aria-label")).toContain("Free after 4:00 PM");
        expect(tile("2026-11-25").querySelectorAll(".bg-moonlit\\/75")).toHaveLength(1);
        expect(tile("2026-11-25").querySelectorAll(".bg-accent-primary\\/80")).toHaveLength(0);
        expect(marks("2026-11-27")).toBe(0);
        expect(marks("2026-11-23")).toBe(0);
        expect(screen.queryByText(/busy|steady/i)).toBeNull();
    });

    it("an empty day is the shared empty state and asks nothing when Capture is clear", () => {
        renderPanel();
        fireEvent.click(tile("2026-11-27"));
        expect(screen.getByText("Wide open.")).toBeTruthy();
        expect(screen.queryByText("Wide open")).toBeNull();
        expect(screen.queryByText(/Drop|Tap/)).toBeNull();
        expect(screen.queryByRole("button", { name: /^Place on/ })).toBeNull();
    });

    it("off the wide desktop it never mentions dragging and places with a tap", async () => {
        mocks.shell = { isWide: false, isTouch: true };
        const ready = task({ title: "Buy milk" });
        const thought = { id: "t1", rawText: "Email Sam" };
        mocks.feed = { tasks: [ready], thoughts: [thought] };
        renderPanel();
        expect(screen.getByText("Week summary")).toBeTruthy();
        expect(screen.queryByText(/drag/i)).toBeNull();
        fireEvent.click(tile("2026-11-27"));
        expect(screen.getByText(/Tap Place/)).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: /^Place on/ }));
        fireEvent.click(await screen.findByRole("button", { name: /^Place Buy milk on/ }));
        expect(mocks.placeTask).toHaveBeenCalledWith(ready, "2026-11-27");
        fireEvent.click(screen.getByRole("button", { name: /^Place Email Sam on/ }));
        expect(mocks.placeThought).toHaveBeenCalledWith(thought, "2026-11-27");
    });

    it("lists Fixed blocks with their full time range", () => {
        renderPanel();
        const day = screen.getByRole("region", { name: "Day" });
        expect(within(day).getByText("8:35 – 9:55am")).toBeTruthy();
        expect(within(day).queryByText(/Meds/)).toBeNull();
    });

    it("shows events and routines by their own emoji, without counting routines", () => {
        mocks.events = [
            { id: "e1", label: "Mum's birthday", monthDay: "11-25", emoji: "🎂" },
            { id: "e2", label: "Anniversary", monthDay: "11-25", emoji: null },
        ];
        mocks.routines = [
            task({
                id: "habit-a--2026-11-25--08:00",
                title: "Meds",
                isHabit: true,
                habitEmoji: "💊",
                scheduledStart: at("2026-11-25", "08:00"),
            } as Partial<Task>),
            task({
                id: "habit-a--2026-11-25--20:00",
                title: "Meds",
                isHabit: true,
                habitEmoji: "💊",
                scheduledStart: at("2026-11-25", "20:00"),
            } as Partial<Task>),
            task({
                id: "habit-b--2026-11-25",
                title: "Stretch",
                isHabit: true,
                state: "COMPLETE",
                dueDate: "2026-11-25",
            } as Partial<Task>),
            task({
                id: "habit-b--2026-11-26",
                title: "Stretch",
                isHabit: true,
                dueDate: "2026-11-26",
            } as Partial<Task>),
        ];
        renderPanel();
        const day = screen.getByRole("region", { name: "Day" });
        expect(within(day).getByText("🎂")).toBeTruthy();
        const fold = within(day).getByRole("button", { name: /2 routines · 1 done/ });
        fireEvent.click(fold);
        const routines = within(day).getByRole("list", { name: "Routines" });
        expect(within(routines).getAllByRole("listitem")).toHaveLength(2);
        expect(within(routines).getAllByText("💊")).toHaveLength(1);
        expect(within(routines).getByText(/, done/)).toBeTruthy();
        expect(screen.getByText("Free after 4:00 PM")).toBeTruthy();
        expect(tile("2026-11-25").querySelectorAll(".bg-solstice")).toHaveLength(1);
    });
});
