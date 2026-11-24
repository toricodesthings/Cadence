import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { Cloud } from "lucide-react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InboxItem } from "@cadence/contracts/inbox";
import type { Task } from "@cadence/contracts/task";
import { HoldingFeed } from "../../../app/components/holding/HoldingFeed";
import { CaptureGreeting, CaptureWindow } from "../../../app/components/holding/CaptureGreeting";
import { skyWarmth } from "../../../app/hooks/environment/use-weather";
import HomeRoute from "../../../app/routes/home";

type MockFeed = {
    thoughts: InboxItem[];
    older: InboxItem[];
    tasks: Task[];
    notes: InboxItem[];
    inboxItems: InboxItem[];
    count: number;
    isLoading: boolean;
};

type MockWeather = {
    weather: {
        temp: number;
        celsius: number;
        code: number;
        isDay: boolean;
        condition: string;
        icon: typeof Cloud;
    } | null;
    status: "off" | "unavailable" | "loading" | "ready" | "error";
};

const state = vi.hoisted(() => ({
    feed: {
        thoughts: [] as InboxItem[],
        older: [] as InboxItem[],
        tasks: [] as Task[],
        notes: [] as InboxItem[],
        inboxItems: [] as InboxItem[],
        count: 0,
        isLoading: false,
    } as MockFeed,
    weather: {
        weather: null,
        status: "off",
    } as MockWeather,
    shell: { isWide: true, isCompact: false, isPhone: false, isTouch: false },
}));

