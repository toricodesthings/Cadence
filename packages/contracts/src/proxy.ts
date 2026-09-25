import { z } from "zod";

// ── Queries ──

export const coordsQuerySchema = z.object({
    latitude: z.coerce.number().min(-90).max(90),
    longitude: z.coerce.number().min(-180).max(180),
});

export const geocodeSearchQuerySchema = z.object({
    name: z.string().trim().min(2).max(80),
    locale: z.string().min(2).max(10).default("en"),
});

export const holidayCountriesQuerySchema = z.object({
    locale: z.string().min(2).max(10).default("en"),
});

export const holidaySubdivisionsQuerySchema = z.object({
    countryCode: z.string().min(2).max(3),
    year: z.coerce.number().int().min(2000).max(2100),
    locale: z.string().min(2).max(10).default("en"),
});

export const holidaysQuerySchema = z.object({
    countryCode: z.string().min(2).max(3),
    start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    subdivisionCode: z.string().max(10).optional(),
    locale: z.string().min(2).max(10).default("en"),
});

// ── Responses ──

export const coordinatesSchema = z.object({ latitude: z.number(), longitude: z.number() });
export type Coordinates = z.infer<typeof coordinatesSchema>;

/** GET /proxy/weather: current conditions in Celsius, `weatherCode` is WMO. */
export const weatherReadingSchema = z.object({ temperature: z.number(), weatherCode: z.number() });
export type WeatherReading = z.infer<typeof weatherReadingSchema>;

/** GET /proxy/geocode/reverse: the region a point falls in. */
export const regionInfoSchema = z.object({
    countryCode: z.string().nullable(),
    subdivisionCode: z.string().nullable(),
    subdivisionName: z.string().nullable(),
});
export type RegionInfo = z.infer<typeof regionInfoSchema>;

/** GET /proxy/geo/approximate: city-level place from the request's IP. */
export const approximatePlaceSchema = regionInfoSchema.extend({
    city: z.string().nullable(),
    coordinates: coordinatesSchema.nullable(),
});
export type ApproximatePlace = z.infer<typeof approximatePlaceSchema>;

/** GET /proxy/geocode/search: one match for the city picker. */
export const cityResultSchema = coordinatesSchema.extend({
    name: z.string(),
    region: z.string().nullable(),
    country: z.string().nullable(),
    countryCode: z.string().nullable(),
});
export type CityResult = z.infer<typeof cityResultSchema>;

/** GET /proxy/holidays/countries and /holidays/subdivisions. */
export const holidayOptionSchema = z.object({ code: z.string(), label: z.string() });
export type HolidayCountryOption = z.infer<typeof holidayOptionSchema>;
export type HolidaySubdivisionOption = z.infer<typeof holidayOptionSchema>;

/** GET /proxy/holidays. */
export const holidayRecordSchema = z.object({
    date: z.string(),
    name: z.string(),
    localName: z.string().optional(),
    countryCode: z.string(),
    subdivisionCode: z.string().nullable(),
    isRegional: z.boolean(),
});
export type HolidayRecord = z.infer<typeof holidayRecordSchema>;
