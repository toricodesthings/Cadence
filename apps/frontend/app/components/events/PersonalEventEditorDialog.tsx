import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarHeart, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../primitives/Dialog";
import * as AlertDialog from "../primitives/AlertDialog";
import { Button } from "../primitives/Button";
import { Switch } from "../primitives/Switch";
import { EmojiPickerPopover } from "../shared/EmojiPickerPopover";
import { EventDatePicker } from "./EventDatePicker";
import type { PersonalEvent } from "../../types/settings";
import { getNextPersonalEventDate } from "../../lib/utils/personal-events";

interface PersonalEventEditorDialogProps {
    open: boolean;
    initialEvent?: PersonalEvent | null;
    title?: string;
    description?: string;
    submitLabel?: string;
    onClose: () => void;
    onSubmit: (value: Omit<PersonalEvent, "id">) => void;
    onDelete?: () => void;
}

export function PersonalEventEditorDialog({
    open,
    initialEvent,
    title,
    description,
    submitLabel,
    onClose,
    onSubmit,
    onDelete,
}: PersonalEventEditorDialogProps) {
    const labelRef = useRef<HTMLInputElement>(null);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [label, setLabel] = useState("");
    const [emoji, setEmoji] = useState("");
    const [eventDate, setEventDate] = useState(() => getNextPersonalEventDate({ monthDay: `${String(new Date().getMonth() + 1).padStart(2, "0")}-${String(new Date().getDate()).padStart(2, "0")}` }));
    const [trackMilestone, setTrackMilestone] = useState(false);
    const [startedOn, setStartedOn] = useState(() => getNextPersonalEventDate({ monthDay: `${String(new Date().getMonth() + 1).padStart(2, "0")}-${String(new Date().getDate()).padStart(2, "0")}` }));
    const [notify, setNotify] = useState(true);

    useEffect(() => {
        if (!open) return;

        const now = new Date();
        const sourceMonthDay = initialEvent?.monthDay ?? `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

        setLabel(initialEvent?.label ?? "");
        setEmoji(initialEvent?.emoji ?? "");
        setEventDate(getNextPersonalEventDate({ monthDay: sourceMonthDay }, now));
        setTrackMilestone(Boolean(initialEvent?.startedOn));
        setStartedOn(initialEvent?.startedOn ?? getNextPersonalEventDate({ monthDay: sourceMonthDay }, now));
        setNotify(initialEvent?.notify ?? true);

        const id = requestAnimationFrame(() => labelRef.current?.focus());
        return () => cancelAnimationFrame(id);
    }, [initialEvent, open]);

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
        <>
            <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>{title ?? (initialEvent ? "Edit event" : "Add event")}</DialogTitle>
                        <DialogDescription>
                            {description ?? "Yearly recurring milestones stay visible in Schedule while giving you a calmer place to manage them."}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-5">
                        <div className="space-y-2">
                            <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-twilight-text-muted">Event</span>
                            <div className="flex items-center gap-3 rounded-[28px] border border-white/[0.06] bg-white/[0.03] p-3">
                                <EmojiPickerPopover
                                    emoji={emoji}
                                    onSelect={setEmoji}
                                    contentClassName="layer-system-dialog z-[120]"
                                >
                                    <button
                                        type="button"
                                        aria-label="Pick an emoji"
                                        className="flex h-14 w-14 shrink-0 cursor-pointer items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.04] text-[24px] text-twilight-text transition-colors hover:border-white/[0.10] hover:bg-white/[0.06]"
                                    >
                                        {emoji || <CalendarHeart size={18} className="text-personal" />}
                                    </button>
                                </EmojiPickerPopover>

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
                    </div>

                    <DialogFooter className="flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex w-full items-center gap-2 sm:w-auto">
                            {onDelete ? (
                                <Button
                                    type="button"
                                    variant="danger"
                                    size="md"
                                    onClick={() => setDeleteOpen(true)}
                                    className="w-full sm:w-auto"
                                >
                                    <Trash2 size={15} aria-hidden="true" />
                                    Delete
                                </Button>
                            ) : null}
                        </div>

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
                                className="flex-1 border-personal/30 bg-personal/14 text-personal hover:bg-personal/20 sm:flex-none"
                            >
                                {submitLabel ?? (initialEvent ? "Save changes" : "Add event")}
                            </Button>
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <AlertDialog.Root open={deleteOpen} onOpenChange={setDeleteOpen}>
                <AlertDialog.Content>
                    <AlertDialog.Header>
                        <AlertDialog.Title>Delete "{initialEvent?.label}"?</AlertDialog.Title>
                        <AlertDialog.Description>
                            This removes the yearly event from your library and from every calendar surface it appears on.
                        </AlertDialog.Description>
                    </AlertDialog.Header>
                    <AlertDialog.Footer>
                        <AlertDialog.Cancel asChild>
                            <Button variant="ghost" size="md">
                                Cancel
                            </Button>
                        </AlertDialog.Cancel>
                        <AlertDialog.Action asChild>
                            <Button
                                variant="danger"
                                size="md"
                                onClick={() => {
                                    onDelete?.();
                                    setDeleteOpen(false);
                                }}
                            >
                                Delete event
                            </Button>
                        </AlertDialog.Action>
                    </AlertDialog.Footer>
                </AlertDialog.Content>
            </AlertDialog.Root>
        </>
    );
}
