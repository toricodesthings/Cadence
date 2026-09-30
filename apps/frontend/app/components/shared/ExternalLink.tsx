import type { ComponentProps } from "react";
import { openExternalUrl } from "../../platform/runtime";

/** A link that leaves the app: a new tab on the web, the system browser on desktop (Tauri would otherwise load it in-window). */
export function ExternalLink({ href, onClick, children, ...props }: ComponentProps<"a"> & { href: string }) {
    return (
        <a
            {...props}
            href={href}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => {
                onClick?.(event);
                if (event.defaultPrevented) return;
                event.preventDefault();
                void openExternalUrl(href);
            }}
        >
            {children}
        </a>
    );
}
