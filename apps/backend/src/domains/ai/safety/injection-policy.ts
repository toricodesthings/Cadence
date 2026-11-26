const NONCE_BYTES = 16;

const MAX_SANITIZED_CHARS = 16_000;

export function makeFenceNonce(): string {
    const bytes = new Uint8Array(NONCE_BYTES);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

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

// oxlint-disable-next-line no-control-regex -- stripping control chars is the point
const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

const INJECTION_LEAD_INS: Array<{ pattern: RegExp; label: string }> = [
    {
        pattern: /ignore\s+(?:all\s+|any\s+)?(?:previous|prior|above|earlier)\s+instructions?/gi,
        label: "ignore_previous",
    },
    {
        pattern: /disregard\s+(?:all\s+|any\s+)?(?:previous|prior|above|earlier)\s+(?:instructions?|rules?)/gi,
        label: "ignore_previous",
    },
    {
        pattern: /forget\s+(?:everything|all|your)\s+(?:above|previous|prior|instructions?)/gi,
        label: "ignore_previous",
    },
    { pattern: /you\s+are\s+now\s+(?:a|an|the)\b/gi, label: "role_override" },
    { pattern: /(?:^|\n)\s*system\s*:/gi, label: "role_override" },
    {
        pattern: /(?:reveal|print|show|repeat|output)\s+(?:your\s+|the\s+)?(?:system\s+)?(?:prompt|instructions?)/gi,
        label: "reveal_prompt",
    },
    { pattern: /(?:new|updated|override)\s+(?:system\s+)?(?:rules?|instructions?)/gi, label: "role_override" },
];

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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

export function stripNonce(text: string, nonce: string): string {
    let result = text;
    if (nonce) {
        const noncePart = escapeRegExp(nonce);
        result = result.replace(new RegExp(`<<<\\s*(?:END_)?CADENCE_DATA_${noncePart}[^>]*>>>`, "gi"), "");
        if (nonce.length >= 8) {
            result = result.split(nonce).join("");
        }
    }
    result = result.replace(/<<<\s*(?:END_)?CADENCE_DATA[^>]*>>>/gi, "");
    return result;
}

export function detectInjectionSignal(text: string): string | null {
    if (/<<<\s*(?:END_)?CADENCE_DATA/i.test(text)) {
        return "fence_spoof";
    }
    for (const { pattern, label } of INJECTION_LEAD_INS) {
        pattern.lastIndex = 0;
        if (pattern.test(text)) {
            return label;
        }
    }
    return null;
}
