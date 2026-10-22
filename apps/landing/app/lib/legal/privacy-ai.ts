import type { LegalDoc } from "./types";

/*
 * The Privacy Policy's assistant sections: the AI assistant, its memory, and connected assistants.
 * Same rule as privacy.ts: update in the same change as any data-flow change.
 */
export const AI_SECTIONS: LegalDoc["sections"] = [
  {
    id: "ai-assistant",
    title: "The AI assistant",
    blocks: [
      {
        kind: "p",
        text: "Emilie is Cadence's AI assistant. Apart from the destination suggestions described below, nothing is sent to an AI model unless you send the assistant a message. The assistant reads your data to answer, and every change it makes goes through the same permission checks as the app.",
      },
      { kind: "sub", title: "What is sent for each message" },
      {
        kind: "list",
        items: [
          "Your message and up to the last 40 turns of that conversation. Older lookup results are shrunk to counts and ids.",
          "Photos attached to your message and to the last 6 messages, sent as image data.",
          "A snapshot taken before each reply: today's schedule, up to 5 overdue tasks, today's routines, your 5 newest captures, and events in the next 7 days.",
          "Anything the assistant looks up while answering: tasks, notes (cut off after 1,000 characters), lists, tags, routines, events, saved views.",
          "Your assistant settings: its name, your nickname, voice, emoji and suggestion choices, your custom instructions, and your approval mode.",
          "Your time zone, language, week start, the current local time, and a high-workload flag when adaptive tone is on.",
          "A short fingerprint of your user id (the first 16 characters of a SHA-256 hash). Your email and account name are not sent.",
          "For a new conversation, the first 500 characters of your first message also go to a smaller model to write a title.",
        ],
      },
      { kind: "sub", title: "Who receives it" },
      {
        kind: "p",
        text: "Every assistant request goes through OpenRouter, which passes it to the company that runs the model. Today that is DeepInfra for the DeepSeek model (most requests), Upstage for the Solar model (short, simple requests), and Google for Gemini, the default fallback if the others are unavailable, and for Gemma, which writes conversation titles. The code also lists a Mistral model as a further fallback. These are settings and can change without notice.",
      },
      { kind: "sub", title: "Suggestions in Capture and search" },
      {
        kind: "p",
        text: "Separately from the assistant, Cadence can suggest where a new capture belongs and which task you meant when a search finds nothing. This is on by default. Turn it off in Settings, Tasks & Routines, under Suggest where captures go: nothing is sent for these suggestions once it is off, and the server checks the switch before every request.",
      },
      {
        kind: "list",
        items: [
          "For a new capture (from the app, Quick Capture or a connected assistant): its text, with the names of your lists and sections.",
          "For a search that found nothing: the search text, with the titles of your 255 most recently changed open tasks.",
          "The model answers with a choice among those names or titles, never text. It is told nothing else about you, and ids are not sent.",
          "The suggestion is stored on the capture (which list and section, and how sure the model was). Search suggestions are not stored.",
          "Cadence logs only that a suggestion was made (the kind, model, size, cost, time and outcome), never the text.",
        ],
      },
      { kind: "sub", title: "What is stored" },
      {
        kind: "list",
        items: [
          "Conversations are saved in the database with replies, the lookups and changes made, which model answered, and token counts and cost. Delete one from History, or archive conversations and clear the archive. Deleting removes its messages and photos.",
          "Photos you attach are re-encoded in your browser (which drops camera data such as location), checked again by the server, and stored privately. They are deleted 30 days after last use, or when you delete the conversation.",
          "A temporary copy of a reply in progress sits in Redis so a reload can resume it, for up to an hour, and about a minute after it finishes.",
          "Logs record one line per reply: model, outcome, steps, token counts, cost, timing and a hashed user id. They do not record your message text. Shortened error details from the model provider can be logged when a request fails.",
        ],
      },
      { kind: "sub", title: "Memory" },
      {
        kind: "p",
        text: "Memory is covered in its own section below: what Basic and Full each learn, what is never stored, and how to see, forget and clear it.",
      },
      { kind: "sub", title: "Retention and training by AI providers" },
      {
        kind: "gap",
        title: "Cannot be verified from the code",
        text: "Cadence does not set OpenRouter's data-collection or zero-retention options on requests. Project notes say the AI providers are used with training opted out, but that would be an account-level setting at OpenRouter that the code cannot show. Whether any provider keeps or trains on your content is governed by their terms, not something this project can confirm. Do not put anything in the assistant you would not be comfortable sharing with them.",
      },
      {
        kind: "p",
        text: "Nothing in Cadence's own code uses your content to train or fine-tune any model.",
      },
      { kind: "sub", title: "Limits and safety" },
      {
        kind: "p",
        text: "Usage is capped per account (by default 150 replies per 5 hours and 1,500 per week, plus photo limits) using counters in Redis. You choose whether the assistant asks before each change, asks only for risky ones, or acts on its own. Approvals are cryptographically signed so a forged one fails.",
      },
    ],
  },
  {
    id: "memory",
    title: "Assistant memory",
    blocks: [
      {
        kind: "p",
        text: "Memory lets the assistant carry what you have told it from one chat to the next, so you never repeat yourself. Basic is on until you choose: the assistant remembers what you tell it, and a card the first time you open it says so and offers Full, Keep Basic or Turn off. Memory facts about health, money or relationship trouble are not kept from a passing mention, only if you tell the assistant to remember them. You can change the choice any time in Settings, under Cadence Assistant. Full is only ever on because you chose it.",
      },
      { kind: "sub", title: "What each choice learns from" },
      {
        kind: "table",
        head: ["", "Off", "Basic", "Full"],
        rows: [
          ["What you say in assistant chats", "Nothing", "Yes", "Yes"],
          ["Changes you make yourself: rescheduling, finishing tasks, routine check-ins, how long you say things took (tasks and routines)", "Nothing", "Nothing", "Yes"],
          ["When you like to do things (which part of the day you put a task in when other parts had room) and which suggestions you decline", "Nothing", "Nothing", "Yes"],
          ["Changed lines of your task notes", "Nothing", "Nothing", "Yes"],
          ["The last 90 days of chats and notes, once, over a few nights", "Nothing", "Nothing", "Yes, when you choose Full"],
        ],
      },
      { kind: "sub", title: "How it learns" },
      {
        kind: "list",
        items: [
          "When you tell the assistant to remember, correct or forget something, it saves at once and shows what it saved with an Undo.",
          "About ten minutes after a chat goes quiet, the messages you wrote in it are read once by an AI model that picks out the few lasting things worth keeping. Only your own words are read: never the assistant's replies, tool results, or text you quoted or pasted.",
          "Each kept fact is a short sentence with the day you first said it. Its text is also sent to an embedding model so it can be found later by meaning.",
          "At night, repeats are merged, facts that no longer apply are dropped, and unconfirmed guesses expire after 60 days. Things you said outright never expire on their own.",
          "Full adds patterns it can count (for example that you often finish things in the evening, or plan study in the evening) from the changes you made yourself in the app, never from changes the assistant or a connected assistant made. A pattern needs several events on several different days, mostly in one slot, before anything is claimed. What it learns only changes the order of what Cadence offers: it never moves, shortens or reprioritises anything.",
          "Memory has no size limit; what you ask it to forget stays forgotten, including when you say it again in other words. Deleting a chat deletes what only that chat taught.",
        ],
      },
      { kind: "sub", title: "What goes to AI providers" },
      {
        kind: "p",
        text: "The messages, and for Full the note lines, that memory reads are sent through OpenRouter to the model provider, the same way assistant messages are (see the assistant section for who that is and what cannot be verified about their retention). Cadence does not use your content to train models. The same limits on what Cadence can promise about providers apply here.",
      },
      { kind: "sub", title: "What is never stored" },
      {
        kind: "list",
        items: [
          "Anything the app already holds: your tasks, note text and settings. A note is never copied into memory; only a short fingerprint of each line read is kept so a saved edit is learned from once.",
          "Anything from the assistant's own text, from tool results, or from quoted, forwarded or hypothetical text.",
          "Details about other people beyond what planning needs (a name, how they relate to you, a date).",
          "Diagnoses, mood or health guesses. A sensitive detail (health, money, relationship trouble) is kept only if you tell the assistant to remember it.",
        ],
      },
      { kind: "sub", title: "Seeing, changing and removing it" },
      {
        kind: "list",
        items: [
          "**What Cadence knows** lists everything in plain sentences with where each came from. Tap an item to forget it; it is gone from use at once, can be brought back for 10 minutes, and afterwards only a short topic label stays so it is not learned again.",
          "Ask the assistant to change or forget anything, in chat.",
          "**Don't learn from this chat** in a conversation's menu keeps that chat out of memory.",
          "Choosing Off stops learning and use on the next message; what is stored stays, shown as unused, until you clear it. Choosing Basic after Full stops the activity, note and catch-up learning; what Full already learned stays, and activity signals still expire after 90 days. Changing the mode never erases anything: **Clear everything** deletes every item.",
          "Your data export includes memory items; embedding vectors are left out. Deleting your account deletes memory with it.",
        ],
      },
      {
        kind: "gap",
        title: "What this cannot promise",
        text: "Extraction is done by an AI model and can get a fact wrong or miss one. Memory never overrides your settings or your instructions, and never lets the assistant do something you have not allowed, but it can be mistaken. Anything you would rather it did not keep, forget it or choose Off.",
      },
    ],
  },
  {
    id: "connected-assistants",
    title: "Connected assistants",
    blocks: [
      {
        kind: "p",
        text: "You can let an outside assistant, such as Claude, work with your Cadence through the connected-assistant server (MCP). Nothing is connected unless you approve it on a consent page that shows what it may do.",
      },
      {
        kind: "list",
        items: [
          "You choose the access: read your data, add to Capture only, or change your data (including permanent deletes). It cannot change settings.",
          "While you have memory on, read access includes what Cadence remembers and searching what you said in past chats, and change access includes remembering, updating and forgetting facts. With memory off, none of that is offered.",
          "Cadence stores the assistant's name, the access you granted, your browser's time zone at the time, and when it last connected, in the database. Its access tokens are kept by Cloudflare, expire after 30 idle days, and are checked against your Disconnect on every call.",
          "Disconnect in Settings stops new access immediately. It cannot take back what the assistant already read; from then on that assistant's own provider handles it under its own terms.",
          "A short-lived cookie on the connected-assistant domain ties a consent request to the browser that started it, for up to 10 minutes.",
        ],
      },
      {
        kind: "gap",
        title: "What the outside assistant does next is out of Cadence's hands",
        text: "Anything an outside assistant reads is processed under that provider's terms. Cadence cannot see or control that.",
      },
    ],
  },
];
