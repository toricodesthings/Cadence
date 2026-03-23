import { useState } from "react";
import { Switch, AlertDialog } from "../../primitives";
import { Button } from "../../primitives/Button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../primitives/Select";
import { SettingsSection, SettingsRow } from "../layout/SettingsLayout";
import { useSettings, useUpdateSettings } from "../../../hooks/core/use-settings";
import { SETTINGS_DEFAULTS } from "../../../types/settings";
import { toast } from "sonner";
import { checkForAppUpdate, IS_DESKTOP_RUNTIME, type AvailableAppUpdate } from "../../../platform/runtime";

export function DataPrivacyTab() {
    const { data: settings } = useSettings();
    const updateSettings = useUpdateSettings();
    const [exportConfirmOpen, setExportConfirmOpen] = useState(false);
    const [isCheckingForUpdates, setIsCheckingForUpdates] = useState(false);
    const [isInstallingUpdate, setIsInstallingUpdate] = useState(false);
    const [availableUpdate, setAvailableUpdate] = useState<AvailableAppUpdate | null>(null);

    const privacy = settings?.privacy ?? SETTINGS_DEFAULTS.privacy;

    const handleExportRequest = () => {
        const now = new Date().toISOString();
        updateSettings.mutate({ privacy: { lastExportRequestedAt: now } });
        toast.success("Export request recorded. You will be notified when your data is ready.");
        setExportConfirmOpen(false);
    };

    const handleCheckForUpdates = async () => {
        setIsCheckingForUpdates(true);

        try {
            const update = await checkForAppUpdate();
            if (!update) {
                toast.success("Cadence is already up to date.");
                return;
            }

            setAvailableUpdate(update);
        } catch {
            toast.error("Cadence could not check for updates right now.");
        } finally {
            setIsCheckingForUpdates(false);
        }
    };

    const handleInstallUpdate = async () => {
        if (!availableUpdate) {
            return;
        }

        setIsInstallingUpdate(true);

        try {
            await availableUpdate.install();
        } catch {
            toast.error("Cadence could not install the downloaded update.");
        } finally {
            setIsInstallingUpdate(false);
        }
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

            {IS_DESKTOP_RUNTIME && (
                <SettingsSection title="Desktop app">
                    <SettingsRow
                        title="Check for updates"
                        description="Look for a signed Cadence desktop update and review the release notes before restarting."
                    >
                        <Button
                            variant="secondary"
                            className="bg-white/5 border-white/10"
                            disabled={isCheckingForUpdates || isInstallingUpdate}
                            onClick={() => void handleCheckForUpdates()}
                        >
                            {isCheckingForUpdates ? "Checking..." : "Check for updates"}
                        </Button>
                    </SettingsRow>

                    {availableUpdate && (
                        <AlertDialog.Root
                            open={!!availableUpdate}
                            onOpenChange={(open) => {
                                if (!open) {
                                    setAvailableUpdate(null);
                                }
                            }}
                        >
                            <AlertDialog.Content>
                                <AlertDialog.Header>
                                    <AlertDialog.Title>Update ready to install</AlertDialog.Title>
                                    <AlertDialog.Description>
                                        Cadence {availableUpdate.version} is available. Installing will restart the desktop app.
                                    </AlertDialog.Description>
                                </AlertDialog.Header>
                                <div className="space-y-3 rounded-2xl border border-white/[0.06] bg-black/20 p-4">
                                    <div className="flex flex-wrap gap-4 text-xs uppercase tracking-[0.14em] text-twilight-text-soft">
                                        <span>Current {availableUpdate.currentVersion}</span>
                                        <span>Next {availableUpdate.version}</span>
                                        {availableUpdate.date && (
                                            <span>{new Date(availableUpdate.date).toLocaleDateString()}</span>
                                        )}
                                    </div>
                                    {availableUpdate.body ? (
                                        <div className="max-h-56 overflow-y-auto rounded-xl border border-white/[0.06] bg-black/20 p-3 text-sm leading-relaxed text-twilight-text-soft">
                                            <pre className="whitespace-pre-wrap font-sans">
                                                {availableUpdate.body}
                                            </pre>
                                        </div>
                                    ) : (
                                        <p className="text-sm text-twilight-text-soft">
                                            No release notes were included with this update.
                                        </p>
                                    )}
                                </div>
                                <AlertDialog.Footer>
                                    <AlertDialog.Cancel disabled={isInstallingUpdate}>Later</AlertDialog.Cancel>
                                    <AlertDialog.Action
                                        disabled={isInstallingUpdate}
                                        onClick={(event) => {
                                            event.preventDefault();
                                            void handleInstallUpdate();
                                        }}
                                    >
                                        {isInstallingUpdate ? "Installing..." : "Install update"}
                                    </AlertDialog.Action>
                                </AlertDialog.Footer>
                            </AlertDialog.Content>
                        </AlertDialog.Root>
                    )}
                </SettingsSection>
            )}
        </div>
    );
}
