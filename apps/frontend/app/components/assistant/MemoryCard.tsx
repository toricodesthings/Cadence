import { Button } from "../primitives";
import { useMemoryPage, useSetMemoryMode } from "../../hooks/ai/use-memory";

/**
 * Memory, said once and never in the way. Basic is already on for anyone who has not chosen, so this is a card at the
 * top of the conversation (the message box works underneath), not a question to answer first. Any choice can be changed
 * later in Settings, which the card says.
 */
export function MemoryCard() {
    const { data } = useMemoryPage();
    const setMode = useSetMemoryMode();
    if (!data || data.mode !== null) return null;

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
                <Button size="sm" onClick={() => setMode.mutate("full")} disabled={setMode.isPending}>Switch to Full</Button>
                <Button size="sm" variant="secondary" onClick={() => setMode.mutate("basic")} disabled={setMode.isPending}>Keep Basic</Button>
                <Button size="sm" variant="ghost" onClick={() => setMode.mutate("off")} disabled={setMode.isPending}>Turn off</Button>
            </div>
        </section>
    );
}
