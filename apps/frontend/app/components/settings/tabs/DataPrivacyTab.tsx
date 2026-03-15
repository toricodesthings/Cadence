import { useState } from "react";
import { Switch, AlertDialog } from "../../primitives";
import { Button } from "../../primitives/Button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../primitives/Select";
import { SettingsSection, SettingsRow } from "../layout/SettingsLayout";
import { useSettings, useUpdateSettings } from "../../../hooks/core/use-settings";
import { SETTINGS_DEFAULTS } from "../../../lib/types/settings";
import { toast } from "sonner";

export function DataPrivacyTab() {
    const { data: settings } = useSettings();
    const updateSettings = useUpdateSettings();
    const [exportConfirmOpen, setExportConfirmOpen] = useState(false);

    const privacy = settings?.privacy ?? SETTINGS_DEFAULTS.privacy;

    const handleExportRequest = () => {
        const now = new Date().toISOString();
        updateSettings.mutate({ privacy: { lastExportRequestedAt: now } });
        toast.success("Export request recorded. You will be notified when your data is ready.");
        setExportConfirmOpen(false);
    };

    const hasExportPending = !!privacy.lastExportRequestedAt;

    return (
        <div className="flex flex-col gap-10">
            <h2 className="mb-2 text-2xl font-bold text-twilight-text">Privacy & Data</h2>

            {/* ── Privacy preferences ── */}
            <SettingsSection title="Privacy preferences">
                <SettingsRow
                    title="Usage diagnostics"
                    description="Share anonymous usage patterns to help improve Cadence. No personal data is included."
                >
                    <Switch
                        checked={privacy.usageDiagnostics}
                        onCheckedChange={(val) =>
                            updateSettings.mutate({ privacy: { usageDiagnostics: val } })
                        }
                    />
                </SettingsRow>
                <SettingsRow
                    title="Crash reports"
                    description="Automatically send crash diagnostics so issues can be resolved faster."
                >
                    <Switch
                        checked={privacy.crashReports}
                        onCheckedChange={(val) =>
                            updateSettings.mutate({ privacy: { crashReports: val } })
                        }
                    />
                </SettingsRow>
            </SettingsSection>

            {/* ── Local data preferences ── */}
            <SettingsSection title="Local data preferences">
                <SettingsRow
                    title="Store recent searches"
                    description="Keep recent search queries for quick access. Turning this off clears the history."
                >
                    <Switch
                        checked={privacy.storeRecentSearches}
                        onCheckedChange={(val) =>
                            updateSettings.mutate({ privacy: { storeRecentSearches: val } })
                        }
                    />
                </SettingsRow>
                <SettingsRow
                    title="Store dismissed prompts"
                    description="Remember which hints and prompts you have dismissed so they don't reappear."
                >
                    <Switch
                        checked={privacy.storeDismissedPrompts}
                        onCheckedChange={(val) =>
                            updateSettings.mutate({ privacy: { storeDismissedPrompts: val } })
                        }
                    />
                </SettingsRow>
            </SettingsSection>

            {/* ── Export and deletion status ── */}
            <SettingsSection title="Export and deletion status">
                <SettingsRow
                    title="Export format"
                    description="Choose the format for your data export."
                >
                    <div className="w-full sm:max-w-[14rem]">
                        <Select
                            value={privacy.exportFormat}
                            onValueChange={(val) =>
                                updateSettings.mutate({ privacy: { exportFormat: val as any } })
                            }
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="json">JSON</SelectItem>
                                <SelectItem value="csv">CSV</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </SettingsRow>

                <SettingsRow
                    title="Request data export"
                    description={
                        hasExportPending
                            ? `Export requested on ${new Date(privacy.lastExportRequestedAt!).toLocaleDateString()}. Automated delivery is not yet available — contact support for your export.`
                            : "Request a package containing all of your Cadence data."
                    }
                >
                    <AlertDialog.Root open={exportConfirmOpen} onOpenChange={setExportConfirmOpen}>
                        <AlertDialog.Trigger asChild>
                            <Button variant="secondary" className="bg-white/5 border-white/10">
                                {hasExportPending ? "Request again" : "Request data"}
                            </Button>
                        </AlertDialog.Trigger>
                        <AlertDialog.Content>
                            <AlertDialog.Header>
                                <AlertDialog.Title>Request data export</AlertDialog.Title>
                                <AlertDialog.Description>
                                    This records your export request in {privacy.exportFormat.toUpperCase()} format. Automated delivery is not yet available — you will be contacted when your export is ready.
                                </AlertDialog.Description>
                            </AlertDialog.Header>
                            <AlertDialog.Footer>
                                <AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
                                <AlertDialog.Action onClick={handleExportRequest}>
                                    Confirm request
                                </AlertDialog.Action>
                            </AlertDialog.Footer>
                        </AlertDialog.Content>
                    </AlertDialog.Root>
                </SettingsRow>

                <div className="rounded-[1.4rem] border border-white/[0.04] bg-white/[0.015] p-4">
                    <h4 className="text-base font-medium text-twilight-text mb-1">Account deletion</h4>
                    <p className="text-sm leading-relaxed text-twilight-text-soft">
                        To permanently delete your account and all associated data, please contact support. This action is irreversible and will be processed manually.
                    </p>
                </div>
            </SettingsSection>
        </div>
    );
}
