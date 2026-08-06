import { createAvatar } from "@dicebear/core";
import { adventurer } from "@dicebear/collection";
import { nameGender } from "./gender";

/**
 * Single source of truth for portraits: the same pools drive rendering, the
 * character builder's swatches, and server-side validation of what gets saved.
 * Isomorphic on purpose — the builder renders live previews in the browser.
 */

const range = (prefix: string, n: number) =>
  Array.from({ length: n }, (_, i) => `${prefix}${String(i + 1).padStart(2, "0")}`);

export const HAIR_LONG = range("long", 26);
export const HAIR_SHORT = range("short", 19);
export const HAIR = [...HAIR_SHORT, ...HAIR_LONG];
export const HAIR_COLORS = ["e5d7a3", "b9a05f", "ac6511", "ab2a18", "6a4e35", "562306", "0e0e0e"];
// Explicit self-selection, so the full range — the light-European narrowing only
// ever made sense as a fallback for names we were guessing from.
export const SKIN_COLORS = ["ffdbb4", "f2d3b1", "ecad80", "d08b5b", "ae5d29", "9e5622", "763900", "614335"];
export const EYES = range("variant", 26);
export const EYEBROWS = range("variant", 15);
export const MOUTH = range("variant", 30);
export const GLASSES = range("variant", 5);
export const EARRINGS = range("variant", 6);
export const FEATURES = ["freckles", "blush", "birthmark", "mustache"];
export const BACKGROUNDS = ["ffd5dc", "cdeaf7", "d1f4d9", "ffe6b3", "e6dbff", "ffd9c0", "d9f1ee", "1B2328"];

export const NONE = "none";
export const BALD = "bald";

export interface AvatarOptions {
  hair?: string;
  hairColor?: string;
  skinColor?: string;
  eyes?: string;
  eyebrows?: string;
  mouth?: string;
  glasses?: string;
  earrings?: string;
  features?: string;
  backgroundColor?: string;
}

/** Field → allowed values. Anything outside these is dropped, never rendered. */
const POOLS: Record<keyof AvatarOptions, string[]> = {
  hair: [...HAIR, BALD],
  hairColor: HAIR_COLORS,
  skinColor: SKIN_COLORS,
  eyes: EYES,
  eyebrows: EYEBROWS,
  mouth: MOUTH,
  glasses: [...GLASSES, NONE],
  earrings: [...EARRINGS, NONE],
  features: [...FEATURES, NONE],
  backgroundColor: [...BACKGROUNDS, NONE],
};

/** Keeps only known fields with whitelisted values — the trust boundary. */
export function sanitizeAvatarOptions(input: unknown): AvatarOptions {
  if (!input || typeof input !== "object") return {};
  const out: AvatarOptions = {};
  for (const [field, pool] of Object.entries(POOLS) as [keyof AvatarOptions, string[]][]) {
    const value = (input as Record<string, unknown>)[field];
    if (typeof value === "string" && pool.includes(value)) out[field] = value;
  }
  return out;
}

export function randomAvatarOptions(pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)]): AvatarOptions {
  return {
    hair: pick(HAIR),
    hairColor: pick(HAIR_COLORS),
    skinColor: pick(SKIN_COLORS),
    eyes: pick(EYES),
    eyebrows: pick(EYEBROWS),
    mouth: pick(MOUTH),
    glasses: pick([NONE, NONE, ...GLASSES]),
    earrings: pick([NONE, NONE, ...EARRINGS]),
    features: pick([NONE, NONE, NONE, ...FEATURES]),
    backgroundColor: pick(BACKGROUNDS),
  };
}

/**
 * Renders the portrait. Explicit picks win; anything unset falls back to the
 * seeded derivation (name + charm), so members who never open the builder look
 * exactly as they did before.
 */
export function avatarSvg(name: string, charm: string, options?: AvatarOptions | null): string {
  const o = options ?? {};
  const gender = nameGender(name);
  // Only bias hair by the name guess while the member hasn't chosen for themselves.
  const hairFallback =
    o.hair
      ? {}
      : gender === "f"
        ? { hair: HAIR_LONG as never }
        : gender === "m"
          ? { hair: HAIR_SHORT as never }
          : {};

  return createAvatar(adventurer, {
    seed: `${name}·${charm}`,
    // A few hair variants are drawn to the frame edge — shrink everything so
    // even the biggest heads keep a margin inside the circular crop.
    scale: 80,
    backgroundColor: o.backgroundColor
      ? o.backgroundColor === NONE
        ? ["transparent"]
        : [o.backgroundColor]
      : BACKGROUNDS.slice(0, 7),
    skinColor: o.skinColor ? [o.skinColor] : ["f2d3b1", "ffdfc4"],
    hairColor: o.hairColor ? [o.hairColor] : HAIR_COLORS,
    featuresProbability: o.features ? (o.features === NONE ? 0 : 100) : 15,
    glassesProbability: o.glasses ? (o.glasses === NONE ? 0 : 100) : 45,
    earringsProbability: o.earrings ? (o.earrings === NONE ? 0 : 100) : 0,
    hairProbability: o.hair === BALD ? 0 : 100,
    ...hairFallback,
    ...(o.hair && o.hair !== BALD ? { hair: [o.hair] as never } : {}),
    ...(o.eyes ? { eyes: [o.eyes] as never } : {}),
    ...(o.eyebrows ? { eyebrows: [o.eyebrows] as never } : {}),
    ...(o.mouth ? { mouth: [o.mouth] as never } : {}),
    ...(o.glasses && o.glasses !== NONE ? { glasses: [o.glasses] as never } : {}),
    ...(o.earrings && o.earrings !== NONE ? { earrings: [o.earrings] as never } : {}),
    ...(o.features && o.features !== NONE ? { features: [o.features] as never } : {}),
  }).toString();
}

/** Data URI — always rendered via <img> so the SVG fills its circle exactly. */
export function avatarUri(name: string, charm: string, options?: AvatarOptions | null): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(avatarSvg(name, charm, options))}`;
}
