import { Smartphone } from "lucide-react";
import type { LinkedAppId } from "@cadence/contracts/app-link";
import { useSettings } from "../../hooks/core/use-settings";
import { appEntry } from "../../lib/app-links/catalog";
import { toastUndo } from "../../lib/utils/undo-toast";
import { resolveAppLaunch, resolveWebsite } from "../../platform/app-links";
import { CARD, PanelHeader, PanelTrigger } from "./DetailPanelSections";
import { AppInitials } from "./AppInitials";
import { AppLaunchLink, OpenPill } from "./AppLaunchLink";
import { AppChooser, WebsiteTile } from "./AppPicker";
import { Reveal } from "./Reveal";

/** What a task or routine opens: one app or one website, never both. */
export interface AppLinkPatch {
    linkedAppId: LinkedAppId | null;
    linkedUrl: string | null;
}

/**
 * The App pane of a task or routine. Collapsed with an app or website, it is that row with an Open pill on
 * the right: one tap leaves Cadence, a tap on the name opens the chooser. Opened, it is the chooser.
 * Choosing or removing saves and collapses back to the row.
 */
export function AppPane({ value, url, title, kind, hint, open, onOpenChange, onChange }: {
    value: string | null | undefined;
    url: string | null | undefined;
    /** The task or routine's own title: read once per visit to rank suggestions. */
    title: string;
    kind: "task" | "routine";
    hint?: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onChange: (patch: AppLinkPatch) => void;
}) {
    const { data: settings } = useSettings();
    const entry = appEntry(value);
    const launch = entry ? resolveAppLaunch(entry) : null;
    // An app wins if both were ever saved; a website that fails the check is treated as unavailable.
    const website = value ? null : resolveWebsite(url);
    const saved = Boolean(value || url);

    const change = (next: AppLinkPatch) => {
        const previous = { linkedAppId: (value ?? null) as LinkedAppId | null, linkedUrl: url ?? null };
        if (next.linkedAppId !== previous.linkedAppId || next.linkedUrl !== previous.linkedUrl) onChange(next);
        if (!next.linkedAppId && !next.linkedUrl && saved) toastUndo(previous.linkedAppId ? "App removed" : "Website removed", () => onChange(previous));
    };
    const choose = (next: AppLinkPatch) => { change(next); onOpenChange(false); };

    const row = (tile: React.ReactNode, name: string, summary: string, action: React.ReactNode) => (
        <div className={`${CARD} flex min-h-16 items-center gap-2 py-2 pl-2 pr-3`} role="group" aria-label="App">
            <button
                type="button"
                aria-expanded={false}
                aria-label={`App: ${name}. Change app`}
                onClick={() => onOpenChange(true)}
                className="flex min-h-12 min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-xl px-2 text-left transition-colors hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
            >
                {tile}
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-twilight-text">{name}</span>
                    <span className="block truncate text-xs text-twilight-text-muted">{summary} · Change</span>
                </span>
            </button>
            {action}
        </div>
    );

    const collapsed = !saved ? (
        <PanelTrigger icon={Smartphone} title="App" summary="Open an app or website in one tap" onOpen={() => onOpenChange(true)} />
    ) : website ? (
        row(<WebsiteTile />, website.label, "Website", <OpenPill href={website.href} opens="website" label={`Open ${website.label}`} />)
    ) : entry && launch ? (
        row(<AppInitials initials={entry.initials} />, entry.label, launch.opens === "app" ? "Opens the app" : "Opens the website", <AppLaunchLink appId={value} />)
    ) : (
        row(
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.04] text-twilight-text-muted"><Smartphone size={16} aria-hidden="true" /></span>,
            value ? "App unavailable" : "Website unavailable",
            "Not on this device",
            null,
        )
    );

    return (
        <>
            {open ? null : collapsed}
            <Reveal open={open}>
                <section className={`${CARD} space-y-3 px-3 py-3`} aria-label="Choose app">
                    <div className="px-1"><PanelHeader title="App" summary={hint ?? "An app you use, or any website"} onDone={() => onOpenChange(false)} /></div>
                    <AppChooser
                        title={title}
                        kind={kind}
                        currentId={value}
                        currentUrl={value ? null : resolveWebsite(url)?.href ?? null}
                        nlpEnabled={settings?.tasks?.intelligence?.nlpEnabled !== false}
                        onSelect={(id) => choose({ linkedAppId: id, linkedUrl: null })}
                        // Opening: the tap must follow its link first, so the pane folds on the next task, not under the finger.
                        onWebsite={(next, opening) => {
                            change({ linkedAppId: null, linkedUrl: next });
                            if (opening) window.setTimeout(() => onOpenChange(false), 0);
                            else onOpenChange(false);
                        }}
                        onRemove={() => choose({ linkedAppId: null, linkedUrl: null })}
                    />
                </section>
            </Reveal>
        </>
    );
}
