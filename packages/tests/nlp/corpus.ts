// The 0.29.0 labelled corpus. Expectations are written from what the words mean, never from what the parser returns.
// Reference clock: Tuesday 2026-10-06 10:00 in America/Toronto. Paraphrase families (one intent over many verbs)
// stay together: a family is wholly in `dev` or wholly in `held-out`, so near-duplicates never leak between them.
import { atLocal } from "@cadence/domain/time";

export const ZONE = "America/Toronto";
export const CLOCK = { today: "2026-10-06", now: "10:00", weekStart: "Sunday" as const };
export const WORK = "00000000-0000-4000-8000-0000000000a1";
export const ERRANDS = "00000000-0000-4000-8000-0000000000b1";
export const CONTEXT = {
    projects: [{ id: WORK, name: "Work" }],
    tags: [{ id: ERRANDS, name: "errands" }, { id: "00000000-0000-4000-8000-0000000000b2", name: "Expecting" }],
};

export type Surface = "task" | "routine" | "event";
export type Fields = Partial<{
    dueDate: string; scheduledStart: string; scheduledEnd: string; timeOfDay: string; recurrenceRule: string;
    priority: number; projectId: string; tagIds: string[]; waitingOn: string; durationMinutes: number; notBefore: string; reminderAt: string;
}>;
export interface Case {
    id: string;
    family: string;
    split: "dev" | "held-out";
    surface: Surface;
    text: string;
    /** The fields that must be applied, with their values. Every other field must stay empty. */
    fields: Fields;
    /** The title that must remain. */
    title: string;
    /** Negative, literal, ambiguous or unsupported: nothing may be applied beyond `fields`. */
    negative?: boolean;
    combined?: boolean;
}

const at = (day: string, time: string) => atLocal(day, time, ZONE);
const VERBS = ["Call Sam", "Send the invoice", "Buy groceries", "Write report", "Book dentist", "Pay rent", "Review draft", "Clean garage", "Email Alex", "Renew passport", "Order supplies", "Submit form"];
const cases: Omit<Case, "split">[] = [];
const add = (c: Omit<Case, "split">) => cases.push(c);

/** One family: the same intent over every verb. */
function family(name: string, surface: Surface, make: (verb: string) => { text: string; fields: Fields; title?: string }, opts: { negative?: boolean; combined?: boolean; verbs?: string[] } = {}) {
    for (const verb of opts.verbs ?? VERBS) {
        const { text, fields, title } = make(verb);
        add({ id: `${name}:${verb}`, family: name, surface, text, fields, title: title ?? verb, negative: opts.negative, combined: opts.combined });
    }
}

// ── Days ──
const DAYS: Array<[string, string]> = [["tomorrow", "2026-10-07"], ["today", "2026-10-06"], ["this Friday", "2026-10-09"], ["next Monday", "2026-10-12"], ["on Oct 20", "2026-10-20"], ["in 3 days", "2026-10-09"], ["in two weeks", "2026-10-20"], ["on 2026-11-02", "2026-11-02"]];
for (const [phrase, day] of DAYS) family(`day:${phrase}`, "task", (v) => ({ text: `${v} ${phrase}`, fields: { dueDate: day } }), { verbs: VERBS.slice(0, 6) });
for (const [phrase, day] of DAYS.slice(0, 3)) family(`day-first:${phrase}`, "task", (v) => ({ text: `${phrase} ${v}`, fields: { dueDate: day } }), { verbs: VERBS.slice(5, 8) });

// ── Deadlines ──
family("by-friday", "task", (v) => ({ text: `${v} by Friday`, fields: { dueDate: "2026-10-09" } }));
family("before-friday", "task", (v) => ({ text: `${v} before Friday`, fields: { dueDate: "2026-10-08" } }), { verbs: VERBS.slice(0, 4) });
family("by-date", "task", (v) => ({ text: `${v} by Oct 30`, fields: { dueDate: "2026-10-30" } }), { verbs: VERBS.slice(0, 4) });
family("due-date", "task", (v) => ({ text: `${v}, due Oct 30`, fields: { dueDate: "2026-10-30" } }), { verbs: VERBS.slice(0, 3) });
family("end-of-month", "task", (v) => ({ text: `${v} by end of this month`, fields: { dueDate: "2026-10-31" } }), { verbs: VERBS.slice(0, 4) });

