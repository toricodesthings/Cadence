import { useEffect, useState } from "react";

export type ShellMode = "wide" | "laptop" | "tablet" | "phone";

function getShellMode(width: number): ShellMode {
    if (width >= 1440) return "wide";
    if (width >= 1120) return "laptop";
    if (width >= 768) return "tablet";
    return "phone";
}

export function useShellMode() {
    const [mode, setMode] = useState<ShellMode>(() => {
        if (typeof window === "undefined") return "wide";
        return getShellMode(window.innerWidth);
    });

    useEffect(() => {
        const onResize = () => setMode(getShellMode(window.innerWidth));
        onResize();
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, []);

    return {
        mode,
        isWide: mode === "wide",
        isLaptop: mode === "laptop",
        isTablet: mode === "tablet",
        isPhone: mode === "phone",
        isDesktop: mode === "wide" || mode === "laptop",
        isCompact: mode === "tablet" || mode === "phone",
    };
}
