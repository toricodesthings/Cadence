import type { ReactNode } from "react";
import { CADENCE_PRIVACY_URL, CADENCE_TERMS_URL } from "../../lib/constants/app-info";
import { ExternalLink } from "./ExternalLink";

const LINK = "font-medium text-accent-primary underline-offset-2 hover:underline";

/** "Terms of Service and Privacy Policy", each opening cadenceapp.cloud in the browser. */
export function LegalLinks() {
    return (
        <>
            <ExternalLink href={CADENCE_TERMS_URL} className={LINK}>Terms of Service</ExternalLink>
            {" and "}
            <ExternalLink href={CADENCE_PRIVACY_URL} className={LINK}>Privacy Policy</ExternalLink>
        </>
    );
}

/** One tick box in the sign-up card's glass style. */
export function ConsentCheck({ checked, onChange, children }: { checked: boolean; onChange: (checked: boolean) => void; children: ReactNode }) {
    return (
        <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-[1rem] border border-twilight-border-light bg-twilight-surface/40 px-4 py-3 text-left text-sm text-twilight-text">
            <input
                type="checkbox"
                checked={checked}
                onChange={(event) => onChange(event.target.checked)}
                className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-[var(--accent-primary)]"
            />
            <span>{children}</span>
        </label>
    );
}
