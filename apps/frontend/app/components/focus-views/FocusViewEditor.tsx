import { useState } from "react";
import { Check } from "lucide-react";
import {
    FOCUS_VIEW_COLORS,
    FOCUS_VIEW_ICONS,
    type FocusViewColor,
    type FocusViewIcon,
} from "@cadence/contracts/settings";
import * as Dialog from "../primitives/Dialog";
import { Button } from "../primitives/Button";
import { Input } from "../primitives/Input";
import { Tip } from "../primitives";
import { DEFAULT_COLOR, DEFAULT_ICON, FOCUS_COLORS, FOCUS_ICONS, FocusBubble } from "./focus-look";

export type FocusViewLook = { name: string; icon: FocusViewIcon | null; color: FocusViewColor | null };

const CHOICE =
    "flex size-11 cursor-pointer items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50";

type FormProps = {
    initial: FocusViewLook;
    submitLabel: string;
    onSubmit: (look: FocusViewLook) => void;
    onDone: () => void;
};

/** Name, icon and colour, with a live preview of the row it makes. Enter saves. */
function FocusViewForm({ initial, submitLabel, onSubmit, onDone }: FormProps) {
    const [name, setName] = useState(initial.name);
    const [icon, setIcon] = useState<FocusViewIcon>(initial.icon ?? DEFAULT_ICON);
    const [color, setColor] = useState<FocusViewColor>(initial.color ?? DEFAULT_COLOR);
    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;
        onSubmit({ name: name.trim(), icon, color });
        onDone();
    };
    return (
        <form onSubmit={submit} className="flex flex-col gap-5">
            <div className="flex items-center gap-3">
                <FocusBubble icon={icon} color={color} size={44} />
                <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    aria-label="Name"
                    placeholder="Name this view"
                    maxLength={120}
                    autoFocus
                    className="flex-1"
                />
            </div>

            <fieldset>
                <legend className="mb-2 px-1 text-[13px] font-medium text-twilight-text-soft">Icon</legend>
                <div className="grid grid-cols-[repeat(auto-fill,2.75rem)] justify-between gap-1">
                    {FOCUS_VIEW_ICONS.map((key) => {
                        const Icon = FOCUS_ICONS[key];
                        const on = key === icon;
                        return (
                            <button
                                key={key}
                                type="button"
                                aria-label={key}
                                aria-pressed={on}
                                onClick={() => setIcon(key)}
                                style={{ "--tone": FOCUS_COLORS[color].tone } as React.CSSProperties}
                                className={`${CHOICE} ${on ? "bg-[color-mix(in_srgb,var(--tone)_18%,transparent)] text-[var(--tone)] ring-1 ring-inset ring-[color-mix(in_srgb,var(--tone)_40%,transparent)]" : "text-twilight-text-soft hover:bg-[color-mix(in_srgb,var(--color-twilight-text)_8%,transparent)] hover:text-twilight-text"}`}
                            >
                                <Icon size={18} aria-hidden="true" />
                            </button>
                        );
                    })}
                </div>
            </fieldset>

            <fieldset>
                <legend className="mb-2 px-1 text-[13px] font-medium text-twilight-text-soft">Colour</legend>
                <div className="flex flex-wrap gap-1">
                    {FOCUS_VIEW_COLORS.map((key) => {
                        const on = key === color;
                        return (
                            <Tip key={key} label={FOCUS_COLORS[key].label}>
                                <button
                                    type="button"
                                    aria-label={FOCUS_COLORS[key].label}
                                    aria-pressed={on}
                                    onClick={() => setColor(key)}
                                    className={`${CHOICE} hover:bg-[color-mix(in_srgb,var(--color-twilight-text)_8%,transparent)]`}
                                >
                                    <span
                                        aria-hidden="true"
                                        style={{ background: FOCUS_COLORS[key].tone }}
                                        className={`flex size-6 items-center justify-center rounded-full text-[var(--primary-foreground)] ${on ? "ring-2 ring-twilight-text/80 ring-offset-2 ring-offset-[var(--color-panel-raised)]" : ""}`}
                                    >
                                        {on ? <Check size={13} strokeWidth={3} /> : null}
                                    </span>
                                </button>
                            </Tip>
                        );
                    })}
                </div>
            </fieldset>

            <Dialog.DialogFooter>
                <Button type="button" variant="ghost" size="md" onClick={onDone}>
                    Cancel
                </Button>
                <Button type="submit" variant="cardPrimary" size="md" disabled={!name.trim()}>
                    {submitLabel}
                </Button>
            </Dialog.DialogFooter>
        </form>
    );
}

type FocusViewEditorProps = {
    /** The view being edited or saved; null keeps the dialog closed. */
    initial: FocusViewLook | null;
    title: string;
    submitLabel: string;
    onSubmit: (look: FocusViewLook) => void;
    onClose: () => void;
};

/** Save or edit a view: one small dialog for its name, icon and colour. */
export function FocusViewEditor({ initial, title, submitLabel, onSubmit, onClose }: FocusViewEditorProps) {
    return (
        <Dialog.Dialog open={initial !== null} onOpenChange={(open) => !open && onClose()}>
            <Dialog.DialogContent className="sm:max-w-md" hideCloseButton>
                <Dialog.DialogHeader>
                    <Dialog.DialogTitle>{title}</Dialog.DialogTitle>
                    <Dialog.DialogDescription className="sr-only">
                        Choose a name, an icon and a colour for this view.
                    </Dialog.DialogDescription>
                </Dialog.DialogHeader>
                {initial ? (
                    <FocusViewForm initial={initial} submitLabel={submitLabel} onSubmit={onSubmit} onDone={onClose} />
                ) : null}
            </Dialog.DialogContent>
        </Dialog.Dialog>
    );
}
