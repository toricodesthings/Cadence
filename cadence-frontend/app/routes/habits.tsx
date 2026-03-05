import { useState, useMemo, useCallback } from "react";
import { AnimatePresence } from "framer-motion";
import { MainLayout } from "../components/MainLayout";
import { toISODate, getWeekDates } from "../lib/utils/date-format";
import { HabitsCanvas } from "../components/habits/HabitsCanvas";
import { HabitDetailPanel } from "../components/habits/HabitDetailPanel";
import { CreateHabitDialog } from "../components/habits/CreateHabitDialog";
import { ResizableSidePanel } from "../components/shared/ResizableSidePanel";
import { useHabitsWeekly } from "../hooks/habits/use-habits";
import { HabitToastResolver } from "../components/habits/HabitToastResolver";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";

const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
];

export default function Habits() {
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
        const endFmt = new Intl.DateTimeFormat("en-US", {
            month: sameMonth ? undefined : "short",
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
    const selectedHabit = habits.find((h) => h.id === selectedHabitId) ?? null;

    return (
        <MainLayout requireAuth>
            <HabitToastResolver />

            <div className="h-full flex overflow-hidden">
                <div className="flex-1 flex flex-col overflow-hidden min-w-0">
                    <header className="shrink-0 px-8 py-5 border-b border-twilight-border">
                        <div className="flex items-start justify-between">
                            <div>
                                <h1 className="font-display text-2xl font-semibold text-twilight-text tracking-tight leading-tight">
                                    {mainHeading}
                                </h1>
                                <div className="mt-1 flex items-center gap-2">
                                    <p className="text-[13.5px] text-twilight-text-muted">
                                        {weekRangeLabel}
                                    </p>
                                    {isCurrentWeek && (
                                        <>
                                            <span className="w-1 h-1 rounded-full bg-twilight-border/80" />
                                            <p className="text-[13px] font-medium text-lantern/90">
                                                Today is {todayLabel}
                                            </p>
                                        </>
                                    )}
                                </div>
                            </div>

                            <div className="flex items-center gap-2 pt-0.5">
                                <button
                                    type="button"
                                    onClick={handleToday}
                                    disabled={isCurrentWeek}
                                    className="px-4 py-2 rounded-xl border border-twilight-border text-[13px] font-medium text-twilight-text-soft hover:text-twilight-text hover:bg-white/[0.04] transition-colors duration-200 cursor-pointer disabled:opacity-30 disabled:pointer-events-none"
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

                        <div className="flex items-center justify-between mt-3">
                            <div className="flex items-center p-1 bg-white/[0.02] border border-twilight-border rounded-xl">
                                <button
                                    onClick={() => setViewMode("active")}
                                    className={`px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all duration-200 cursor-pointer ${viewMode === "active"
                                        ? "bg-white/[0.08] text-twilight-text shadow-sm"
                                        : "text-twilight-text-muted hover:text-twilight-text hover:bg-white/[0.04]"
                                        }`}
                                >
                                    Active Habits
                                </button>
                                <button
                                    onClick={() => setViewMode("archived")}
                                    className={`px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all duration-200 cursor-pointer ${viewMode === "archived"
                                        ? "bg-white/[0.08] text-twilight-text shadow-sm"
                                        : "text-twilight-text-muted hover:text-twilight-text hover:bg-white/[0.04]"
                                        }`}
                                >
                                    Archived
                                </button>
                            </div>

                            <button
                                type="button"
                                onClick={() => setIsCreateOpen(true)}
                                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-lantern/15 text-lantern border border-lantern/20 text-[13px] font-medium hover:bg-lantern/25 hover:border-lantern/30 transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-lantern"
                            >
                                <Plus size={15} />
                                Add Habit
                            </button>
                        </div>
                    </header>

                    <main className="flex-1 overflow-hidden flex flex-col pt-4 min-w-0">
                        <HabitsCanvas
                            weekDates={weekDates}
                            habits={habits}
                            selectedHabitId={selectedHabitId}
                            onSelectHabit={handleSelectHabit}
                            emptyStateMode={viewMode}
                        />
                    </main>
                </div>

                <AnimatePresence>
                    {selectedHabit && (
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
            </div>
        </MainLayout>
    );
}
