import { useState } from "react";
import { ArrowRight, Download } from "lucide-react";
import { toast } from "sonner";
import * as AlertDialog from "../primitives/AlertDialog";
import { Button } from "../primitives/Button";
import { formatShortDate } from "../../lib/utils/date-format";
import { log } from "../../lib/log";
import type { AvailableAppUpdate } from "../../platform/runtime";

const VERSION_PILL = "rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-xs font-semibold text-twilight-text";

/** The "update ready" prompt: what's new, then Install (restarts the app) or Later. */
export function UpdateDialog({ update, onClose }: { update: AvailableAppUpdate; onClose: () => void }) {
    const [installing, setInstalling] = useState(false);

    const install = async () => {
        setInstalling(true);
        try {
            await update.install();
        } catch (error) {
            log.error("desktop-update", "Couldn't install the update.", error);
            toast.error("Cadence could not install the downloaded update.");
            setInstalling(false);
        }
    };

    return (
        <AlertDialog.Root open onOpenChange={(open) => { if (!open && !installing) onClose(); }}>
            <AlertDialog.Content className="sm:max-w-lg">
                <AlertDialog.Header className="items-center text-center sm:items-center sm:text-center">
                    <span className="mb-1 flex h-12 w-12 items-center justify-center rounded-2xl border border-accent-primary/25 bg-accent-primary/10 text-accent-primary">
                        <Download size={22} aria-hidden="true" />
                    </span>
                    <AlertDialog.Title>Update ready to install</AlertDialog.Title>
                    <AlertDialog.Description>
                        Installing will restart Cadence. Your work is saved and will be right where you left it.
                    </AlertDialog.Description>
                </AlertDialog.Header>

                <div className="flex flex-wrap items-center justify-center gap-2">
                    <span className={VERSION_PILL}>{update.currentVersion}</span>
                    <ArrowRight size={14} className="text-twilight-text-muted" aria-hidden="true" />
                    <span className={`${VERSION_PILL} border-accent-primary/30 bg-accent-primary/10 text-accent-primary`}>
                        {update.version}
                    </span>
                    {update.date && (
                        <span className="w-full text-center text-xs text-twilight-text-muted">
                            Released {formatShortDate(update.date)}
                        </span>
                    )}
                </div>

                <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
                    <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-twilight-text-soft">
                        Release notes
                    </h4>
                    {update.body ? (
                        <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap font-sans text-sm leading-relaxed text-twilight-text-soft">
                            {update.body}
                        </pre>
                    ) : (
                        <p className="text-sm text-twilight-text-muted">No release notes were included with this update.</p>
                    )}
                </div>

                <AlertDialog.Footer>
                    <AlertDialog.Cancel asChild>
                        <Button variant="ghost" size="md" disabled={installing}>Later</Button>
                    </AlertDialog.Cancel>
                    <AlertDialog.Action asChild>
                        <Button
                            variant="primary"
                            size="md"
                            disabled={installing}
                            onClick={(event) => {
                                event.preventDefault();
                                void install();
                            }}
                        >
                            {installing ? "Installing…" : "Install update"}
                        </Button>
                    </AlertDialog.Action>
                </AlertDialog.Footer>
            </AlertDialog.Content>
        </AlertDialog.Root>
    );
}
