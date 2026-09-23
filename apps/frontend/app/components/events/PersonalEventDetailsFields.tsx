import { Bell, Milestone } from "lucide-react";
import { ComposerToggle } from "../shared/Composer";
import { FIELD_LABEL } from "../tasks/task-choice-options";
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
    return <div className="space-y-5">
        <div className="space-y-2">
            <span className={FIELD_LABEL}>Date</span>
            <DatePicker label="Event date" yearNav value={eventDate} onChange={(date) => date && setEventDate(date)} />
        </div>

        <ComposerToggle
            icon={Milestone}
            iconClassName="text-accent-nav-schedule"
            label="Milestone tracking"
            description="Count the days since it began"
            checked={trackMilestone}
            onCheckedChange={(checked) => {
                setTrackMilestone(checked);
                if (checked && !startedOn) setStartedOn(eventDate);
            }}
            ariaLabel="Enable milestone tracking for this personal event"
        >
            {trackMilestone ? (
                <div className="flex items-center gap-3">
                    <span className={`shrink-0 ${FIELD_LABEL}`}>Started on</span>
                    <div className="min-w-0 flex-1">
                        <DatePicker label="Started on" yearNav value={startedOn} onChange={(date) => date && setStartedOn(date)} />
                    </div>
                </div>
            ) : null}
        </ComposerToggle>

        <ComposerToggle
            icon={Bell}
            iconClassName="text-accent-nav-schedule"
            label="Notifications"
            description="Show a reminder dot"
            checked={notify}
            onCheckedChange={setNotify}
            ariaLabel="Enable notifications for this personal event"
        />
    </div>;
}