vi.mock("../../../app/hooks/inbox/use-capture-feed", () => ({
    useCaptureFeed: () => state.feed,
}));
vi.mock("../../../app/hooks/environment/use-weather", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../../app/hooks/environment/use-weather")>();
    return {
        ...actual,
        useWeather: () => state.weather,
    };
});
vi.mock("../../../app/hooks/auth/use-auth-state", () => ({
    useAuthState: () => ({ session: { user: { id: "u1", name: "Tori" } } }),
}));
vi.mock("../../../app/hooks/ui/use-realtime-clock", () => ({
    useMinuteClock: () => new Date("2026-11-24T14:00:00Z"),
}));
vi.mock("../../../app/lib/constants/greetings", () => ({
    dayPeriodOf: () => "afternoon",
    getTimeBasedGreeting: (_now?: Date, name?: string) => (name ? `Good afternoon, ${name}` : "Good afternoon"),
}));
vi.mock("../../../app/hooks/ui/use-shell-mode", () => ({
    useShellMode: () => state.shell,
}));
vi.mock("../../../app/hooks/core/use-settings", () => ({
    useSettings: () => ({ data: undefined }),
}));
vi.mock("../../../app/hooks/projects/use-own-projects", () => ({
    useEditableProjects: () => ({ data: [] }),
}));
vi.mock("../../../app/hooks/tags/use-tags", () => ({
    useTags: () => ({ data: [] }),
}));
vi.mock("../../../app/hooks/inbox/use-process-inbox-to-task", () => ({
    useProcessInboxToTask: () => ({ mutate: vi.fn(), mutateAsync: vi.fn() }),
}));
vi.mock("../../../app/hooks/inbox/use-unprocess-inbox", () => ({
    useUnprocessInbox: () => ({ mutate: vi.fn() }),
}));
vi.mock("../../../app/hooks/inbox/use-capture-actions", () => ({
    useCaptureActions: () => ({ setStatus: vi.fn() }),
}));
vi.mock("../../../app/hooks/tasks/use-update-task", () => ({
    useUpdateTask: () => ({ mutate: vi.fn(), mutateAsync: vi.fn() }),
}));
vi.mock("../../../app/hooks/tasks/use-subtasks", () => ({
    useSubtasksByTaskIds: () => ({ data: {} }),
}));
vi.mock("../../../app/components/holding/PlaceSheet", () => ({
    useWeekLoad: () => ({ lightest: "2026-11-25" }),
    usePlaceTask: () => vi.fn(),
    CaptureColumnDrop: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    PlaceDndProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("../../../app/components/holding/CaptureRow", () => ({
    CaptureRow: ({ item, task }: { item?: InboxItem; task?: Task }) => (
        <div data-testid="capture-row">{item?.rawText ?? task?.title}</div>
    ),
}));
vi.mock("../../../app/components/holding/CaptureInput", () => ({
    KBD: "kbd",
    CaptureInput: () => <div data-testid="capture-input">What's on your mind?</div>,
    useCaptureComposer: () => ({
        title: "Add a thought",
        isDirty: false,
        reset: vi.fn(),
        submit: { onSubmit: vi.fn(), submitLabel: "Capture" },
        children: null,
    }),
}));
vi.mock("../../../app/components/layout/MainLayout", () => ({
    MainLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("../../../app/components/location/LocationNotice", () => ({
    LocationNotice: () => null,
}));
vi.mock("../../../app/components/shared/ScrollAreaWrapper", () => ({
    ScrollAreaWrapper: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("../../../app/components/shared/EditSidePanelRail", () => ({
    EditSidePanelRail: () => null,
}));
vi.mock("../../../app/components/shared/EditSidePanel", () => ({
    EditSidePanel: () => null,
}));
vi.mock("../../../app/components/holding/HoldingPlannerPanel", () => ({
    HoldingPlannerPanel: () => null,
}));
vi.mock("../../../app/components/shared/ResponsiveOverlayPanel", () => ({
    ResponsiveOverlayPanel: () => null,
}));
vi.mock("../../../app/components/shared/Composer", () => ({
    Composer: () => null,
}));
vi.mock("../../../app/components/shared/ContextualAddOrb", () => ({
    ContextualAddOrb: () => null,
}));
vi.mock("../../../app/components/shared/SortMenu", () => ({
    SortMenu: () => null,
}));
vi.mock("../../../app/components/focus-views/FocusViewBar", () => ({
    FocusViewBar: () => null,
}));
vi.mock("../../../app/components/primitives/Tooltip", () => ({
    Tip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("../../../app/hooks/search/use-route-focus", () => ({
    useRouteFocus: () => undefined,
}));
vi.mock("../../../app/hooks/ui/use-route-view-mode", () => ({
    useRouteViewMode: () => ({ view: "list", setView: vi.fn() }),
}));

const sampleThought = {
    id: "10000000-0000-4000-8000-000000000001",
    rawText: "Pick up coffee beans",
    captureStatus: "clarifying",
    createdAt: "2026-11-24T13:00:00.000Z",
} as InboxItem;

const sampleTask = {
    id: "20000000-0000-4000-8000-000000000002",
    title: "Renew passport",
    state: "ACTIVE",
    priority: 0,
    createdAt: "2026-11-24T13:00:00.000Z",
} as Task;

beforeEach(() => {
    state.feed = {
        thoughts: [],
        older: [],
        tasks: [],
        notes: [],
        inboxItems: [],
        count: 0,
        isLoading: false,
    };
    state.weather = {
        weather: { temp: 1, celsius: 1, code: 3, isDay: true, condition: "cloudy", icon: Cloud },
        status: "ready",
    };
    state.shell = { isWide: true, isCompact: false, isPhone: false, isTouch: false };
});

describe("Capture merged empty state", () => {
    it("merges New and No day yet into one greeting + weather empty state when both are empty", () => {
        const { container } = render(
            <MemoryRouter>
                <HoldingFeed onSelectTask={vi.fn()} onClarifyInboxItem={vi.fn()} />
            </MemoryRouter>,
        );

        expect(container.querySelector("[data-capture-clear]")).not.toBeNull();
        expect(screen.getByText(/Good afternoon,/)).toBeTruthy();
        expect(screen.getByText("Tori")).toBeTruthy();
        expect(screen.getByText("1°")).toBeTruthy();
        expect(screen.getByText("cloudy")).toBeTruthy();
        expect(screen.getByText("All clear. Add a thought or task whenever you need.")).toBeTruthy();

        expect(screen.queryByRole("heading", { name: /^New\b/ })).toBeNull();
        expect(screen.queryByRole("heading", { name: /^No day yet\b/ })).toBeNull();
        expect(screen.queryByText("Nothing new. Add a thought whenever you need.")).toBeNull();
        expect(screen.queryByText("No tasks waiting for a day.")).toBeNull();
        expect(screen.queryByText("Tick off")).toBeNull();
    });

    it("renders the greeting cleanly when weather is off", () => {
        state.weather = { weather: null, status: "off" };
        const { container } = render(
            <MemoryRouter>
                <HoldingFeed onSelectTask={vi.fn()} onClarifyInboxItem={vi.fn()} />
            </MemoryRouter>,
        );

        expect(container.querySelector("[data-capture-clear]")).not.toBeNull();
        expect(screen.getByText(/Good afternoon,/)).toBeTruthy();
        expect(screen.queryByText("cloudy")).toBeNull();
        expect(container.querySelector(".capture-sky")?.getAttribute("aria-hidden")).toBe("true");
    });

    it("restores both sections as soon as a thought appears in New", () => {
        state.feed = {
            ...state.feed,
            thoughts: [sampleThought],
            inboxItems: [sampleThought],
            count: 1,
        };
        const { container } = render(
            <MemoryRouter>
                <HoldingFeed onSelectTask={vi.fn()} onClarifyInboxItem={vi.fn()} />
            </MemoryRouter>,
        );

        expect(container.querySelector("[data-capture-clear]")).toBeNull();
        expect(screen.getByRole("heading", { name: /^New\b/ })).toBeTruthy();
        expect(screen.getByRole("heading", { name: /^No day yet\b/ })).toBeTruthy();
        expect(screen.getByText("Pick up coffee beans")).toBeTruthy();
        expect(screen.getByText("No tasks waiting for a day.")).toBeTruthy();
    });

    it("restores both sections as soon as a task appears in No day yet", () => {
        state.feed = {
            ...state.feed,
            tasks: [sampleTask],
            count: 1,
        };
        const { container } = render(
            <MemoryRouter>
                <HoldingFeed onSelectTask={vi.fn()} onClarifyInboxItem={vi.fn()} />
            </MemoryRouter>,
        );

        expect(container.querySelector("[data-capture-clear]")).toBeNull();
        expect(screen.getByRole("heading", { name: /^New\b/ })).toBeTruthy();
        expect(screen.getByRole("heading", { name: /^No day yet\b/ })).toBeTruthy();
        expect(screen.getByText("Renew passport")).toBeTruthy();
        expect(screen.getByText("Nothing new. Add a thought whenever you need.")).toBeTruthy();
    });

    it("merges board view when both fields are empty and keeps Older/Notes folds accessible", () => {
        state.feed = {
            ...state.feed,
            notes: [{ ...sampleThought, id: "30000000-0000-4000-8000-000000000003", captureStatus: "kept" }],
        };
        const { container } = render(
            <MemoryRouter>
                <HoldingFeed onSelectTask={vi.fn()} onClarifyInboxItem={vi.fn()} view="kanban" />
            </MemoryRouter>,
        );

        expect(container.querySelector("[data-capture-clear]")).not.toBeNull();
        expect(screen.getByRole("button", { name: /Notes/ })).toBeTruthy();
    });

    it("moves the desktop top greeting into the merged empty state and restores it when an item appears", () => {
        const { container, rerender } = render(
            <MemoryRouter>
                <HomeRoute />
            </MemoryRouter>,
        );

        // Only one greeting on screen — inside the special empty state, not above CaptureInput.
        expect(screen.getAllByText(/Good afternoon,/)).toHaveLength(1);
        expect(container.querySelector("[data-capture-clear]")).not.toBeNull();
        expect(screen.getByTestId("capture-input")).toBeTruthy();

        state.feed = {
            ...state.feed,
            thoughts: [sampleThought],
            inboxItems: [sampleThought],
            count: 1,
        };
        rerender(
            <MemoryRouter>
                <HomeRoute />
            </MemoryRouter>,
        );

        // Top greeting is back above CaptureInput and the merged empty state is gone.
        expect(container.querySelector("[data-capture-clear]")).toBeNull();
        expect(screen.getAllByText(/Good afternoon,/)).toHaveLength(1);
        expect(screen.getByRole("heading", { name: /^New\b/ })).toBeTruthy();
        expect(screen.getByRole("heading", { name: /^No day yet\b/ })).toBeTruthy();
    });

    it("maps weather and time of day onto a continuous 0–100 warmth spectrum", () => {
        const hotSunny = skyWarmth("afternoon", { celsius: 32, code: 0, isDay: true });
        const warmMorning = skyWarmth("morning", { celsius: 24, code: 0, isDay: true });
        const mildPartlyCloudy = skyWarmth("afternoon", { celsius: 18, code: 2, isDay: true });
        const chillyPartlyCloudy = skyWarmth("afternoon", { celsius: 1, code: 2, isDay: true });
        const coolRain = skyWarmth("afternoon", { celsius: 8, code: 63, isDay: true });
        const warmClearNight = skyWarmth("night", { celsius: 24, code: 0, isDay: false });
        const coolClearNight = skyWarmth("night", { celsius: 10, code: 0, isDay: false });
        const freezingSnowNight = skyWarmth("night", { celsius: -6, code: 73, isDay: false });

        expect(hotSunny).toBe(100);
        expect(warmMorning).toBeGreaterThan(mildPartlyCloudy);
        expect(mildPartlyCloudy).toBeGreaterThan(chillyPartlyCloudy);
        expect(chillyPartlyCloudy).toBeGreaterThan(coolRain);
        expect(warmClearNight).toBeGreaterThan(coolClearNight);
        expect(coolClearNight).toBeGreaterThan(freezingSnowNight);
        expect(freezingSnowNight).toBeLessThanOrEqual(5);

        // No-weather fallback still follows a smooth day-period spectrum.
        expect(skyWarmth("afternoon", null)).toBeGreaterThan(skyWarmth("morning", null));
        expect(skyWarmth("morning", null)).toBeGreaterThan(skyWarmth("evening", null));
        expect(skyWarmth("evening", null)).toBeGreaterThan(skyWarmth("night", null));
    });

    it("applies the same adaptive --sky-warmth spectrum on desktop and mobile variants", () => {
        state.weather = {
            weather: { temp: 31, celsius: 31, code: 0, isDay: true, condition: "clear", icon: Cloud },
            status: "ready",
        };
        const { container: desktopClear } = render(<CaptureWindow variant="clear" />);
        const { container: desktopLine } = render(<CaptureGreeting />);
        const { container: mobileBand } = render(<CaptureWindow variant="band" />);
        const { container: mobileEmpty } = render(<CaptureWindow variant="empty" />);

        expect(desktopClear.querySelector<HTMLElement>(".capture-sky")?.style.getPropertyValue("--sky-warmth")).toBe(
            "100%",
        );
        expect(
            desktopLine.querySelector<HTMLElement>(".capture-sky-tone")?.style.getPropertyValue("--sky-warmth"),
        ).toBe("100%");
        expect(mobileBand.querySelector<HTMLElement>(".capture-sky")?.style.getPropertyValue("--sky-warmth")).toBe(
            "100%",
        );
        expect(mobileEmpty.querySelector<HTMLElement>(".capture-sky")?.style.getPropertyValue("--sky-warmth")).toBe(
            "100%",
        );

        state.weather = {
            weather: { temp: -6, celsius: -6, code: 73, isDay: false, condition: "snow", icon: Cloud },
            status: "ready",
        };
        const { container: coldClear } = render(<CaptureWindow variant="clear" />);
        expect(coldClear.querySelector<HTMLElement>(".capture-sky")?.style.getPropertyValue("--sky-warmth")).toBe("2%");
    });
});
