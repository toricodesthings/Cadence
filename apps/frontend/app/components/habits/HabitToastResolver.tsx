import { useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { useHabitUnresolvedSummary } from "../../hooks/habits/use-habit-unresolved";
import { useSettings } from "../../hooks/core/use-settings";

export function HabitToastResolver() {
    const { data } = useHabitUnresolvedSummary();
    const { data: settings } = useSettings();
    const navigate = useNavigate();
    const shownRef = useRef(false);

    const bundleEnabled = settings?.notifications?.bundleMissedRoutinePrompts !== false;

    // We only show the bundled toast once per mount
    useEffect(() => {
        if (shownRef.current) return;
        if (!bundleEnabled) return;
        if (!data || !Array.isArray(data) || data.length === 0) return;
        shownRef.current = true;

        const count = data.length;

        toast.info(
            count === 1
                ? `1 routine still needs a check-in`
                : `${count} routines still need a check-in`,
            {
                id: "habit-unresolved-bundle",
                description: data.slice(0, 3).map((h: any) => String(h.title)).join(", ") +
                    (count > 3 ? ` +${count - 3} more` : ""),
                action: {
                    label: "Open Habits",
                    onClick: () => navigate("/habits"),
                },
                cancel: {
                    label: "Dismiss",
                    onClick: () => undefined,
                },
                duration: 12000,
            },
        );
    }, [data, navigate, bundleEnabled]);

    return null;
}
