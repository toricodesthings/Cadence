import { useState, useMemo, useCallback, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
export { RouteErrorBoundary as ErrorBoundary } from "../components/shared/RouteErrorBoundary";
import { MainLayout } from "../components/layout/MainLayout";
import { toISODate, getWeekDates } from "../lib/utils/date-format";
import { HabitsCanvas } from "../components/habits/HabitsCanvas";
import { HabitDetailPanel } from "../components/habits/HabitDetailPanel";
import { CreateHabitDialog } from "../components/habits/CreateHabitDialog";
import { ResizableSidePanel } from "../components/shared/ResizableSidePanel";
import { useHabitsWeekly } from "../hooks/habits/use-habits";
import { HabitToastResolver } from "../components/habits/HabitToastResolver";
import { ResponsiveOverlayPanel } from "../components/shared/ResponsiveOverlayPanel";
import { ChevronLeft, ChevronRight, Plus, PanelLeftOpen, Flame } from "lucide-react";
import { useDocumentMeta } from "../hooks/core/use-document-meta";
import { useShellMode } from "../hooks/ui/use-shell-mode";
import { useRouteFocus } from "../hooks/search/use-route-focus";
import { useSidebarStore } from "../stores/sidebar-store";

const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
];

const slideVariants = {
    enter: (delta: number) => ({ x: delta > 0 ? 28 : -28, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (delta: number) => ({ x: delta > 0 ? -28 : 28, opacity: 0 }),
};

export default function Habits() {
    const shell = useShellMode();
    const { setMobileNavOpen } = useSidebarStore();
    const today = new Date();
    const [currentDate, setCurrentDate] = useState<string>(toISODate(today));
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [selectedHabitId, setSelectedHabitId] = useState<string | null>(null);
    const [mobileDetailMode, setMobileDetailMode] = useState<"peek" | "focus">("peek");
    const [direction, setDirection] = useState(0);

    const [viewMode, setViewMode] = useState<"active" | "archived">("active");

    const weekDates = useMemo(() => getWeekDates(new Date(currentDate + "T00:00:00")), [currentDate]);
    const startIso = toISODate(weekDates[0]);
    const endIso = toISODate(weekDates[6]);

    const { data: habits = [] } = useHabitsWeekly({
        start: startIso,
        end: endIso,
        archived: viewMode === "archived"
    });
    const visibleHabits = useMemo(
        () => habits.filter((habit) => habit.archived === (viewMode === "archived")),
        [habits, viewMode],
    );

    const handleNavigate = useCallback((delta: number) => {
        setDirection(delta);
        setCurrentDate((prev) => {
            const date = new Date(prev + "T00:00:00");
            date.setDate(date.getDate() + delta * 7);
            return toISODate(date);
        });
    }, []);

    const handleToday = useCallback(() => {
        const todayIso = toISODate(new Date());
        setDirection(todayIso >= currentDate ? 1 : -1);
        setCurrentDate(toISODate(new Date()));
    }, [currentDate]);

    const handleSelectHabit = (id: string) => {
        if (shell.isPhone) {
            setMobileDetailMode("peek");
        }
        setSelectedHabitId((prev) => (prev === id ? null : id));
    };

    const isCurrentWeek = toISODate(new Date()) >= startIso && toISODate(new Date()) <= endIso;

    const monthIdx = weekDates[0].getMonth();
    const year = weekDates[0].getFullYear();
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

    const mainHeading = `${MONTHS[monthIdx]} ${year}`;
    const selectedHabit = visibleHabits.find((h) => h.id === selectedHabitId) ?? null;

    useEffect(() => {
        if (selectedHabitId && !visibleHabits.some((habit) => habit.id === selectedHabitId)) {
            setSelectedHabitId(null);
        }
    }, [selectedHabitId, visibleHabits]);

    useDocumentMeta(
        "Habits · Cadence",
        "Track weekly habits in a spacious rhythm that keeps each day readable.",
    );

    useRouteFocus({
        onFocusMatch: (params) => {
            if (params.focusKind === "habit" && params.focusId) {
                setSelectedHabitId(params.focusId);
            }
        },
    });

    return (
        <MainLayout requireAuth hideHeader hideContextualOrb>
            <HabitToastResolver />

            <div className="flex h-full overflow-hidden">
                <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                    <header className="shrink-0 border-b border-twilight-border">
                        {shell.isPhone ? (
                            /* ── Phone: two tight rows ──────────────────────────── */
                            <div className="px-4 pt-2.5 pb-3">
                                {/* Row 1: sidebar toggle + page identity + heading + nav arrows */}
                                <div className="flex items-center gap-2 min-h-[44px]">
                                    <button
                                        type="button"
                                        onClick={() => setMobileNavOpen(true)}
                                        className="btn-icon rounded-xl text-twilight-text-muted hover:text-twilight-text hover:bg-white/[0.05]"
                                        aria-label="Open navigation"
                                    >
                                        <PanelLeftOpen size={18} />
                                    </button>
                                    <div className="flex min-w-0 flex-1 items-center gap-2">
                                        <Flame size={14} className="text-lantern/70 shrink-0" />
                                        <div className="min-w-0">
                                            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-twilight-text-muted leading-none">Habits</p>
                                            <h2 className="font-display text-sm font-semibold text-twilight-text tracking-tight truncate leading-tight">
                                                {mainHeading}
                                            </h2>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-0.5 shrink-0">
                                        <button
                                            type="button"
                                            onClick={() => handleNavigate(-1)}
                                            className="btn-icon min-h-8 min-w-8 rounded-full text-twilight-text-muted hover:text-twilight-text hover:bg-white/[0.06]"
                                            aria-label="Previous week"
                                        >
                                            <ChevronLeft size={15} />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleNavigate(1)}
                                            className="btn-icon min-h-8 min-w-8 rounded-full text-twilight-text-muted hover:text-twilight-text hover:bg-white/[0.06]"
                                            aria-label="Next week"
                                        >
                                            <ChevronRight size={15} />
                                        </button>
                                    </div>
                                </div>
                                {/* Row 2: Active/Archived tabs + Today button */}
                                <div className="flex items-center gap-1 mt-1.5">
                                    <nav
                                        className="flex items-center gap-1 rounded-xl border border-twilight-border/30 bg-twilight-base/35 p-0.5"
                                        role="radiogroup"
                                        aria-label="Habit view mode"
                                    >
                                        {(["active", "archived"] as const).map((mode) => (
                                            <button
                                                key={mode}
                                                type="button"
                                                role="radio"
                                                aria-checked={viewMode === mode}
                                                onClick={() => setViewMode(mode)}
                                                className={`
                                                    rounded-lg px-3 py-1 text-[13px] font-medium transition-colors cursor-pointer border
                                                    ${viewMode === mode
                                                        ? "bg-lantern/20 text-lantern border-lantern/25"
                                                        : "text-twilight-text-soft hover:text-twilight-text hover:bg-white/[0.04] border-transparent"}
                                                `}
                                            >
                                                {mode === "active" ? "Active" : "Archived"}
                                            </button>
                                        ))}
                                    </nav>
                                    <button
                                        type="button"
                                        onClick={handleToday}
                                        disabled={isCurrentWeek}
                                        className="ml-auto rounded-lg border border-twilight-border/30 bg-white/[0.03] px-3 py-1 text-[13px] font-medium text-twilight-text-soft hover:bg-white/[0.05] hover:text-twilight-text cursor-pointer disabled:opacity-30"
                                    >
                                        Today
                                    </button>
                                </div>
                            </div>
                        ) : (
                            /* ── Tablet + Desktop: single compressed row ~56px ── */
                            <div className="px-4 sm:px-6 lg:px-8">
                                <div className="flex h-16 items-center gap-3">
                                    {/* Left: icon + page identity + heading + week range */}
                                    <div className="flex min-w-0 items-center gap-2.5">
                                        <Flame size={18} className="text-lantern/70 shrink-0" />
                                        <div className="min-w-0">
                                            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-twilight-text-muted leading-none">Habits</p>
                                            <h2 className="font-display text-lg font-semibold text-twilight-text tracking-tight whitespace-nowrap leading-tight">
                                                {mainHeading}
                                            </h2>
                                        </div>
                                        <span className="hidden sm:flex items-center text-[13px] text-twilight-text-soft whitespace-nowrap">
                                            <span className="mx-1.5 text-twilight-text-soft/50">&middot;</span>
                                            <span>{weekRangeLabel}</span>
                                        </span>
                                    </div>

                                    {/* Center: navigation */}
                                    <div className="flex items-center gap-1 ml-auto">
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
                                            disabled={isCurrentWeek}
                                            className="rounded-lg border border-twilight-border/30 bg-white/[0.03] px-3.5 py-1.5 text-sm font-medium text-twilight-text-soft hover:bg-white/[0.05] hover:text-twilight-text transition-colors cursor-pointer disabled:pointer-events-none disabled:opacity-30"
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

                                    {/* Right: view tabs */}
                                    <nav
                                        className="flex items-center gap-0.5 rounded-xl border border-twilight-border/30 bg-twilight-base/35 p-0.5"
                                        role="radiogroup"
                                        aria-label="Habit view mode"
                                    >
                                        {(["active", "archived"] as const).map((mode) => (
                                            <button
                                                key={mode}
                                                type="button"
                                                role="radio"
                                                aria-checked={viewMode === mode}
                                                onClick={() => setViewMode(mode)}
                                                className={`
                                                    rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors cursor-pointer border
                                                    ${viewMode === mode
                                                        ? "bg-lantern/20 text-lantern border-lantern/25"
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
                                        className="inline-flex items-center gap-1.5 rounded-xl border border-lantern/20 bg-lantern/15 px-4 py-1.5 text-sm font-medium text-lantern hover:bg-lantern/25 hover:border-lantern/30 transition-colors cursor-pointer"
                                    >
                                        <Plus size={14} />
                                        <span className="hidden lg:inline">Add Routine</span>
                                    </button>
                                </div>
                            </div>
                        )}
                    </header>

                    <div className="flex-1 overflow-hidden flex flex-col pt-4 min-w-0">
                        <AnimatePresence initial={false} custom={direction} mode="wait">
                            <motion.div
                                key={weekDates[0].toISOString()}
                                custom={direction}
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
                                <HabitsCanvas
                                    weekDates={weekDates}
                                    habits={visibleHabits}
                                    selectedHabitId={selectedHabitId}
                                    onSelectHabit={handleSelectHabit}
                                    emptyStateMode={viewMode}
                                />
                            </motion.div>
                        </AnimatePresence>
                    </div>
                </div>

                <AnimatePresence>
                    {selectedHabit && !shell.isPhone && (
                        <motion.div
                            key="habit-side-panel"
                            initial={{ width: 0 }}
                            animate={{ width: "auto" }}
                            exit={{ width: 0 }}
                            transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
                            style={{ willChange: "width", overflow: "hidden" }}
                            className="flex h-full self-stretch shrink-0 items-stretch"
                        >
                            <motion.div
                                initial={{ x: 24, opacity: 0 }}
                                animate={{ x: 0, opacity: 1 }}
                                exit={{ x: 24, opacity: 0 }}
                                transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
                                style={{ willChange: "transform, opacity" }}
                                className="flex h-full min-w-0 flex-1 items-stretch"
                            >
                                <ResizableSidePanel
                                    defaultWidth={340}
                                    minWidth={280}
                                    maxWidth={480}
                                    ariaLabel="Resize habit detail panel"
                                >
                                    <HabitDetailPanel
                                        key={selectedHabit.id}
                                        habit={selectedHabit}
                                        onClose={() => setSelectedHabitId(null)}
                                    />
                                </ResizableSidePanel>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>

                <CreateHabitDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />

                {shell.isPhone && selectedHabit && (
                    <ResponsiveOverlayPanel
                        ariaLabel={`Habit details for ${selectedHabit.title}`}
                        open={!!selectedHabit}
                        onClose={() => setSelectedHabitId(null)}
                        mode={mobileDetailMode}
                    >
                        <HabitDetailPanel
                            habit={selectedHabit}
                            detailMode={mobileDetailMode}
                            onDetailModeChange={setMobileDetailMode}
                            onClose={() => setSelectedHabitId(null)}
                        />
                    </ResponsiveOverlayPanel>
                )}

                {shell.isPhone ? (
                    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-30 flex justify-center px-4">
                        <button
                            type="button"
                            onClick={() => setIsCreateOpen(true)}
                            className="pointer-events-auto touch-target inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-lantern/25 bg-lantern px-5 text-sm font-semibold text-twilight-void shadow-[0_18px_48px_rgba(232,164,74,0.28)]"
                        >
                            <Plus size={15} aria-hidden="true" />
                            Add Routine
                        </button>
                    </div>
                ) : null}
            </div>
        </MainLayout>
    );
}
