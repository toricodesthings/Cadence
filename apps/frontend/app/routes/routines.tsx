import { useState, useMemo, useCallback, useEffect } from "react";
import { useSearchParams } from "react-router";
import { AnimatePresence, motion } from "framer-motion";
export { RouteErrorBoundary as ErrorBoundary } from "../components/shared/RouteErrorBoundary";
import { MainLayout } from "../components/layout/MainLayout";
import { addDays, weekdayOf, type LocalDate } from "@cadence/domain/time";
import { getWeekDays, getMonthDateRange, isoMonthStart, formatMonthYear, formatMonthName, formatShortDate, weekdayLabels, WEEK_START_INDEX } from "../lib/utils/date-format";
import { useToday } from "../lib/utils/user-zone";
import { slideVariants, SPRINGS } from "../lib/constants/motion";
import { HabitsCanvas } from "../components/habits/HabitsCanvas";
import { HabitsMonthView } from "../components/habits/HabitsMonthView";
import { RoutineTodayBand } from "../components/habits/RoutineTodayBand";
import type { RoutineDay } from "../components/habits/RoutineWeekRow";
import { EditSidePanel } from "../components/shared/EditSidePanel";
import { CreateHabitDialog } from "../components/habits/CreateHabitDialog";
import { EditSidePanelRail } from "../components/shared/EditSidePanelRail";
import { ContextualAddOrb } from "../components/shared/ContextualAddOrb";
import * as DropdownMenu from "../components/primitives/DropdownMenu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/primitives/Select";
import { EmptyState } from "../components/tasks/EmptyState";
import { SegmentedControl } from "../components/primitives/SegmentedControl";
import { Switch } from "../components/primitives/Switch";
import { useRightPanelStore } from "../stores/right-panel-store";
import { useHabitsRange } from "../hooks/habits/use-habits";
import { useSettings, useUpdateSettings } from "../hooks/core/use-settings";
import { ResponsiveOverlayPanel } from "../components/shared/ResponsiveOverlayPanel";
import { ChevronLeft, ChevronRight, Plus, Flame, EllipsisVertical, CalendarPlus, Clock, ArrowDownAZ, ArrowUpDown, Check, GripVertical, type LucideIcon } from "lucide-react";
import type { RoutineSort } from "../lib/utils/habits";
import { useShellMode } from "../hooks/ui/use-shell-mode";
import { useReducedMotionSetting } from "../hooks/ui/use-reduced-motion";
import { useRouteFocus } from "../hooks/search/use-route-focus";
import { HEADER_ICON_BUTTON, HEADER_SELECT_TRIGGER, PageHeader, PhonePageHeader } from "../components/layout/PageHeader";
import { PeriodDock, PeriodNav, PeriodTodayPill } from "../components/layout/PeriodNav";
import { LayoutScaleMenuRow } from "../components/layout/LayoutScaleMenu";
import { useDeviceValue } from "../hooks/ui/use-device-flag";

const HABITS_ACCENT = "var(--accent-nav-habits, var(--accent-primary))";
const NAV_BUTTON = "btn-icon cursor-pointer rounded-xl text-twilight-text-muted hover:bg-white/[0.06] hover:text-twilight-text";

type DisplayMode = "week" | "month";

const ROUTINE_SORTS: { value: RoutineSort; label: string; icon: LucideIcon }[] = [
    { value: "created", label: "Date added", icon: CalendarPlus },
    { value: "time", label: "Time of day", icon: Clock },
    { value: "name", label: "Name", icon: ArrowDownAZ },
    { value: "custom", label: "Custom", icon: GripVertical },
];

const MENU_LABEL = "flex items-center gap-1.5 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-twilight-text-muted";

/** The Routines ⋮, built like Today's (`shared/SortMenu`): the choices up top, then Sort by rows, streaks, and the scale. */
type RoutinesMenuProps = {
    phone: boolean;
    display: DisplayMode;
    onDisplayChange: (mode: DisplayMode) => void;
    show: ViewMode;
    onShowChange: (mode: ViewMode) => void;
    sort: RoutineSort;
    onSortChange: (sort: RoutineSort) => void;
    streaks: boolean;
    onStreaksChange: (on: boolean) => void;
};

