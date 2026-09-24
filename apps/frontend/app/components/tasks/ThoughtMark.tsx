import { MessageSquare } from "lucide-react";
import { Tip } from "../primitives/Tooltip";

/** A completed thought keeps its identity when reopened as a task. */
export function ThoughtMark() {
    return (
        <Tip label="Thought">
            <span role="img" aria-label="Thought" className="inline-flex shrink-0 text-twilight-text-muted">
                <MessageSquare size={14} aria-hidden />
            </span>
        </Tip>
    );
}
