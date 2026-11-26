import { OverlayPanel } from "./OverlayPanel";
import { ArrowRight } from "lucide-react";
import * as ScrollArea from "../primitives/ScrollArea";
import { UsageMeters } from "./UsageMeters";
import { useAiUsage } from "../../hooks/ai/use-ai-usage";

export function UsageOverlay({ onClose, onOpenSettings }: { onClose: () => void; onOpenSettings: () => void }) {
    const { data: usage, isLoading } = useAiUsage(true);

    return (
        <OverlayPanel label="Usage" title="Usage" onClose={onClose} className="bg-panel/95 backdrop-blur-xl">
            <ScrollArea.Root className="min-h-0 flex-1">
                <ScrollArea.Viewport className="px-3 py-4">
                    <UsageMeters usage={usage} isLoading={isLoading} />
                    <button
                        type="button"
                        onClick={onOpenSettings}
                        className="mx-auto mt-5 flex min-h-11 items-center gap-1.5 rounded-full px-4 text-sm font-medium text-accent-primary transition-colors hover:bg-accent-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50 cursor-pointer"
                    >
                        Assistant settings
                        <ArrowRight size={14} aria-hidden />
                    </button>
                </ScrollArea.Viewport>
                <ScrollArea.Scrollbar>
                    <ScrollArea.Thumb />
                </ScrollArea.Scrollbar>
            </ScrollArea.Root>
        </OverlayPanel>
    );
}
