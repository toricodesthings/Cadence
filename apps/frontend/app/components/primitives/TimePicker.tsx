import * as React from "react";
import * as Popover from "./Popover";
import { getDateFormatConfig } from "../../lib/utils/date-format";

interface TimePickerProps {
    value: string;
    onChange: (value: string) => void;
    icon?: React.ReactNode;
    className?: string;
    /** Accessible name for the field, e.g. "Start time". Defaults to "Time". */
    label?: string;
}

/** Suggestion list: every 30 minutes across the day. */
const SUGGESTIONS: string[] = Array.from({ length: 48 }, (_, i) => {
    const h = Math.floor(i / 2);
    const m = i % 2 === 0 ? "00" : "30";
    return `${String(h).padStart(2, "0")}:${m}`;
});

/** "HH:mm" → display label honoring the 12h/24h preference. */
function formatTime(value: string, is24h: boolean): string {
    const [hs, ms] = value.split(":");
    const h = Number(hs);
    if (Number.isNaN(h) || ms === undefined) return value;
    if (is24h) return value;
    const period = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${ms} ${period}`;
}

/**
 * Forgiving parser: accepts "9", "9:30", "09:05", "930", "2:37pm", "9 p",
 * "14:30". Period is honored in both display modes. An ambiguous bare hour
 * (1–12 with no period) in 12h mode keeps the current value's AM/PM.
 * Returns canonical "HH:mm" or null when unparseable.
 */
function parseTimeInput(raw: string, current: string, is24h: boolean): string | null {
    const text = raw.trim().toLowerCase();
    if (!text) return null;

    const periodMatch = text.match(/([ap])\s*\.?\s*m?\.?\s*$/);
    const period = periodMatch ? (periodMatch[1] === "p" ? "PM" : "AM") : null;
    const core = periodMatch ? text.slice(0, periodMatch.index).trim() : text;
    const cleaned = core.replace(/[^\d:]/g, "");
    if (!cleaned) return null;

    let h: number;
    let m: number;
    if (cleaned.includes(":")) {
        const [hs, ms = ""] = cleaned.split(":");
        if (!hs) return null;
        h = Number(hs);
        m = ms === "" ? 0 : Number(ms);
    } else if (cleaned.length <= 2) {
        h = Number(cleaned);
        m = 0;
    } else if (cleaned.length <= 4) {
        h = Number(cleaned.slice(0, -2));
        m = Number(cleaned.slice(-2));
    } else {
        return null;
    }
    if (Number.isNaN(h) || Number.isNaN(m) || m > 59) return null;

    if (period) {
        if (h < 1 || h > 12) return null;
        h = (h % 12) + (period === "PM" ? 12 : 0);
    } else if (h > 23) {
        return null;
    } else if (!is24h && h >= 1 && h <= 12) {
        const curH = Number(current.split(":")[0]);
        const curPeriod = Number.isNaN(curH) || curH < 12 ? "AM" : "PM";
        h = (h % 12) + (curPeriod === "PM" ? 12 : 0);
    }
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Index of the suggestion closest to the given "HH:mm" value. */
function nearestIndex(value: string, items: string[]): number {
    const toMin = (v: string) => {
        const [h, m] = v.split(":").map(Number);
        return h * 60 + m;
    };
    const target = toMin(value);
    let best = 0;
    let bestDiff = Infinity;
    items.forEach((item, i) => {
        const d = Math.abs(toMin(item) - target);
        if (d < bestDiff) {
            best = i;
            bestDiff = d;
        }
    });
    return best;
}

/** True on touch-first devices (phones, tablets) where native pickers win. */
function useIsCoarsePointer(): boolean {
    const [isCoarse, setIsCoarse] = React.useState(false);
    React.useEffect(() => {
        const mq = window.matchMedia("(hover: none) and (pointer: coarse)");
        setIsCoarse(mq.matches);
        const onChange = (e: MediaQueryListEvent) => setIsCoarse(e.matches);
        mq.addEventListener("change", onChange);
        return () => mq.removeEventListener("change", onChange);
    }, []);
    return isCoarse;
}

export function TimePicker(props: TimePickerProps) {
    const isCoarsePointer = useIsCoarsePointer();
    if (isCoarsePointer) return <NativeTimeField {...props} />;
    return <DesktopTimePicker {...props} />;
}

/**
 * Mobile path: the platform's own time picker (iOS wheel, Android clock).
 * `type="time"` speaks "HH:mm" natively and follows the device's 12h/24h
 * locale automatically.
 */
function NativeTimeField({ value, onChange, icon, className, label }: TimePickerProps) {
    return (
        <div className={`flex items-center gap-0.5 rounded-xl border border-white/[0.06] bg-white/[0.03] px-2 py-1 ${className ?? ""}`}>
            {icon && <span className="mr-1 shrink-0">{icon}</span>}
            <input
                type="time"
                aria-label={label ?? "Time"}
                step={60}
                value={value}
                onChange={(e) => {
                    if (e.target.value) onChange(e.target.value);
                }}
                className="min-h-9 cursor-pointer bg-transparent px-1.5 py-1 text-sm text-twilight-text outline-none [color-scheme:dark]"
            />
        </div>
    );
}

/**
 * Desktop path: a typeable field with a suggestion dropdown. Typing accepts
 * any minute in either convention; the list offers 30-minute shortcuts with
 * the current value highlighted and scrolled into view. Commits on Enter,
 * blur, or picking; invalid input silently reverts.
 */
function DesktopTimePicker({ value, onChange, icon, className, label }: TimePickerProps) {
    const is24h = getDateFormatConfig().timeDisplay === "24h";
    const listId = React.useId();

    const [open, setOpen] = React.useState(false);
    const [text, setText] = React.useState(() => formatTime(value, is24h));
    const [highlight, setHighlight] = React.useState(-1);
    const listRef = React.useRef<HTMLDivElement | null>(null);
    const lastSentRef = React.useRef(value);

    // External value changes refresh the display text.
    React.useEffect(() => {
        lastSentRef.current = value;
        setText(formatTime(value, is24h));
    }, [value, is24h]);

    // Ensure the current value always appears in the list, even off-step.
    const items = React.useMemo(() => {
        if (SUGGESTIONS.includes(value)) return SUGGESTIONS;
        const list = SUGGESTIONS.slice();
        const at = list.findIndex((v) => v > value);
        list.splice(at === -1 ? list.length : at, 0, value);
        return list;
    }, [value]);

    const commit = React.useCallback(
        (next: string) => {
            setText(formatTime(next, is24h));
            if (next !== lastSentRef.current) {
                lastSentRef.current = next;
                onChange(next);
            }
        },
        [is24h, onChange],
    );

    const commitTyped = React.useCallback(() => {
        const parsed = parseTimeInput(text, value, is24h);
        if (parsed) commit(parsed);
        else setText(formatTime(value, is24h));
    }, [text, value, is24h, commit]);

    const openList = React.useCallback(() => {
        const idx = items.indexOf(value);
        setHighlight(idx === -1 ? nearestIndex(value, items) : idx);
        setOpen(true);
    }, [items, value]);

    // Keep the highlighted row in view while navigating.
    React.useEffect(() => {
        if (!open || highlight < 0 || !listRef.current) return;
        const el = listRef.current.children[highlight] as HTMLElement | undefined;
        el?.scrollIntoView({ block: "nearest" });
    }, [open, highlight]);

    const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            if (!open) {
                openList();
                return;
            }
            const delta = e.key === "ArrowDown" ? 1 : -1;
            setHighlight((h) => (h + delta + items.length) % items.length);
        } else if (e.key === "Enter") {
            e.preventDefault();
            if (open && highlight >= 0 && items[highlight]) commit(items[highlight]);
            else commitTyped();
            setOpen(false);
        } else if (e.key === "Escape") {
            setOpen(false);
            setText(formatTime(value, is24h));
        }
    };

    return (
        <Popover.Root open={open} onOpenChange={setOpen}>
            <Popover.Anchor asChild>
                <div className={`flex items-center gap-0.5 rounded-xl border border-white/[0.06] bg-white/[0.03] px-2 py-1 ${className ?? ""}`}>
                    {icon && <span className="mr-1 shrink-0">{icon}</span>}
                    <input
                        role="combobox"
                        aria-expanded={open}
                        aria-controls={listId}
                        aria-activedescendant={highlight >= 0 ? `${listId}-${highlight}` : undefined}
                        aria-autocomplete="none"
                        aria-label={label ?? "Time"}
                        autoComplete="off"
                        autoCorrect="off"
                        spellCheck={false}
                        inputMode="numeric"
                        value={text}
                        onChange={(e) => {
                            setText(e.target.value);
                            if (!open) openList();
                        }}
                        onFocus={(e) => {
                            // Select the text but don't pop the list — opening on
                            // focus flashes the dropdown on mount and on refocus
                            // after a commit. The list opens on click or typing.
                            e.target.select();
                        }}
                        onClick={() => {
                            if (!open) openList();
                        }}
                        onBlur={() => {
                            commitTyped();
                            setOpen(false);
                        }}
                        onKeyDown={onKeyDown}
                        className="min-h-9 w-[4.75rem] bg-transparent px-1.5 py-1 text-sm text-twilight-text outline-none placeholder:text-twilight-text-muted focus-visible:rounded-lg focus-visible:ring-2 focus-visible:ring-accent-primary/50"
                    />
                </div>
            </Popover.Anchor>
            <Popover.Content
                align="start"
                sideOffset={4}
                className="w-36 select-none p-1"
                onOpenAutoFocus={(e) => e.preventDefault()}
                onCloseAutoFocus={(e) => e.preventDefault()}
            >
                <div
                    id={listId}
                    role="listbox"
                    aria-label="Suggested times"
                    ref={listRef}
                    className="max-h-64 overflow-y-auto overscroll-contain"
                >
                    {items.map((item, i) => {
                        const isCurrent = item === value;
                        const isHighlighted = i === highlight;
                        return (
                            <div
                                key={item}
                                id={`${listId}-${i}`}
                                role="option"
                                aria-selected={isCurrent}
                                onMouseDown={(e) => {
                                    e.preventDefault();
                                    commit(item);
                                    setOpen(false);
                                }}
                                onMouseEnter={() => setHighlight(i)}
                                className={`cursor-pointer rounded-lg px-3 py-2.5 text-sm ${
                                    isHighlighted ? "bg-white/[0.08]" : ""
                                } ${isCurrent ? "font-medium text-accent-primary" : "text-twilight-text"}`}
                            >
                                {formatTime(item, is24h)}
                            </div>
                        );
                    })}
                </div>
            </Popover.Content>
        </Popover.Root>
    );
}