// ── Times ──
family("time-pm", "task", (v) => ({ text: `${v} tomorrow at 3pm`, fields: { scheduledStart: at("2026-10-07", "15:00") } }));
family("email-day", "task", (v) => ({ text: `${v} sam@example.com on Monday`, fields: { dueDate: "2026-10-12" }, title: `${v} sam@example.com` }), { verbs: ["Email", "Ping", "Write to"] });
family("time-am", "task", (v) => ({ text: `${v} tomorrow at 9:30am`, fields: { scheduledStart: at("2026-10-07", "09:30") } }), { verbs: VERBS.slice(0, 4) });
family("time-24h", "task", (v) => ({ text: `${v} tomorrow at 14:00`, fields: { scheduledStart: at("2026-10-07", "14:00") } }), { verbs: VERBS.slice(0, 4) });
family("time-range", "task", (v) => ({ text: `${v} tomorrow 2pm to 3:30pm`, fields: { scheduledStart: at("2026-10-07", "14:00"), scheduledEnd: at("2026-10-07", "15:30") } }));
family("time-tonight", "task", (v) => ({ text: `${v} tonight at 8`, fields: { scheduledStart: at("2026-10-06", "20:00") } }), { verbs: VERBS.slice(0, 3) });
family("time-relative", "task", (v) => ({ text: `${v} in 30 minutes`, fields: { scheduledStart: at("2026-10-06", "10:30") } }), { verbs: VERBS.slice(0, 4) });

// ── Duration ──
family("duration-for", "task", (v) => ({ text: `${v} for 30 minutes`, fields: { durationMinutes: 30 } }), { verbs: VERBS.slice(0, 4) });
family("duration-takes", "task", (v) => ({ text: `${v} takes 45 minutes`, fields: { durationMinutes: 45 } }), { verbs: VERBS.slice(0, 4) });
family("duration-hm", "task", (v) => ({ text: `${v} 1h30m`, fields: { durationMinutes: 90 } }), { verbs: VERBS.slice(0, 3) });
family("duration-half", "task", (v) => ({ text: `${v} for half an hour`, fields: { durationMinutes: 30 } }), { verbs: VERBS.slice(0, 3) });

