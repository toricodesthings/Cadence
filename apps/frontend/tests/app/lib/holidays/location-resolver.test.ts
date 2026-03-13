import { describe, expect, it } from "vitest";
import {
    findSubdivisionCode,
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
    });

    it("matches subdivisions using labels and aliases", () => {
        expect(findSubdivisionCode(
            [
                { code: "US-CA", label: "California" },
                { code: "US-NY", label: "New York" },
            ],
            { countryCode: "US", subdivisionName: "CA" },
        )).toBe("US-CA");

        expect(findSubdivisionCode(
            [{ code: "CA-QC", label: "Quebec" }],
            { countryCode: "CA", subdivisionName: "Québec" },
        )).toBe("CA-QC");
    });
});
