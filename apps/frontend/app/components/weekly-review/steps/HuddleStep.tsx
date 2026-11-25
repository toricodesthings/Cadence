import { ResetChat } from "../ResetChat";
import { StepShell } from "../StepShell";

/* ─── Step 4 · Huddle: just the assistant, to re-plan the week in words (skippable: Next moves on) ─── */
export function HuddleStep({ titleInHeader }: { titleInHeader?: boolean }) {
    return (
        <StepShell step={4} titleInHeader={titleInHeader}>
            <ResetChat />
        </StepShell>
    );
}
