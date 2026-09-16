import { useEffect, useState, type ReactNode } from "react";

/** Load an optional surface on first use, then keep it mounted for exit motion. */
export function DeferredMount({ active, children }: { active: boolean; children: ReactNode }) {
    const [opened, setOpened] = useState(active);
    useEffect(() => {
        if (active) setOpened(true);
    }, [active]);
    return active || opened ? children : null;
}
