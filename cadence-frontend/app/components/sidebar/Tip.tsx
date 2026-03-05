import * as Tooltip from "../primitives/Tooltip";

interface TipProps {
    label: string;
    side?: "top" | "right" | "bottom" | "left";
    children: React.ReactNode;
}

/** Reusable tooltip wrapper — composes from the Tooltip primitive */
export function Tip({ label, side = "right", children }: TipProps) {
    return (
        <Tooltip.Root>
            <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
            <Tooltip.Portal>
                <Tooltip.Content side={side}>
                    {label}
                    <Tooltip.Arrow className="fill-twilight-surface" />
                </Tooltip.Content>
            </Tooltip.Portal>
        </Tooltip.Root>
    );
}
