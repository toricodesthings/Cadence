/**
 * Typed-fast and dictated date words, rewritten to what chrono reads before the date pass ("tmrw" → "tomorrow",
 * "five pm" → "5 pm"), with a map back to the person's own characters. A date read through a shortcut counts,
 * at one step less confidence (never "high"); a dictated time is full words, so it keeps its confidence.
 * "tom" is left alone on purpose: it is also a name ("Email tom the notes").
 */

const WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};
const HOUR = `(${Object.keys(WORDS).join("|")}|\\d{1,2})`;
const hourOf = (word: string) => WORDS[word.toLowerCase()] ?? Number(word);
const MINUTES: Record<string, string> = { fifteen: "15", thirty: "30", "forty five": "45", "forty-five": "45", fortyfive: "45" };
/** An hour word with optional spoken minutes: "seven", "seven thirty", "ten forty-five". */
const SPOKEN = `(${Object.keys(WORDS).join("|")})(?:\\s+(fifteen|thirty|forty[\\s-]?five))?`;
const spokenTime = (m: RegExpExecArray) => {
  const minutes = m[2] ? MINUTES[m[2].toLowerCase().replace(/\s+/, " ")] : null;
  return minutes ? `${hourOf(m[1])}:${minutes}` : String(hourOf(m[1]));
};

interface Rule {
  re: RegExp;
  to: (m: RegExpExecArray) => string;
  shortcut: boolean;
}

const RULES: Rule[] = [
  // Tomorrow, abbreviated or misspelled.
  { re: /\b(?:tmrw?|tmw|tmro|2moro+w?|2morrow|2mrw|tommorr?ow|tomorow|tomoro)\b/gi, to: () => "tomorrow", shortcut: true },
  // Weekday shortcuts chrono doesn't know ("tues", "weds", "thurs").
  { re: /\btues\b/gi, to: () => "tuesday", shortcut: true },
  { re: /\bweds\b/gi, to: () => "wednesday", shortcut: true },
  { re: /\bthurs?\b/gi, to: () => "thursday", shortcut: true },
  { re: /\btdy\b/gi, to: () => "today", shortcut: true },
  // "by eod": the end of today is a day; "eom": the end of this month.
  { re: /\beod\b/gi, to: () => "today", shortcut: true },
  { re: /\beom\b/gi, to: () => "end of this month", shortcut: true },
  { re: /\bnxt\b/gi, to: () => "next", shortcut: true },
  { re: /\bwks?\b/gi, to: (m) => (m[0].length > 2 ? "weeks" : "week"), shortcut: true },
  { re: /\bwknd\b/gi, to: () => "weekend", shortcut: true },
  // Dictated times: "half past three", "quarter to four", "five pm", "at five", "five o'clock".
  { re: new RegExp(`\\bhalf\\s+past\\s+${HOUR}\\b`, "gi"), to: (m) => `${hourOf(m[1])}:30`, shortcut: false },
  { re: new RegExp(`\\bquarter\\s+past\\s+${HOUR}\\b`, "gi"), to: (m) => `${hourOf(m[1])}:15`, shortcut: false },
  { re: new RegExp(`\\bquarter\\s+to\\s+${HOUR}\\b`, "gi"), to: (m) => `${(hourOf(m[1]) + 10) % 12 + 1}:45`, shortcut: false },
  { re: new RegExp(`\\b${HOUR}\\s+o'?clock\\b`, "gi"), to: (m) => `${hourOf(m[1])}:00`, shortcut: false },
  // "five pm", "seven thirty pm", "at five", "at ten fifteen".
  { re: new RegExp(`\\b${SPOKEN}(?=\\s*(?:a\\.?m\\.?|p\\.?m\\.?)(?:\\W|$))`, "gi"), to: spokenTime, shortcut: false },
  { re: new RegExp(`(?<=\\bat\\s+)${SPOKEN}\\b`, "gi"), to: spokenTime, shortcut: false },
];

/** Abbreviated weekdays chrono reads itself ("fri", "next tues"): a shortcut too. */
const WEEKDAY_SHORT = /\b(?:mon|tues?|weds?|thur?s?|fri|sat|sun)\b/i;

interface Swap {
  from: { start: number; end: number };
  to: { start: number; end: number };
  shortcut: boolean;
}

export interface Expanded {
  text: string;
  /** Original start of an expanded position (a rewritten word maps to its own start). */
  start: (at: number) => number;
  /** Original end of an expanded position (a rewritten word maps to its own end). */
  end: (at: number) => number;
  /** Whether an original span was read through a shortcut. */
  shortcut: (span: { start: number; end: number }, text: string) => boolean;
}

export function expandShortcuts(input: string): Expanded {
  const found: Array<{ start: number; end: number; to: string; shortcut: boolean }> = [];
  for (const rule of RULES) {
    for (const m of input.matchAll(rule.re)) {
      const start = m.index ?? 0;
      const end = start + m[0].length;
      if (found.some((f) => start < f.end && end > f.start)) continue;
      found.push({ start, end, to: rule.to(m as RegExpExecArray), shortcut: rule.shortcut });
    }
  }
  found.sort((a, b) => a.start - b.start);

  const swaps: Swap[] = [];
  let text = "";
  let at = 0;
  for (const f of found) {
    text += input.slice(at, f.start);
    swaps.push({ from: { start: f.start, end: f.end }, to: { start: text.length, end: text.length + f.to.length }, shortcut: f.shortcut });
    text += f.to;
    at = f.end;
  }
  text += input.slice(at);

  /** Shift by every swap before `pos`; a position inside a swap snaps to that swap's edge. */
  const map = (pos: number, edge: "start" | "end") => {
    let delta = 0;
    for (const s of swaps) {
      if (pos <= s.to.start) break;
      if (pos < s.to.end) return edge === "start" ? s.from.start : s.from.end;
      delta = s.from.end - s.to.end;
    }
    return pos + delta;
  };

  return {
    text,
    start: (pos) => map(pos, "start"),
    end: (pos) => map(pos, "end"),
    shortcut: (span, original) =>
      swaps.some((s) => s.shortcut && span.start < s.from.end && span.end > s.from.start) || WEEKDAY_SHORT.test(original.slice(span.start, span.end)),
  };
}
