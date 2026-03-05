import { useState } from "react";
import { useSearchParams } from "react-router";
import { AnimatePresence, motion } from "framer-motion";
import { MainLayout } from "../components/MainLayout";
import { PlannerHeader } from "../components/layout/PlannerHeader";
import { AddTaskInput } from "../components/tasks/AddTaskInput";
import { SectionedTaskList } from "../components/tasks/SectionedTaskList";
import { TaskList } from "../components/tasks/TaskList";
import { TaskListSkeleton } from "../components/tasks/TaskListSkeleton";
import { EmptyState } from "../components/tasks/EmptyState";
import { CalendarView } from "../components/calendar/CalendarView";
import { TaskEditPanel } from "../components/tasks/TaskEditPanel";
import { ScrollAreaWrapper } from "../components/shared/ScrollAreaWrapper";
import { ResizableSidePanel } from "../components/shared/ResizableSidePanel";
import { ViewToggle } from "../components/shared/ViewToggle";
import { KanbanBoard } from "../components/kanban/KanbanBoard";
import { PlannerHabitsSection } from "../components/habits/PlannerHabitsSection";
import { useTasks } from "../hooks/tasks";
import { useViewMode } from "../hooks/use-view-mode";
import { useTagFilterStore } from "../stores/tag-filter-store";
import { toISODate } from "../lib/utils/date-format";
import { ChevronRight, ChevronDown } from "lucide-react";
import type { Task } from "../types/task";

function SectionHeader({ title, isOverdue = false }: { title: string; isOverdue?: boolean }) {
  return (
    <div className="flex items-center gap-3 mt-6 mb-3">
      <span className={`text-[12px] font-display font-medium uppercase tracking-wider ${isOverdue ? "text-red-400/80" : "text-twilight-text-muted"}`}>
        {title}
      </span>
      <div className="flex-1 h-px bg-gradient-to-r from-transparent via-twilight-border/30 to-transparent" />
    </div>
  );
}

