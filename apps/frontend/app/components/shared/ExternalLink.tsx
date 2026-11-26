import type { ComponentProps } from "react";
import { openExternalUrl } from "../../platform/runtime";

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
