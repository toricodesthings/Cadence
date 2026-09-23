import { tool } from "ai";
import { z } from "zod";
import tasks from "../help/tasks.md";
import datesAndTimes from "../help/dates-and-times.md";
import repeats from "../help/repeats.md";
import routines from "../help/routines.md";
import capture from "../help/capture.md";
import organizing from "../help/organizing.md";
import planning from "../help/planning.md";
import events from "../help/events.md";
import assistant from "../help/assistant.md";
import settings from "../help/settings.md";
import shortcuts from "../help/shortcuts.md";
import devices from "../help/devices.md";
import privacyAndData from "../help/privacy-and-data.md";

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
            "READ-ONLY. The Cadence guide: how a feature works, where it lives, and in-app links to copy. " +
            "Topics: tasks (create, edit, Waiting, done, Trash, Undo) · dates-and-times (due vs scheduled, typing dates, dragging, overdue) · " +
            "repeats (Fixed vs Routine vs repeating task, making each) · routines (done/skip, pause, archive, streaks) · " +
            "capture (thoughts, quick capture, sorting) · organizing (projects, sections, tags) · " +
            "planning (Today, Schedule, Upcoming, Weekly Reset) · events (personal events) · " +
            "assistant (what you can do, approval modes, voices, memory) · settings (every Settings tab) · " +
            "shortcuts (keyboard) · devices (desktop, Home Screen, offline) · privacy-and-data (export, account deletion, AI data). " +
            "Call two topics in parallel when a question spans both.",
        inputSchema: z.object({
            topic: z.enum(Object.keys(HELP_TOPICS) as [HelpTopic, ...HelpTopic[]]),
        }),
        execute: async ({ topic }) => ({ topic, text: HELP_TOPICS[topic] }),
    }),
});
