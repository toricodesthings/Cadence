import { Loader2 } from "lucide-react";

/** Dims whatever it covers (the parent must be `relative`) while a short job runs. */
export function BusyOverlay({ label }: { label: string }) {
    return (
        <div className="absolute inset-0 flex items-center justify-center bg-black/55 backdrop-blur-sm">
            <span className="flex items-center gap-2 text-[12px] font-medium text-white">
                <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                {label}
            </span>
        </div>
    );
}
