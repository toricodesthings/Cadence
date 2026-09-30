import { useMemo, useState, type ReactNode } from "react";
import { ArrowUpRight, ChevronDown, CircleCheck, Code2, Download, Globe, Heart, LifeBuoy, Monitor, RefreshCw, ScrollText, Smartphone, Tag } from "lucide-react";
import { isToday } from "date-fns";
import { Link } from "react-router";
import { toast } from "sonner";
import { Button } from "../../primitives/Button";
import { UpdateDialog } from "../../desktop/UpdateDialog";
import { SettingsSection } from "../layout/SettingsLayout";
import { CADENCE_PUBLIC_VERSION, CADENCE_REPOSITORY_URL } from "../../../lib/constants/app-info";
import { formatShortDateTime, formatTime } from "../../../lib/utils/date-format";
import { checkForAppUpdate, IS_DESKTOP_RUNTIME } from "../../../platform/runtime";
import { publishAvailableDesktopUpdate, useAvailableDesktopUpdate, useLastUpdateCheck } from "../../../platform/desktop-update-state";

const PILL = "inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-twilight-text-soft";

/** Which build this is, by UA: the Tauri app, a phone/tablet browser (incl. iPadOS, which reports as a Mac), or a desktop browser. */
function detectPlatform() {
    if (IS_DESKTOP_RUNTIME) return { label: "Desktop app", Icon: Monitor };
    const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
    return mobile ? { label: "Mobile", Icon: Smartphone } : { label: "Browser", Icon: Globe };
}

function Pill({ icon, children, accent }: { icon: ReactNode; children: ReactNode; accent?: boolean }) {
    return <span className={accent ? `${PILL} border-accent-primary/25 bg-accent-primary/10 text-accent-primary` : PILL}>{icon}{children}</span>;
}

