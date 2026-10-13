import { useRef, useState } from "react";
import { Smartphone } from "lucide-react";
import type { LinkedAppId } from "@cadence/contracts/app-link";
import { useShellMode } from "../../hooks/ui/use-shell-mode";
import { useSettings } from "../../hooks/core/use-settings";
import { appEntry } from "../../lib/app-links/catalog";
import { toastUndo } from "../../lib/utils/undo-toast";
import { resolveAppLaunch } from "../../platform/app-links";
import { FieldRow, VALUE_BTN } from "./DetailPanelSections";
import { AppPicker } from "./AppPicker";

/**
 * Details → App: the saved app for this task or routine, and the way to change or remove it. Opening is
 * `AppLaunchLink`, kept apart so choosing never takes anyone out of Cadence.
 */
export function AppLinkField({ value, title, kind, hint, onChange }: {
    value: string | null | undefined;
    /** The task or routine's own title: read once per picker visit to rank suggestions. */
    title: string;
    kind: "task" | "routine";
    hint?: string;
    onChange: (id: LinkedAppId | null) => void;
}) {
    const { isCompact } = useShellMode();
    const { data: settings } = useSettings();
    const [open, setOpen] = useState(false);
    const trigger = useRef<HTMLButtonElement>(null);

    const entry = appEntry(value);
    const reachable = Boolean(entry && resolveAppLaunch(entry));
    const label = !value ? "Add app" : reachable && entry ? entry.label : "App unavailable";

    const change = (next: LinkedAppId | null) => {
        const previous = (value ?? null) as LinkedAppId | null;
        onChange(next);
        if (next === null && previous) toastUndo("App removed", () => onChange(previous));
    };
    const toggle = (next: boolean) => {
        setOpen(next);
        // The sheet is not a Radix popover, so put focus back on the field itself.
        if (!next) requestAnimationFrame(() => trigger.current?.focus({ preventScroll: true }));
    };

    return (
        <FieldRow icon={Smartphone} label="App" hint={hint}>
            <AppPicker
                open={open}
                onOpenChange={toggle}
                compact={isCompact}
                title={title}
                kind={kind}
                currentId={value}
                nlpEnabled={settings?.tasks?.intelligence?.nlpEnabled !== false}
                onSelect={(id) => change(id)}
                onRemove={() => change(null)}
            >
                <button
                    ref={trigger}
                    type="button"
                    aria-haspopup="dialog"
                    aria-label={`App: ${label}`}
                    onClick={isCompact ? () => toggle(true) : undefined}
                    className={`${VALUE_BTN} ${value ? "" : "text-twilight-text-muted"}`}
                >
                    {label}
                </button>
            </AppPicker>
        </FieldRow>
    );
}
