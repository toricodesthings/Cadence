import { LoaderCircle } from "lucide-react";

export function BusyOverlay({ label }: { label: string }) {
    return (
        <div className="absolute inset-0 flex items-center justify-center bg-black/55 backdrop-blur-sm">
            <span className="flex items-center gap-2 text-[12px] font-medium text-white">
                <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />
                {label}
            </span>
        </div>
    );
}
