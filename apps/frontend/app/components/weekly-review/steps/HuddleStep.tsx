import { ResetChat } from "../ResetChat";
import { StepShell } from "../StepShell";

export function HuddleStep({ titleInHeader }: { titleInHeader?: boolean }) {
    return (
        <StepShell step={4} titleInHeader={titleInHeader}>
            <ResetChat />
        </StepShell>
    );
}
