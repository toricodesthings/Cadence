import { useMemo } from "react";
import { CalendarChipActionsContext, type CalendarChipActions } from "./CalendarItem";
import { AnimatePresence, motion } from "framer-motion";
import { slideVariants, type SlideCustom, SPRINGS } from "../../lib/constants/motion";
import { daysBetween } from "@cadence/domain/time";
import { CalendarGrid } from "./CalendarGrid";
import { WeekView } from "./WeekView";
import { DayView } from "./DayView";
import { YearView } from "./YearView";
import { ScheduleHeader } from "./ScheduleHeader";
import { PeriodDock } from "../layout/PeriodNav";
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

type ScheduleCalendarProps = {
    shell: ReturnType<typeof useShellMode>;
    navigation: ScheduleNavigation;
    data: ScheduleData;
    selection: ScheduleSelection;
    actions: ScheduleTaskActions;
    drag: ScheduleDrag;
    creation: ScheduleCreation;
    swipe: ReturnType<typeof usePeriodSwipe>;
};

/** "Today", "Tomorrow", "In 3 days", "2 days ago". */
function relativeDay(days: number) {
    if (days === 0) return "Today";
    if (days === 1) return "Tomorrow";
    if (days === -1) return "Yesterday";
    return days > 0 ? `In ${days} days` : `${-days} days ago`;
}

/** Phone header: name what's on screen; the label above zooms out. */
function usePhoneHeader(navigation: ScheduleNavigation, phoneGroups: ScheduleData["phoneGroups"]) {
    const { year, month, currentDate, todayIso, viewMode, handleViewMode } = navigation;
    const { y: todayYear } = parseYMD(todayIso);
    return useMemo(() => {
        if (viewMode === "year") return { title: String(year) };
        if (viewMode === "month") {
            return {
                title: year === todayYear ? MONTH_NAMES[month] : `${MONTH_NAMES[month]} ${year}`,
                backLabel: String(year),
                onZoomOut: () => handleViewMode("year"),
            };
        }
        const relation = relativeDay(daysBetween(todayIso, currentDate));
        const items = phoneGroups.get(currentDate) ?? [];
        return {
            title: dayHeading(currentDate),
            meta: items.length ? `${relation} · ${loadWord(dayLoad(items))}` : relation,
            backLabel: MONTH_NAMES[month],
            onZoomOut: () => handleViewMode("month"),
        };
    }, [currentDate, handleViewMode, month, phoneGroups, todayIso, todayYear, viewMode, year]);
}

/** The key the slide animation tracks: one per period on screen. */
function viewKeyOf({ viewMode, year, month, currentDate }: ScheduleNavigation, weekDates: string[]) {
    if (viewMode === "month") return `month-${year}-${month}`;
    if (viewMode === "week") return `week-${weekDates[0]}`;
    return viewMode === "day" ? `day-${currentDate}` : `year-${year}`;
}

/** The day's holidays and personal events, when those overlays are on. */
function dayExtras(data: ScheduleData, day: string) {
    return {
        holidays: data.holidayOverlay.enabled ? (data.holidaysByDateRecord[day] ?? []) : [],
        isBirthday: data.birthdayDate === day,
        personalEvents: data.personalEvents.enabled ? data.personalEvents.getEventsForDate(day) : [],
    };
}

// ── Views ───────────────────────────────────────────────────────────────────

function MonthPane({ shell, navigation, data, selection, actions, drag, creation, swipe }: ScheduleCalendarProps) {
    const { year, month, currentDate } = navigation;
    if (shell.isPhone) {
        return (
            <MonthFold
                year={year}
                month={month}
                selectedIso={currentDate}
                groups={data.phoneGroups}
                markers={data.phoneMarkers}
                routineEmoji={data.routineEmoji}
                onSelect={navigation.setCurrentDate}
                onOpenDay={navigation.openDay}
                onNextMonth={() => navigation.handleNavigate(1)}
                dragActive={Boolean(drag.activeDragTask)}
                reducedMotion={Boolean(swipe.reducedMotion)}
                {...actions.rowHandlers}
            />
        );
    }
    return (
        <div className="flex-1 min-h-0 overflow-hidden p-3 sm:p-4">
            <CalendarGrid
                year={year}
                month={month}
                selectedDate={currentDate}
                datesWithTasks={data.datesWithTasks}
                holidayDays={data.holidayOverlay.enabled ? data.holidayOverlay.holidayDateSet : undefined}
                birthdayDate={data.birthdayDate}
                personalEventDays={data.personalEvents.enabled ? data.personalEvents.eventDateSet : undefined}
                personalEventCountsByDay={data.personalEventDateCounts}
                onSelectDate={navigation.handleSelectDate}
                variant="full"
                tasksByDay={data.tasksByDay}
                onSelectTask={selection.handleSelectTask}
                onContextAdd={creation.handleGridClick}
            />
        </div>
    );
}

function WeekPane({ navigation, data, selection, actions, drag, creation }: ScheduleCalendarProps) {
    return (
        <WeekView
            weekDates={data.weekDates}
            tasksByDate={data.weekTasksByDate}
            holidaysByDate={data.holidayOverlay.enabled ? data.holidaysByDateRecord : undefined}
            birthdayDate={data.birthdayDate}
            personalEventsByDate={data.personalEvents.enabled ? data.personalEventsByDateRecord : undefined}
            activeDropPreview={drag.activeDropPreview}
            draftPlacement={creation.popover?.draftPlacement ?? null}
            onSelectTask={selection.handleSelectTask}
            onResizeTask={actions.handleResizeTask}
            onGridClick={creation.handleGridClick}
            onJumpToDay={navigation.handleSelectDate}
            startHour={data.userSettings?.calendar?.timelineStartHour}
        />
    );
}

