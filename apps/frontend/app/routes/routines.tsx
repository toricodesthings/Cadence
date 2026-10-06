import { useState, useMemo, useCallback, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
export { RouteErrorBoundary as ErrorBoundary } from "../components/shared/RouteErrorBoundary";
import { MainLayout } from "../components/layout/MainLayout";
import { addDays, weekdayOf, type LocalDate } from "@cadence/domain/time";
import { getWeekDays, getMonthDateRange, isoMonthStart, formatMonthYear, formatMonthName, formatShortDate, weekdayLabels, WEEK_START_INDEX } from "../lib/utils/date-format";
import { useToday } from "../lib/utils/user-zone";
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
import { useRouteFocus } from "../hooks/search/use-route-focus";
import { HEADER_SELECT_TRIGGER, PageHeader, PhonePageHeader, PhoneViewPicker } from "../components/layout/PageHeader";
import { PeriodNav, PeriodTodayPill } from "../components/layout/PeriodNav";

const HABITS_ACCENT = "var(--accent-nav-habits, var(--accent-primary))";
const NAV_BUTTON = "btn-icon cursor-pointer rounded-xl text-twilight-text-muted hover:bg-white/[0.06] hover:text-twilight-text";

type DisplayMode = "week" | "month";
type ViewMode = "active" | "archived";

/** "Sep 27 – Oct 3", or "Sep 6 – 12" inside one month. */
function weekRange(weekDays: LocalDate[]) {
    const [first, last] = [weekDays[0], weekDays[6]];
    const end = first.slice(5, 7) === last.slice(5, 7) ? String(Number(last.slice(8))) : formatShortDate(last);
    return `${formatShortDate(first)} – ${end}`;
}

export default function Routines() {
    const shell = useShellMode();
    const setRailView = useRightPanelStore((s) => s.setRailView);
    const todayIso = useToday();
    const [currentDate, setCurrentDate] = useState<LocalDate>(todayIso);
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

    const periodYear = Number(currentDate.slice(0, 4));
    const periodMonth = Number(currentDate.slice(5, 7)) - 1;
    const weekDates = useMemo(() => getWeekDays(currentDate, weekStartsOn), [currentDate, weekStartsOn]);
    const range = displayMode === "week"
        ? { start: weekDates[0], end: weekDates[6] }
        : getMonthDateRange(periodYear, periodMonth);
    const isCurrentPeriod = todayIso >= range.start && todayIso <= range.end;

    const { data: habits = [] } = useHabitsRange({ ...range, archived: viewMode === "archived", enabled: Boolean(settings) });
    const visibleHabits = useMemo(() => habits.filter((habit) => habit.archived === (viewMode === "archived")), [habits, viewMode]);
    const selectedHabit = visibleHabits.find((h) => h.id === selectedHabitId) ?? null;

    const days = useMemo<RoutineDay[]>(() => weekDates.map((date) => {
        const short = weekdayLabels(3, 0)[weekdayOf(date)];
        return { iso: date, short, initial: short[0], dayNum: Number(date.slice(8)) };
    }), [weekDates]);

    const handleNavigate = useCallback((delta: number) => {
        setDirection(delta);
        setCurrentDate((prev) => {
            if (displayMode === "week") return addDays(prev, delta * 7);
            const index = Number(prev.slice(0, 4)) * 12 + Number(prev.slice(5, 7)) - 1 + delta;
            return isoMonthStart(Math.floor(index / 12), index % 12);
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
        ? formatMonthYear(weekDates[0])
        : formatMonthYear(currentDate);
    const periodWord = displayMode === "week" ? "week" : "month";

    const setDisplay = (mode: DisplayMode) => { setDirection(0); setDisplayMode(mode); };

    const optionsBody = (
        <div className="space-y-4">
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
        </div>
    );

    // Same as Schedule: a gear at the far right opens a small panel of view options.
    const options = (
        <Popover.Root>
            <Popover.Trigger asChild>
                <button type="button" className={NAV_BUTTON} aria-label="Routine view options">
                    <Settings size={16} aria-hidden="true" />
                </button>
            </Popover.Trigger>
            <Popover.Content side="bottom" align="end" className="w-[min(20rem,calc(100vw-2rem))] p-3">
                {optionsBody}
            </Popover.Content>
        </Popover.Root>
    );

    const headingDate = displayMode === "week" ? weekDates[0] : currentDate;
    const inThisYear = headingDate.slice(0, 4) === todayIso.slice(0, 4);
    // Phone: the title names what's on screen (the week, or the month), so the
    // header stays two lines like every other page.
    const phoneTitle = displayMode === "week"
        ? inThisYear ? weekRange(weekDates) : `${weekRange(weekDates)}, ${headingDate.slice(0, 4)}`
        : inThisYear ? formatMonthName(headingDate) : heading;

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
                        // Same as Schedule: Week/Month live under the sliders icon, Today floats bottom left.
                        <PhonePageHeader
                            eyebrow="Routines"
                            title={phoneTitle}
                            actions={<div className="flex shrink-0 items-center gap-2">
                                <button type="button" onClick={() => handleNavigate(-1)} className={`${NAV_BUTTON} touch-target rounded-full`} aria-label={`Previous ${periodWord}`}>
                                    <ChevronLeft size={15} aria-hidden="true" />
                                </button>
                                <button type="button" onClick={() => handleNavigate(1)} className={`${NAV_BUTTON} touch-target rounded-full`} aria-label={`Next ${periodWord}`}>
                                    <ChevronRight size={15} aria-hidden="true" />
                                </button>
                            </div>}
                            options={<div className="space-y-4">
                                <PhoneViewPicker value={displayMode} onChange={setDisplay} options={[{ value: "week", label: "Week" }, { value: "month", label: "Month" }]} />
                                {optionsBody}
                            </div>}
                        />
                    ) : (
                        <PageHeader
                            icon={<Flame size={18} aria-hidden="true" />}
                            accentColor={HABITS_ACCENT}
                            eyebrow="Routines"
                            title={heading}
                            meta={displayMode === "week" ? `Week of ${weekRange(weekDates)}` : undefined}
                            actions={<>
                                <PeriodNav unit={periodWord} isCurrent={isCurrentPeriod} onNavigate={handleNavigate} onToday={handleToday} />
                                <Select value={displayMode} onValueChange={(value) => setDisplay(value as DisplayMode)}>
                                    <SelectTrigger
                                        aria-label="Routine view"
                                        className={`${HEADER_SELECT_TRIGGER} focus:ring-accent-nav-habits/40`}
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
                                    className="surface-control-accent inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xl border border-accent-primary/20 px-4 text-sm font-medium text-accent-primary transition-colors hover:border-accent-primary/30"
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
                                        <HabitsMonthView {...shared} trimEarlyWeeks={shell.isPhone} year={periodYear} month={periodMonth} weekStartsOn={weekStartsOn} />
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

                <PeriodTodayPill show={shell.isPhone && !isCurrentPeriod} reducedMotion={reducedMotion} onToday={handleToday} />
                {shell.isCompact ? <ContextualAddOrb directCapture directLabel="Add routine" onOpen={() => setIsCreateOpen(true)} /> : null}
            </div>
        </MainLayout>
    );
}
