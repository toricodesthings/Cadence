import { tool } from "ai";
import { z } from "zod";

/**
 * One question for the user, Claude Code style: the card shows it with a few
 * options to tap and a box for their own words. The turn stops here (agent.ts
 * `stopWhen`), and their reply arrives as the next user message, so nothing
 * waits on the server and a reload keeps the thread as it was.
 */
export const askTools = () => ({
    ask_user: tool({
        description:
            "Asks the user one short question and ends your turn: use it instead of guessing a detail you'd act on (which item, list, day or time). " +
            "The card shows the question, your options to tap, and a box to type their own answer; their reply is the next message. Don't repeat the question in text.",
        inputSchema: z.object({
            question: z.string().min(1).max(200).describe("One plain question."),
            options: z.array(z.object({
                label: z.string().min(1).max(60).describe("A short answer they can tap."),
                description: z.string().max(120).optional().describe("What it means, when the label isn't enough."),
            })).min(2).max(4).describe("The likely answers, most likely first. They can always type their own."),
        }),
        execute: async () => ({ asked: true }),
    }),
});
