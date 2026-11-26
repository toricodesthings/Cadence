import { dayOf, wallTimeOf } from "@cadence/domain/time";
import { getUserZone } from "../utils/user-zone";

export const GREETINGS = {
    morning: [
        ["Good morning, {name}", "Good morning"],
        ["One thing at a time, {name}", "One thing at a time"],
        ["A fresh page today, {name}", "A fresh page today"],
    ],
    afternoon: [
        ["Good afternoon, {name}", "Good afternoon"],
        ["Steady as you go, {name}", "Steady as you go"],
        ["Small steps count, {name}", "Small steps count"],
    ],
    evening: [
        ["Good evening, {name}", "Good evening"],
        ["Ease into the evening, {name}", "Ease into the evening"],
        ["The day's winding down, {name}", "The day's winding down"],
    ],
    night: [
        ["Quiet hours, {name}", "Quiet hours"],
        ["Hi {name}", "Hi there"],
        ["The world's gone quiet, {name}", "The world's gone quiet"],
    ],
} as const;

export type DayPeriod = keyof typeof GREETINGS;

export function dayPeriodOf(now: Date = new Date()): DayPeriod {
    const hour = Number(wallTimeOf(now, getUserZone()).slice(0, 2));
    return hour >= 5 && hour < 12
        ? "morning"
        : hour >= 12 && hour < 17
          ? "afternoon"
          : hour >= 17 && hour < 22
            ? "evening"
            : "night";
}

export function getTimeBasedGreeting(now: Date = new Date(), name?: string): string {
    const zone = getUserZone();
    const period = dayPeriodOf(now);
    const options = GREETINGS[period];
    const [named, bare] = options[Number(dayOf(now, zone).replaceAll("-", "")) % options.length];
    return name ? named.replace("{name}", name) : bare;
}
