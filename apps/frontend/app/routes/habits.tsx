import { useState, useMemo, useCallback, useEffect } from "react";
import { AnimatePresence } from "framer-motion";
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

const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
];

export default function Habits() {
    const shell = useShellMode();
    const today = new Date();
    const [currentDate, setCurrentDate] = useState<string>(toISODate(today));
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [selectedHabitId, setSelectedHabitId] = useState<string | null>(null);

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
        setCurrentDate((prev) => {
            const date = new Date(prev + "T00:00:00");
            date.setDate(date.getDate() + delta * 7);
            return toISODate(date);
        });
    }, []);

    const handleToday = useCallback(() => {
        setCurrentDate(toISODate(new Date()));
    }, []);

    const handleSelectHabit = (id: string) => {
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
                                            <span className="w-1 h-1 rounded-full bg-twilight-border/80" />
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
                                    className="touch-target rounded-2xl border border-twilight-border px-4 text-[14px] font-medium text-twilight-text-soft hover:text-twilight-text hover:bg-white/[0.04] transition-colors duration-200 cursor-pointer disabled:opacity-30 disabled:pointer-events-none"
                                >
                                    Today
                                </button>
                                <div className="flex items-center gap-0.5">
                                    <button
                                        type="button"
                                        onClick={() => handleNavigate(-1)}
                                        className="btn-icon text-twilight-text-muted hover:text-twilight-text hover:bg-white/[0.06]"
                                        aria-label="Previous week"
                                    >
                                        <ChevronLeft size={18} />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleNavigate(1)}
                                        className="btn-icon text-twilight-text-muted hover:text-twilight-text hover:bg-white/[0.06]"
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
                                    className={`touch-target rounded-xl px-4 text-[14px] font-medium transition-all duration-200 cursor-pointer ${viewMode === "active"
                                        ? "bg-white/[0.08] text-twilight-text shadow-sm"
                                        : "text-twilight-text-soft hover:text-twilight-text hover:bg-white/[0.04]"
                                        }`}
                                >
                                    Active Habits
                                </button>
                                <button
                                    type="button"
                                    role="radio"
                                    aria-checked={viewMode === "archived"}
                                    onClick={() => setViewMode("archived")}
                                    className={`touch-target rounded-xl px-4 text-[14px] font-medium transition-all duration-200 cursor-pointer ${viewMode === "archived"
                                        ? "bg-white/[0.08] text-twilight-text shadow-sm"
                                        : "text-twilight-text-soft hover:text-twilight-text hover:bg-white/[0.04]"
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
                    </header>

                    <div className="flex-1 overflow-hidden flex flex-col pt-4 min-w-0">
                        <HabitsCanvas
                            weekDates={weekDates}
                            habits={visibleHabits}
                            selectedHabitId={selectedHabitId}
                            onSelectHabit={handleSelectHabit}
                            emptyStateMode={viewMode}
                        />
                    </div>
                </div>

                <AnimatePresence>
                    {selectedHabit && !shell.isPhone && (
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
                    )}
                </AnimatePresence>

                <CreateHabitDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />

                {shell.isPhone && selectedHabit && (
                    <ResponsiveOverlayPanel
                        ariaLabel={`Habit details for ${selectedHabit.title}`}
                        open={!!selectedHabit}
                        onClose={() => setSelectedHabitId(null)}
                        title={selectedHabit.title}
                    >
                        <HabitDetailPanel
                            habit={selectedHabit}
                            onClose={() => setSelectedHabitId(null)}
                        />
                    </ResponsiveOverlayPanel>
                )}
            </div>
        </MainLayout>
    );
}
