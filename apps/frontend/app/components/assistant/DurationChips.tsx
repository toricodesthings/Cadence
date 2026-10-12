import { toast } from "sonner";
import { toastName } from "../../lib/utils/undo-toast";

const CHOICES: ReadonlyArray<{ minutes: number; label: string }> = [
    { minutes: 15, label: "15 min" },
    { minutes: 30, label: "30 min" },
    { minutes: 60, label: "1 hr" },
    { minutes: 120, label: "2 hr" },
];

/** "How long did it take?": optional quick picks on completion (Full). Skipping does nothing and costs nothing. */
export function DurationChips({ id, title, onPick }: { id: string | number; title: string; onPick: (minutes: number) => void }) {
    // The Cadence toast is the card: no surface of its own, or it shows a border inside a border.
    return (
        <div role="group" aria-label="How long did it take?" className="flex w-full max-w-sm flex-col gap-2 text-sm text-twilight-text">
            <p className="leading-snug">
                How long did <span className="font-medium">{toastName(title, 40)}</span> take?
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
                {CHOICES.map((choice) => (
                    <button
                        key={choice.minutes}
                        type="button"
                        onClick={() => {
                            onPick(choice.minutes);
                            toast.dismiss(id);
                        }}
                        className="min-h-9 cursor-pointer rounded-full border border-accent-primary/30 bg-accent-primary/10 px-3 text-[13px] font-medium text-twilight-text transition-colors hover:bg-accent-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
                    >
                        {choice.label}
                    </button>
                ))}
                <button
                    type="button"
                    onClick={() => toast.dismiss(id)}
                    className="min-h-9 cursor-pointer rounded-full px-3 text-[13px] text-twilight-text-muted hover:text-twilight-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
                >
                    Skip
                </button>
            </div>
        </div>
    );
}
