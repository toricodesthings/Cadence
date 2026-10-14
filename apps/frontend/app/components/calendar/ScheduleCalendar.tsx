import { useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { slideVariants, type SlideCustom } from "../../lib/constants/motion";
import { daysBetween } from "@cadence/domain/time";
import { CalendarGrid } from "./CalendarGrid";
import { WeekView } from "./WeekView";
import { DayView } from "./DayView";
import { YearView } from "./YearView";
import { ScheduleHeader } from "./ScheduleHeader";
import { ScheduleOptions } from "./ScheduleOptions";
import { DayStrip } from "./phone/DayStrip";
import { DayAgenda } from "./phone/DayAgenda";
import { MonthFold } from "./phone/MonthFold";
import { MONTH_NAMES } from "../../lib/utils/date-format";
import { dayHeading, parseYMD } from "../../lib/utils/calendar/calendar-math";
import { dayLoad, taskDays } from "../../lib/utils/calendar/schedule-day";
import { loadWord } from "../../lib/utils/task/day-load";
import type { useShellMode } from "../../hooks/ui/use-shell-mode";
import type { usePeriodSwipe } from "../../hooks/ui/use-period-swipe";
import type { ScheduleNavigation } from "../../hooks/calendar/use-schedule-navigation";
import type { ScheduleData } from "../../hooks/calendar/use-schedule-data";
import type { ScheduleSelection } from "../../hooks/calendar/use-schedule-selection";
import type { ScheduleTaskActions } from "../../hooks/calendar/use-schedule-task-actions";
import type { ScheduleDrag } from "../../hooks/calendar/use-schedule-drag";
import type { ScheduleCreation } from "../../hooks/calendar/use-schedule-creation";

export function ScheduleCalendar({ shell, navigation, data, selection, actions, drag, creation, swipe }: {
    shell: ReturnType<typeof useShellMode>;
    navigation: ScheduleNavigation;
    data: ScheduleData;
    selection: ScheduleSelection;
    actions: ScheduleTaskActions;
    drag: ScheduleDrag;
    creation: ScheduleCreation;
    swipe: ReturnType<typeof usePeriodSwipe>;
}) {
    const { year, month, currentDate, todayIso, viewMode, isPhoneDay, direction, zoom,
        handleViewMode, handleNavigate, handleToday, handleSelectDate, handleYearSelectMonth,
        openDay, setCurrentDate, selectStripDay, shiftStripWeek } = navigation;
    const { periodRange, weekDates, weekLoads, phoneGroups, phoneMarkers, routineEmoji,
        datesWithTasks, tasksByDay, holidayOverlay, birthdayDate, personalEvents, personalEventDateCounts,
        holidaysByDateRecord, personalEventsByDateRecord, weekTasksByDate, userSettings,
        readyTasks, visibleTasks, visibleHabitTasks } = data;
    const { handleSelectTask } = selection;
    const { handleCompleteTask, handleArchiveTask, handleResizeTask, setReadyOpen } = actions;
    const { handleAddAt, handleGridClick, handleAddTaskToolbar, handleAddEventToolbar } = creation;
    const draftPlacement = creation.creation?.draftPlacement ?? null;
    const { reducedMotion, dragProps } = swipe;
    const slideCustom = useMemo<SlideCustom>(() => ({ direction, distance: reducedMotion || zoom ? 0 : 32, zoom: reducedMotion ? 0 : zoom }),
        [direction, reducedMotion, zoom]);
    const { y: todayYear } = parseYMD(todayIso);
    /** Phone header: name what's on screen; the label above zooms out. */
    const phoneHeader = useMemo(() => {
        if (viewMode === "year") return { title: String(year) };
        if (viewMode === "month") {
            return {
                title: year === todayYear ? MONTH_NAMES[month] : `${MONTH_NAMES[month]} ${year}`,
                backLabel: String(year),
                onZoomOut: () => handleViewMode("year"),
            };
        }
        const days = daysBetween(todayIso, currentDate);
        const relation = days === 0 ? "Today" : days === 1 ? "Tomorrow" : days === -1 ? "Yesterday" : days > 0 ? `In ${days} days` : `${-days} days ago`;
        const items = phoneGroups.get(currentDate) ?? [];
        return {
            title: dayHeading(currentDate),
            meta: items.length ? `${relation} · ${loadWord(dayLoad(items))}` : relation,
            backLabel: MONTH_NAMES[month],
            onZoomOut: () => handleViewMode("month"),
        };
    }, [currentDate, handleViewMode, month, phoneGroups, todayIso, todayYear, viewMode, year]);

    const viewKey = viewMode === "month"
        ? `month-${year}-${month}`
        : viewMode === "week"
            ? `week-${weekDates[0]}`
            : viewMode === "day"
                ? `day-${currentDate}`
                : `year-${year}`;

    return (
        <div className="h-full flex flex-col overflow-hidden">
            {/* Header */}
            <ScheduleHeader
                year={year}
                month={month}
                currentDate={currentDate}
                viewMode={viewMode}
                onViewMode={handleViewMode}
                onNavigate={handleNavigate}
                onToday={handleToday}
                isCurrentPeriod={todayIso >= periodRange.start && todayIso <= periodRange.end}
                onAddTask={handleAddTaskToolbar}
                onAddEvent={handleAddEventToolbar}
                overflowContent={<ScheduleOptions phone={shell.isPhone} navigation={navigation} data={data} actions={actions} />}
                compact={shell.isCompact}
                phone={shell.isPhone ? phoneHeader : undefined}
            />

            {/* Phone Day: the week stays put while the day below swipes. */}
            {isPhoneDay ? (
                <DayStrip
                    weekDates={weekDates}
                    selectedIso={currentDate}
                    loads={weekLoads}
                    markedDays={new Set(phoneMarkers.keys())}
                    onSelect={selectStripDay}
                    onShiftWeek={shiftStripWeek}
                />
            ) : null}

            {/* Main calendar area */}
            <div className="flex-1 min-h-0 relative flex overflow-hidden">
                {/* Calendar views */}
                <motion.div
                    {...dragProps}
                    className={`flex-1 min-w-0 relative overflow-hidden${shell.isCompact ? " select-none" : ""}`}
                >
                    <AnimatePresence initial={false} custom={slideCustom} mode="wait">
                        <motion.div
                            key={viewKey}
                            custom={slideCustom}
                            variants={slideVariants}
                            initial="enter"
                            animate="center"
                            exit="exit"
                            transition={reducedMotion ? { duration: 0 } : {
                                x: { type: "spring", stiffness: 320, damping: 32 },
                                scale: { type: "spring", stiffness: 380, damping: 34 },
                                opacity: { duration: 0.18 },
                            }}
                            className="absolute inset-0 flex flex-col"
                        >
                            {/* ── MONTH ── */}
                            {viewMode === "month" && (
                                shell.isPhone ? (
                                    <MonthFold
                                        year={year}
                                        month={month}
                                        selectedIso={currentDate}
                                        groups={phoneGroups}
                                        markers={phoneMarkers}
                                        routineEmoji={routineEmoji}
                                        onSelect={setCurrentDate}
                                        onOpenDay={openDay}
                                        onNextMonth={() => handleNavigate(1)}
                                        dragActive={Boolean(drag.activeDragTask)}
                                        reducedMotion={Boolean(reducedMotion)}
                                        {...actions.rowHandlers}
                                    />
                                ) : (
                                <div className="flex-1 min-h-0 overflow-hidden p-3 sm:p-4">
                                    <CalendarGrid
                                        year={year}
                                        month={month}
                                        selectedDate={currentDate}
                                        datesWithTasks={datesWithTasks}
                                        holidayDays={holidayOverlay.enabled ? holidayOverlay.holidayDateSet : undefined}
                                        birthdayDate={birthdayDate}
                                        personalEventDays={personalEvents.enabled ? personalEvents.eventDateSet : undefined}
                                        personalEventCountsByDay={personalEventDateCounts}
                                        onSelectDate={handleSelectDate}
                                        variant="full"
                                        tasksByDay={tasksByDay}
                                        onSelectTask={handleSelectTask}
                                        onCompleteTask={handleCompleteTask}
                                        onArchiveTask={handleArchiveTask}
                                        onContextAdd={handleGridClick}
                                    />
                                </div>
                                )
                            )}

                            {/* ── WEEK ── */}
                            {viewMode === "week" && (
                                    <WeekView
                                        weekDates={weekDates}
                                        tasksByDate={weekTasksByDate}
                                        holidaysByDate={holidayOverlay.enabled ? holidaysByDateRecord : undefined}
                                        birthdayDate={birthdayDate}
                                        personalEventsByDate={personalEvents.enabled ? personalEventsByDateRecord : undefined}
                                        activeDropPreview={drag.activeDropPreview}
                                        draftPlacement={draftPlacement}
                                        onSelectTask={handleSelectTask}
                                        onCompleteTask={handleCompleteTask}
                                        onArchiveTask={handleArchiveTask}
                                        onResizeTask={handleResizeTask}
                                        onGridClick={handleGridClick}
                                        onJumpToDay={handleSelectDate}
                                        startHour={userSettings?.calendar?.timelineStartHour}
                                    />
                            )}

                            {/* ── DAY ── */}
                            {viewMode === "day" && (
                                shell.isPhone ? (
                                    <DayAgenda
                                        dateIso={currentDate}
                                        tasks={phoneGroups.get(currentDate) ?? []}
                                        holidays={holidayOverlay.enabled ? (holidaysByDateRecord[currentDate] ?? []) : []}
                                        isBirthday={birthdayDate === currentDate}
                                        personalEvents={personalEvents.enabled ? personalEvents.getEventsForDate(currentDate) : []}
                                        routineEmoji={routineEmoji}
                                        hasReady={readyTasks.length > 0}
                                        onOpenReady={() => setReadyOpen(true)}
                                        onAddAt={handleAddAt}
                                        dragActive={Boolean(drag.activeDragTask)}
                                        reducedMotion={Boolean(reducedMotion)}
                                        {...actions.rowHandlers}
                                    />
                                ) : (
                                    <DayView
                                        currentDate={currentDate}
                                        tasks={[...visibleTasks, ...visibleHabitTasks.filter((t) => taskDays(t).includes(currentDate))]}
                                        holidays={holidayOverlay.enabled ? (holidaysByDateRecord[currentDate] ?? []) : []}
                                        isBirthday={birthdayDate === currentDate}
                                        personalEvents={personalEvents.enabled ? personalEvents.getEventsForDate(currentDate) : []}
                                        activeDropPreview={drag.activeDropPreview}
                                        draftPlacement={draftPlacement}
                                        onSelectTask={handleSelectTask}
                                        onCompleteTask={handleCompleteTask}
                                        onArchiveTask={handleArchiveTask}
                                        onResizeTask={handleResizeTask}
                                        onGridClick={handleGridClick}
                                        startHour={userSettings?.calendar?.timelineStartHour}
                                    />
                                )
                            )}

                            {/* ── YEAR ── */}
                            {viewMode === "year" && (
                                <div className="flex-1 min-h-0 p-4">
                                    <YearView
                                        year={year}
                                        tasks={visibleTasks}
                                        holidayDateSet={holidayOverlay.enabled ? holidayOverlay.holidayDateSet : undefined}
                                        birthdayDate={birthdayDate}
                                        personalEventDateSet={personalEvents.enabled ? personalEvents.eventDateSet : undefined}
                                        personalEventDateCounts={personalEventDateCounts}
                                        onSelectMonth={handleYearSelectMonth}
                                        onSelectDay={handleSelectDate}
                                        compact={shell.isPhone}
                                    />
                                </div>
                            )}
                        </motion.div>
                    </AnimatePresence>
                </motion.div>

            </div>
        </div>

    );
}
