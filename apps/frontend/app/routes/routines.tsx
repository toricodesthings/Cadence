import { useState, useMemo, useCallback, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
export { RouteErrorBoundary as ErrorBoundary } from "../components/shared/RouteErrorBoundary";
import { MainLayout } from "../components/layout/MainLayout";
import { toISODate, getWeekDates, MONTH_NAMES } from "../lib/utils/date-format";
import { slideVariants } from "../lib/constants/motion";
import { HabitsCanvas } from "../components/habits/HabitsCanvas";
import { HabitsMonthView } from "../components/habits/HabitsMonthView";
import { EditSidePanel } from "../components/shared/EditSidePanel";
import { CreateHabitDialog } from "../components/habits/CreateHabitDialog";
import { EditSidePanelRail } from "../components/shared/EditSidePanelRail";
import { useRightPanelStore } from "../stores/right-panel-store";
import { useHabitsWeekly } from "../hooks/habits/use-habits";
import { HabitToastResolver } from "../components/habits/HabitToastResolver";
import { ResponsiveOverlayPanel } from "../components/shared/ResponsiveOverlayPanel";
import { ChevronLeft, ChevronRight, Plus, Settings, Flame } from "lucide-react";
import { useDocumentMeta } from "../hooks/core/use-document-meta";
import { useShellMode } from "../hooks/ui/use-shell-mode";
import { useRouteFocus } from "../hooks/search/use-route-focus";
import { PAGE_HEADER_SURFACE, PageHeader, PageHeaderIdentity } from "../components/layout/PageHeader";
import * as Popover from "../components/primitives/Popover";
import { Tip } from "../components/primitives/Tooltip";

const HABITS_ACCENT = "var(--accent-nav-habits, var(--accent-primary))";

export default function Habits() {
    const shell = useShellMode();
    const setRailView = useRightPanelStore((s) => s.setRailView);
    const today = new Date();
    const [currentDate, setCurrentDate] = useState<string>(toISODate(today));
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [selectedHabitId, setSelectedHabitId] = useState<string | null>(null);
    const [mobileDetailMode, setMobileDetailMode] = useState<"peek" | "focus">("peek");
    const [direction, setDirection] = useState(0);

    const [displayMode, setDisplayMode] = useState<"week" | "month">("week");
    const [viewMode, setViewMode] = useState<"active" | "archived">("active");

    const weekDates = useMemo(() => getWeekDates(new Date(currentDate + "T00:00:00")), [currentDate]);
    const startIso = toISODate(weekDates[0]);
    const endIso = toISODate(weekDates[6]);

    const { data: habits = [] } = useHabitsWeekly({
        start: startIso,
        end: endIso,
        archived: viewMode === "archived",
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    const visibleHabits = useMemo(
        () => habits.filter((habit) => habit.archived === (viewMode === "archived")),
        [habits, viewMode],
    );
    const periodDate = useMemo(() => new Date(currentDate + "T00:00:00"), [currentDate]);

    const handleNavigate = useCallback((delta: number) => {
        setDirection(delta);
        setCurrentDate((prev) => {
            const date = new Date(prev + "T00:00:00");
            if (displayMode === "week") {
                date.setDate(date.getDate() + delta * 7);
            } else {
                date.setMonth(date.getMonth() + delta);
            }
            return toISODate(date);
        });
    }, [displayMode]);

    const handleToday = useCallback(() => {
        const todayIso = toISODate(new Date());
        setDirection(todayIso >= currentDate ? 1 : -1);
        setCurrentDate(todayIso);
    }, [currentDate]);

    const handleSelectHabit = (id: string) => {
        if (!shell.isWide) {
            setMobileDetailMode("peek");
        }
        setSelectedHabitId(id);
        setRailView("context");
    };

    const todayIso = toISODate(new Date());
    const isCurrentWeek = todayIso >= startIso && todayIso <= endIso;
    const isCurrentMonth = periodDate.getFullYear() === new Date().getFullYear()
        && periodDate.getMonth() === new Date().getMonth();
    const isCurrentPeriod = displayMode === "week" ? isCurrentWeek : isCurrentMonth;

    const monthIdx = weekDates[0].getMonth();
    const year = weekDates[0].getFullYear();
    const activeMonthIdx = periodDate.getMonth();
    const activeYear = periodDate.getFullYear();
    const weekRangeLabel = (() => {
        const sameMonth = weekDates[0].getMonth() === weekDates[6].getMonth();
        const startFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(weekDates[0]);

        if (sameMonth) {
            return `Week of ${startFmt} – ${weekDates[6].getDate()}, ${weekDates[6].getFullYear()}`;
        }

        const endFmt = new Intl.DateTimeFormat("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
        }).format(weekDates[6]);
        return `Week of ${startFmt} – ${endFmt}`;
    })();

    const monthRangeLabel = new Intl.DateTimeFormat("en-US", {
        month: "long",
        year: "numeric",
    }).format(periodDate);
    const mainHeading = `${MONTH_NAMES[monthIdx]} ${year}`;
    const currentHeading = displayMode === "week" ? mainHeading : monthRangeLabel;
    const selectedHabit = visibleHabits.find((h) => h.id === selectedHabitId) ?? null;

    useEffect(() => {
        if (selectedHabitId && !visibleHabits.some((habit) => habit.id === selectedHabitId)) {
            setSelectedHabitId(null);
        }
    }, [selectedHabitId, visibleHabits]);

    useDocumentMeta(
        "Routines · Cadence",
        "Keep up the routines you care about, one calm week at a time.",
    );

    useRouteFocus({
        onFocusMatch: (params) => {
            if (params.focusKind === "habit" && params.focusId) {
                setSelectedHabitId(params.focusId);
            }
        },
    });

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
            <HabitToastResolver />

            <div className="flex h-full overflow-hidden">
                <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                    {shell.isPhone ? (
                        <header className={`${PAGE_HEADER_SURFACE} safe-header-top px-4 pb-3`}>
                            {/* Same two rows as Schedule: identity + period nav +
                                overflow on top, view switcher + Today below. */}
                            <div className="flex items-center gap-2 min-h-[44px]">
                                <div className="min-w-0 flex-1">
                                    <PageHeaderIdentity compact icon={<Flame size={16} aria-hidden="true" />} accentColor={HABITS_ACCENT} eyebrow="Routines" title={currentHeading} />
                                </div>
                                <div className="flex items-center gap-0.5 shrink-0">
                                    <button
                                        type="button"
                                        onClick={() => handleNavigate(-1)}
                                        className="btn-icon touch-target rounded-full text-twilight-text-muted hover:text-twilight-text hover:bg-white/[0.06]"
                                        aria-label={displayMode === "week" ? "Previous week" : "Previous month"}
                                    >
                                        <ChevronLeft size={15} />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleNavigate(1)}
                                        className="btn-icon touch-target rounded-full text-twilight-text-muted hover:text-twilight-text hover:bg-white/[0.06]"
                                        aria-label={displayMode === "week" ? "Next week" : "Next month"}
                                    >
                                        <ChevronRight size={15} />
                                    </button>
                                </div>
                                <Popover.Root>
                                    <Tip label="Routine options"><Popover.Trigger asChild>
                                        <button
                                            type="button"
                                            className="btn-icon touch-target rounded-full text-twilight-text-muted hover:text-twilight-text hover:bg-white/[0.06]"
                                            aria-label="Routine options"
                                        >
                                            <Settings size={16} />
                                        </button>
                                    </Popover.Trigger></Tip>
                                    <Popover.Content side="bottom" align="end" className="w-64 space-y-2 p-3">
                                        <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-twilight-text-muted">Show</h3>
                                        <div className="space-y-1.5" role="radiogroup" aria-label="Routine view mode">
                                            {(["active", "archived"] as const).map((mode) => (
                                                <button
                                                    key={mode}
                                                    type="button"
                                                    role="radio"
                                                    aria-checked={viewMode === mode}
                                                    onClick={() => setViewMode(mode)}
                                                    className={`touch-target flex min-h-11 w-full items-center rounded-xl border px-3 text-sm font-medium ${
                                                        viewMode === mode
                                                            ? "border-accent-primary/30 bg-accent-primary/14 text-accent-primary"
                                                            : "border-twilight-border/40 bg-white/[0.03] text-twilight-text-soft"
                                                    }`}
                                                >
                                                    {mode === "active" ? "Active routines" : "Archived routines"}
                                                </button>
                                            ))}
                                        </div>
                                    </Popover.Content>
                                </Popover.Root>
                            </div>

                            <div className="mt-1.5 flex items-center gap-1">
                                <nav
                                    className="flex items-center gap-1 rounded-xl border border-twilight-border/30 bg-twilight-base/35 p-0.5"
                                    role="radiogroup"
                                    aria-label="Routine display mode"
                                >
                                    {(["week", "month"] as const).map((mode) => (
                                        <button
                                            key={mode}
                                            type="button"
                                            role="radio"
                                            aria-checked={displayMode === mode}
                                            onClick={() => setDisplayMode(mode)}
                                            className={`rounded-lg border px-3 py-1 text-[13px] font-medium transition-colors cursor-pointer ${
                                                displayMode === mode
                                                    ? "bg-accent-primary/20 text-accent-primary border-accent-primary/25"
                                                    : "text-twilight-text-soft hover:text-twilight-text hover:bg-white/[0.04] border-transparent"
                                            }`}
                                        >
                                            {mode === "week" ? "Week" : "Month"}
                                        </button>
                                    ))}
                                </nav>
                                <button
                                    type="button"
                                    onClick={handleToday}
                                    disabled={isCurrentPeriod}
                                    className="ml-auto rounded-lg border border-twilight-border/30 bg-white/[0.03] px-3 py-1 text-[13px] font-medium text-twilight-text-soft hover:bg-white/[0.05] hover:text-twilight-text cursor-pointer disabled:opacity-30"
                                >
                                    Today
                                </button>
                            </div>
                        </header>
                    ) : (
                        <PageHeader
                            icon={<Flame size={18} aria-hidden="true" />}
                            accentColor={HABITS_ACCENT}
                            eyebrow="Routines"
                            title={currentHeading}
                            meta={displayMode === "week" ? weekRangeLabel : "Motivational review"}
                            actions={<>
                                    {/* Center: navigation */}
                                    <div className="flex items-center gap-1">
                                        <button
                                            type="button"
                                            onClick={() => handleNavigate(-1)}
                                            className="btn-icon rounded-xl text-twilight-text-muted hover:text-twilight-text hover:bg-white/[0.06]"
                                            aria-label="Previous week"
                                        >
                                            <ChevronLeft size={16} />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleToday}
                                            disabled={isCurrentPeriod}
                                            className="inline-flex min-h-11 items-center rounded-xl border border-twilight-border/30 bg-white/[0.03] px-3.5 text-sm font-medium text-twilight-text-soft hover:bg-white/[0.05] hover:text-twilight-text transition-colors cursor-pointer disabled:pointer-events-none disabled:opacity-30"
                                        >
                                            Today
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleNavigate(1)}
                                            className="btn-icon rounded-xl text-twilight-text-muted hover:text-twilight-text hover:bg-white/[0.06]"
                                            aria-label="Next week"
                                        >
                                            <ChevronRight size={16} />
                                        </button>
                                    </div>

                                    <nav
                                        className="flex min-h-11 items-center gap-0.5 rounded-xl border border-twilight-border/30 bg-twilight-base/35 p-0.5"
                                        role="radiogroup"
                                        aria-label="Routine display mode"
                                    >
                                        {(["week", "month"] as const).map((mode) => (
                                            <button
                                                key={mode}
                                                type="button"
                                                role="radio"
                                                aria-checked={displayMode === mode}
                                                onClick={() => setDisplayMode(mode)}
                                                className={`
                                                    inline-flex h-9 items-center rounded-lg px-3.5 text-sm font-medium transition-colors cursor-pointer border
                                                    ${displayMode === mode
                                                        ? "bg-accent-primary/20 text-accent-primary border-accent-primary/25"
                                                        : "text-twilight-text-soft hover:text-twilight-text hover:bg-white/[0.04] border-transparent"}
                                                `}
                                            >
                                                {mode === "week" ? "Week" : "Month"}
                                            </button>
                                        ))}
                                    </nav>

                                    {/* Right: view tabs */}
                                    <nav
                                        className="flex min-h-11 items-center gap-0.5 rounded-xl border border-twilight-border/30 bg-twilight-base/35 p-0.5"
                                        role="radiogroup"
                                        aria-label="Routine view mode"
                                    >
                                        {(["active", "archived"] as const).map((mode) => (
                                            <button
                                                key={mode}
                                                type="button"
                                                role="radio"
                                                aria-checked={viewMode === mode}
                                                onClick={() => setViewMode(mode)}
                                                className={`
                                                    inline-flex h-9 items-center rounded-lg px-3.5 text-sm font-medium transition-colors cursor-pointer border
                                                    ${viewMode === mode
                                                        ? "bg-accent-primary/20 text-accent-primary border-accent-primary/25"
                                                        : "text-twilight-text-soft hover:text-twilight-text hover:bg-white/[0.04] border-transparent"}
                                                `}
                                                aria-current={viewMode === mode ? "true" : undefined}
                                            >
                                                {mode === "active" ? "Active" : "Archived"}
                                            </button>
                                        ))}
                                    </nav>

                                    {/* Add Routine button */}
                                    <button
                                        type="button"
                                        onClick={() => setIsCreateOpen(true)}
                                        className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-accent-primary/20 bg-accent-primary/15 px-4 text-sm font-medium text-accent-primary hover:bg-accent-primary/25 hover:border-accent-primary/30 transition-colors cursor-pointer"
                                    >
                                        <Plus size={14} />
                                        <span className="hidden lg:inline">Add Routine</span>
                                    </button>
                            </>}
                        />
                    )}

                    <div className="flex-1 overflow-hidden flex flex-col pt-4 min-w-0">
                        <AnimatePresence initial={false} custom={{ direction, distance: 28 }} mode="wait">
                            <motion.div
                                key={`${displayMode}-${currentDate}`}
                                custom={{ direction, distance: 28 }}
                                variants={slideVariants}
                                initial="enter"
                                animate="center"
                                exit="exit"
                                transition={{
                                    x: { type: "spring", stiffness: 320, damping: 32 },
                                    opacity: { duration: 0.18 },
                                }}
                                className="flex min-h-0 flex-1"
                            >
                                {displayMode === "week" ? (
                                    <HabitsCanvas
                                        weekDates={weekDates}
                                        habits={visibleHabits}
                                        selectedHabitId={selectedHabitId}
                                        onSelectHabit={handleSelectHabit}
                                        emptyStateMode={viewMode}
                                    />
                                ) : (
                                    <HabitsMonthView
                                        year={activeYear}
                                        month={activeMonthIdx}
                                        habits={visibleHabits}
                                        selectedHabitId={selectedHabitId}
                                        onSelectHabit={handleSelectHabit}
                                        emptyStateMode={viewMode}
                                    />
                                )}
                            </motion.div>
                        </AnimatePresence>
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

                {shell.isCompact ? (
                    /* Bottom-right orb like every other page — the dock owns the
                       centre, so a centred pill collided with it. */
                    <div className="layer-floating-bar pointer-events-none mobile-floating-action fixed bottom-5 right-4 flex flex-col items-end sm:right-5">
                        <Tip label="Add routine" side="left">
                            <button
                                type="button"
                                onClick={() => setIsCreateOpen(true)}
                                aria-label="Add routine"
                                className="pointer-events-auto flex h-14 w-14 cursor-pointer items-center justify-center rounded-full border border-accent-primary/20 bg-accent-primary text-[var(--primary-foreground)] shadow-[0_24px_54px_color-mix(in_srgb,var(--accent-primary)_34%,transparent)] transition-transform hover:scale-[1.02] active:scale-[0.98]"
                            >
                                <Plus size={20} aria-hidden="true" />
                            </button>
                        </Tip>
                    </div>
                ) : null}
            </div>
        </MainLayout>
    );
}
