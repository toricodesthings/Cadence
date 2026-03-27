import { useState, useRef, useEffect } from "react";
import { Plus, Trash2, X, Check } from "lucide-react";
import { Button } from "../primitives/Button";
import type { PersonalEvent } from "../../types/settings";

interface PersonalEventsPanelProps {
    items: PersonalEvent[];
    compact?: boolean;
    hideAddButton?: boolean;
    onAdd: (event: Omit<PersonalEvent, "id">) => void;
    onUpdate: (id: string, patch: Partial<Omit<PersonalEvent, "id">>) => void;
    onRemove: (id: string) => void;
}

const MONTH_LABELS = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function formatMonthDay(monthDay: string): string {
    const [mm, dd] = monthDay.split("-");
    const monthIdx = parseInt(mm, 10) - 1;
    const dayNum = parseInt(dd, 10);
    // Show day-of-week for the current year
    const now = new Date();
    const date = new Date(now.getFullYear(), monthIdx, dayNum);
    const dayName = date.toLocaleDateString("en-US", { weekday: "short" });
    return `${dayName}, ${MONTH_LABELS[monthIdx]} ${dayNum}`;
}

export function PersonalEventsPanel({
    items,
    compact = false,
    hideAddButton = false,
    onAdd,
    onUpdate,
    onRemove,
}: PersonalEventsPanelProps) {
    const [isAdding, setIsAdding] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [label, setLabel] = useState("");
    const [monthDay, setMonthDay] = useState("");
    const [emoji, setEmoji] = useState("");
    const [startedOn, setStartedOn] = useState<string | null>(null);
    const labelRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isAdding && labelRef.current) {
            labelRef.current.focus();
        }
    }, [isAdding]);

    const resetForm = () => {
        setLabel("");
        setMonthDay("");
        setEmoji("");
        setStartedOn(null);
        setIsAdding(false);
        setEditingId(null);
    };

    const handleSave = () => {
        const trimmedLabel = label.trim();
        if (!trimmedLabel || !monthDay) return;

        // Validate MM-DD format
        const match = monthDay.match(/^(\d{1,2})-(\d{1,2})$/);
        if (!match) return;
        const mm = String(parseInt(match[1], 10)).padStart(2, "0");
        const dd = String(parseInt(match[2], 10)).padStart(2, "0");
        const normalized = `${mm}-${dd}`;

        // Basic range check
        const monthNum = parseInt(mm, 10);
        const dayNum = parseInt(dd, 10);
        if (monthNum < 1 || monthNum > 12 || dayNum < 1 || dayNum > 31) return;

        if (editingId) {
            onUpdate(editingId, {
                label: trimmedLabel,
                monthDay: normalized,
                emoji: emoji.trim() || null,
                startedOn,
            });
        } else {
            onAdd({
                label: trimmedLabel,
                monthDay: normalized,
                emoji: emoji.trim() || null,
                notify: true,
                startedOn: null,
            });
        }
        resetForm();
    };

    const handleEdit = (evt: PersonalEvent) => {
        setEditingId(evt.id);
        setLabel(evt.label);
        setMonthDay(evt.monthDay);
        setEmoji(evt.emoji ?? "");
        setStartedOn(evt.startedOn ?? null);
        setIsAdding(true);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            e.preventDefault();
            handleSave();
        }
        if (e.key === "Escape") {
            resetForm();
        }
    };

    return (
        <div className={compact ? "space-y-2" : "space-y-3"}>
            {/* Event list */}
            {items.length > 0 && (
                <div className="space-y-1">
                    {items.map((evt) => (
                        <div
                            key={evt.id}
                            className="group flex items-center gap-2.5 rounded-xl border border-twilight-border/30 bg-white/[0.03] px-3 py-2 text-sm hover:bg-white/[0.05] transition-colors"
                        >
                            <span className="h-2 w-2 shrink-0 rounded-full bg-accent-nav-schedule shadow-[0_0_6px_color-mix(in_srgb,var(--accent-nav-schedule)_40%,transparent)]" />
                            <button
                                type="button"
                                className="flex-1 min-w-0 text-left text-twilight-text-soft truncate cursor-pointer hover:text-accent-nav-schedule transition-colors"
                                onClick={() => handleEdit(evt)}
                            >
                                <span className="mr-1.5">{evt.emoji ?? "🎉"}</span>
                                {evt.label}
                            </button>
                            <span className="text-xs text-twilight-text-muted shrink-0">
                                {formatMonthDay(evt.monthDay)}
                            </span>
                            <button
                                type="button"
                                className="opacity-0 group-hover:opacity-100 text-twilight-text-muted hover:text-red-400 transition-all cursor-pointer p-0.5"
                                onClick={() => onRemove(evt.id)}
                                aria-label={`Remove ${evt.label}`}
                            >
                                <Trash2 size={13} />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* Add / Edit form */}
            {isAdding ? (
                <div className="space-y-2 rounded-xl border border-accent-nav-schedule/20 bg-accent-nav-schedule/5 p-3">
                    <div className="flex gap-2">
                        <input
                            ref={labelRef}
                            type="text"
                            value={label}
                            onChange={(e) => setLabel(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Event name"
                            maxLength={80}
                            className="flex-1 min-w-0 rounded-lg border border-twilight-border/40 bg-white/[0.04] px-2.5 py-1.5 text-sm text-twilight-text-soft placeholder:text-twilight-text-muted/50 focus:outline-none focus:border-accent-nav-schedule/40 transition-colors"
                        />
                        <input
                            type="text"
                            value={emoji}
                            onChange={(e) => setEmoji(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="😊"
                            maxLength={4}
                            className="w-12 rounded-lg border border-twilight-border/40 bg-white/[0.04] px-2 py-1.5 text-sm text-center placeholder:text-twilight-text-muted/50 focus:outline-none focus:border-accent-nav-schedule/40 transition-colors"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <input
                            type="text"
                            value={monthDay}
                            onChange={(e) => setMonthDay(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="MM-DD"
                            maxLength={5}
                            className="w-20 rounded-lg border border-twilight-border/40 bg-white/[0.04] px-2.5 py-1.5 text-sm text-twilight-text-soft placeholder:text-twilight-text-muted/50 focus:outline-none focus:border-accent-nav-schedule/40 transition-colors"
                        />
                        <div className="flex-1" />
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={resetForm}
                            className="text-twilight-text-muted"
                        >
                            <X size={14} />
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleSave}
                            className="text-accent-nav-schedule"
                            disabled={!label.trim() || !monthDay}
                        >
                            <Check size={14} />
                        </Button>
                    </div>
                </div>
            ) : (
                !hideAddButton &&
                items.length < 50 && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setIsAdding(true)}
                        className="flex items-center gap-2 w-full justify-center text-twilight-text-muted hover:text-accent-nav-schedule transition-colors"
                    >
                        <Plus size={14} />
                        Add event
                    </Button>
                )
            )}
        </div>
    );
}
