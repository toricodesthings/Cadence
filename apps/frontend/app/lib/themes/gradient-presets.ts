/**
 * Curated gradient preset definitions for custom backgrounds.
 */

export interface GradientPreset {
    id: string;
    name: string;
    color1: string;
    color2: string;
    direction: 0 | 45 | 90 | 135 | 180 | 225 | 270 | 315;
    mood: string;
}

export const GRADIENT_PRESETS: GradientPreset[] = [
    {
        id: "midnight",
        name: "Midnight",
        color1: "#0f1d32",
        color2: "#1a1030",
        direction: 180,
        mood: "Deep navy-to-plum — classic dark atmosphere",
    },
    {
        id: "ocean",
        name: "Ocean",
        color1: "#0a2540",
        color2: "#0f3052",
        direction: 135,
        mood: "Deep teal depth — calm and focused",
    },
    {
        id: "sunset",
        name: "Sunset",
        color1: "#2d1025",
        color2: "#1a1030",
        direction: 180,
        mood: "Warm burgundy-to-plum — evening warmth",
    },
    {
        id: "forest",
        name: "Forest",
        color1: "#0a2018",
        color2: "#0f2510",
        direction: 180,
        mood: "Deep green canopy — natural and grounding",
    },
    {
        id: "plum",
        name: "Plum",
        color1: "#2d1f4e",
        color2: "#1a0f2e",
        direction: 180,
        mood: "Rich purple depth — creative and mysterious",
    },
    {
        id: "storm",
        name: "Storm",
        color1: "#1a1a2e",
        color2: "#2d2d3f",
        direction: 135,
        mood: "Cool gray-blue — modern and neutral",
    },
    {
        id: "ember",
        name: "Ember",
        color1: "#2d1010",
        color2: "#1a0a08",
        direction: 180,
        mood: "Deep red warmth — intense focus",
    },
    {
        id: "dusk",
        name: "Dusk",
        color1: "#1a2030",
        color2: "#2d1f25",
        direction: 135,
        mood: "Navy-to-mauve — transition and reflection",
    },
];
