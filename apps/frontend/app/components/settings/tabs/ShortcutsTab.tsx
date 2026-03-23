import { useState, useCallback, useEffect, useRef } from "react";
import { Switch } from "../../primitives";
import { Button } from "../../primitives/Button";
import { SettingsSection, SettingsRow } from "../layout/SettingsLayout";
import { useSettings, useUpdateSettings } from "../../../hooks/core/use-settings";
import { SETTINGS_DEFAULTS } from "../../../types/settings";

const BINDING_LABELS: Record<string, { label: string; description: string }> = {
    commandPalette: { label: "Command palette", description: "Open the global command palette" },
    newTask: { label: "New task", description: "Create a new task from any screen" },
    focusSearch: { label: "Focus search", description: "Jump to the search input" },
    toggleView: { label: "Toggle view", description: "Switch between list and kanban" },
    completeTask: { label: "Complete task", description: "Mark the selected task as done" },
    archiveTask: { label: "Archive task", description: "Move the selected task to trash" },
};

function formatKeyForDisplay(key: string): string {
    return key
        .replace("mod+", "⌘ ")
        .replace("ctrl+", "Ctrl+")
        .replace("alt+", "Alt+")
        .replace("shift+", "Shift+")
        .toUpperCase();
}

function KeyBindingCapture({
    value,
    onChange,
    onReset,
    defaultValue,
}: {
    value: string;
    onChange: (key: string) => void;
    onReset: () => void;
    defaultValue: string;
}) {
    const [capturing, setCapturing] = useState(false);
    const inputRef = useRef<HTMLButtonElement>(null);

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (!capturing) return;
        e.preventDefault();
        e.stopPropagation();

        const parts: string[] = [];
        if (e.metaKey || e.ctrlKey) parts.push("mod");
        if (e.altKey) parts.push("alt");
        if (e.shiftKey) parts.push("shift");

        const key = e.key.toLowerCase();
        if (!["control", "meta", "alt", "shift"].includes(key)) {
            parts.push(key);
        }

        if (parts.length > 0 && !["control", "meta", "alt", "shift"].includes(e.key.toLowerCase())) {
            const binding = parts.join("+");
            onChange(binding);
            setCapturing(false);
        }
    }, [capturing, onChange]);

    useEffect(() => {
        if (capturing) {
            window.addEventListener("keydown", handleKeyDown, true);
            return () => window.removeEventListener("keydown", handleKeyDown, true);
        }
    }, [capturing, handleKeyDown]);

    return (
        <div className="flex items-center gap-2">
            <button
                ref={inputRef}
                type="button"
                onClick={() => setCapturing(!capturing)}
                className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 font-mono text-xs transition-colors cursor-pointer ${
                    capturing
                        ? "border-lantern/50 bg-lantern/10 text-lantern shadow-[0_0_8px_rgba(232,164,74,0.15)]"
                        : "border-white/10 bg-black/40 text-twilight-text-soft hover:bg-white/[0.06]"
                }`}
            >
                {capturing ? "Press a key…" : (
                    <kbd className="tracking-wider">{formatKeyForDisplay(value)}</kbd>
                )}
            </button>
            {value !== defaultValue && (
                <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-twilight-text-muted hover:text-twilight-text h-7 px-2"
                    onClick={onReset}
                >
                    Reset
                </Button>
            )}
        </div>
    );
}

export function ShortcutsTab() {
    const { data: settings } = useSettings();
    const updateSettings = useUpdateSettings();

    const shortcutSettings = settings?.shortcuts ?? SETTINGS_DEFAULTS.shortcuts;
    const bindings = shortcutSettings.bindings ?? SETTINGS_DEFAULTS.shortcuts.bindings;

    return (
        <div className="flex flex-col gap-10">
            <h2 className="mb-2 text-2xl font-bold text-twilight-text">Keyboard Shortcuts</h2>

            <SettingsSection title="Shortcut behavior">
                <SettingsRow
                    title="Enable keyboard shortcuts"
                    description="Turn all global keyboard shortcuts on or off."
                >
                    <Switch
                        checked={shortcutSettings.enabled}
                        onCheckedChange={(val) =>
                            updateSettings.mutate({ shortcuts: { enabled: val } })
                        }
                    />
                </SettingsRow>
                <SettingsRow
                    title="Show shortcut hints"
                    description="Display keyboard shortcut hints in tooltips and the command palette."
                >
                    <Switch
                        checked={shortcutSettings.showHints}
                        onCheckedChange={(val) =>
                            updateSettings.mutate({ shortcuts: { showHints: val } })
                        }
                    />
                </SettingsRow>
            </SettingsSection>

            <SettingsSection title="Key bindings">
                <p className="text-sm text-twilight-text-muted -mt-2 mb-2">
                    Click a binding to remap it. Press the key combination you want to assign.
                </p>
                {Object.entries(bindings).map(([key, value]) => {
                    const meta = BINDING_LABELS[key];
                    if (!meta) return null;
                    const defaultBinding = SETTINGS_DEFAULTS.shortcuts.bindings[key as keyof typeof SETTINGS_DEFAULTS.shortcuts.bindings];
                    return (
                        <SettingsRow
                            key={key}
                            title={meta.label}
                            description={meta.description}
                        >
                            <KeyBindingCapture
                                value={value}
                                defaultValue={defaultBinding}
                                onChange={(newKey) =>
                                    updateSettings.mutate({ shortcuts: { bindings: { [key]: newKey } } })
                                }
                                onReset={() =>
                                    updateSettings.mutate({ shortcuts: { bindings: { [key]: defaultBinding } } })
                                }
                            />
                        </SettingsRow>
                    );
                })}
            </SettingsSection>

            <SettingsSection title="Navigation shortcuts">
                <p className="text-sm text-twilight-text-muted -mt-2 mb-2">
                    Press <kbd className="inline-flex items-center rounded border border-white/10 bg-black/40 px-1.5 py-0.5 font-mono text-xs text-twilight-text-soft">G</kbd> then a letter to navigate. These shortcuts are not configurable.
                </p>
                {[
                    { keys: "G then T", label: "Go to Today" },
                    { keys: "G then S", label: "Go to Schedule" },
                    { keys: "G then I", label: "Go to Inbox" },
                    { keys: "G then H", label: "Go to Habits" },
                    { keys: "G then U", label: "Go to Upcoming" },
                    { keys: "G then W", label: "Go to Weekly Review" },
                ].map(({ keys, label }) => (
                    <SettingsRow key={keys} title={label} description="">
                        <span className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 font-mono text-xs text-twilight-text-soft">
                            {keys}
                        </span>
                    </SettingsRow>
                ))}
            </SettingsSection>
        </div>
    );
}
