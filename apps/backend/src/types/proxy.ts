import { z } from "zod";

export const weatherQuerySchema = z.object({
    latitude: z.coerce.number().min(-90).max(90),
    longitude: z.coerce.number().min(-180).max(180),
});

export const reverseGeocodeQuerySchema = z.object({
    latitude: z.coerce.number().min(-90).max(90),
    longitude: z.coerce.number().min(-180).max(180),
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
