import { useState } from "react";
import * as Popover from "../primitives/Popover";
import { Tip } from "../primitives/Tooltip";
import { Swatches, type SwatchOption } from "./Swatches";

/** A composer's compact colour pick: a dot beside the title mark that opens the swatches. */
export function ColourDot({ options, value, onChange, label }: { options: SwatchOption[]; value: string; onChange: (value: string) => void; label: string }) {
    const [open, setOpen] = useState(false);
    const current = options.find((option) => option.value === value) ?? options[0];
    return (
        <Popover.Root open={open} onOpenChange={setOpen}>
            <Tip label="Colour"><Popover.Trigger asChild>
                <button type="button" aria-label={label} className="flex h-11 w-8 shrink-0 cursor-pointer items-center justify-center rounded-xl hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50">
                    <span className="h-4 w-4 rounded-full ring-2 ring-white/10 transition-colors duration-300" style={{ backgroundColor: current.color }} />
                </button>
            </Popover.Trigger></Tip>
            <Popover.Content align="start" className="w-72 p-3">
                <Swatches options={options} value={current.value} onChange={(next) => { onChange(next); setOpen(false); }} />
            </Popover.Content>
        </Popover.Root>
    );
}
