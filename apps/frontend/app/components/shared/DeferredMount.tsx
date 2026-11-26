import { Suspense, useEffect, useState, type ReactNode } from "react";

export function DeferredMount({ active, children }: { active: boolean; children: ReactNode }) {
    const [opened, setOpened] = useState(active);
    useEffect(() => {
        if (active) setOpened(true);
    }, [active]);
    return active || opened ? <Suspense fallback={null}>{children}</Suspense> : null;
}