function RoutinesMenu({ phone, display, onDisplayChange, show, onShowChange, sort, onSortChange, streaks, onStreaksChange }: RoutinesMenuProps) {
    return (
        <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
                <button type="button" aria-label="Routine view and sort options"
                    className={phone ? "btn-icon touch-target rounded-full text-twilight-text-muted hover:bg-white/[0.06] hover:text-twilight-text" : HEADER_ICON_BUTTON}>
                    <EllipsisVertical size={18} aria-hidden="true" />
                </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Content align="end" className="w-[min(17rem,calc(100vw-2rem))]">
                <div className="space-y-2 px-3 pb-2.5 pt-2">
                    {phone ? <SegmentedControl ariaLabel="Routine view" className="flex w-full [&>button]:flex-1" value={display} onChange={onDisplayChange}
                        options={[{ value: "week", label: "Week" }, { value: "month", label: "Month" }]} /> : null}
                    <SegmentedControl ariaLabel="Which routines" className="flex w-full [&>button]:flex-1" value={show} onChange={onShowChange}
                        options={[{ value: "active", label: "Active" }, { value: "archived", label: "Archived" }]} />
                </div>
                <DropdownMenu.Separator />
                <div className={MENU_LABEL}><ArrowUpDown size={11} aria-hidden="true" />Sort by</div>
                {ROUTINE_SORTS.map(({ value, label, icon: Icon }) => (
                    <DropdownMenu.Item key={value} onSelect={() => onSortChange(value)} className="flex items-center gap-2">
                        <Icon size={14} aria-hidden="true" />
                        <span className="flex-1">{label}</span>
                        {sort === value ? <Check size={14} className="text-accent-primary" aria-hidden="true" /> : null}
                    </DropdownMenu.Item>
                ))}
                <DropdownMenu.Separator />
                <DropdownMenu.Item onSelect={(event) => { event.preventDefault(); onStreaksChange(!streaks); }} role="menuitemcheckbox" aria-checked={streaks} className="flex items-center gap-2">
                    <Flame size={14} aria-hidden="true" />
                    <span className="flex-1">Show streaks</span>
                    <Switch checked={streaks} tabIndex={-1} aria-hidden="true" className="pointer-events-none" />
                </DropdownMenu.Item>
                <LayoutScaleMenuRow />
            </DropdownMenu.Content>
        </DropdownMenu.Root>
    );
}

type ViewMode = "active" | "archived";

/** "Sep 27 – Oct 3", or "Sep 6 – 12" inside one month. */
function weekRange(weekDays: LocalDate[]) {
    const [first, last] = [weekDays[0], weekDays[6]];
    const end = first.slice(5, 7) === last.slice(5, 7) ? String(Number(last.slice(8))) : formatShortDate(last);
    return `${formatShortDate(first)} – ${end}`;
}

/**
 * The week start comes from settings, never the global default, so the grid doesn't render
 * Monday-first and then jump once settings load. Blooms rest in low stimulation and reduced motion.
 */
function useRoutineSettings() {
    const { data: settings } = useSettings();
    const updateSettings = useUpdateSettings();
    const reducedMotion = useReducedMotionSetting();
    return {
        settings,
        updateSettings,
        weekStartsOn: WEEK_START_INDEX[settings?.dateTime?.weekStart ?? "Sunday"],
        showStreaks: settings?.tasks?.showStreaks !== false,
        reducedMotion,
        bloom: !settings?.tasks?.intelligence?.lowStimulationMode && !reducedMotion,
    };
}

const inRange = (day: LocalDate, range: { start: LocalDate; end: LocalDate }) => day >= range.start && day <= range.end;

type Shell = ReturnType<typeof useShellMode>;

type RoutinesHeaderProps = {
    shell: Shell;
    titles: ReturnType<typeof periodTitles>;
    meta: string | undefined;
    isCurrentPeriod: boolean;
    displayMode: DisplayMode;
    onDisplayMode: (mode: DisplayMode) => void;
    onNavigate: (delta: number) => void;
    onToday: () => void;
    onAdd: () => void;
    menu: (phone: boolean) => React.ReactNode;
};

