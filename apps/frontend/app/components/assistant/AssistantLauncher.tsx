import { AnimatePresence, motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { useAssistantStore } from "../../stores/assistant-store";

/**
 * Floating Sparkles button that opens the Cadence assistant on non-wide shells,
 * where the icon rail's "Ask Assistant" button isn't mounted. Mirrors the visual
 * language of `ContextualAddOrb` so the bottom-right action cluster reads as one
 * family. Hidden once the panel is open — the drawer covers this spot anyway.
 *
 * `besideOrb` shifts the button to the left of the quick-add orb when they share
 * the corner (phone, on routes that show the orb). We offset horizontally rather
 * than stacking, so the orb's upward-expanding menu never collides with it.
 */
export function AssistantLauncher({ besideOrb = false }: { besideOrb?: boolean }) {
    const { assistantPanelOpen, toggleAssistantPanel } = useAssistantStore();

    return (
        <div
            className={`layer-floating-bar pointer-events-none fixed bottom-5 flex justify-end ${
                besideOrb ? "right-[5.5rem] sm:right-[6rem]" : "right-4 sm:right-5"
            }`}
        >
            <AnimatePresence>
                {!assistantPanelOpen ? (
                    <motion.button
                        key="assistant-launcher"
                        type="button"
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                        onClick={toggleAssistantPanel}
                        aria-label="Ask Cadence"
                        className="glow-lantern pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full border border-accent-primary/25 bg-twilight-deep/96 text-accent-primary shadow-[0_24px_54px_rgba(0,0,0,0.34)] backdrop-blur-xl transition-transform hover:scale-[1.02] active:scale-[0.98]"
                    >
                        <Sparkles size={20} aria-hidden="true" />
                    </motion.button>
                ) : null}
            </AnimatePresence>
        </div>
    );
}