function DayPane({ shell, navigation, data, selection, actions, drag, creation, swipe }: ScheduleCalendarProps) {
    const { currentDate } = navigation;
    const extras = dayExtras(data, currentDate);
    if (shell.isPhone) {
        return (
            <DayAgenda
                dateIso={currentDate}
                tasks={data.phoneGroups.get(currentDate) ?? []}
                {...extras}
                routineEmoji={data.routineEmoji}
                hasReady={data.readyTasks.length > 0}
                onOpenReady={() => actions.setReadyOpen(true)}
                onAddAt={creation.handleAddAt}
                dragActive={Boolean(drag.activeDragTask)}
                reducedMotion={Boolean(swipe.reducedMotion)}
                {...actions.rowHandlers}
            />
        );
    }
    return (
        <DayView
            currentDate={currentDate}
            tasks={[...data.visibleTasks, ...data.visibleHabitTasks.filter((t) => taskDays(t).includes(currentDate))]}
            {...extras}
            activeDropPreview={drag.activeDropPreview}
            draftPlacement={creation.popover?.draftPlacement ?? null}
            onSelectTask={selection.handleSelectTask}
            onResizeTask={actions.handleResizeTask}
            onGridClick={creation.handleGridClick}
            startHour={data.userSettings?.calendar?.timelineStartHour}
        />
    );
}

function YearPane({ shell, navigation, data }: ScheduleCalendarProps) {
    return (
        <div className="flex-1 min-h-0 p-4">
            <YearView
                year={navigation.year}
                tasks={data.visibleTasks}
                holidayDateSet={data.holidayOverlay.enabled ? data.holidayOverlay.holidayDateSet : undefined}
                birthdayDate={data.birthdayDate}
                personalEventDateSet={data.personalEvents.enabled ? data.personalEvents.eventDateSet : undefined}
                personalEventDateCounts={data.personalEventDateCounts}
                onSelectMonth={navigation.handleYearSelectMonth}
                onSelectDay={navigation.handleSelectDate}
                compact={shell.isPhone}
            />
        </div>
    );
}

const PANES = { month: MonthPane, week: WeekPane, day: DayPane, year: YearPane };

export function ScheduleCalendar(props: ScheduleCalendarProps) {
    const { shell, navigation, data, selection, actions, swipe } = props;
    const { year, month, currentDate, todayIso, viewMode, isPhoneDay, direction, zoom,
        handleViewMode, handleNavigate, handleToday, selectStripDay, shiftStripWeek } = navigation;
    const { periodRange, weekDates, weekStartsOn, weekLoads, phoneGroups, phoneMarkers } = data;
    const { reducedMotion, dragProps } = swipe;
    const chipActions = useMemo<CalendarChipActions>(() => ({
        complete: actions.completeTask,
        resolveRoutine: actions.resolveRoutine,
        moveToTomorrow: actions.moveToTomorrow,
        pickDay: actions.setPlaceTask,
        openInRoutines: selection.openInRoutines,
    }), [actions.completeTask, actions.resolveRoutine, actions.moveToTomorrow, actions.setPlaceTask, selection.openInRoutines]);
    const slideCustom = useMemo<SlideCustom>(() => ({ direction, distance: reducedMotion || zoom ? 0 : 32, zoom: reducedMotion ? 0 : zoom }),
        [direction, reducedMotion, zoom]);
    const phoneHeader = usePhoneHeader(navigation, phoneGroups);
    const isCurrentPeriod = todayIso >= periodRange.start && todayIso <= periodRange.end;
    const Pane = PANES[viewMode];

    return (
        <CalendarChipActionsContext.Provider value={chipActions}>
        <div className="h-full flex flex-col overflow-hidden">
            {/* Header */}
            <ScheduleHeader
                year={year}
                month={month}
                currentDate={currentDate}
                viewMode={viewMode}
                weekStartsOn={weekStartsOn}
                onViewMode={handleViewMode}
                onNavigate={handleNavigate}
                onToday={handleToday}
                isCurrentPeriod={isCurrentPeriod}
                onAddTask={props.creation.handleAddTaskToolbar}
                hidePeriodNav={shell.isLaptop}
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
                            key={viewKeyOf(navigation, weekDates)}
                            custom={slideCustom}
                            variants={slideVariants}
                            initial="enter"
                            animate="center"
                            exit="exit"
                            transition={reducedMotion ? { duration: 0 } : {
                                x: SPRINGS.GLIDE,
                                scale: SPRINGS.GLIDE,
                                opacity: { duration: 0.18 },
                            }}
                            className="absolute inset-0 flex flex-col"
                        >
                            <Pane {...props} />
                        </motion.div>
                    </AnimatePresence>
                </motion.div>

            </div>
            {shell.isLaptop ? (
                <PeriodDock unit={viewMode} isCurrent={isCurrentPeriod} onNavigate={handleNavigate} onToday={handleToday} />
            ) : null}
        </div>
        </CalendarChipActionsContext.Provider>
    );
}
