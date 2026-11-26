import { Flame } from "lucide-react";

export function RoutineMark({
    emoji,
    size = 14,
    className = "",
}: {
    emoji?: string | null;
    size?: number;
    className?: string;
}) {
    if (emoji) {
        return (
            <span
                aria-hidden="true"
                className={`inline-flex shrink-0 items-center justify-center leading-none ${className}`}
                style={{ fontSize: size + 2 }}
            >
                {emoji}
            </span>
        );
    }
    return <Flame size={size} aria-hidden="true" className={`shrink-0 ${className}`} />;
}