// ── Recurrence ──
family("every-weekday", "task", (v) => ({ text: `${v} every weekday`, fields: { recurrenceRule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR" } }));
family("every-monday", "task", (v) => ({ text: `${v} every Monday`, fields: { recurrenceRule: "FREQ=WEEKLY;BYDAY=MO" } }));
family("every-other", "task", (v) => ({ text: `${v} every other Tuesday`, fields: { recurrenceRule: "FREQ=WEEKLY;INTERVAL=2;BYDAY=TU" } }), { verbs: VERBS.slice(0, 4) });
family("every-n-days", "task", (v) => ({ text: `${v} every 3 days`, fields: { recurrenceRule: "FREQ=DAILY;INTERVAL=3" } }), { verbs: VERBS.slice(0, 3) });
family("monthly-15th", "task", (v) => ({ text: `${v} every month on the 15th`, fields: { recurrenceRule: "FREQ=MONTHLY;BYMONTHDAY=15" } }), { verbs: VERBS.slice(0, 3) });
family("every-until", "task", (v) => ({ text: `${v} every Monday until December 14`, fields: { recurrenceRule: "FREQ=WEEKLY;BYDAY=MO;UNTIL=20261214" } }), { verbs: VERBS.slice(0, 3) });
family("every-starting", "task", (v) => ({ text: `${v} every other Tuesday starting next week`, fields: { recurrenceRule: "FREQ=WEEKLY;INTERVAL=2;BYDAY=TU", dueDate: "2026-10-13" } }), { verbs: VERBS.slice(0, 3) });

// ── Priority, waiting, hide, reminder ──
for (const [p, n] of [["p1", 4], ["p2", 3], ["p3", 2], ["p4", 1]] as const) family(`priority:${p}`, "task", (v) => ({ text: `${v} ${p}`, fields: { priority: n } }), { verbs: VERBS.slice(0, 3) });
family("priority-words", "task", (v) => ({ text: `${v} high priority`, fields: { priority: 3 } }), { verbs: VERBS.slice(0, 3) });
family("waiting", "task", (v) => ({ text: `${v} waiting on Sam`, fields: { waitingOn: "Sam" } }), { verbs: VERBS.slice(0, 4) });
family("waiting-for", "task", (v) => ({ text: `${v} waiting for Priya`, fields: { waitingOn: "Priya" } }), { verbs: VERBS.slice(0, 3) });
family("hide-until", "task", (v) => ({ text: `${v} hide until Monday`, fields: { notBefore: "2026-10-12" } }), { verbs: VERBS.slice(0, 3) });
family("remind", "task", (v) => ({ text: `remind me tomorrow at 9am to ${v.toLowerCase()}`, fields: { reminderAt: at("2026-10-07", "09:00") }, title: v.toLowerCase() }), { verbs: VERBS.slice(0, 3) });
family("remind-before", "task", (v) => ({ text: `${v} tomorrow at 3pm, remind me 30 minutes before`, fields: { scheduledStart: at("2026-10-07", "15:00"), reminderAt: at("2026-10-07", "14:30") } }), { verbs: VERBS.slice(0, 4) });
family("remind-before-no-start", "task", (v) => ({ text: `${v} remind me 1 hour before`, fields: {}, title: `${v} remind me 1 hour before` }), { verbs: VERBS.slice(4, 7), negative: true });

// ── Destination ──
family("in-list", "task", (v) => ({ text: `${v} in Work`, fields: { projectId: WORK } }));
family("tag-cue", "task", (v) => ({ text: `${v} tag it errands`, fields: { tagIds: [ERRANDS] } }), { verbs: VERBS.slice(0, 3) });
family("tag-hash", "task", (v) => ({ text: `${v} #errands`, fields: { tagIds: [ERRANDS] } }), { verbs: VERBS.slice(0, 3) });
family("list-slash", "task", (v) => ({ text: `${v} /work`, fields: { projectId: WORK } }), { verbs: VERBS.slice(0, 3) });

// ── Combined ──
family("combined-1", "task", (v) => ({ text: `${v} tomorrow at 3pm p2 in Work`, fields: { scheduledStart: at("2026-10-07", "15:00"), priority: 3, projectId: WORK } }), { combined: true });
family("combined-2", "task", (v) => ({ text: `${v} by Friday for 30 minutes tag it errands`, fields: { dueDate: "2026-10-09", durationMinutes: 30, tagIds: [ERRANDS] } }), { combined: true });
family("combined-3", "task", (v) => ({ text: `${v} every Monday p1 in Work`, fields: { recurrenceRule: "FREQ=WEEKLY;BYDAY=MO", priority: 4, projectId: WORK } }), { combined: true });
family("combined-4", "task", (v) => ({ text: `${v} tomorrow at 2pm for an hour, due Friday`, fields: { scheduledStart: at("2026-10-07", "14:00"), dueDate: "2026-10-09", durationMinutes: 60 } }), { combined: true });
family("combined-5", "task", (v) => ({ text: `${v} waiting on Sam by Friday`, fields: { waitingOn: "Sam", dueDate: "2026-10-09" } }), { combined: true });
family("combined-6", "task", (v) => ({ text: `${v} next Monday p3 waiting on Alex`, fields: { dueDate: "2026-10-12", priority: 2, waitingOn: "Alex" } }), { combined: true });
family("correction", "task", (v) => ({ text: `${v} not Friday, Monday instead`, fields: { dueDate: "2026-10-12" } }), { combined: true });

// ── Negative, literal, ambiguous, unsupported: nothing may apply ──
const LITERAL: Array<[string, string]> = [
    ["Send monthly report", "monthly report"], ["Read the daily digest", "daily digest"], ["Friday's notes", "possessive"], ["Black Friday deals research", "compound"],
    ["Call May about the invoice", "name-may"], ["Plan the summer trip", "season"], ["Morning routine tweaks", "morning routine"], ["Expecting guests", "tag-word"],
    ["Buy milk and eggs", "and"], ["Pick up the package in the lobby", "in"], ["Read https://example.com/friday", "url"], ["Fix `tomorrow()` in the parser", "code"],
    ["Email sam@example.com the notes", "email"], ["Plan a day off", "day off"], ["Order one day passes", "one day"], ["Watch Saturday Night Live", "snl"],
    ["Write the March of the Penguins review", "march"], ["Update the weekly standup agenda", "weekly standup"], ["Check the August Wilson reading list", "august"], ["Review sunday school plan", "sunday school"],
    ["Book a table for the sunday brunch", "sunday brunch"], ["Fall cleanup in the yard", "fall"], ["Winter coat shopping", "winter"], ["Think about Heaven's Night", "heavens"],
    ["TGIF planning", "tgif"], ["Happy Friday card", "happy friday"], ["Yesterday's meeting notes", "yesterdays"], ["Buy tomatoes", "tomato"],
];
for (const [text, key] of LITERAL) add({ id: `literal:${key}`, family: `literal:${key}`, surface: "task", text, fields: {}, title: text, negative: true });
for (const quoted of ['Read "every Monday" book', 'Write "Call tomorrow" on the card', 'Title is "p1 launch"']) {
    add({ id: `quoted:${quoted}`, family: "quoted", surface: "task", text: quoted, fields: {}, title: quoted.replace(/"/g, ""), negative: true });
}
for (const text of ["Meet at 5", "Call at 7:30", "Lunch tomorrow at 2", "sometime next week", "maybe Friday", "do this thing in the next 2 days", "Finish report by Friday at 5pm", "Review draft tomorrow and send Friday", "Call Sam, due Friday at 5pm"]) {
    add({ id: `ambiguous:${text}`, family: `ambiguous:${text}`, surface: "task", text, fields: {}, title: text, negative: true });
}
// Partial: the clear part applies, the ambiguous part stays in the title.
add({ id: "partial:two-dates", family: "partial:two-dates", surface: "task", text: "Review draft tomorrow and send Friday", fields: {}, title: "Review draft tomorrow and send Friday", negative: true });
for (const text of ["Water the plants", "Call mom", "Plan Q4 goals", "Clean desk", "Book flights", "Draft the proposal", "Back up laptop", "Sort photos"]) {
    add({ id: `plain:${text}`, family: "plain", surface: "task", text, fields: {}, title: text, negative: true });
}

// ── Routines: a cadence and a time of day, no day ──
const ACTIVITIES = ["Stretch", "Meditate", "Read", "Journal", "Walk the dog", "Practice piano", "Floss", "Take vitamins", "Review budget", "Water plants", "Call Mom", "Tidy desk", "Plan the day", "Foam roll", "Write morning pages"];
const CADENCES: Array<[string, string, string?]> = [
    ["every weekday at 7am", "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", "07:00"], ["every day at 6:30am", "FREQ=DAILY", "06:30"], ["every day at 9pm", "FREQ=DAILY", "21:00"],
    ["every Monday and Wednesday and Friday", "FREQ=WEEKLY;BYDAY=MO,WE,FR"], ["every weekend", "FREQ=WEEKLY;BYDAY=SA,SU"], ["every other Tuesday", "FREQ=WEEKLY;INTERVAL=2;BYDAY=TU"],
];
ACTIVITIES.forEach((activity, i) => CADENCES.forEach(([phrase, rule, time]) =>
    add({ id: `routine:${activity}:${phrase}`, family: `routine:${i}`, surface: "routine", text: `${activity} ${phrase}`, fields: { recurrenceRule: rule, ...(time && { timeOfDay: time }) }, title: activity })));
add({ id: "routine:monthly-1st", family: "routine:x1", surface: "routine", text: "Review budget every month on the 1st", fields: { recurrenceRule: "FREQ=MONTHLY;BYMONTHDAY=1" }, title: "Review budget" });
add({ id: "routine:in-list", family: "routine:x2", surface: "routine", text: "Floss every day at 10pm in Work", fields: { recurrenceRule: "FREQ=DAILY", timeOfDay: "22:00", projectId: WORK }, title: "Floss" });
add({ id: "routine:tag", family: "routine:x3", surface: "routine", text: "Take vitamins every day at 8am tag it errands", fields: { recurrenceRule: "FREQ=DAILY", timeOfDay: "08:00", tagIds: [ERRANDS] }, title: "Take vitamins" });
for (const text of ["Stretch tomorrow at 7am", "Read monthly report", "Call Sam on Friday", "Morning routine", "Stretch some day", "Clean desk", "Practice piano", "Pray at sunrise", "Evening walk", "Daily digest review"]) {
    add({ id: `routine-neg:${text}`, family: `routine-neg:${text}`, surface: "routine", text, fields: {}, title: text, negative: true });
}

// ── Yearly events: a month and a day, nothing else ──
const NAMES = ["Mom's birthday", "Dad's birthday", "Anniversary", "Launch day", "Retreat", "Graduation anniversary", "Sam's birthday", "Book club kickoff", "Team offsite", "Garden planting day", "Memorial service", "Reunion"];
const DATES: Array<[string, string]> = [["May 12", "-05-12"], ["on June 3", "-06-03"], ["Aug 20", "-08-20"], ["Feb 29", "-02-29"], ["Nov 3", "-11-03"], ["on Dec 1", "-12-01"], ["July 9", "-07-09"], ["March 30", "-03-30"]];
NAMES.forEach((name, i) => DATES.forEach(([phrase, suffix]) =>
    add({ id: `event:${name}:${phrase}`, family: `event:${i}`, surface: "event", text: `${name} ${phrase}`, fields: { dueDate: suffix }, title: name })));
const UNFIT = ["Dinner Friday 7pm", "Launch May 12, 2027", "Call Sam tomorrow at 3pm", "Book club Nov 5 at 6pm", "Concert June 5 2027", "Lunch tomorrow at noon", "Standup every Monday", "Pay rent p1", "Dentist in Work", "Party on 2027-06-01", "Sync Monday 9am", "Flight Oct 20 at 6am"];
for (const text of UNFIT) add({ id: `event-neg:${text}`, family: `event-neg:${text}`, surface: "event", text, fields: {}, title: text, negative: true });
for (const text of ["Birthday party", "Reunion", "Garden day", "Retreat"]) add({ id: `event-plain:${text}`, family: `event-plain:${text}`, surface: "event", text, fields: {}, title: text });

/** A family is wholly dev or wholly held-out; roughly a third of families are held out. */
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
export const CORPUS: Case[] = cases.map((c) => ({ ...c, split: hash(c.family) % 3 === 0 ? "held-out" : "dev" }));
