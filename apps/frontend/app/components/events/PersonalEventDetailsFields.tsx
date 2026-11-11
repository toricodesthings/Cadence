import { Bell, Calendar, Milestone } from "lucide-react";
import { ComposerRow, ComposerRows, ROW_PILL } from "../shared/Composer";
import { Switch } from "../primitives";
import { DatePicker } from "../shared/DatePicker";

/** Shared event fields for creation (Events, Schedule) and in-place editing. */
export function PersonalEventDetailsFields({ eventDate, setEventDate, trackMilestone, setTrackMilestone, startedOn, setStartedOn, notify, setNotify }: {
    eventDate: string;
    setEventDate: (date: string) => void;
    trackMilestone: boolean;
    setTrackMilestone: (enabled: boolean) => void;
    startedOn: string;
    setStartedOn: (date: string) => void;
    notify: boolean;
    setNotify: (enabled: boolean) => void;
}) {
    return <ComposerRows>
        <ComposerRow icon={Calendar} label="Date">
            <DatePicker label="Event date" yearNav value={eventDate} className={ROW_PILL} onChange={(date) => date && setEventDate(date)} />
        </ComposerRow>
        <ComposerRow
            icon={Milestone}
            label="Count days since it began"
            detail={trackMilestone ? (
                <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-twilight-text-soft">Started on</span>
                    <DatePicker label="Started on" yearNav value={startedOn} className={ROW_PILL} onChange={(date) => date && setStartedOn(date)} />
                </div>
            ) : null}
        >
            <Switch
                checked={trackMilestone}
                onCheckedChange={(checked) => {
                    setTrackMilestone(checked);
                    if (checked && !startedOn) setStartedOn(eventDate);
                }}
                aria-label="Count the days since it began"
            />
        </ComposerRow>
        <ComposerRow icon={Bell} label="Reminder dot">
            <Switch checked={notify} onCheckedChange={setNotify} aria-label="Show a reminder dot for this event" />
        </ComposerRow>
    </ComposerRows>;
}
