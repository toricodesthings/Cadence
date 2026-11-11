import type { BoughSpec } from "~/lib/branch";
import type { Pt } from "~/lib/geometry";

import type { FoliageKind } from "./Foliage";

/* The journey bough's authored segments (see BoughSegment): plain data, cheap enough to ship. */

export const W = 1000;
/** Every segment is timed on this clock; journey.css maps it onto the section's scroll. */
export const CLOCK = 2000;
/** A chapter is one screen: words beside a panel, the bough between. */
const CHAPTER_H = 640;

/** Chapter keys are drawn on a 900-unit box and fitted to the chapter's height; 0 and 900 land exactly on the joints. */
const fit = (keys: readonly Pt[]): Pt[] => keys.map(([x, y]) => [x, Math.round((y * CHAPTER_H) / 900)] as const);

type SegmentSpec = Pick<
  BoughSpec,
  "id" | "seed" | "keys" | "w0" | "wEnd" | "forks" | "joint" | "bloomShare" | "clusterSize"
> & {
  /** viewBox height; the section's aspect is 1000 / h. */
  h: number;
};

/**
 * A chapter's forks, by the side its words take (1 turns off the falling limb to the left, -1 to the right).
 * The words hold x 0–444 (or 556–1000) over y ≈ 170–500, so the long gestures reach the panel's side, where
 * they show above its top and pass behind it; on the words' side only a short twig above them and a strand
 * weeping below them, and nothing crosses a line of text.
 */
const chapterForks = (words: 1 | -1, lean = 0): BoughSpec["forks"] => {
  const panel = -words as 1 | -1;
  return [
    {
      t: 0.15, side: panel, angle: 74 + lean, len: 0.3,
      forks: [{ t: 0.45, side: words, len: 0.4 }, { t: 0.75, side: panel, len: 0.35 }],
    },
    { t: 0.11, side: words, angle: 66, len: 0.1, forks: [] },
    { t: 0.3, side: panel, angle: 56 - lean, len: 0.34, weep: true, forks: [{ t: 0.55, side: words, len: 0.3 }] },
    { t: 0.52, side: panel, angle: 38, len: 0.13, forks: [] },
    { t: 0.84, side: words, angle: 40, len: 0.15, weep: true, forks: [] },
    { t: 0.9, side: panel, angle: 36, len: 0.12, forks: [] },
  ];
};

