import type { MemoryMode } from "@cadence/contracts/memory";
import { Button } from "../primitives";
import { useMemoryPage, useSetMemoryMode } from "../../hooks/ai/use-memory";
import { toastUndo } from "../../lib/utils/undo-toast";

const LABEL: Record<MemoryMode, string> = { off: "Off", basic: "Basic", full: "Full" };

/**
 * Memory, said once and never in the way. Basic is already on for anyone who has not chosen, so this is a card at the
 * top of the conversation (the message box works underneath), not a question to answer first. Every button is a choice
 * with Undo, which goes back to Basic (the mode that was in effect).
 */
export function MemoryCard() {
    const { data } = useMemoryPage();
    const setMode = useSetMemoryMode();
    if (!data || data.mode !== null) return null;

    const before: MemoryMode = "basic";
    const choose = (mode: MemoryMode) =>
        setMode.mutate(mode, {
            onSuccess: () => toastUndo(`Memory: ${LABEL[mode]}`, () => setMode.mutate(before)),
        });

    return (
        <section aria-label="Memory" className="relative shrink-0 border-b border-twilight-border bg-accent-primary/6 px-4 py-3">
            <p className="text-[13px] leading-relaxed text-twilight-text">
                <span className="font-semibold">I remember what you tell me, so you don’t have to repeat yourself.</span>
                <br />
                <span className="text-twilight-text-soft">
                    Full also learns from how you work: what you finish, what you move, how long things take, and when you like to do things.
                </span>
                <br />
                <span className="text-twilight-text-muted">Change this anytime in Settings → Assistant → Memory.</span>
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button size="sm" onClick={() => choose("full")} disabled={setMode.isPending}>Switch to Full</Button>
                <Button size="sm" variant="secondary" onClick={() => choose("basic")} disabled={setMode.isPending}>Keep Basic</Button>
                <Button size="sm" variant="ghost" onClick={() => choose("off")} disabled={setMode.isPending}>Turn off</Button>
            </div>
        </section>
    );
}
