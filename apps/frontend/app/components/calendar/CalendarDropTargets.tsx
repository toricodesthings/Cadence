import { useMemo, type ReactNode } from "react";
import { useDroppable } from "@dnd-kit/core";
import {
    CALENDAR_SLOT_COUNT,
    CALENDAR_SLOT_MINUTES,
    type CalendarDropPreview,
    buildCalendarAllDayDropId,
    buildCalendarTimedDropId,
    getDropMinutesLabel,
} from "../../lib/utils/calendar-dnd";
import { DAY_GRID_HEIGHT, HOUR_HEIGHT } from "../../lib/utils/calendar-utils";

function TimeSlotDropZone({
    dropId,
    minutes,
    isActive = false,
}: {
    dropId: string;
    minutes: number;
    isActive?: boolean;
}) {
    const { setNodeRef, isOver } = useDroppable({ id: dropId });
    const top = (minutes / 60) * HOUR_HEIGHT;
    const height = (CALENDAR_SLOT_MINUTES / 60) * HOUR_HEIGHT;
    const isHighlighted = isOver || isActive;

    return (
        <div
            ref={setNodeRef}
            className="absolute inset-x-0 z-30"
            style={{ top, height }}
            aria-hidden="true"
        >
            <div
                className={`
                    absolute inset-x-1.5 top-1/2 -translate-y-1/2 rounded-full border transition-[opacity,transform,box-shadow,background-color] duration-150
                    ${isHighlighted
                        ? "opacity-100 scale-100 border-moonlit/50 bg-moonlit/10 shadow-[0_0_0_1px_rgba(142,197,252,0.12),0_0_18px_rgba(142,197,252,0.16)]"
                        : "opacity-0 scale-95 border-transparent bg-transparent"
                    }
                `}
                style={{ height: Math.max(12, height - 8) }}
            />
            {isHighlighted && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full border border-moonlit/35 bg-twilight/90 px-2 py-0.5 text-[10px] font-medium tracking-[0.08em] text-moonlit shadow-[0_8px_20px_rgba(0,0,0,0.22)]">
                    {getDropMinutesLabel(minutes)}
                </span>
            )}
        </div>
    );
}

export function TimeSlotDropLayer({
    dateStr,
    activeMinutes = null,
}: {
    dateStr: string;
    activeMinutes?: number | null;
}) {
    const slots = useMemo(
        () =>
            Array.from({ length: CALENDAR_SLOT_COUNT }, (_, index) => {
                const minutes = index * CALENDAR_SLOT_MINUTES;
                return {
                    key: `${dateStr}-${minutes}`,
                    dropId: buildCalendarTimedDropId(dateStr, minutes),
                    minutes,
                };
            }),
        [dateStr],
    );

    return (
        <div className="absolute inset-0 z-30" style={{ height: DAY_GRID_HEIGHT }} aria-hidden="true">
            {slots.map((slot) => (
                <TimeSlotDropZone
                    key={slot.key}
                    dropId={slot.dropId}
                    minutes={slot.minutes}
                    isActive={activeMinutes === slot.minutes}
                />
            ))}
        </div>
    );
}

export function AllDayDropLane({
    dateStr,
    className = "",
    children,
    isActive = false,
}: {
    dateStr: string;
    className?: string;
    children: ReactNode;
    isActive?: boolean;
}) {
    const { setNodeRef, isOver } = useDroppable({ id: buildCalendarAllDayDropId(dateStr) });
    const isHighlighted = isOver || isActive;

    return (
        <div
            ref={setNodeRef}
            className={`
                relative rounded-2xl transition-[background-color,border-color,box-shadow] duration-150
                ${isHighlighted
                    ? "bg-moonlit/10 ring-1 ring-moonlit/35 shadow-[0_0_18px_rgba(142,197,252,0.12)]"
                    : ""
                }
                ${className}
            `}
        >
            {children}
            {isHighlighted && (
                <span className="pointer-events-none absolute right-2 top-2 rounded-full border border-moonlit/30 bg-twilight/90 px-2 py-0.5 text-[10px] font-medium tracking-[0.08em] text-moonlit">
                    All day
                </span>
            )}
        </div>
    );
}

export function TimedDropPreview({
    preview,
}: {
    preview: CalendarDropPreview;
}) {
    if (preview.kind !== "timed" || preview.startMinutes == null || preview.endMinutes == null) {
        return null;
    }

    const top = (preview.startMinutes / 60) * HOUR_HEIGHT;
    const height = Math.max(((preview.endMinutes - preview.startMinutes) / 60) * HOUR_HEIGHT, 36);

    return (
        <div
            className="pointer-events-none absolute inset-x-1 z-[15] overflow-hidden rounded-2xl border border-moonlit/45 bg-moonlit/[0.08] shadow-[0_12px_30px_rgba(142,197,252,0.12)]"
            style={{ top, height }}
            aria-hidden="true"
        >
            <div className="absolute inset-y-2 left-0 w-1 rounded-full bg-moonlit/60" />
            <div className="flex h-full flex-col justify-between px-4 py-3">
                <span className="text-[13px] font-semibold text-moonlit">Drop here</span>
                {preview.label ? (
                    <span className="text-[11px] font-medium tracking-[0.08em] text-moonlit/80 uppercase">
                        {preview.label}
                    </span>
                ) : null}
            </div>
        </div>
    );
}

export function AllDayDropPreview({
    preview,
}: {
    preview: CalendarDropPreview;
}) {
    if (preview.kind !== "allday") {
        return null;
    }

    return (
        <div
            className="pointer-events-none inline-flex items-center rounded-full border border-moonlit/40 bg-moonlit/[0.08] px-3 py-1.5 text-[12px] font-medium text-moonlit shadow-[0_8px_24px_rgba(142,197,252,0.08)]"
            aria-hidden="true"
        >
            Drop as all-day
        </div>
    );
}
