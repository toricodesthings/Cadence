import { useEffect, useRef, useState } from "react";
import { CalendarHeart } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../primitives/Dialog";
import { Button } from "../primitives/Button";
import { EmojiMarkButton } from "../shared/EmojiMarkButton";
import { PersonalEventDetailsFields } from "./PersonalEventDetailsFields";
import type { PersonalEvent } from "../../types/settings";
import { getNextPersonalEventDate } from "../../lib/utils/personal-events";

interface PersonalEventEditorDialogProps {
    open: boolean;
    title?: string;
    description?: string;
    submitLabel?: string;
    onClose: () => void;
    onSubmit: (value: Omit<PersonalEvent, "id">) => void;
}

export function PersonalEventEditorDialog({
    open,
    title,
    description,
    submitLabel,
    onClose,
    onSubmit,
}: PersonalEventEditorDialogProps) {
    const labelRef = useRef<HTMLInputElement>(null);
    const [label, setLabel] = useState("");
    const [emoji, setEmoji] = useState("");
    const [eventDate, setEventDate] = useState(() => getNextPersonalEventDate({ monthDay: `${String(new Date().getMonth() + 1).padStart(2, "0")}-${String(new Date().getDate()).padStart(2, "0")}` }));
    const [trackMilestone, setTrackMilestone] = useState(false);
    const [startedOn, setStartedOn] = useState(() => getNextPersonalEventDate({ monthDay: `${String(new Date().getMonth() + 1).padStart(2, "0")}-${String(new Date().getDate()).padStart(2, "0")}` }));
    const [notify, setNotify] = useState(true);

    useEffect(() => {
        if (!open) return;

        const now = new Date();
        const sourceMonthDay = `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

        setLabel("");
        setEmoji("");
        setEventDate(getNextPersonalEventDate({ monthDay: sourceMonthDay }, now));
        setTrackMilestone(false);
        setStartedOn(getNextPersonalEventDate({ monthDay: sourceMonthDay }, now));
        setNotify(true);

        const id = requestAnimationFrame(() => labelRef.current?.focus());
        return () => cancelAnimationFrame(id);
    }, [open]);

    const handleSubmit = () => {
        const trimmedLabel = label.trim();
        if (!trimmedLabel) return;

        onSubmit({
            label: trimmedLabel,
            emoji: emoji.trim() || null,
            monthDay: eventDate.slice(5),
            notify,
            startedOn: trackMilestone ? startedOn : null,
        });
    };

    return (
        <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{title ?? "Add event"}</DialogTitle>
                    <DialogDescription>
                        {description ?? "Yearly recurring milestones stay visible in Schedule while giving you a calmer place to manage them."}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-5">
                    <div className="space-y-2">
                        <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-twilight-text-muted">Event</span>
                        <div className="flex items-center gap-3 rounded-[28px] border border-white/[0.06] bg-white/[0.03] p-3">
                            <EmojiMarkButton emoji={emoji || null} onChange={(next) => setEmoji(next ?? "")} fallback={<CalendarHeart size={18} className="text-accent-nav-schedule" aria-hidden="true" />} />

                            <div className="min-w-0 flex-1">
                                <input
                                    ref={labelRef}
                                    type="text"
                                    value={label}
                                    onChange={(event) => setLabel(event.target.value)}
                                    onKeyDown={(event) => { if (event.key === "Enter") handleSubmit(); }}
                                    placeholder="Mom's birthday, retreat, launch day…"
                                    maxLength={80}
                                    className="block w-full min-w-0 bg-transparent text-[1.05rem] font-medium text-twilight-text outline-none placeholder:text-twilight-text-muted/55"
                                />
                            </div>
                        </div>
                    </div>

                    <PersonalEventDetailsFields
                        eventDate={eventDate} setEventDate={setEventDate}
                        trackMilestone={trackMilestone} setTrackMilestone={setTrackMilestone}
                        startedOn={startedOn} setStartedOn={setStartedOn}
                        notify={notify} setNotify={setNotify}
                    />
                </div>

                <DialogFooter className="flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex w-full items-center gap-2 sm:w-auto">
                        <Button type="button" variant="ghost" size="md" onClick={onClose} className="flex-1 sm:flex-none">
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            variant="cardPrimary"
                            size="md"
                            onClick={handleSubmit}
                            disabled={!label.trim()}
                            className="flex-1 border-accent-nav-schedule/30 bg-accent-nav-schedule/14 text-accent-nav-schedule hover:bg-accent-nav-schedule/20 sm:flex-none"
                        >
                            {submitLabel ?? "Add event"}
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