/** The phone header, or the page header with period nav (not on laptop: the dock has it) and Add (not on compact: the orb has it). */
function RoutinesHeader({ shell, titles, meta, isCurrentPeriod, displayMode, onDisplayMode, onNavigate, onToday, onAdd, menu }: RoutinesHeaderProps) {
    if (shell.isPhone) {
        return <RoutinesPhoneHeader title={titles.phoneTitle} periodWord={titles.periodWord} onNavigate={onNavigate} menu={menu(true)} />;
    }
    return (
        <RoutinesDesktopHeader
            heading={titles.heading}
            meta={meta}
            periodNav={shell.isLaptop ? null : <PeriodNav unit={titles.periodWord} isCurrent={isCurrentPeriod} onNavigate={onNavigate} onToday={onToday} />}
            displayMode={displayMode}
            onDisplayMode={onDisplayMode}
            onAdd={shell.isCompact ? null : onAdd}
            menu={menu(false)}
        />
    );
}

type RoutinesFloatingProps = {
    shell: Shell;
    periodWord: string;
    isCurrentPeriod: boolean;
    reducedMotion: boolean;
    onNavigate: (delta: number) => void;
    onToday: () => void;
    onAdd: () => void;
};

/** What floats over the page: the laptop's period dock, the phone's Today pill, the compact add orb. */
function RoutinesFloating({ shell, periodWord, isCurrentPeriod, reducedMotion, onNavigate, onToday, onAdd }: RoutinesFloatingProps) {
    return (
        <>
            {shell.isLaptop ? <PeriodDock unit={periodWord} isCurrent={isCurrentPeriod} onNavigate={onNavigate} onToday={onToday} /> : null}
            <PeriodTodayPill show={shell.isPhone && !isCurrentPeriod} reducedMotion={reducedMotion} onToday={onToday} />
            {shell.isCompact ? <ContextualAddOrb directCapture directLabel="Add routine" onOpen={onAdd} /> : null}
        </>
    );
}

const routineSortOf = (saved: unknown): RoutineSort => ROUTINE_SORTS.find((option) => option.value === saved)?.value ?? "created";

/** On a desktop week the grid's today column already is today's check-in, so the band shows only where today is scattered (month cards, phone cards). */
const showsTodayBand = (viewMode: ViewMode, displayMode: DisplayMode, compact: boolean) => viewMode === "active" && (displayMode === "month" || compact);

type RoutinesPeriodProps = {
    shared: Omit<React.ComponentProps<typeof HabitsCanvas>, "days" | "stacked" | "showWeekCount">;
    displayMode: DisplayMode;
    rangeStart: LocalDate;
    direction: number;
    bloom: boolean;
    days: RoutineDay[];
    phone: boolean;
    wide: boolean;
    year: number;
    month: number;
    weekStartsOn: (typeof WEEK_START_INDEX)[keyof typeof WEEK_START_INDEX];
};

/** The week grid or the month, sliding between periods (still when motion is calm). */
function RoutinesPeriod({ shared, displayMode, rangeStart, direction, bloom, days, phone, wide, year, month, weekStartsOn }: RoutinesPeriodProps) {
    return (
        <AnimatePresence initial={false} custom={{ direction, distance: bloom ? 28 : 0 }} mode="wait">
            <motion.div
                key={`${displayMode}-${rangeStart}`}
                custom={{ direction, distance: direction && bloom ? 28 : 0 }}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={bloom ? { x: SPRINGS.GLIDE, opacity: { duration: 0.18 } } : { duration: 0 }}
                className="flex min-h-0 flex-1"
            >
                {displayMode === "week" ? (
                    <HabitsCanvas {...shared} days={days} stacked={phone} showWeekCount={wide} />
                ) : (
                    <HabitsMonthView {...shared} trimEarlyWeeks={phone} year={year} month={month} weekStartsOn={weekStartsOn} />
                )}
            </motion.div>
        </AnimatePresence>
    );
}

type RoutineDetailOverlayProps = {
    habit: NonNullable<ReturnType<typeof useHabitsRange>["data"]>[number];
    mode: "peek" | "focus";
    onModeChange: (mode: "peek" | "focus") => void;
    onClose: () => void;
};

/** Below the wide layout, a routine's details open over the page. */
function RoutineDetailOverlay({ habit, mode, onModeChange, onClose }: RoutineDetailOverlayProps) {
    return (
        <ResponsiveOverlayPanel
            ariaLabel={`Routine details for ${habit.title}`}
            open
            onClose={onClose}
            mode={mode}
            fill
        >
            <EditSidePanel kind="habit"
                habit={habit}
                detailMode={mode}
                onDetailModeChange={onModeChange}
                onClose={onClose}
            />
        </ResponsiveOverlayPanel>
    );
}

