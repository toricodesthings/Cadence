import { useState, useCallback, useEffect, useRef } from "react";
import { Switch } from "../../primitives";
import { Button } from "../../primitives/Button";
import { SettingsSection, SettingsRow, SettingsList } from "../layout/SettingsLayout";
import { useSettings, useUpdateSettings } from "../../../hooks/core/use-settings";
import { SETTINGS_DEFAULTS } from "../../../types/settings";
import { GLOBAL_QUICK_CAPTURE_SHORTCUT } from "../../../platform/desktop-shell";
import { useDesktopCommandPreferences } from "../../../hooks/ui/use-desktop-command-preferences";
import { IS_DESKTOP_RUNTIME } from "../../../platform/runtime";
import { SHORTCUT_SECTIONS, bindingKeys } from "../../../lib/constants/shortcuts";

const KBD = "inline-flex items-center rounded-lg border border-white/10 bg-black/40 px-2 py-1 font-mono text-xs text-twilight-text-soft";

function Keys({ keys }: { keys: string[] }) {
    return <span className="flex flex-wrap justify-end gap-1">{keys.map((k, i) => <kbd key={i} className={KBD}>{k}</kbd>)}</span>;
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
                        ? "border-accent-primary/50 bg-accent-primary/10 text-accent-primary shadow-[0_0_8px_color-mix(in_srgb,var(--accent-primary)_15%,transparent)]"
                        : "border-white/10 bg-black/40 text-twilight-text-soft hover:bg-white/[0.06]"
                }`}
            >
                {capturing ? "Press a key…" : (
                    <kbd className="tracking-wider">{bindingKeys(value).join(" ")}</kbd>
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
    const { preferences, updatePreferences } = useDesktopCommandPreferences();

    const shortcutSettings = settings?.shortcuts ?? SETTINGS_DEFAULTS.shortcuts;
    const bindings = { ...SETTINGS_DEFAULTS.shortcuts.bindings, ...shortcutSettings.bindings };

    return (
        <div className="flex flex-col gap-10">
            <h2 className="mb-2 text-2xl font-bold text-twilight-text">Keyboard Shortcuts</h2>

            <SettingsSection title="Shortcut behavior">
                <SettingsRow
                    title="Enable keyboard shortcuts"
                    description="Turn all keyboard shortcuts on or off. Click a key below to change it; letter keys pause while you type in a field."
                >
                    <Switch
                        checked={shortcutSettings.enabled}
                        onCheckedChange={(val) =>
                            updateSettings.mutate({ shortcuts: { enabled: val } })
                        }
                    />
                </SettingsRow>
                {IS_DESKTOP_RUNTIME ? (
                    <SettingsRow
                        title="Global quick capture"
                        description={`Register ${GLOBAL_QUICK_CAPTURE_SHORTCUT} as a system-wide shortcut for opening the quick capture window.`}
                    >
                        <Switch
                            checked={preferences.quickCaptureShortcutEnabled}
                            onCheckedChange={(value) => {
                                void updatePreferences({ quickCaptureShortcutEnabled: value });
                            }}
                        />
                    </SettingsRow>
                ) : null}
            </SettingsSection>

            {SHORTCUT_SECTIONS.map((section) => (
                <SettingsSection key={section.title} title={section.title}>
                    <SettingsList>
                        {section.items.filter((item) => IS_DESKTOP_RUNTIME || !item.desktopOnly).map((item) => (
                            <SettingsRow key={item.label} inline title={item.label}>
                                {item.binding ? (
                                    <KeyBindingCapture
                                        value={bindings[item.binding]}
                                        defaultValue={SETTINGS_DEFAULTS.shortcuts.bindings[item.binding]}
                                        onChange={(newKey) => updateSettings.mutate({ shortcuts: { bindings: { [item.binding!]: newKey } } })}
                                        onReset={() => updateSettings.mutate({ shortcuts: { bindings: { [item.binding!]: SETTINGS_DEFAULTS.shortcuts.bindings[item.binding!] } } })}
                                    />
                                ) : <Keys keys={item.keys ?? []} />}
                            </SettingsRow>
                        ))}
                    </SettingsList>
                </SettingsSection>
            ))}
        </div>
    );
}
