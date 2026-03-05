const GREETINGS: Record<string, string[]> = {
    morning: [
        "Good morning",
        "Rise and shine",
        "A new day awaits",
        "Morning glow",
        "Fresh start",
    ],
    afternoon: [
        "Good afternoon",
        "Afternoon light",
        "The day rolls on",
        "Steady pace",
        "Sun's still up",
    ],
    evening: [
        "Good evening",
        "Evening calm",
        "Winding down",
        "Twilight hour",
        "The night is young",
    ],
    night: [
        "Good night",
        "Quiet hours",
        "Night owl mode",
        "Stars are out",
        "Moonlit focus",
    ],
};

function pickRandom(arr: string[]): string {
    return arr[Math.floor(Math.random() * arr.length)];
}

export function getTimeBasedGreeting(): string {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return pickRandom(GREETINGS.morning);
    if (hour >= 12 && hour < 18) return pickRandom(GREETINGS.afternoon);
    if (hour >= 18 && hour < 22) return pickRandom(GREETINGS.evening);
    return pickRandom(GREETINGS.night);
}
