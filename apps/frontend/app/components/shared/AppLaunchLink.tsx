import type { ComponentProps, ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { Button } from "../primitives/Button";
import { appEntry } from "../../lib/app-links/catalog";
import { resolveAppLaunch, type AppLaunch } from "../../platform/app-links";
import { IS_DESKTOP_RUNTIME, openExternalUrl } from "../../platform/runtime";

/**
 * A real anchor, so the phone handles the tap itself: no router link, no async work, no `window.open`
 * before a custom scheme. Only the desktop shell hands an HTTPS address to the system; everywhere else
 * a website opens in a new tab.
 */
export function AppAnchor({ href, opens, children, ...props }: Omit<ComponentProps<"a">, "href"> & { href: string; opens: AppLaunch["opens"]; children: ReactNode }) {
    const website = opens === "website";
    return (
        <a
            {...props}
            href={href}
            {...(website ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            onClick={IS_DESKTOP_RUNTIME && website ? (event) => { event.preventDefault(); void openExternalUrl(href); } : undefined}
        >
            {children}
        </a>
    );
}

/** The one-tap action for a saved app. Nothing renders when the id is unknown here or has no route on this device (the field says so). */
export function AppLaunchLink({ appId }: { appId: string | null | undefined }) {
    const entry = appEntry(appId);
    const launch = entry ? resolveAppLaunch(entry) : null;
    if (!entry || !launch) return null;
    const label = launch.opens === "website" ? `Open ${entry.label} website` : `Open ${entry.label}`;
    return (
        <Button asChild variant="ghost" size="md" className="w-fit max-w-full justify-start gap-2 px-3">
            <AppAnchor href={launch.href} opens={launch.opens} aria-label={label}>
                <span className="truncate">{label}</span>
                <ArrowUpRight size={16} aria-hidden="true" className="shrink-0" />
            </AppAnchor>
        </Button>
    );
}