function DesktopUpdatePanel() {
    const update = useAvailableDesktopUpdate();
    const lastChecked = useLastUpdateCheck();
    const [checking, setChecking] = useState(false);
    // An update found at startup opens its dialog straight away (the header chip lands here).
    const [dialogOpen, setDialogOpen] = useState(!!update);

    const check = async () => {
        setChecking(true);
        try {
            const found = await checkForAppUpdate();
            publishAvailableDesktopUpdate(found);
            if (found) setDialogOpen(true);
            else toast.success("Cadence is already up to date.");
        } catch {
            toast.error("Cadence could not check for updates right now.");
        } finally {
            setChecking(false);
        }
    };

    const checkedLabel = lastChecked
        ? `Last checked: ${isToday(lastChecked) ? formatTime(lastChecked.toISOString()) : formatShortDateTime(lastChecked.toISOString())}`
        : null;

    let Icon = RefreshCw;
    let title = "Check for updates";
    let detail = "Look for a signed Cadence desktop update and review the release notes before restarting.";
    if (checking) {
        title = "Checking for updates…";
        detail = "Looking for a signed Cadence desktop update.";
    } else if (update) {
        Icon = Download;
        title = `Cadence ${update.version} is available`;
        detail = checkedLabel ?? detail;
    } else if (checkedLabel) {
        Icon = CircleCheck;
        title = "Cadence is up to date";
        detail = checkedLabel;
    }

    return (
        <SettingsSection title="Desktop app" className="mb-0">
            <div className="flex flex-col items-center gap-4 rounded-[1.4rem] border border-white/[0.04] bg-white/[0.02] p-5 text-center sm:flex-row sm:text-left">
                <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border ${update ? "border-accent-primary/25 bg-accent-primary/10 text-accent-primary" : "border-white/[0.08] bg-white/[0.04] text-twilight-text-soft"}`}>
                    <Icon size={22} className={checking ? "sync-spin" : undefined} aria-hidden="true" />
                </span>
                <div className="flex flex-1 flex-col gap-1">
                    <h4 className="text-base font-medium text-twilight-text">{title}</h4>
                    <p className="text-sm leading-relaxed text-twilight-text-soft">{detail}</p>
                </div>
                {update ? (
                    <Button variant="primary" size="md" onClick={() => setDialogOpen(true)}>Review update</Button>
                ) : (
                    <Button variant="secondary" size="md" disabled={checking} onClick={() => void check()}>
                        {checking ? "Checking…" : "Check for updates"}
                    </Button>
                )}
            </div>
            {update && dialogOpen && <UpdateDialog update={update} onClose={() => setDialogOpen(false)} />}
        </SettingsSection>
    );
}

export function AboutTab() {
    const [expanded, setExpanded] = useState(false);
    const { label: platform, Icon: PlatformIcon } = useMemo(detectPlatform, []);

    return (
        <div className="flex flex-col gap-10">
            <div className="flex flex-col items-center gap-4 text-center">
                <img
                    src="/logo.png"
                    alt="Cadence"
                    className="h-20 w-20 rounded-[1.6rem] object-cover shadow-[0_0_32px_color-mix(in_srgb,var(--accent-primary)_22%,transparent)]"
                />
                <div>
                    <h2 className="text-2xl font-bold text-twilight-text">About Cadence</h2>
                    <p className="mt-1 text-sm leading-relaxed text-twilight-text-soft">
                        Calm planning for tasks, habits, and weekly resets.
                    </p>
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                    <Pill icon={<Tag size={12} aria-hidden="true" />}>{CADENCE_PUBLIC_VERSION}</Pill>
                    <Pill accent icon={<PlatformIcon size={12} aria-hidden="true" />}>{platform}</Pill>
                    <Pill icon={<Code2 size={12} aria-hidden="true" />}>Open source</Pill>
                    <Pill icon={<Heart size={12} aria-hidden="true" />}>No paid plan</Pill>
                </div>
            </div>

            {IS_DESKTOP_RUNTIME && <DesktopUpdatePanel />}

            <SettingsSection title="Product" className="mb-0">
                <div className="flex flex-col gap-3 rounded-[1.4rem] border border-white/[0.04] bg-white/[0.02] p-5 text-sm leading-6 text-twilight-text-soft">
                    <p className={expanded ? undefined : "line-clamp-3"}>
                        Cadence is built on the principle of being cozy, warm, and focused on the essentials. Cadence was born from a spark, a struggle with day-to-day planning. Every other app I've used just didn't work for me. This app will be something I use every day to keep myself on track, and I hope it can do the same for you.
                    </p>
                    {expanded && (
                        <>
                            <p>
                                If you're curious about how it works under the hood, found a bug, or want to contribute/have feature suggestions, check out the repository on GitHub. Cadence will always be free and open source.
                            </p>
                            <p>
                                If you find it valuable and want to support the project, the best way is to star the repository and share it with people who might enjoy it. Thanks for being here!
                            </p>
                        </>
                    )}
                    <button
                        type="button"
                        aria-expanded={expanded}
                        onClick={() => setExpanded((open) => !open)}
                        className="inline-flex cursor-pointer items-center gap-1 self-start rounded-md text-xs font-semibold text-accent-primary transition-colors hover:text-accent-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
                    >
                        {expanded ? "Show less" : "Show more"}
                        <ChevronDown size={14} className={expanded ? "rotate-180 transition-transform" : "transition-transform"} aria-hidden="true" />
                    </button>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <Button asChild variant="card" size="card">
                        <a href={CADENCE_REPOSITORY_URL} target="_blank" rel="noreferrer">
                            <Code2 size={20} className="text-accent-primary" aria-hidden="true" />
                            <span className="inline-flex items-center gap-1">View repository <ArrowUpRight size={13} aria-hidden="true" /></span>
                        </a>
                    </Button>
                    <Button asChild variant="card" size="card">
                        <Link to="/changelog">
                            <ScrollText size={20} className="text-accent-primary" aria-hidden="true" />
                            Changelog
                        </Link>
                    </Button>
                    <Button asChild variant="card" size="card">
                        <Link to="/help-feedback">
                            <LifeBuoy size={20} className="text-accent-primary" aria-hidden="true" />
                            Help & Feedback
                        </Link>
                    </Button>
                </div>
            </SettingsSection>
        </div>
    );
}
