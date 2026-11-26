import type { ComponentProps, ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { parseWebsite } from "@cadence/contracts/app-link";
import { Button } from "../primitives/Button";
import { appEntry } from "../../lib/app-links/catalog";
import { resolveAppLaunch, type AppLaunch } from "../../platform/app-links";
import { IS_DESKTOP_RUNTIME, openExternalUrl } from "../../platform/runtime";

export function AppAnchor({
    href,
    opens,
    children,
    ...props
}: Omit<ComponentProps<"a">, "href"> & { href: string; opens: AppLaunch["opens"]; children: ReactNode }) {
    const website = opens === "website";
    return (
        <a
            {...props}
            href={href}
            {...(website ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            onClick={
                IS_DESKTOP_RUNTIME && website
                    ? (event) => {
                          event.preventDefault();
                          const safe = parseWebsite(href);
                          if (safe) void openExternalUrl(safe);
                      }
                    : undefined
            }
        >
            {children}
        </a>
    );
}

export const OPEN_PILL = "shrink-0 gap-1.5 rounded-full px-4 text-[13px]";

export function OpenPill({
    href,
    opens,
    label,
    onClick,
}: {
    href: string;
    opens: AppLaunch["opens"];
    label: string;
    onClick?: () => void;
}) {
    return (
        <Button asChild variant="cardPrimary" size="sm" className={OPEN_PILL}>
            <AppAnchor href={href} opens={opens} aria-label={label} onClickCapture={onClick}>
                Open
                <ArrowUpRight size={15} aria-hidden="true" />
            </AppAnchor>
        </Button>
    );
}

export function AppLaunchLink({ appId }: { appId: string | null | undefined }) {
    const entry = appEntry(appId);
    const launch = entry ? resolveAppLaunch(entry) : null;
    if (!entry || !launch) return null;
    return (
        <OpenPill
            href={launch.href}
            opens={launch.opens}
            label={launch.opens === "website" ? `Open ${entry.label} website` : `Open ${entry.label}`}
        />
    );
}
