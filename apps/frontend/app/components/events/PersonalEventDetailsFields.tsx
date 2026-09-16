import { Switch } from "../primitives/Switch";
import { EventDatePicker } from "./EventDatePicker";

/** Shared event fields for creation and in-place editing. */
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
            <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-twilight-text-muted">Date</span>
            <EventDatePicker value={eventDate} onChange={setEventDate} />
        </div>

        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] px-4 py-3">
            <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                    <p className="text-sm font-medium text-twilight-text">Milestone tracking</p>
                </div>
                <Switch
                    checked={trackMilestone}
                    onCheckedChange={(checked) => {
                        setTrackMilestone(checked);
                        if (checked && !startedOn) {
                            setStartedOn(eventDate);
                        }
                    }}
                    aria-label="Enable milestone tracking for this personal event"
                />
            </div>

            {trackMilestone ? (
                <div className="mt-3 flex items-center gap-3 border-t border-white/[0.05] pt-3">
                    <span className="shrink-0 text-[11px] font-medium uppercase tracking-[0.18em] text-twilight-text-muted">
                        Started on
                    </span>
                    <div className="min-w-0 flex-1">
                        <EventDatePicker compact value={startedOn} onChange={setStartedOn} />
                    </div>
                </div>
            ) : null}
        </div>

        <div className="rounded-[28px] border border-white/[0.06] bg-white/[0.03] px-4 py-4">
            <div className="flex items-center justify-between gap-4">
                <div className="space-y-1">
                    <p className="text-sm font-medium text-twilight-text">Notifications</p>
                    <p className="text-xs text-twilight-text-soft">Show a reminder dot</p>
                </div>
                <Switch
                    checked={notify}
                    onCheckedChange={setNotify}
                    aria-label="Enable notifications for this personal event"
                />
            </div>
        </div>
    </div>;
}
