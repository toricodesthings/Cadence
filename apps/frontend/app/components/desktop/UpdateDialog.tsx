import { useState } from "react";
import { ArrowRight, Download, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import * as AlertDialog from "../primitives/AlertDialog";
import { Button } from "../primitives/Button";
import { CardPage } from "../shared/CardPage";
import { ExternalLink } from "../shared/ExternalLink";
import { CADENCE_REPOSITORY_URL, CADENCE_VERSION } from "../../lib/constants/app-info";
import { formatShortDate } from "../../lib/utils/date-format";
import { log } from "../../lib/log";
import type { AvailableAppUpdate } from "../../platform/runtime";

const VERSION_PILL =
    "rounded-full border border-twilight-border-light bg-twilight-surface/40 px-3 py-1 text-xs font-semibold text-twilight-text";

const NOTES_BOX = "rounded-[1rem] border border-twilight-border-light bg-twilight-surface/40 p-4 text-left";

function installLabel(installing: boolean, progress: number | null) {
    if (!installing) return "Install update";
    if (progress === 100) return "Restarting…";
    return `Downloading${progress === null ? "…" : ` ${progress}%`}`;
}

function VersionSummary({
    currentVersion,
    targetVersion,
    date,
}: {
    currentVersion: string;
    targetVersion: string;
    date?: string;
}) {
    return (
        <div className="flex flex-wrap items-center justify-center gap-2">
            <span className={VERSION_PILL}>{currentVersion}</span>
            <ArrowRight size={14} className="text-twilight-text-muted" aria-hidden="true" />
            <span className={`${VERSION_PILL} border-accent-primary/30 bg-accent-primary/10 text-accent-primary`}>
                {targetVersion}
            </span>
            {date && (
                <span className="w-full text-center text-xs text-twilight-text-muted">
                    Released {formatShortDate(date)}
                </span>
            )}
        </div>
    );
}

function ReleaseNotesBox({ body }: { body?: string }) {
    return (
        <div className={NOTES_BOX}>
            <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-twilight-text-soft">
                Release notes
            </h4>
            {body ? (
                <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap font-sans text-sm leading-relaxed text-twilight-text-soft">
                    {body}
                </pre>
            ) : (
                <p className="text-sm text-twilight-text-muted">No release notes were included with this update.</p>
            )}
        </div>
    );
}

type SettingsUpdateDialogProps = {
    variant?: "settings";
    update: AvailableAppUpdate;
    onClose: () => void;
};

type RequiredUpdateDialogProps = {
    variant: "required";
    update: AvailableAppUpdate | null;
    minVersion: string;
    checking?: boolean;
    onRetry?: () => void;
};

export type UpdateDialogProps = SettingsUpdateDialogProps | RequiredUpdateDialogProps;

export function UpdateDialog(props: UpdateDialogProps) {
    const [installing, setInstalling] = useState(false);
    const [progress, setProgress] = useState<number | null>(null);

    const install = async (update: AvailableAppUpdate) => {
        setInstalling(true);
        setProgress(null);
        try {
            await update.install(setProgress);
        } catch (error) {
            log.error("desktop-update", "Couldn't install the update.", error);
            toast.error("Cadence could not install the downloaded update.");
            setInstalling(false);
        }
    };

    if (props.variant === "required") {
        const { update, minVersion, checking = false, onRetry } = props;
        const currentVersion = update?.currentVersion ?? CADENCE_VERSION;
        const targetVersion = update?.version ?? minVersion;

        return (
            <AlertDialog.Root open>
                <AlertDialog.FullscreenContent onEscapeKeyDown={(event) => event.preventDefault()}>
                    <CardPage
                        as="div"
                        title={
                            <AlertDialog.Title asChild>
                                <span>Update required</span>
                            </AlertDialog.Title>
                        }
                        description={
                            <AlertDialog.Description asChild>
                                <span>
                                    This version of Cadence is no longer supported. Update to continue where you left
                                    off.
                                </span>
                            </AlertDialog.Description>
                        }
                    >
                        <div className="space-y-4">
                            <VersionSummary
                                currentVersion={currentVersion}
                                targetVersion={targetVersion}
                                date={update?.date}
                            />

                            {update ? (
                                <>
                                    <ReleaseNotesBox body={update.body} />
                                    <AlertDialog.Action asChild>
                                        <Button
                                            variant="primary"
                                            size="md"
                                            className="min-h-10 w-full rounded-[1rem] font-semibold"
                                            disabled={installing}
                                            onClick={(event) => {
                                                event.preventDefault();
                                                void install(update);
                                            }}
                                        >
                                            {installLabel(installing, progress)}
                                        </Button>
                                    </AlertDialog.Action>
                                </>
                            ) : checking ? (
                                <div className="flex flex-col items-center gap-3 py-4 text-sm text-twilight-text-soft">
                                    <LoaderCircle
                                        className="animate-spin text-twilight-text-soft"
                                        aria-label="Checking for updates"
                                    />
                                    <span>Checking for the latest update…</span>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <p className="text-center text-sm leading-relaxed text-twilight-text-soft">
                                        Cadence {minVersion} or newer is required, but the update could not be reached
                                        right now.
                                    </p>
                                    {onRetry && (
                                        <Button
                                            variant="primary"
                                            size="md"
                                            className="min-h-10 w-full rounded-[1rem] font-semibold"
                                            onClick={onRetry}
                                        >
                                            Check again
                                        </Button>
                                    )}
                                    <p className="text-center text-sm text-twilight-text-soft">
                                        <ExternalLink
                                            href={`${CADENCE_REPOSITORY_URL}/releases/latest`}
                                            className="font-medium text-accent-primary transition-colors hover:text-accent-primary/80"
                                        >
                                            Download the latest installer
                                        </ExternalLink>
                                    </p>
                                </div>
                            )}
                        </div>
                    </CardPage>
                </AlertDialog.FullscreenContent>
            </AlertDialog.Root>
        );
    }

    const { update, onClose } = props;

    return (
        <AlertDialog.Root
            open
            onOpenChange={(open) => {
                if (!open && !installing) onClose();
            }}
        >
            <AlertDialog.Content className="sm:max-w-lg">
                <AlertDialog.Header className="items-center text-center sm:items-center sm:text-center">
                    <span className="mb-1 flex h-12 w-12 items-center justify-center rounded-2xl border border-accent-primary/25 bg-accent-primary/10 text-accent-primary">
                        <Download size={22} aria-hidden="true" />
                    </span>
                    <AlertDialog.Title>Update ready to install</AlertDialog.Title>
                    <AlertDialog.Description>
                        Cadence closes for a few seconds and reopens on its own. Your work is saved and will be right
                        where you left it.
                    </AlertDialog.Description>
                </AlertDialog.Header>

                <VersionSummary
                    currentVersion={update.currentVersion}
                    targetVersion={update.version}
                    date={update.date}
                />

                <ReleaseNotesBox body={update.body} />

                <AlertDialog.Footer>
                    <AlertDialog.Cancel asChild>
                        <Button variant="ghost" size="md" disabled={installing}>
                            Later
                        </Button>
                    </AlertDialog.Cancel>
                    <AlertDialog.Action asChild>
                        <Button
                            variant="primary"
                            size="md"
                            disabled={installing}
                            onClick={(event) => {
                                event.preventDefault();
                                void install(update);
                            }}
                        >
                            {installLabel(installing, progress)}
                        </Button>
                    </AlertDialog.Action>
                </AlertDialog.Footer>
            </AlertDialog.Content>
        </AlertDialog.Root>
    );
}
