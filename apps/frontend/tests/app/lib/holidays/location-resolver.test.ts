import { describe, expect, it } from "vitest";
import {
    findSubdivisionCode,
    getCountryLabel,
    getLocaleRegion,
    inferCountryFromTimezone,
} from "../../../../app/lib/holidays/location-resolver";

describe("holiday location resolver", () => {
    it("extracts the region from a browser locale", () => {
        expect(getLocaleRegion("en-US")).toBe("US");
        expect(getLocaleRegion("fr_CA")).toBe("CA");
    });

    it("infers a broad country from common timezones", () => {
        expect(inferCountryFromTimezone("America/New_York")).toBe("US");
        expect(inferCountryFromTimezone("America/Toronto")).toBe("CA");
        expect(inferCountryFromTimezone("Europe/Berlin")).toBe("DE");
        expect(inferCountryFromTimezone("America/Indiana/Knox")).toBe("US");
        expect(inferCountryFromTimezone("America/Argentina/Cordoba")).toBe("AR");
    });

    it("no longer assumes every American time zone is the US", () => {
        expect(inferCountryFromTimezone("America/Mexico_City")).toBe("MX");
        expect(inferCountryFromTimezone("America/Sao_Paulo")).toBe("BR");
        expect(inferCountryFromTimezone("America/La_Paz")).toBeNull();
        expect(inferCountryFromTimezone("Etc/GMT-10")).toBeNull();
    });

    it("matches subdivisions using labels and aliases", () => {
        expect(findSubdivisionCode(
            [
                { code: "US-CA", label: "California" },
                { code: "US-NY", label: "New York" },
            ],
            { subdivisionName: "CA" },
        )).toBe("US-CA");

        expect(findSubdivisionCode(
            [{ code: "CA-QC", label: "Quebec" }],
            { subdivisionName: "Québec" },
        )).toBe("CA-QC");
    });

    it("prefers an ISO subdivision code when the provider lists it", () => {
        expect(findSubdivisionCode(
            [{ code: "CA-ON", label: "Ontario" }],
            { subdivisionCode: "ca-on", subdivisionName: "Somewhere else" },
        )).toBe("CA-ON");

        expect(findSubdivisionCode(
            [{ code: "GB-SCT", label: "Scotland" }],
            { subdivisionCode: "GB-ENG", subdivisionName: "Scotland" },
        )).toBe("GB-SCT");
    });

    it("names countries without a network call", () => {
        expect(getCountryLabel("CA", "en-US")).toBe("Canada");
        expect(getCountryLabel(null, "en-US")).toBeNull();
    });
});