export const SEGMENTS = {
  // Enters from the right screen edge under the statement and arcs down into the centre gutter.
  prelude: {
    id: "js-prelude",
    seed: 601,
    h: 720,
    w0: 16,
    wEnd: 14.5,
    // One long diagonal from the top right (where the hero's right bough hangs) into the joint: it falls about
    // as fast as it travels, so the growth keeps pace with the scroll instead of shooting across a near-level
    // stretch. It keeps right of the statement (x ≤ 865, y 50–290 at narrow desktops) until it is below it.
    keys: [[1600, 30], [1380, 110], [1160, 200], [980, 290], [860, 380], [720, 470], [600, 560], [530, 640], [500, 680], [500, 720]],
    forks: [
      { t: 0.28, side: -1, len: 0.12, weep: true },
      { t: 0.42, side: -1, len: 0.1 },
      { t: 0.56, side: 1, len: 0.09, weep: true },
      { t: 0.7, side: -1, len: 0.09, weep: true, forks: [] },
      { t: 0.8, side: 1, len: 0.1, weep: true, forks: [] },
    ],
    bloomShare: 0.5,
  },
  // Enters from the right after the mobile statement, then settles into the left gutter joint.
  "prelude-mobile": {
    id: "js-prelude-mobile",
    seed: 607,
    h: 500,
    w0: 14,
    wEnd: 14,
    keys: [[1120, 30], [980, 50], [812, 94], [626, 134], [420, 184], [232, 254], [100, 320], [24, 390], [0, 450], [0, 500]],
    forks: [
      { t: 0.24, side: -1, angle: 42, len: 0.13, weep: true },
      { t: 0.43, side: 1, angle: 38, len: 0.1 },
      { t: 0.64, side: -1, angle: 36, len: 0.13, weep: true },
    ],
    bloomShare: 0.5,
  },
  // Panel right: a twig reaches left over the words, a strand weeps behind the panel's corner.
  spring: {
    id: "js-spring",
    seed: 613,
    h: CHAPTER_H,
    w0: 14.5,
    wEnd: 12.5,
    keys: fit([[500, 0], [500, 70], [476, 210], [522, 390], [486, 570], [512, 730], [500, 830], [500, 900]]),
    forks: chapterForks(1),
    bloomShare: 0.5,
  },
  // Panel left: the same gesture mirrored (never flipped: its own keys and seed).
  summer: {
    id: "js-summer",
    seed: 727,
    h: CHAPTER_H,
    w0: 12.5,
    wEnd: 11,
    keys: fit([[500, 0], [500, 70], [524, 220], [480, 400], [516, 580], [490, 740], [500, 830], [500, 900]]),
    forks: chapterForks(-1, 4),
    bloomShare: 0.5,
  },
  autumn: {
    id: "js-autumn",
    seed: 839,
    h: CHAPTER_H,
    w0: 11,
    wEnd: 10,
    keys: fit([[500, 0], [500, 70], [480, 230], [518, 410], [484, 590], [510, 740], [500, 830], [500, 900]]),
    forks: chapterForks(1, -4),
    bloomShare: 0.5,
  },
  // Emilie, the one tall chapter: the limb swings wide of her centred words, then falls behind her stage.
  emilie: {
    id: "js-emilie",
    seed: 911,
    h: 900,
    w0: 10,
    wEnd: 9,
    // Her words hold x 205–850, y 130–400 (wider at narrow desktops, where the glints wrap); the stage's
    // panel starts below them at x 418. The limb parts above the eyebrow: it swings right round the words,
    // its twin (held on authored points) swings left, and they meet again behind the panel.
    keys: [
      [500, 0], [500, 40], [560, 76], [700, 104], [838, 146], [915, 236], [930, 336], [890, 428],
      [780, 482], [640, 522], [540, 600], [506, 720], [500, 850], [500, 900],
    ],
    forks: [
      {
        t: 0.05, side: -1, until: 0.78, wShare: 0.8,
        path: [[430, 84], [300, 110], [162, 164], [86, 258], [76, 350], [116, 432], [222, 482], [362, 508]],
        forks: [
          { t: 0.3, side: 1, angle: 52, len: 0.08, weep: true, forks: [] },
          { t: 0.5, side: 1, angle: 46, len: 0.09, weep: true },
          { t: 0.7, side: 1, angle: 40, len: 0.06, forks: [] },
        ],
      },
      { t: 0.2, side: -1, angle: 50, len: 0.07, forks: [] },
      { t: 0.33, side: -1, angle: 55, len: 0.09, weep: true },
      { t: 0.47, side: -1, angle: 45, len: 0.07, forks: [] },
    ],
    bloomShare: 0.4,
  },
  // Winter is bare: lit buds only, no blossom.
  winter: {
    id: "js-winter",
    seed: 953,
    h: CHAPTER_H,
    w0: 9,
    wEnd: 8.5,
    keys: fit([[500, 0], [500, 70], [522, 220], [482, 400], [514, 580], [490, 740], [500, 830], [500, 900]]),
    forks: chapterForks(-1, -2),
    // Bare wood, and what it carries is ice, not blossom (the kind below)
    bloomShare: 0.35,
  },
  // Today, the lantern-lit night before spring: panel right, so the limb leans as spring's did.
  today: {
    id: "js-today",
    seed: 967,
    h: CHAPTER_H,
    w0: 8.5,
    wEnd: 8,
    keys: fit([[500, 0], [500, 70], [478, 220], [520, 400], [486, 580], [508, 740], [500, 830], [500, 900]]),
    forks: chapterForks(1, 2),
    bloomShare: 0.4,
  },
  constellation: {
    id: "js-constellation",
    seed: 977,
    h: 630,
    w0: 8,
    wEnd: 7,
    keys: [[500, 0], [500, 58], [484, 199], [514, 365], [492, 514], [500, 580], [500, 630]],
    forks: [
      { t: 0.3, side: -1, angle: 50, len: 0.16, weep: true, forks: [] },
      { t: 0.62, side: 1, angle: 46, len: 0.14, weep: true, forks: [] },
    ],
    bloomShare: 0,
  },
  // The crown: the limb opens into four long arcing limbs wider than the column, every tip in bloom.
  finale: {
    id: "js-finale",
    seed: 991,
    h: 560,
    w0: 7,
    joint: "start",
    keys: [[500, 0], [500, 60], [486, 150], [508, 240], [500, 330]],
    forks: [
      {
        t: 0.26, side: 1, angle: 94, len: 1.45,
        forks: [
          { t: 0.2, side: 1, len: 0.24, weep: true },
          { t: 0.34, side: -1, len: 0.3 },
          { t: 0.5, side: 1, len: 0.34, weep: true },
          { t: 0.66, side: -1, len: 0.26 },
          { t: 0.8, side: 1, len: 0.28, weep: true },
        ],
      },
      {
        t: 0.36, side: -1, angle: 92, len: 1.55,
        forks: [
          { t: 0.18, side: -1, len: 0.24, weep: true },
          { t: 0.32, side: 1, len: 0.3 },
          { t: 0.48, side: -1, len: 0.34, weep: true },
          { t: 0.64, side: 1, len: 0.26 },
          { t: 0.78, side: -1, len: 0.28, weep: true },
        ],
      },
      {
        t: 0.55, side: 1, angle: 64, len: 0.95, weep: true,
        forks: [{ t: 0.35, side: -1, len: 0.35 }, { t: 0.6, side: 1, len: 0.3, weep: true }, { t: 0.82, side: -1, len: 0.25 }],
      },
      {
        t: 0.66, side: -1, angle: 62, len: 1, weep: true,
        forks: [{ t: 0.33, side: 1, len: 0.35 }, { t: 0.58, side: -1, len: 0.3, weep: true }, { t: 0.8, side: 1, len: 0.25 }],
      },
      { t: 0.82, side: 1, angle: 40, len: 0.35, weep: true },
    ],
    bloomShare: 1,
    clusterSize: [4, 7],
  },
  // A winding continuation, with uneven long limbs and seeded twigs reaching above and below it.
  "finale-mobile": {
    id: "js-finale-mobile",
    seed: 997,
    h: 560,
    w0: 14,
    joint: "start",
    keys: [[0, 0], [0, 60], [28, 128], [120, 182], [232, 204], [310, 268], [446, 284], [564, 356], [726, 374], [934, 490]],
    forks: [
      {
        t: 0.17, side: -1, angle: 40, len: 0.5,
        forks: [
          { t: 0.24, side: 1, len: 0.27, weep: true },
          { t: 0.53, side: -1, len: 0.24 },
          { t: 0.78, side: 1, len: 0.36, weep: true },
        ],
      },
      { t: 0.28, side: 1, angle: 64, len: 0.25, weep: true },
      {
        t: 0.42, side: -1, angle: 48, len: 0.48,
        forks: [{ t: 0.35, side: -1, len: 0.24 }, { t: 0.68, side: 1, len: 0.32, weep: true }],
      },
      { t: 0.59, side: 1, angle: 55, len: 0.18, weep: true },
      { t: 0.76, side: -1, angle: 48, len: 0.24 },
    ],
    bloomShare: 1,
    clusterSize: [4, 7],
  },
} satisfies Record<string, SegmentSpec>;

export type SegmentName = keyof typeof SEGMENTS;

export const FEATURES = ["spring", "summer", "autumn", "emilie", "winter", "today", "constellation"] as const;
/** The last feature runs straight down its own (left) side into the crown, so it draws no crossing. */
export const LAST_FEATURE = FEATURES[FEATURES.length - 1];
export type FeatureName = typeof FEATURES[number];
export const mobileBoughSide = (name: SegmentName) => FEATURES.indexOf(name as FeatureName) % 2 === 1 ? "right" : "left";

/** What each segment's tips carry. The seasons are read from the foliage first, and the colour only follows. */
export const FOLIAGE: Record<SegmentName, FoliageKind> = {
  prelude: "ume",
  "prelude-mobile": "ume",
  spring: "ume",
  summer: "wisteria",
  autumn: "maple",
  emilie: "ume",
  winter: "frost",
  today: "ume",
  constellation: "ume",
  finale: "ume",
  "finale-mobile": "ume",
};

export const segmentHeight = (name: SegmentName): number => SEGMENTS[name].h;
