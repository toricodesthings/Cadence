import { useMemo } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../primitives/Select";
import { Switch } from "../../primitives";
import { SettingsSection, SettingsRow } from "../layout/SettingsLayout";
import { useSettings, useUpdateSettings } from "../../../hooks/core/use-settings";
import { useHolidayOverlay } from "../../../hooks/environment/use-holiday-overlay";
import { HolidayPreferencesPanel } from "../../calendar/HolidayControls";

/** Returns the current system UTC offset as a formatted string like "UTC+5:30" or "UTC-8" */
function getLocalUtcOffsetLabel(): string {
    const offsetMinutes = -new Date().getTimezoneOffset(); // positive = east of UTC
    const sign = offsetMinutes >= 0 ? "+" : "−";
    const absMinutes = Math.abs(offsetMinutes);
    const hours = Math.floor(absMinutes / 60);
    const minutes = absMinutes % 60;
    return minutes > 0 ? `UTC${sign}${hours}:${String(minutes).padStart(2, "0")}` : `UTC${sign}${hours}`;
}

/** All UTC offsets from UTC-12 to UTC+14 (including :30 and :45 fractional zones) */
const ALL_UTC_OFFSETS: { value: string; label: string }[] = [
    { value: "Etc/GMT+12", label: "UTC−12" },
    { value: "Etc/GMT+11", label: "UTC−11" },
    { value: "Etc/GMT+10", label: "UTC−10" },
    { value: "Pacific/Marquesas", label: "UTC−9:30" },
    { value: "Etc/GMT+9", label: "UTC−9" },
    { value: "Etc/GMT+8", label: "UTC−8" },
    { value: "Etc/GMT+7", label: "UTC−7" },
    { value: "Etc/GMT+6", label: "UTC−6" },
    { value: "Etc/GMT+5", label: "UTC−5" },
    { value: "Etc/GMT+4", label: "UTC−4" },
    { value: "America/St_Johns", label: "UTC−3:30" },
    { value: "Etc/GMT+3", label: "UTC−3" },
    { value: "Etc/GMT+2", label: "UTC−2" },
    { value: "Etc/GMT+1", label: "UTC−1" },
    { value: "Etc/GMT", label: "UTC+0" },
    { value: "Etc/GMT-1", label: "UTC+1" },
    { value: "Etc/GMT-2", label: "UTC+2" },
    { value: "Etc/GMT-3", label: "UTC+3" },
    { value: "Asia/Tehran", label: "UTC+3:30" },
    { value: "Etc/GMT-4", label: "UTC+4" },
    { value: "Asia/Kabul", label: "UTC+4:30" },
    { value: "Etc/GMT-5", label: "UTC+5" },
    { value: "Asia/Kolkata", label: "UTC+5:30" },
    { value: "Asia/Kathmandu", label: "UTC+5:45" },
    { value: "Etc/GMT-6", label: "UTC+6" },
    { value: "Asia/Yangon", label: "UTC+6:30" },
    { value: "Etc/GMT-7", label: "UTC+7" },
    { value: "Etc/GMT-8", label: "UTC+8" },
    { value: "Australia/Eucla", label: "UTC+8:45" },
    { value: "Etc/GMT-9", label: "UTC+9" },
    { value: "Australia/Darwin", label: "UTC+9:30" },
    { value: "Etc/GMT-10", label: "UTC+10" },
    { value: "Australia/Lord_Howe", label: "UTC+10:30" },
    { value: "Etc/GMT-11", label: "UTC+11" },
    { value: "Etc/GMT-12", label: "UTC+12" },
    { value: "Pacific/Chatham", label: "UTC+12:45" },
    { value: "Etc/GMT-13", label: "UTC+13" },
    { value: "Etc/GMT-14", label: "UTC+14" },
];