/** Planner page — Central orchestrator for daily tasks and scheduling */
export default function Home() {
  const [searchParams] = useSearchParams();
  const selectedDate = searchParams.get("date") ?? toISODate(new Date());
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const { view, setView } = useViewMode();

  const [showQuickWins, setShowQuickWins] = useState(false);
  const [showWaiting, setShowWaiting] = useState(false);

  // Fetch all active and waiting tasks to filter locally
  const { data: activeTasks, isLoading: isActiveLoading } = useTasks({ state: "ACTIVE" });
  const { data: waitingTasks, isLoading: isWaitingLoading } = useTasks({ state: "WAITING" });
  const { activeTagId } = useTagFilterStore();

  const isLoading = isActiveLoading || isWaitingLoading;

  // Filter logic per design manifesto "Intelligent Filtering"
  const tagFilteredActiveTasks = activeTagId
    ? (activeTasks ?? []).filter(t => (t as any).tagIds?.includes(activeTagId))
    : (activeTasks ?? []);

  const visibleActiveTasks = tagFilteredActiveTasks.filter(t => !t.notBefore || t.notBefore <= selectedDate);

  const overdueTasks = visibleActiveTasks.filter(t => {
    if (!t.dueDate) return false;
    const due = t.dueDate.split("T")[0]; // primitive extract
    return due < selectedDate && (!t.scheduledStart || !t.scheduledStart.startsWith(selectedDate));
  });

  const scheduledTasks = visibleActiveTasks.filter(t => t.scheduledStart?.startsWith(selectedDate));
  const unscheduledTasks = visibleActiveTasks.filter(t => !t.scheduledStart && !overdueTasks.includes(t));

  const rawTodayTasks = [...scheduledTasks, ...unscheduledTasks];
  const allVisibleTasks = [...overdueTasks, ...rawTodayTasks];

  const hasManyTasks = (overdueTasks.length + rawTodayTasks.length) > 8;

  let quickWins: Task[] = [];
  let mainTodayTasks = rawTodayTasks;

  if (hasManyTasks) {
    quickWins = rawTodayTasks.filter(t => t.effort === 1);
    mainTodayTasks = rawTodayTasks.filter(t => t.effort !== 1);
  }

  const handleSelectTask = (id: string) => setSelectedTaskId(id === selectedTaskId ? null : id);

  const sidePanel = (
    <ResizableSidePanel ariaLabel="Resize planner sidebar">
      <AnimatePresence mode="wait">
        {selectedTaskId ? (
          <TaskEditPanel
            key={`edit-${selectedTaskId}`}
            taskId={selectedTaskId}
            onClose={() => setSelectedTaskId(null)}
          />
        ) : (
          <ScrollAreaWrapper key="calendar">
            <div className="p-5">
              <CalendarView />
            </div>
          </ScrollAreaWrapper>
        )}
      </AnimatePresence>
    </ResizableSidePanel>
  );

  const nothingActive = (overdueTasks.length === 0 && mainTodayTasks.length === 0 && quickWins.length === 0);

  const headerCenter = <ViewToggle view={view} onViewChange={setView} />;

  return (
    <MainLayout requireAuth sidePanel={sidePanel} headerCenter={headerCenter}>
      {view === 'list' ? (
        <ScrollAreaWrapper>
          <div className="max-w-2xl mx-auto px-8 py-8">
            <PlannerHeader />
            <AddTaskInput scheduledDate={selectedDate} tasks={activeTasks ?? []} />

            {isLoading ? (
              <TaskListSkeleton />
            ) : (
              <>
                {/* Overdue section (not sectioned, always flat) */}
                {overdueTasks.length > 0 && (
                  <div>
                    <SectionHeader title="Overdue" isOverdue />
                    <TaskList tasks={overdueTasks} selectedTaskId={selectedTaskId} onSelectTask={handleSelectTask} />
                  </div>
                )}

                {/* Main tasks — uses SectionedTaskList for grouping */}
                {(overdueTasks.length > 0 || hasManyTasks) && mainTodayTasks.length > 0 && (
                  <SectionHeader title="Today" />
                )}

                {mainTodayTasks.length > 0 && (
                  <SectionedTaskList
                    tasks={mainTodayTasks}
                    selectedTaskId={selectedTaskId}
                    onSelectTask={handleSelectTask}
                  />
                )}

                {/* Quick Wins toggle */}
                {hasManyTasks && quickWins.length > 0 && (
                  <div>
                    <button
                      onClick={() => setShowQuickWins(!showQuickWins)}
                      className="flex items-center gap-2 mt-6 mb-3 text-[12px] font-display font-medium uppercase tracking-wider text-twilight-text-muted hover:text-twilight-text transition-colors"
                    >
                      {showQuickWins ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      Quick Wins ({quickWins.length})
                    </button>
                    <AnimatePresence>
                      {showQuickWins && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <TaskList tasks={quickWins} selectedTaskId={selectedTaskId} onSelectTask={handleSelectTask} />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}

                {nothingActive && (
                  <div className="mt-8">
                    <EmptyState />
                  </div>
                )}

                {/* Waiting Tasks Toggle */}
                {waitingTasks && waitingTasks.length > 0 && (
                  <div className="mt-8 mb-4">
                    <div className="h-px bg-gradient-to-r from-transparent via-twilight-border/30 to-transparent my-4" />
                    <div className="flex justify-center">
                      <button
                        onClick={() => setShowWaiting(!showWaiting)}
                        className="text-[12px] text-moonlit/80 hover:text-moonlit transition-colors tracking-wide"
                      >
                        {showWaiting ? `Hide waiting tasks` : `Show ${waitingTasks.length} waiting`}
                      </button>
                    </div>

                    <AnimatePresence>
                      {showWaiting && (
                        <motion.div
                          initial={{ height: 0, opacity: 0, y: -10 }}
                          animate={{ height: "auto", opacity: 0.7, y: 0 }}
                          exit={{ height: 0, opacity: 0, y: -10 }}
                          className="overflow-hidden mt-4"
                        >
                          <TaskList tasks={waitingTasks} selectedTaskId={selectedTaskId} onSelectTask={handleSelectTask} />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </>
            )}

            <PlannerHabitsSection selectedDate={selectedDate} />
          </div>
        </ScrollAreaWrapper>
      ) : (
        /* Kanban view — lives OUTSIDE ScrollAreaWrapper so horizontal overflow works */
        <div className="h-full flex flex-col overflow-hidden">
          <div className="px-8 pt-8 shrink-0">
            <PlannerHeader />
          </div>
          <div className="flex-1 min-h-0">
            <KanbanBoard
              tasks={allVisibleTasks}
              selectedTaskId={selectedTaskId}
              onSelectTask={handleSelectTask}
            />
          </div>
        </div>
      )}
    </MainLayout>
  );
}