/** A text field, a grid or a menu that wants the arrows keeps them. */
function ownsArrows(target: EventTarget | null) {
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
    return target instanceof HTMLElement && (target.isContentEditable || Boolean(target.closest('[role="grid"], [role="menu"], [role="dialog"], [role="listbox"]')));
}

/** ← / → change the period, as on Schedule. */
function useArrowPeriods(onNavigate: (delta: number) => void) {
    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
            if (ownsArrows(event.target)) return;
            event.preventDefault();
            onNavigate(event.key === "ArrowLeft" ? -1 : 1);
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [onNavigate]);
}

/**
 * The header's month title, the period's name, and the phone title: what's on screen (the week, or
 * the month), with the year only when it isn't this one, so the header stays two lines like every other page.
 */
function periodTitles(displayMode: DisplayMode, weekDates: LocalDate[], currentDate: LocalDate, todayIso: LocalDate) {
    const week = displayMode === "week";
    const headingDate = week ? weekDates[0] : currentDate;
    const heading = formatMonthYear(headingDate);
    const inThisYear = headingDate.slice(0, 4) === todayIso.slice(0, 4);
    const weekTitle = inThisYear ? weekRange(weekDates) : `${weekRange(weekDates)}, ${headingDate.slice(0, 4)}`;
    const monthTitle = inThisYear ? formatMonthName(headingDate) : heading;
    return { heading, periodWord: week ? "week" : "month", phoneTitle: week ? weekTitle : monthTitle };
}

type RoutinesPhoneHeaderProps = { title: string; periodWord: string; onNavigate: (delta: number) => void; menu: React.ReactNode };

/** Same as Schedule: Week/Month live under ⋮, Today floats bottom left. */
function RoutinesPhoneHeader({ title, periodWord, onNavigate, menu }: RoutinesPhoneHeaderProps) {
    return (
        <PhonePageHeader
            eyebrow="Routines"
            title={title}
            actions={<div className="flex shrink-0 items-center gap-2">
                <button type="button" onClick={() => onNavigate(-1)} className={`${NAV_BUTTON} touch-target rounded-full`} aria-label={`Previous ${periodWord}`}>
                    <ChevronLeft size={15} aria-hidden="true" />
                </button>
                <button type="button" onClick={() => onNavigate(1)} className={`${NAV_BUTTON} touch-target rounded-full`} aria-label={`Next ${periodWord}`}>
                    <ChevronRight size={15} aria-hidden="true" />
                </button>
                {menu}
            </div>}

        />
    );
}

type RoutinesDesktopHeaderProps = {
    heading: string;
    meta: string | undefined;
    periodNav: React.ReactNode;
    displayMode: DisplayMode;
    onDisplayMode: (mode: DisplayMode) => void;
    /** Null where the add orb stands in (compact). */
    onAdd: (() => void) | null;
    menu: React.ReactNode;
};

