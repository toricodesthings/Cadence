import { ResetChat } from "../ResetChat";
import { StepShell } from "../StepShell";

/* ─── Step 4 · Huddle: just the assistant, to re-plan the week in words (skippable: Next moves on) ─── */
export function HuddleStep({ onTitleVisible }: { onTitleVisible?: (visible: boolean) => void }) {
    return (
        <StepShell step={4} onTitleVisible={onTitleVisible}>
            <ResetChat />
        </StepShell>
    );
}
