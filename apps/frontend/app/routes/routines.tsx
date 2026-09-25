import { useState, useMemo, useCallback, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
export { RouteErrorBoundary as ErrorBoundary } from "../components/shared/RouteErrorBoundary";
import { MainLayout } from "../components/layout/MainLayout";
import { toISODate, getWeekDates, getMonthDateRange, MONTH_NAMES, WEEK_START_INDEX } from "../lib/utils/date-format";
import { slideVariants } from "../lib/constants/motion";
import { HabitsCanvas } from "../components/habits/HabitsCanvas";
import { HabitsMonthView } from "../components/habits/HabitsMonthView";
import { RoutineTodayBand } from "../components/habits/RoutineTodayBand";
import type { RoutineDay } from "../components/habits/RoutineWeekRow";
import { EditSidePanel } from "../components/shared/EditSidePanel";
import { CreateHabitDialog } from "../components/habits/CreateHabitDialog";
import { EditSidePanelRail } from "../components/shared/EditSidePanelRail";
import { ContextualAddOrb } from "../components/shared/ContextualAddOrb";
import * as Popover from "../components/primitives/Popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/primitives/Select";
import { EmptyState } from "../components/tasks/EmptyState";
import { SegmentedControl } from "../components/primitives/SegmentedControl";
import { Switch } from "../components/primitives/Switch";
import { useRightPanelStore } from "../stores/right-panel-store";
import { useHabitsRange } from "../hooks/habits/use-habits";
import { useSettings, useUpdateSettings } from "../hooks/core/use-settings";
import { ResponsiveOverlayPanel } from "../components/shared/ResponsiveOverlayPanel";
import { ChevronLeft, ChevronRight, Plus, Flame, Settings } from "lucide-react";
import { useDocumentMeta } from "../hooks/core/use-document-meta";
import { useShellMode } from "../hooks/ui/use-shell-mode";
import { useReducedMotionSetting } from "../hooks/ui/use-reduced-motion";
import { useMinuteClock } from "../hooks/ui/use-realtime-clock";
import { useRouteFocus } from "../hooks/search/use-route-focus";
import { PAGE_HEADER_SURFACE, PageHeader, PageHeaderIdentity } from "../components/layout/PageHeader";
import { PeriodNav, PeriodTodayButton } from "../components/layout/PeriodNav";

const HABITS_ACCENT = "var(--accent-nav-habits, var(--accent-primary))";
const NAV_BUTTON = "btn-icon cursor-pointer rounded-xl text-twilight-text-muted hover:bg-white/[0.06] hover:text-twilight-text";

type DisplayMode = "week" | "month";
type ViewMode = "active" | "archived";

function weekRangeLabel(weekDates: Date[]) {
    const [first, last] = [weekDates[0], weekDates[6]];
    const start = first.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const end = first.getMonth() === last.getMonth() ? String(last.getDate()) : last.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return `Week of ${start}–${end}`;
}

export default function Routines() {
    const shell = useShellMode();
    const setRailView = useRightPanelStore((s) => s.setRailView);
    const todayIso = toISODate(useMinuteClock());
    const [currentDate, setCurrentDate] = useState<string>(todayIso);
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [selectedHabitId, setSelectedHabitId] = useState<string | null>(null);
    const [mobileDetailMode, setMobileDetailMode] = useState<"peek" | "focus">("peek");
    const [direction, setDirection] = useState(0);
    const [displayMode, setDisplayMode] = useState<DisplayMode>("week");
    const [viewMode, setViewMode] = useState<ViewMode>("active");

    // The week start comes from settings, never the global default, so the grid
    // doesn't render Monday-first and then jump once settings load.
    const { data: settings } = useSettings();
    const updateSettings = useUpdateSettings();
    const weekStartsOn = WEEK_START_INDEX[settings?.dateTime?.weekStart ?? "Sunday"];
    const showStreaks = settings?.tasks?.showStreaks !== false;
    const reducedMotion = useReducedMotionSetting();
    const bloom = !settings?.tasks?.intelligence?.lowStimulationMode && !reducedMotion;

    const periodDate = useMemo(() => new Date(`${currentDate}T00:00:00`), [currentDate]);
    const weekDates = useMemo(() => getWeekDates(periodDate, weekStartsOn), [periodDate, weekStartsOn]);
    const range = displayMode === "week"
        ? { start: toISODate(weekDates[0]), end: toISODate(weekDates[6]) }
        : getMonthDateRange(periodDate.getFullYear(), periodDate.getMonth());
    const isCurrentPeriod = todayIso >= range.start && todayIso <= range.end;

    const { data: habits = [] } = useHabitsRange({ ...range, archived: viewMode === "archived", enabled: Boolean(settings) });
    const visibleHabits = useMemo(() => habits.filter((habit) => habit.archived === (viewMode === "archived")), [habits, viewMode]);
    const selectedHabit = visibleHabits.find((h) => h.id === selectedHabitId) ?? null;

    const days = useMemo<RoutineDay[]>(() => weekDates.map((date) => {
        const short = date.toLocaleDateString("en-US", { weekday: "short" });
        return { iso: toISODate(date), short, initial: short[0], dayNum: date.getDate() };
    }), [weekDates]);

    const handleNavigate = useCallback((delta: number) => {
        setDirection(delta);
        setCurrentDate((prev) => {
            const date = new Date(`${prev}T00:00:00`);
            if (displayMode === "week") date.setDate(date.getDate() + delta * 7);
            else date.setMonth(date.getMonth() + delta, 1);
            return toISODate(date);
        });
    }, [displayMode]);

    const handleToday = useCallback(() => {
        setDirection(todayIso >= currentDate ? 1 : -1);
        setCurrentDate(todayIso);
    }, [currentDate, todayIso]);

    const handleSelectHabit = (id: string) => {
        if (id === selectedHabitId) {
            setSelectedHabitId(null);
            return;
        }
        if (!shell.isWide) setMobileDetailMode("peek");
        setSelectedHabitId(id);
        setRailView("context");
    };

    useEffect(() => {
        if (selectedHabitId && habits.length && !visibleHabits.some((habit) => habit.id === selectedHabitId)) {
            setSelectedHabitId(null);
        }
    }, [selectedHabitId, habits.length, visibleHabits]);

    useDocumentMeta("Routines · Cadence", "Keep up the routines you care about, one calm week at a time.");

    useRouteFocus({
        onFocusMatch: (params) => {
            if (params.focusKind === "habit" && params.focusId) setSelectedHabitId(params.focusId);
        },
    });

    const heading = displayMode === "week"
        ? `${MONTH_NAMES[weekDates[0].getMonth()]} ${weekDates[0].getFullYear()}`
        : `${MONTH_NAMES[periodDate.getMonth()]} ${periodDate.getFullYear()}`;
    const periodWord = displayMode === "week" ? "week" : "month";

    const setDisplay = (mode: DisplayMode) => { setDirection(0); setDisplayMode(mode); };

    // Same as Schedule: a gear at the far right opens a small panel of view options.
    const options = (
        <Popover.Root>
            <Popover.Trigger asChild>
                <button type="button" className={`${NAV_BUTTON} ${shell.isPhone ? "touch-target rounded-full" : ""}`} aria-label="Routine view options">
                    <Settings size={16} aria-hidden="true" />
                </button>
            </Popover.Trigger>
            <Popover.Content side="bottom" align="end" className="w-[min(20rem,calc(100vw-2rem))] space-y-4 p-3">
                <div>
                    <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-twilight-text-muted">Show</h4>
                    <SegmentedControl
                        ariaLabel="Which routines"
                        value={viewMode}
                        onChange={setViewMode}
                        options={[{ value: "active", label: "Active" }, { value: "archived", label: "Archived" }]}
                    />
                </div>
                <label className="flex items-center justify-between rounded-xl border border-twilight-border/40 bg-white/[0.03] px-3 py-2 text-sm text-twilight-text-soft">
                    <span>Show streaks</span>
                    <Switch checked={showStreaks} onCheckedChange={(value) => updateSettings.mutate({ tasks: { showStreaks: value } })} />
                </label>
            </Popover.Content>
        </Popover.Root>
    );

    // On a desktop week the grid's today column already is today's check-in, so
    // the band shows only where today is scattered (month cards, phone cards).
    const lead = isCurrentPeriod && viewMode === "active" && (displayMode === "month" || shell.isCompact)
        ? <RoutineTodayBand habits={visibleHabits} today={todayIso} bloom={bloom} columns={!shell.isCompact} onOpen={handleSelectHabit} />
        : null;
    const empty = <EmptyState variant={viewMode === "archived" ? "routines-archived" : "routines"} onAction={() => setIsCreateOpen(true)} />;
    const shared = {
        habits: visibleHabits,
        today: todayIso,
        showStreaks,
        bloom,
        selectedHabitId,
        onSelectHabit: handleSelectHabit,
        lead,
        empty,
    };

    return (
        <MainLayout requireAuth hideHeader hideContextualOrb
            sidePanel={(
                <EditSidePanelRail ariaLabel="Resize routine detail panel">
                    {shell.isWide && selectedHabit ? <EditSidePanel kind="habit" habit={selectedHabit} onClose={() => setSelectedHabitId(null)} /> : null}
                </EditSidePanelRail>
            )}
            sidePanelActive={Boolean(selectedHabit)}
            sidePanelLabel="Routine"
            onCloseSidePanel={() => setSelectedHabitId(null)}
        >
            <div className="flex h-full overflow-hidden">
                <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                    {shell.isPhone ? (
                        <header className={`${PAGE_HEADER_SURFACE} safe-header-top px-4 pb-3`}>
                            {/* Same two rows as Schedule: identity + period nav +
                                options on top, view switcher + Today below. */}
                            <div className="flex min-h-[44px] items-center gap-2">
                                <div className="min-w-0 flex-1">
                                    <PageHeaderIdentity compact icon={<Flame size={16} aria-hidden="true" />} accentColor={HABITS_ACCENT} eyebrow="Routines" title={heading} />
                                </div>
                                <div className="flex shrink-0 items-center gap-0.5">
                                    <button type="button" onClick={() => handleNavigate(-1)} className={`${NAV_BUTTON} touch-target rounded-full`} aria-label={`Previous ${periodWord}`}>
                                        <ChevronLeft size={15} aria-hidden="true" />
                                    </button>
                                    <button type="button" onClick={() => handleNavigate(1)} className={`${NAV_BUTTON} touch-target rounded-full`} aria-label={`Next ${periodWord}`}>
                                        <ChevronRight size={15} aria-hidden="true" />
                                    </button>
                                </div>
                                {options}
                            </div>
                            <div className="mt-1.5 flex items-center gap-1">
                                <SegmentedControl
                                    ariaLabel="Routine view"
                                    size="sm"
                                    value={displayMode}
                                    onChange={setDisplay}
                                    options={[{ value: "week", label: "Week" }, { value: "month", label: "Month" }]}
                                />
                                <PeriodTodayButton compact isCurrent={isCurrentPeriod} onToday={handleToday} />
                            </div>
                        </header>
                    ) : (
                        <PageHeader
                            icon={<Flame size={18} aria-hidden="true" />}
                            accentColor={HABITS_ACCENT}
                            eyebrow="Routines"
                            title={heading}
                            meta={displayMode === "week" ? weekRangeLabel(weekDates) : undefined}
                            actions={<>
                                <PeriodNav unit={periodWord} isCurrent={isCurrentPeriod} onNavigate={handleNavigate} onToday={handleToday} />
                                <Select value={displayMode} onValueChange={(value) => setDisplay(value as DisplayMode)}>
                                    <SelectTrigger
                                        aria-label="Routine view"
                                        className="h-11 w-auto min-w-[7.5rem] gap-2 rounded-xl border-twilight-border/30 bg-twilight-base/35 px-3.5 text-sm font-medium text-twilight-text shadow-none hover:bg-twilight-base/50 focus:ring-accent-nav-habits/40"
                                    >
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent align="end">
                                        <SelectItem value="week">Week</SelectItem>
                                        <SelectItem value="month">Month</SelectItem>
                                    </SelectContent>
                                </Select>
                                {shell.isCompact ? null : <button
                                    type="button"
                                    onClick={() => setIsCreateOpen(true)}
                                    className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xl border border-accent-primary/20 bg-accent-primary/15 px-4 text-sm font-medium text-accent-primary transition-colors hover:border-accent-primary/30 hover:bg-accent-primary/25"
                                >
                                    <Plus size={14} aria-hidden="true" />
                                    Add routine
                                </button>}
                                {options}
                            </>}
                        />
                    )}

                    <div className="flex min-w-0 flex-1 flex-col overflow-hidden pt-4">
                        {settings ? (
                            <AnimatePresence initial={false} custom={{ direction, distance: bloom ? 28 : 0 }} mode="wait">
                                <motion.div
                                    key={`${displayMode}-${range.start}`}
                                    custom={{ direction, distance: direction && bloom ? 28 : 0 }}
                                    variants={slideVariants}
                                    initial="enter"
                                    animate="center"
                                    exit="exit"
                                    transition={bloom ? { x: { type: "spring", stiffness: 320, damping: 32 }, opacity: { duration: 0.18 } } : { duration: 0 }}
                                    className="flex min-h-0 flex-1"
                                >
                                    {displayMode === "week" ? (
                                        <HabitsCanvas {...shared} days={days} stacked={shell.isPhone} showWeekCount={shell.isWide} />
                                    ) : (
                                        <HabitsMonthView {...shared} trimEarlyWeeks={shell.isPhone} year={periodDate.getFullYear()} month={periodDate.getMonth()} weekStartsOn={weekStartsOn} />
                                    )}
                                </motion.div>
                            </AnimatePresence>
                        ) : null}
                    </div>
                </div>

                <CreateHabitDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />

                {!shell.isWide && selectedHabit && (
                    <ResponsiveOverlayPanel
                        ariaLabel={`Routine details for ${selectedHabit.title}`}
                        open={!!selectedHabit}
                        onClose={() => setSelectedHabitId(null)}
                        mode={mobileDetailMode}
                        fill
                    >
                        <EditSidePanel kind="habit"
                            habit={selectedHabit}
                            detailMode={mobileDetailMode}
                            onDetailModeChange={setMobileDetailMode}
                            onClose={() => setSelectedHabitId(null)}
                        />
                    </ResponsiveOverlayPanel>
                )}

                {shell.isCompact ? <ContextualAddOrb directCapture directLabel="Add routine" onOpen={() => setIsCreateOpen(true)} /> : null}
            </div>
        </MainLayout>
    );
}
