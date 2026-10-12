import { tool } from "ai";
import { z } from "zod";
import tasks from "../../../prompts/help/tasks.md";
import datesAndTimes from "../../../prompts/help/dates-and-times.md";
import repeats from "../../../prompts/help/repeats.md";
import routines from "../../../prompts/help/routines.md";
import capture from "../../../prompts/help/capture.md";
import organizing from "../../../prompts/help/organizing.md";
import planning from "../../../prompts/help/planning.md";
import events from "../../../prompts/help/events.md";
import assistant from "../../../prompts/help/assistant.md";
import settings from "../../../prompts/help/settings.md";
import shortcuts from "../../../prompts/help/shortcuts.md";
import devices from "../../../prompts/help/devices.md";
import privacyAndData from "../../../prompts/help/privacy-and-data.md";

/**
 * The Cadence guide: one short markdown file per topic in ../help, git-owned like
 * the prompt blocks. A user-visible change that makes a file wrong edits it in the
 * same change. Part of the promptHash (agent.ts).
 */
export const HELP_TOPICS = {
    tasks,
    "dates-and-times": datesAndTimes,
    repeats,
    routines,
    capture,
    organizing,
    planning,
    events,
    assistant,
    settings,
    shortcuts,
    devices,
    "privacy-and-data": privacyAndData,
} as const;

type HelpTopic = keyof typeof HELP_TOPICS;

export const helpTools = () => ({
    // ── R (static, no DB) ────────────────────────────────────────────────────
    get_cadence_help: tool({
        description:
            "The Cadence guide: how a feature works, where it lives, and in-app links to copy. " +
            "Pick the topic by name; call two in parallel when a question spans both.",
        inputSchema: z.object({
            topic: z.enum(Object.keys(HELP_TOPICS) as [HelpTopic, ...HelpTopic[]]),
        }),
        execute: async ({ topic }) => ({ topic, text: HELP_TOPICS[topic] }),
    }),
});
