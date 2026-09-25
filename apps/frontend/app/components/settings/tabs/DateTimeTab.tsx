import { useMemo } from "react";
import { Link, useNavigate } from "react-router";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../primitives/Select";
import { Switch } from "../../primitives";
import { Button } from "../../primitives/Button";
import { SettingsSection, SettingsRow } from "../layout/SettingsLayout";
import { useSettings, useUpdateSettings } from "../../../hooks/core/use-settings";
import { SETTINGS_DEFAULTS } from "../../../types/settings";
import { useHolidayOverlay } from "../../../hooks/environment/use-holiday-overlay";
import { usePersonalEvents } from "../../../hooks/calendar/use-personal-events";
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

export function DateTimeTab() {
    const { data: settings } = useSettings();
    const updateSettings = useUpdateSettings();
    const navigate = useNavigate();
    const systemZone = useMemo(() => `${Intl.DateTimeFormat().resolvedOptions().timeZone} (${getLocalUtcOffsetLabel()})`, []);
    const currentYear = new Date().getFullYear();
    const holidayOverlay = useHolidayOverlay({
        start: `${currentYear}-01-01`,
        end: `${currentYear}-12-31`,
        viewMode: "year",
        fetchOverlay: false,
    });

    const personalEvents = usePersonalEvents(currentYear);

    const dtSettings = settings?.dateTime ?? SETTINGS_DEFAULTS.dateTime;
    const calSettings = settings?.calendar ?? SETTINGS_DEFAULTS.calendar;

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
                    description="Cadence shows every date and time in your device's time zone, and follows it when you travel."
                >
                    <p className="text-sm text-warm-white/70">{systemZone}</p>
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

            <SettingsSection title="Calendar clutter controls">
                <SettingsRow
                    title="Show all-day tasks"
                    description="Keep floating tasks visible at the top of the planner."
                >
                    <Switch
                        checked={calSettings.clutter?.showAllDay ?? true}
                        onCheckedChange={(val) =>
                            updateSettings.mutate({ calendar: { clutter: { showAllDay: val } } })
                        }
                    />
                </SettingsRow>

                <SettingsRow
                    title="Show timed task blocks"
                    description="Display scheduled task blocks inside day and week timelines."
                >
                    <Switch
                        checked={calSettings.clutter?.showTimedTasks ?? true}
                        onCheckedChange={(val) =>
                            updateSettings.mutate({ calendar: { clutter: { showTimedTasks: val } } })
                        }
                    />
                </SettingsRow>

                <SettingsRow
                    title="Show fixed blocks"
                    description="Classes, shifts and other times you're committed to."
                >
                    <Switch
                        checked={calSettings.clutter?.showFixed ?? true}
                        onCheckedChange={(val) =>
                            updateSettings.mutate({ calendar: { clutter: { showFixed: val } } })
                        }
                    />
                </SettingsRow>

                <SettingsRow
                    title="Show routine markers"
                    description="Show routines alongside scheduled work."
                >
                    <Switch
                        checked={calSettings.clutter?.showHabitAnchors ?? true}
                        onCheckedChange={(val) =>
                            updateSettings.mutate({ calendar: { clutter: { showHabitAnchors: val } } })
                        }
                    />
                </SettingsRow>
            </SettingsSection>

            <SettingsSection title="Holiday overlay">
                <SettingsRow
                    title="Location-aware holidays"
                    description="Overlay public holidays on the calendar. The region follows your location setting."
                    className="items-stretch"
                >
                    <div className="w-full sm:min-w-[22rem]">
                        <HolidayPreferencesPanel
                            enabled={holidayOverlay.enabled}
                            regionLabel={holidayOverlay.regionLabel}
                            source={holidayOverlay.source}
                            onEnabledChange={holidayOverlay.setEnabled}
                            onOpenLocationSettings={() => navigate("?settings=location")}
                        />
                    </div>
                </SettingsRow>
            </SettingsSection>

            <SettingsSection title="Personal events">
                <SettingsRow
                    title="Yearly recurring events"
                    description="Control whether personal events appear in Schedule, then manage the event cards from the dedicated Personal Events page."
                    className="items-stretch"
                >
                    <div className="w-full space-y-3">
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-twilight-text-soft">Visible in Schedule</span>
                            <Switch
                                checked={personalEvents.enabled}
                                onCheckedChange={personalEvents.setEnabled}
                            />
                        </div>
                        <p className="text-sm leading-relaxed text-twilight-text-muted">
                            {personalEvents.items.length > 0
                                ? `${personalEvents.items.length} yearly ${personalEvents.items.length === 1 ? "event is" : "events are"} in your library.`
                                : "Your yearly event library lives on the dedicated Events page."}
                        </p>
                        <Button asChild variant="ghost" size="md" className="justify-start rounded-2xl border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.05]">
                            <Link to="/events">Manage events</Link>
                        </Button>
                    </div>
                </SettingsRow>
            </SettingsSection>
        </div>
    );
}