export function DateTimeTab() {
    const { data: settings } = useSettings();
    const updateSettings = useUpdateSettings();
    const autoLabel = useMemo(() => `Automatic (${getLocalUtcOffsetLabel()})`, []);
    const currentYear = new Date().getFullYear();
    const holidayOverlay = useHolidayOverlay({
        start: `${currentYear}-01-01`,
        end: `${currentYear}-12-31`,
        viewMode: "year",
        fetchOverlay: false,
    });

    const dtSettings = settings?.dateTime ?? {
        weekStart: "Sunday" as const,
        timezone: "local",
        timeDisplay: "12h" as const,
        dateStyle: "mdy" as const,
    };

    const calSettings = settings?.calendar ?? {
        defaultView: "month" as const,
        showWeekNumbers: false,
        showWeekends: true,
        holidays: {
            enabled: true,
            usePreciseLocation: false,
            locationMode: "auto" as const,
            countryCode: null,
            subdivisionCode: null,
            promptDismissedAt: null,
        },
    };

    return (
        <div className="flex flex-col gap-10">
            <h2 className="mb-2 text-2xl font-bold text-twilight-text">Calendar & Time</h2>

            <SettingsSection title="Formats">
                <SettingsRow
                    title="Date format"
                    description="Choose the order Cadence uses when displaying dates."
                >
                    <div className="w-full sm:max-w-[18rem]">
                        <Select
                            value={dtSettings.dateStyle}
                            onValueChange={(val) =>
                                updateSettings.mutate({ dateTime: { dateStyle: val as any } })
                            }
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="mdy">MM/DD/YYYY</SelectItem>
                                <SelectItem value="dmy">DD/MM/YYYY</SelectItem>
                                <SelectItem value="ymd">YYYY-MM-DD</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </SettingsRow>

                <SettingsRow
                    title="Time display"
                    description="Choose 12-hour or 24-hour time notation."
                >
                    <div className="w-full sm:max-w-[18rem]">
                        <Select
                            value={dtSettings.timeDisplay}
                            onValueChange={(val) =>
                                updateSettings.mutate({ dateTime: { timeDisplay: val as any } })
                            }
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="12h">12-hour (1:00 PM)</SelectItem>
                                <SelectItem value="24h">24-hour (13:00)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </SettingsRow>
            </SettingsSection>

            <SettingsSection title="Timezone">
                <SettingsRow
                    title="Timezone"
                    description="Cadence automatically uses your system time. Lock to a specific timezone if you travel often."
                >
                    <div className="w-full sm:max-w-[18rem]">
                        <Select
                            value={dtSettings.timezone}
                            onValueChange={(val) =>
                                updateSettings.mutate({ dateTime: { timezone: val } })
                            }
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="local">{autoLabel}</SelectItem>
                                {ALL_UTC_OFFSETS.map((tz) => (
                                    <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </SettingsRow>
            </SettingsSection>

            <SettingsSection title="Calendar layout">
                <SettingsRow
                    title="First day of week"
                    description="Sets the starting day for calendar grids and weekly planners."
                >
                    <div className="w-full sm:max-w-[18rem]">
                        <Select
                            value={dtSettings.weekStart}
                            onValueChange={(val) =>
                                updateSettings.mutate({ dateTime: { weekStart: val as any } })
                            }
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="Sunday">Sunday</SelectItem>
                                <SelectItem value="Monday">Monday</SelectItem>
                                <SelectItem value="Saturday">Saturday</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </SettingsRow>

                <SettingsRow
                    title="Default calendar view"
                    description="The view Cadence opens to when you visit the calendar."
                >
                    <div className="w-full sm:max-w-[18rem]">
                        <Select
                            value={calSettings.defaultView}
                            onValueChange={(val) =>
                                updateSettings.mutate({ calendar: { defaultView: val as any } })
                            }
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="month">Month</SelectItem>
                                <SelectItem value="week">Week</SelectItem>
                                <SelectItem value="day">Day</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </SettingsRow>

                <SettingsRow
                    title="Show week numbers"
                    description="Display ISO week numbers along the edge of the calendar."
                >
                    <Switch
                        checked={calSettings.showWeekNumbers}
                        onCheckedChange={(val) =>
                            updateSettings.mutate({ calendar: { showWeekNumbers: val } })
                        }
                    />
                </SettingsRow>

                <SettingsRow
                    title="Show weekends"
                    description="Toggle Saturday and Sunday columns in the calendar grid."
                >
                    <Switch
                        checked={calSettings.showWeekends}
                        onCheckedChange={(val) =>
                            updateSettings.mutate({ calendar: { showWeekends: val } })
                        }
                    />
                </SettingsRow>
            </SettingsSection>

            <SettingsSection title="Holiday overlay">
                <SettingsRow
                    title="Location-aware holidays"
                    description="Show public holidays across the calendar. Choose whether Cadence detects them automatically or follows a manual country and region."
                    className="items-stretch"
                >
                    <div className="w-full sm:min-w-[22rem]">
                        <HolidayPreferencesPanel
                            enabled={holidayOverlay.holidaySettings.enabled}
                            usePreciseLocation={holidayOverlay.holidaySettings.usePreciseLocation}
                            locationMode={holidayOverlay.holidaySettings.locationMode}
                            countryCode={holidayOverlay.holidaySettings.countryCode}
                            subdivisionCode={holidayOverlay.holidaySettings.subdivisionCode}
                            countryOptions={holidayOverlay.countryOptions}
                            subdivisionOptions={holidayOverlay.subdivisionOptions}
                            effectiveCountryLabel={holidayOverlay.effectiveCountryLabel}
                            effectiveSubdivisionLabel={holidayOverlay.effectiveSubdivisionLabel}
                            permissionState={holidayOverlay.permissionState}
                            countriesLoading={holidayOverlay.countriesLoading}
                            subdivisionsLoading={holidayOverlay.subdivisionsLoading}
                            isLocating={holidayOverlay.isLocating}
                            onEnabledChange={holidayOverlay.setEnabled}
                            onLocationModeChange={holidayOverlay.setLocationMode}
                            onCountryChange={holidayOverlay.setCountryCode}
                            onSubdivisionChange={holidayOverlay.setSubdivisionCode}
                            onUsePreciseLocationChange={(value) => { void holidayOverlay.setUsePreciseLocation(value); }}
                            onRequestPreciseLocation={() => holidayOverlay.requestPreciseLocation()}
                        />
                    </div>
                </SettingsRow>
            </SettingsSection>
        </div>
    );
}
