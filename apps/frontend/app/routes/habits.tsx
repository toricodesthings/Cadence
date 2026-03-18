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
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useDocumentMeta } from "../hooks/core/use-document-meta";
import { useShellMode } from "../hooks/ui/use-shell-mode";
import { useRouteFocus } from "../hooks/search/use-route-focus";
import { CompactPageControls } from "../components/shared/CompactPageControls";
import { ControlsSheet } from "../components/shared/ControlsSheet";

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

    const todayLabel = new Intl.DateTimeFormat("en-US", {
        weekday: "long",
        month: "short",
        day: "numeric",
    }).format(today);

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

    useRouteFocus();

    return (
        <MainLayout requireAuth>
            <HabitToastResolver />

            <div className="flex h-full overflow-hidden">
                <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                    <header className="shrink-0 border-b border-twilight-border px-4 py-4 sm:px-6 lg:px-8">
                        {shell.isPhone ? (
                            <>
                                <div className="flex items-start justify-between gap-4">
                                    <div className="min-w-0">
                                        <h2 className="font-display text-xl font-semibold text-twilight-text tracking-tight leading-tight">
                                            {mainHeading}
                                        </h2>
                                        <div className="mt-2">
                                            <div className="inline-flex max-w-full items-center gap-1 rounded-full border border-twilight-border/30 bg-white/[0.025] px-1.5 py-1">
                                                <button
                                                    type="button"
                                                    onClick={() => handleNavigate(-1)}
                                                    className="btn-icon min-h-8 min-w-8 rounded-full text-twilight-text-muted hover:text-twilight-text hover:bg-white/[0.06]"
                                                    aria-label="Previous week"
                                                >
                                                    <ChevronLeft size={15} />
                                                </button>
                                                <div className="min-w-0 px-1">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <p className="truncate text-[13px] font-medium text-twilight-text-soft">
                                                            {weekRangeLabel}
                                                        </p>
                                                        {isCurrentWeek && (
                                                            <>
                                                                <span className="w-1 h-1 rounded-full bg-twilight-border/80" />
                                                                <p className="text-[13px] font-medium text-lantern">
                                                                    {todayLabel}
                                                                </p>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
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
                                    </div>
                                </div>

                                <div className="mt-3">
                                    <CompactPageControls
                                        className="w-fit max-w-full border-transparent bg-transparent p-0 gap-2.5 backdrop-blur-none"
                                        primaryControl={(
                                            <div className="flex items-center rounded-[1.15rem] border border-twilight-border/35 bg-white/[0.03] p-1" role="radiogroup" aria-label="Habit view mode">
                                                <button
                                                    type="button"
                                                    role="radio"
                                                    aria-checked={viewMode === "active"}
                                                    onClick={() => setViewMode("active")}
                                                    className={`touch-target rounded-xl px-3.5 text-[13px] font-medium transition-all duration-200 ${
                                                        viewMode === "active"
                                                            ? "bg-white/[0.08] text-twilight-text shadow-sm"
                                                            : "text-twilight-text-soft hover:bg-white/[0.04] hover:text-twilight-text"
                                                    }`}
                                                >
                                                    Active
                                                </button>
                                                <button
                                                    type="button"
                                                    role="radio"
                                                    aria-checked={viewMode === "archived"}
                                                    onClick={() => setViewMode("archived")}
                                                    className={`touch-target rounded-xl px-3.5 text-[13px] font-medium transition-all duration-200 ${
                                                        viewMode === "archived"
                                                            ? "bg-white/[0.08] text-twilight-text shadow-sm"
                                                            : "text-twilight-text-soft hover:bg-white/[0.04] hover:text-twilight-text"
                                                    }`}
                                                >
                                                    Archived
                                                </button>
                                            </div>
                                        )}
                                        secondaryControl={(
                                            <button
                                                type="button"
                                                onClick={handleToday}
                                                disabled={isCurrentWeek}
                                                className="touch-target inline-flex min-h-10 items-center justify-center rounded-[1.15rem] border border-twilight-border/35 bg-white/[0.03] px-4 text-[13px] font-medium text-twilight-text-soft disabled:opacity-30"
                                            >
                                                Today
                                            </button>
                                        )}
                                        controlsTrigger={(
                                            <ControlsSheet
                                                routeKey="habits"
                                                title="Habit controls"
                                                triggerClassName="min-h-10 rounded-[1.15rem] border-twilight-border/35 bg-white/[0.03] px-4"
                                                sections={[
                                                    {
                                                        id: "view",
                                                        label: "View",
                                                        content: (
                                                            <div className="space-y-2">
                                                                {(["active", "archived"] as const).map((mode) => (
                                                                    <button
                                                                        key={mode}
                                                                        type="button"
                                                                        onClick={() => setViewMode(mode)}
                                                                        className={`touch-target flex min-h-11 w-full items-center justify-between rounded-2xl border px-4 text-sm font-medium ${
                                                                            viewMode === mode
                                                                                ? "border-lantern/30 bg-lantern/14 text-lantern"
                                                                                : "border-twilight-border/40 bg-white/[0.03] text-twilight-text-soft"
                                                                        }`}
                                                                    >
                                                                        {mode === "active" ? "Active habits" : "Archived"}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        ),
                                                    },
                                                    {
                                                        id: "create",
                                                        label: "Create",
                                                        content: (
                                                            <button
                                                                type="button"
                                                                onClick={() => setIsCreateOpen(true)}
                                                                className="touch-target flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-lantern/20 bg-lantern/15 px-4 text-sm font-medium text-lantern"
                                                            >
                                                                <Plus size={15} aria-hidden="true" />
                                                                Add habit
                                                            </button>
                                                        ),
                                                    },
                                                ]}
                                            />
                                        )}
                                    />
                                </div>
                            </>
                        ) : (
                            <>
                                <div className={`flex gap-4 ${shell.isCompact ? "flex-col" : "items-start justify-between"}`}>
                                    <div>
                                        <h2 className="font-display text-2xl font-semibold text-twilight-text tracking-tight leading-tight sm:text-[2rem]">
                                            {mainHeading}
                                        </h2>
                                        <div className="mt-1 flex flex-wrap items-center gap-2">
                                            <p className="text-[14px] text-twilight-text-soft">
                                                {weekRangeLabel}
                                            </p>
                                            {isCurrentWeek && (
                                                <>
                                                    <span className="h-1 w-1 rounded-full bg-twilight-border/80" />
                                                    <p className="text-[14px] font-medium text-lantern">
                                                        Today is {todayLabel}
                                                    </p>
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-2 pt-0.5">
                                        <button
                                            type="button"
                                            onClick={handleToday}
                                            disabled={isCurrentWeek}
                                            className="touch-target rounded-2xl border border-twilight-border px-4 text-[14px] font-medium text-twilight-text-soft hover:bg-white/[0.04] hover:text-twilight-text transition-colors duration-200 cursor-pointer disabled:pointer-events-none disabled:opacity-30"
                                        >
                                            Today
                                        </button>
                                        <div className="flex items-center gap-0.5">
                                            <button
                                                type="button"
                                                onClick={() => handleNavigate(-1)}
                                                className="btn-icon text-twilight-text-muted hover:bg-white/[0.06] hover:text-twilight-text"
                                                aria-label="Previous week"
                                            >
                                                <ChevronLeft size={18} />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleNavigate(1)}
                                                className="btn-icon text-twilight-text-muted hover:bg-white/[0.06] hover:text-twilight-text"
                                                aria-label="Next week"
                                            >
                                                <ChevronRight size={18} />
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div className={`mt-4 flex gap-3 ${shell.isCompact ? "flex-col" : "items-center justify-between"}`}>
                                    <div className="flex items-center rounded-2xl border border-twilight-border bg-white/[0.02] p-1" role="radiogroup" aria-label="Habit view mode">
                                        <button
                                            type="button"
                                            role="radio"
                                            aria-checked={viewMode === "active"}
                                            onClick={() => setViewMode("active")}
                                            className={`touch-target rounded-xl px-4 text-[14px] font-medium transition-all duration-200 cursor-pointer ${
                                                viewMode === "active"
                                                    ? "bg-white/[0.08] text-twilight-text shadow-sm"
                                                    : "text-twilight-text-soft hover:bg-white/[0.04] hover:text-twilight-text"
                                            }`}
                                        >
                                            Active Habits
                                        </button>
                                        <button
                                            type="button"
                                            role="radio"
                                            aria-checked={viewMode === "archived"}
                                            onClick={() => setViewMode("archived")}
                                            className={`touch-target rounded-xl px-4 text-[14px] font-medium transition-all duration-200 cursor-pointer ${
                                                viewMode === "archived"
                                                    ? "bg-white/[0.08] text-twilight-text shadow-sm"
                                                    : "text-twilight-text-soft hover:bg-white/[0.04] hover:text-twilight-text"
                                            }`}
                                        >
                                            Archived
                                        </button>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => setIsCreateOpen(true)}
                                        className="touch-target inline-flex min-h-11 items-center justify-center gap-1.5 rounded-2xl border border-lantern/20 bg-lantern/15 px-4 text-[14px] font-medium text-lantern hover:bg-lantern/25 hover:border-lantern/30 transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-lantern"
                                    >
                                        <Plus size={15} />
                                        Add Habit
                                    </button>
                                </div>
                            </>
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
                            Add Habit
                        </button>
                    </div>
                ) : null}
            </div>
        </MainLayout>
    );
}
