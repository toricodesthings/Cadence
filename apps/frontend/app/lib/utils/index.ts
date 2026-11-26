import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export function chunk<T>(items: T[], size: number): T[][] {
    const runs: T[][] = [];
    for (let i = 0; i < items.length; i += size) runs.push(items.slice(i, i + size));
    return runs;
}
