/**
 * Prompt-injection defense primitives (PURE — no I/O).
 *
 * The agent reads untrusted text from many surfaces (user messages, task
 * titles/notes, inbox captures, custom instructions, retrieved memories). All of
 * it is DATA, never commands. These helpers implement the data-marking /
 * spotlighting defense from docs/ai_upgrade/09 §2.2 and 03 §3:
 *
 *  - Wrap untrusted content in a fence whose token carries a per-request random
 *    nonce. Because an attacker cannot predict the nonce, they cannot forge a
 *    "closing fence + new system block" inside the data they control.
 *  - Strip the nonce/fence markers out of untrusted content BEFORE fencing so the
 *    live token can never be smuggled in.
 *  - Strip the nonce out of model OUTPUT before persistence/render so the model
 *    echoing it cannot leak the live token.
 *  - Detect (but never echo) obvious injection lead-ins for low-cardinality
 *    logging only.
 *
 * Everything here is deterministic and bounded; the only entropy source is
 * `makeFenceNonce`, which uses Web Crypto (Edge-safe — no node:crypto).
 */

/** Number of random bytes backing a fence nonce (→ 32 hex chars). */
const NONCE_BYTES = 16;

/** Hard cap on sanitized text length so one field cannot blow the prompt budget. */
const MAX_SANITIZED_CHARS = 16_000;

/**
 * Generate a per-request, unpredictable fence nonce as lowercase hex.
 *
 * Uses `crypto.getRandomValues` (Web Crypto) so it is safe on Cloudflare Workers
 * and any Edge runtime — never node:crypto.
 */
export function makeFenceNonce(): string {
    const bytes = new Uint8Array(NONCE_BYTES);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Wrap content in a nonce-bearing data fence. The model is instructed (in the
 * Base `safety` block) to treat everything between these markers as data.
 *
 *   <<<CADENCE_DATA_{nonce} kind="{kind}" trust="{trust}">>>
 *   {content}
 *   <<<END_CADENCE_DATA_{nonce}>>>
 *
 * Untrusted content should already be passed through `sanitizeUntrusted` (with
 * the same nonce) so it cannot contain the live token.
 */
export function fenceData(args: {
    nonce: string;
    kind: string;
    trust: "untrusted" | "trusted";
    content: string;
}): string {
    const { nonce, kind, trust, content } = args;
    return (
        `<<<CADENCE_DATA_${nonce} kind="${kind}" trust="${trust}">>>\n` +
        `${content}\n` +
        `<<<END_CADENCE_DATA_${nonce}>>>`
    );
}

/** Matches control chars except \n (\x0A) and \t (\x09). */
const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

/**
 * Injection lead-ins. We do NOT delete these (a blocklist is brittle and removing
 * text can change meaning); we neutralize by inserting a zero-width-free marker
 * that breaks the imperative phrasing while keeping the content human-readable and
 * visibly inert. Labels here mirror `detectInjectionSignal`.
 */
const INJECTION_LEAD_INS: Array<{ pattern: RegExp; label: string }> = [
    { pattern: /ignore\s+(?:all\s+|any\s+)?(?:previous|prior|above|earlier)\s+instructions?/gi, label: "ignore_previous" },
    { pattern: /disregard\s+(?:all\s+|any\s+)?(?:previous|prior|above|earlier)\s+(?:instructions?|rules?)/gi, label: "ignore_previous" },
    { pattern: /forget\s+(?:everything|all|your)\s+(?:above|previous|prior|instructions?)/gi, label: "ignore_previous" },
    { pattern: /you\s+are\s+now\s+(?:a|an|the)\b/gi, label: "role_override" },
    { pattern: /(?:^|\n)\s*system\s*:/gi, label: "role_override" },
    { pattern: /(?:reveal|print|show|repeat|output)\s+(?:your\s+|the\s+)?(?:system\s+)?(?:prompt|instructions?)/gi, label: "reveal_prompt" },
    { pattern: /(?:new|updated|override)\s+(?:system\s+)?(?:rules?|instructions?)/gi, label: "role_override" },
];

/** Escape a literal string for use inside a RegExp. */
function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Neutralize untrusted text before it is placed inside a data fence. Deterministic
 * and bounded. In order:
 *
 *  1. Strip any occurrence of the live nonce and the `CADENCE_DATA` fence markers
 *     so the content cannot smuggle the real fence token (fence-spoofing defense).
 *  2. Strip control characters (keep \n and \t).
 *  3. Neutralize obvious injection lead-ins by FRAMING — inserting a visible
 *     `[neutralized]` break inside the imperative phrase — rather than deleting
 *     content. The model is told fenced text is data regardless; this is
 *     defense-in-depth, not the primary guarantee.
 *  4. Truncate to a hard length cap.
 */
export function sanitizeUntrusted(text: string, nonce: string): string {
    let cleaned = stripNonce(text, nonce);

    cleaned = cleaned.replace(CONTROL_CHARS, "");

    for (const { pattern } of INJECTION_LEAD_INS) {
        cleaned = cleaned.replace(pattern, (match) => `${match.slice(0, 1)}[neutralized]${match.slice(1)}`);
    }

    if (cleaned.length > MAX_SANITIZED_CHARS) {
        cleaned = cleaned.slice(0, MAX_SANITIZED_CHARS);
    }
    return cleaned;
}

/**
 * Remove the live nonce and any `CADENCE_DATA` fence markers from a string. Used
 * both to clean untrusted INPUT (via `sanitizeUntrusted`) and to clean model
 * OUTPUT before persistence/render (defense against the model echoing the nonce).
 */
export function stripNonce(text: string, nonce: string): string {
    let result = text;
    if (nonce) {
        const noncePart = escapeRegExp(nonce);
        // Always strip full fence tokens carrying the nonce.
        result = result.replace(new RegExp(`<<<\\s*(?:END_)?CADENCE_DATA_${noncePart}[^>]*>>>`, "gi"), "");
        // Only strip a BARE nonce remnant when the nonce is long enough to be a
        // real token — a short value (e.g. a 1-char test stub) would over-match
        // ordinary letters. Real nonces are 32 hex chars (see makeFenceNonce).
        if (nonce.length >= 8) {
            result = result.replace(new RegExp(noncePart, "g"), "");
        }
    }
    // Also drop any generic fence markers (with or without a nonce) so untrusted
    // content cannot fabricate even a nonce-less fence that confuses parsing.
    result = result.replace(/<<<\s*(?:END_)?CADENCE_DATA[^>]*>>>/gi, "");
    return result;
}

/**
 * Heuristic injection detector. Returns a stable, LOW-CARDINALITY signal label
 * for `prompt_injection_suspected` logging, or null. NEVER returns the offending
 * text. Order-independent: the first matching pattern's label wins, plus an
 * explicit fence-spoof check.
 */
export function detectInjectionSignal(text: string): string | null {
    if (/<<<\s*(?:END_)?CADENCE_DATA/i.test(text)) {
        return "fence_spoof";
    }
    for (const { pattern, label } of INJECTION_LEAD_INS) {
        // Reset lastIndex — these patterns are declared with the global flag.
        pattern.lastIndex = 0;
        if (pattern.test(text)) {
            return label;
        }
    }
    return null;
}
