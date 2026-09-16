import { useCallback } from "react";
import { SettingsSection, SettingsRow } from "../layout/SettingsLayout";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../primitives/Select";
import { useSettings, useUpdateSettings } from "../../../hooks/core/use-settings";
import { useDesktopLayoutScale } from "../../../hooks/ui/use-desktop-layout-scale";
import { IS_DESKTOP_RUNTIME } from "../../../platform/runtime";
import { ThemeModeCard } from "../appearance/ThemeModeCard";
import { PalettePicker } from "../appearance/PalettePicker";
import { ThemeCarousel } from "../appearance/ThemeCarousel";
import { BackgroundSettings } from "../appearance/BackgroundSettings";
import { SegmentedControl } from "../appearance/SegmentedControl";
import { THEME_PRESETS, type ThemePresetId } from "../../../lib/themes/theme-presets";
import type { PaletteId } from "../../../lib/themes/accent-palettes";
import type { BackgroundImage } from "@cadence/contracts/settings";

export function AppearanceTab() {
    const { data: settings } = useSettings();
    const updateSettings = useUpdateSettings();
    const { layoutScale, setLayoutScale } = useDesktopLayoutScale();

    const appearance = settings?.appearance ?? {
        theme: "twilight" as const,
        accentIntensity: "balanced" as const,
        motion: "system" as const,
        density: "comfortable" as const,
        palette: "lantern" as const,
        themePreset: "default" as const,
        backgroundMode: "theme" as const,
        backgroundColor: null as string | null,
        backgroundGradient: null as string | null,
        backgroundImage: null as BackgroundImage | null,
    };

    // A photo owns the accent and the light/dark of the whole interface, so
    // choosing a theme or a preset means leaving it — the photo stays
    // stored, and picking it again in Background brings it back.
    const photoActive = appearance.backgroundMode === "image";
    const leavePhoto = photoActive ? { backgroundMode: "theme" as const } : {};
    const photoNote = photoActive
        ? "Your photo is setting this right now. Choosing here returns to a theme background."
        : undefined;

    const handleThemePreset = useCallback(
        (presetId: ThemePresetId) => {
            const preset = THEME_PRESETS.find((p) => p.id === presetId);
            if (!preset) return;
            updateSettings.mutate({
                appearance: {
                    themePreset: presetId,
                    theme: preset.baseMode,
                    palette: preset.palette,
                    backgroundMode: "theme",
                    backgroundColor: null,
                    backgroundGradient: null,
                },
            });
        },
        [updateSettings],
    );

    const handleImageAdjust = useCallback(
        (adjustments: Partial<Pick<BackgroundImage, "accent" | "blur" | "brightness">>) => {
            updateSettings.mutate({ appearance: { backgroundImage: adjustments } });
        },
        [updateSettings],
    );

    const handleBackgroundColor = useCallback(
        (color: string) => {
            updateSettings.mutate({
                appearance: {
                    backgroundMode: "custom",
                    backgroundColor: color,
                    backgroundGradient: null,
                },
            });
        },
        [updateSettings],
    );

    const handleBackgroundGradient = useCallback(
        (gradientId: string) => {
            updateSettings.mutate({
                appearance: {
                    backgroundMode: "custom",
                    backgroundGradient: gradientId,
                    backgroundColor: null,
                },
            });
        },
        [updateSettings],
    );

    return (
        <div className="flex flex-col gap-10">
            <h2 className="mb-2 text-2xl font-bold text-twilight-text">Appearance</h2>

            {/* ── Theme Mode ── */}
            <SettingsSection title="Theme">
                {photoNote && (
                    <p className="text-[12px] leading-relaxed text-twilight-text-muted">{photoNote}</p>
                )}
                <div className="grid grid-cols-3 gap-3">
                    {(["twilight", "daylight", "system"] as const).map((mode) => (
                        <ThemeModeCard
                            key={mode}
                            mode={mode}
                            selected={!photoActive && appearance.theme === mode}
                            onSelect={() =>
                                updateSettings.mutate({ appearance: { theme: mode, ...leavePhoto } })
                            }
                        />
                    ))}
                </div>
            </SettingsSection>

            <SettingsSection title="Curated Themes">
                <p className="text-sm text-twilight-text-muted">
                    A starting point for your background and accents. Choose a preset to use Cadence’s look.
                </p>
                <ThemeCarousel
                    value={photoActive ? null : ((appearance.themePreset ?? "default") as ThemePresetId)}
                    onChange={handleThemePreset}
                />
            </SettingsSection>

            <SettingsSection title="Accent Palette">
                {photoActive && (
                    <p id="photo-accent-note" className="text-sm text-twilight-text-muted">
                        Photo selected. Choose an accent below your photo in Background.
                    </p>
                )}
                <fieldset
                    disabled={photoActive}
                    aria-label="Cadence accent palettes"
                    aria-describedby={photoActive ? "photo-accent-note" : undefined}
                    className="min-w-0 disabled:opacity-40 disabled:grayscale"
                >
                    <PalettePicker
                        value={photoActive ? null : ((appearance.palette ?? "lantern") as PaletteId)}
                        onChange={(palette) => updateSettings.mutate({ appearance: { palette } })}
                        theme={appearance.theme}
                    />
                </fieldset>
            </SettingsSection>

            {/* ── Background ── */}
            <SettingsSection title="Background">
                <BackgroundSettings
                    backgroundMode={
                        (appearance.backgroundMode ?? "theme") as "theme" | "custom" | "image"
                    }
                    themePreset={(appearance.themePreset ?? "default") as ThemePresetId}
                    backgroundColor={appearance.backgroundColor ?? null}
                    backgroundGradient={appearance.backgroundGradient ?? null}
                    backgroundImage={appearance.backgroundImage ?? null}
                    onModeChange={(mode) =>
                        updateSettings.mutate({ appearance: {
                            backgroundMode: mode,
                            ...(mode === "theme" ? { backgroundColor: null, backgroundGradient: null } : {}),
                        } })
                    }
                    onColorChange={handleBackgroundColor}
                    onGradientChange={handleBackgroundGradient}
                    onImageAdjust={handleImageAdjust}
                />
            </SettingsSection>

            <SettingsSection title="Accent intensity">
                <p className="text-sm text-twilight-text-muted">Controls how brightly accent colors glow across the interface.</p>
                <div>
                    <SegmentedControl
                        value={appearance.accentIntensity}
                        onChange={(accentIntensity) => updateSettings.mutate({ appearance: { accentIntensity } })}
                        options={[
                            { value: "soft", label: "Soft" },
                            { value: "balanced", label: "Balanced" },
                            { value: "vivid", label: "Vivid" },
                        ]}
                    />
                </div>
            </SettingsSection>

            {/* ── Motion ── */}
            <SettingsSection title="Motion">
                <SettingsRow
                    title="Animation preference"
                    description="Choose whether Cadence plays animations, defers to your system setting, or disables motion entirely."
                >
                    <SegmentedControl
                        value={appearance.motion}
                        onChange={(val) =>
                            updateSettings.mutate({ appearance: { motion: val as any } })
                        }
                        options={[
                            { value: "system", label: "System" },
                            { value: "full", label: "Full" },
                            { value: "reduced", label: "Reduced" },
                        ]}
                    />
                </SettingsRow>
            </SettingsSection>

            {/* ── Density ── */}
            <SettingsSection title="Density">
                <SettingsRow
                    title="Interface density"
                    description="Compact mode tightens spacing for smaller screens or a denser workflow."
                >
                    <SegmentedControl
                        value={appearance.density}
                        onChange={(val) =>
                            updateSettings.mutate({ appearance: { density: val as any } })
                        }
                        options={[
                            { value: "comfortable", label: "Comfortable" },
                            { value: "compact", label: "Compact" },
                        ]}
                    />
                </SettingsRow>

                {IS_DESKTOP_RUNTIME && (
                    <SettingsRow
                        title="Desktop layout scale"
                        description="Adjust the overall app scale for this device. The same control is available with Ctrl/Cmd +/-/0."
                    >
                        <div className="w-full sm:max-w-[18rem]">
                            <Select
                                value={layoutScale}
                                onValueChange={(val) => {
                                    void setLayoutScale(val as typeof layoutScale);
                                }}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="compact">Compact</SelectItem>
                                    <SelectItem value="default">Default</SelectItem>
                                    <SelectItem value="comfortable">Comfortable</SelectItem>
                                    <SelectItem value="large">Large</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </SettingsRow>
                )}
            </SettingsSection>
        </div>
    );
}
