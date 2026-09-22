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

/** The client's IANA zone if the runtime recognizes it, otherwise "UTC". */
export function resolveTimeZone(timezone: string | undefined): string {
    if (!timezone) return "UTC";
    try {
        new Intl.DateTimeFormat("en-US", { timeZone: timezone });
        return timezone;
    } catch {
        return "UTC";
    }
}

/** Minutes east of UTC that `timezone` is at `date` (DST-aware). */
function utcOffsetMinutes(date: Date, timezone: string): number {
    const parts = Object.fromEntries(
        new Intl.DateTimeFormat("en-US", {
            timeZone: timezone,
            hourCycle: "h23",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
        })
            .formatToParts(date)
            .map((p) => [p.type, p.value]),
    );
    const wallClockAsUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
    return Math.round((wallClockAsUtc - Math.floor(date.getTime() / 1000) * 1000) / 60_000);
}

/**
 * The instant written as the user's wall clock with its offset, e.g.
 * "2026-09-21T22:30:00-04:00". Same instant as the UTC form, but a reader (or a
 * model) sees the local time and date directly instead of converting.
 */
export function toZonedIso(date: Date, timezone: string): string {
    const offset = utcOffsetMinutes(date, timezone);
    const wallClock = new Date(date.getTime() + offset * 60_000).toISOString().slice(0, 19);
    const abs = Math.abs(offset);
    const sign = offset < 0 ? "-" : "+";
    return `${wallClock}${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}

/** Shift a `YYYY-MM-DD` date by whole days (calendar arithmetic, zone-free). */
export function addDaysToDateStr(date: string, days: number): string {
    const d = new Date(`${date}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}
