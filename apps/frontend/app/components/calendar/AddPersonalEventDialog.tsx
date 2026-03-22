import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../primitives/Dialog";
import { Button } from "../primitives/Button";
import { usePersonalEvents } from "../../hooks/calendar/use-personal-events";

interface AddPersonalEventDialogProps {
    open: boolean;
    onClose: () => void;
}

const MONTH_LABELS = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function AddPersonalEventDialog({ open, onClose }: AddPersonalEventDialogProps) {
    const [label, setLabel] = useState("");
    const [month, setMonth] = useState(() => String(new Date().getMonth() + 1));
    const [day, setDay] = useState(() => String(new Date().getDate()));
    const [emoji, setEmoji] = useState("");
    const labelRef = useRef<HTMLInputElement>(null);
    const { addEvent } = usePersonalEvents(new Date().getFullYear());

    useEffect(() => {
        if (open) {
            requestAnimationFrame(() => labelRef.current?.focus());
        }
    }, [open]);

    const handleSubmit = () => {
        const trimmed = label.trim();
        if (!trimmed) return;
        const mm = String(parseInt(month, 10)).padStart(2, "0");
        const dd = String(parseInt(day, 10)).padStart(2, "0");
        const monthNum = parseInt(mm, 10);
        const dayNum = parseInt(dd, 10);
        if (monthNum < 1 || monthNum > 12 || dayNum < 1 || dayNum > 31) return;

        addEvent({
            label: trimmed,
            monthDay: `${mm}-${dd}`,
            emoji: emoji.trim() || null,
            notify: true,
        });
        setLabel("");
        setEmoji("");
        onClose();
    };

    // Preview the day of week
    const previewDay = (() => {
        const m = parseInt(month, 10);
        const d = parseInt(day, 10);
        if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
            const date = new Date(new Date().getFullYear(), m - 1, d);
            return date.toLocaleDateString("en-US", { weekday: "long" });
        }
        return null;
    })();

    return (
        <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Add Personal Event</DialogTitle>
                </DialogHeader>
                <p className="text-sm text-twilight-text-muted">
                    Personal events repeat yearly and appear on your calendar.
                </p>
                <div className="flex gap-3">
                    <input
                        ref={labelRef}
                        type="text"
                        value={label}
                        onChange={(e) => setLabel(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
                        placeholder="Event name"
                        maxLength={80}
                        className="flex-1 min-w-0 rounded-xl border border-twilight-border/40 bg-white/[0.04] px-4 py-2.5 text-[15px] text-twilight-text placeholder:text-twilight-text-muted/50 outline-none focus:border-personal/40 transition-colors"
                    />
                    <input
                        type="text"
                        value={emoji}
                        onChange={(e) => setEmoji(e.target.value)}
                        placeholder="🎉"
                        maxLength={4}
                        className="w-14 rounded-xl border border-twilight-border/40 bg-white/[0.04] px-3 py-2.5 text-[15px] text-center placeholder:text-twilight-text-muted/50 outline-none focus:border-personal/40 transition-colors"
                    />
                </div>
                <div className="flex items-center gap-3">
                    <select
                        value={month}
                        onChange={(e) => setMonth(e.target.value)}
                        className="rounded-xl border border-twilight-border/40 bg-white/[0.04] px-3 py-2.5 text-sm text-twilight-text outline-none focus:border-personal/40 transition-colors cursor-pointer"
                    >
                        {MONTH_LABELS.map((m, i) => (
                            <option key={i} value={String(i + 1)}>{m}</option>
                        ))}
                    </select>
                    <input
                        type="number"
                        value={day}
                        onChange={(e) => setDay(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
                        min={1}
                        max={31}
                        className="w-20 rounded-xl border border-twilight-border/40 bg-white/[0.04] px-3 py-2.5 text-sm text-twilight-text outline-none focus:border-personal/40 transition-colors"
                    />
                    {previewDay && (
                        <span className="text-sm text-twilight-text-muted">{previewDay}</span>
                    )}
                </div>
                <DialogFooter>
                    <Button variant="ghost" size="md" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        variant="primary"
                        size="md"
                        onClick={handleSubmit}
                        disabled={!label.trim()}
                        className="bg-personal/20 hover:bg-personal/30 text-personal disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                        Add Event
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
