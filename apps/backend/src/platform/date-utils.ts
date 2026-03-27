/**
 * Date utilities for Cloudflare Workers.
 *
 * IMPORTANT: Workers always run in UTC — never use `date.getFullYear()` /
 * `toISOString().substring(0, 10)` when you need the user's local date.
 * Always accept a timezone string from the client and use these helpers.
 */

/**
 * Return the `YYYY-MM-DD` date string for a given moment in a specific IANA
 * timezone. Uses `Intl.DateTimeFormat` with the `en-CA` locale, which
 * produces the ISO-style `YYYY-MM-DD` format directly.
 *
 * @param date     - The instant to convert (defaults to now)
 * @param timezone - IANA timezone identifier, e.g. "America/New_York"
 */
export function toLocalDateStr(date: Date = new Date(), timezone = "UTC"): string {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(date);
}

/**
 * Return the `YYYY-MM-DD` date string for the day that is `offsetDays` before
 * or after the given moment in the specified timezone.
 *
 * @param offsetDays - Positive = future, negative = past (default: 0)
 */
export function offsetLocalDateStr(offsetDays: number, date: Date = new Date(), timezone = "UTC"): string {
    const offset = offsetDays * 24 * 60 * 60 * 1000;
    return toLocalDateStr(new Date(date.getTime() + offset), timezone);
}