function RoutinesDesktopHeader({ heading, meta, periodNav, displayMode, onDisplayMode, onAdd, menu }: RoutinesDesktopHeaderProps) {
    return (
        <PageHeader
            icon={<Flame size={18} aria-hidden="true" />}
            accentColor={HABITS_ACCENT}
            eyebrow="Routines"
            title={heading}
            meta={meta}
            actions={<>
                {periodNav}
                <Select value={displayMode} onValueChange={(value) => onDisplayMode(value as DisplayMode)}>
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
                {onAdd ? <button
                    type="button"
                    onClick={onAdd}
                    className="surface-control-accent inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xl border border-accent-primary/20 px-4 text-sm font-medium text-accent-primary transition-colors hover:border-accent-primary/30"
                >
                    <Plus size={14} aria-hidden="true" />
                    Add routine
                </button> : null}
                {menu}
            </>}
        />
    );
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
    const { settings, updateSettings, weekStartsOn, showStreaks, reducedMotion, bloom } = useRoutineSettings();
    // The order is this device's own (a drag still saves the Custom order itself to the account).
    const [savedSort, setRoutineSort] = useDeviceValue("cadence:routines:sort");
    const routineSort = routineSortOf(savedSort);

    const periodYear = Number(currentDate.slice(0, 4));
    const periodMonth = Number(currentDate.slice(5, 7)) - 1;
    const weekDates = useMemo(() => getWeekDays(currentDate, weekStartsOn), [currentDate, weekStartsOn]);
    const range = displayMode === "week" ? { start: weekDates[0], end: weekDates[6] } : getMonthDateRange(periodYear, periodMonth);
    const isCurrentPeriod = inRange(todayIso, range);

    const { data: habits = [] } = useHabitsRange({ ...range, archived: viewMode === "archived", enabled: Boolean(settings) });
    const visibleHabits = useMemo(() => habits.filter((habit) => habit.archived === (viewMode === "archived")), [habits, viewMode]);
    const selectedHabit = visibleHabits.find((h) => h.id === selectedHabitId);

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

    // `?routine=` (Schedule's "Open in Routines") selects once and leaves no trace; an unknown id is dropped below.
    const [searchParams, setSearchParams] = useSearchParams();
    useEffect(() => {
        const id = searchParams.get("routine");
        if (!id) return;
        setSelectedHabitId(id);
        setRailView("context");
        setSearchParams((params) => { params.delete("routine"); return params; }, { replace: true });
    }, [searchParams, setSearchParams, setRailView]);

    useArrowPeriods(handleNavigate);

    useEffect(() => {
        if (selectedHabitId && habits.length && !visibleHabits.some((habit) => habit.id === selectedHabitId)) {
            setSelectedHabitId(null);
        }
    }, [selectedHabitId, habits.length, visibleHabits]);


    useRouteFocus({
        onFocusMatch: (params) => {
            if (params.focusKind === "habit" && params.focusId) setSelectedHabitId(params.focusId);
        },
    });

    const { heading, periodWord, phoneTitle } = periodTitles(displayMode, weekDates, currentDate, todayIso);

    const setDisplay = (mode: DisplayMode) => { setDirection(0); setDisplayMode(mode); };

    // One ⋮ on every size, the same menu as Today's: what to show, the order, streaks, and (desktop app) the scale.
    const menu = (phone: boolean) => (
        <RoutinesMenu
            phone={phone}
            display={displayMode} onDisplayChange={setDisplay}
            show={viewMode} onShowChange={setViewMode}
            sort={routineSort} onSortChange={setRoutineSort}
            streaks={showStreaks} onStreaksChange={(value) => updateSettings.mutate({ tasks: { showStreaks: value } })}
        />
    );


    // On a desktop week the grid's today column already is today's check-in, so
    // the band shows only where today is scattered (month cards, phone cards).
    const lead = isCurrentPeriod && showsTodayBand(viewMode, displayMode, shell.isCompact)
        ? <RoutineTodayBand habits={visibleHabits} today={todayIso} bloom={bloom} columns={!shell.isCompact} onOpen={handleSelectHabit} />
        : null;
    const empty = <EmptyState variant={viewMode === "archived" ? "routines-archived" : "routines"} onAction={() => setIsCreateOpen(true)} />;
    const shared = {
        habits: visibleHabits,
        sort: routineSort,
        onSortChange: setRoutineSort,
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
                    <RoutinesHeader
                        shell={shell}
                        titles={{ heading, periodWord, phoneTitle }}
                        meta={displayMode === "week" ? weekRange(weekDates) : undefined}
                        isCurrentPeriod={isCurrentPeriod}
                        displayMode={displayMode}
                        onDisplayMode={setDisplay}
                        onNavigate={handleNavigate}
                        onToday={handleToday}
                        onAdd={() => setIsCreateOpen(true)}
                        menu={menu}
                    />

                    <div className="flex min-w-0 flex-1 flex-col overflow-hidden pt-4">
                        {settings ? (
                            <RoutinesPeriod
                                shared={shared}
                                displayMode={displayMode}
                                rangeStart={range.start}
                                direction={direction}
                                bloom={bloom}
                                days={days}
                                phone={shell.isPhone}
                                wide={shell.isWide}
                                year={periodYear}
                                month={periodMonth}
                                weekStartsOn={weekStartsOn}
                            />
                        ) : null}
                    </div>
                </div>

                <CreateHabitDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />

                {!shell.isWide && selectedHabit ? (
                    <RoutineDetailOverlay habit={selectedHabit} mode={mobileDetailMode} onModeChange={setMobileDetailMode} onClose={() => setSelectedHabitId(null)} />
                ) : null}

                <RoutinesFloating shell={shell} periodWord={periodWord} isCurrentPeriod={isCurrentPeriod} reducedMotion={reducedMotion} onNavigate={handleNavigate} onToday={handleToday} onAdd={() => setIsCreateOpen(true)} />
            </div>
        </MainLayout>
    );
}
