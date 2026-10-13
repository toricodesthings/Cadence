import { describe, expect, it } from "vitest";
import { suggestApps, type AppDescriptor } from "@cadence/nlp/app-suggestions";

const APPS: AppDescriptor[] = [
    { id: "gmail", category: "email", names: ["Gmail", "Google Mail"] },
    { id: "google-calendar", category: "calendar", names: ["Google Calendar", "GCal"] },
    { id: "myfitnesspal", category: "food", names: ["MyFitnessPal", "MFP"] },
    { id: "outlook", category: "email", names: ["Outlook"] },
    { id: "spotify", category: "music", names: ["Spotify"] },
];
const ids = (title: string) => suggestApps(title, APPS)?.ids ?? null;

describe("suggestApps", () => {
    it.each([
        ["Check emails", ["gmail", "outlook"]],
        ["Check my inbox", ["gmail", "outlook"]],
        ["Check Gmail", ["gmail"]],
        ["Log calories", ["myfitnesspal"]],
        ["Track meals", ["myfitnesspal"]],
        ["Listen to music", ["spotify"]],
        ["Review my calendar", ["google-calendar"]],
        ["Open MFP", ["myfitnesspal"]],
    ])("%s", (title, expected) => expect(ids(title)).toEqual(expected));

    it.each([
        "Buy stamps to mail a parcel",
        "Email marketing research",
        "Don't check email tonight",
        "Morning routine",
        "Compare Gmail and Outlook",
        "Check email and log calories",
        "Gmail or Spotify",
        "",
    ])("abstains on %j", (title) => expect(ids(title)).toBeNull());

    it("says how it matched", () => {
        expect(suggestApps("Check Gmail", APPS)?.basis).toBe("named");
        expect(suggestApps("Check emails", APPS)?.basis).toBe("category");
    });

    it("only offers what it was given", () => expect(suggestApps("Check emails", [APPS[2]])).toBeNull());
});
