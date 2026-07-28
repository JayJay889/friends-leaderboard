import { createAvatar } from "@dicebear/core";
import { openPeeps } from "@dicebear/collection";
import { nameGender } from "@/lib/gender";

// Hairstyle pools per name-read: a bias, not a verdict — unrecognized names
// keep the library's full variety, and the charm re-rolls within the pool.
const FEMALE_HEADS = [
  "long", "longBangs", "longCurly", "longAfro", "medium1", "medium2", "medium3",
  "mediumBangs", "mediumBangs2", "mediumBangs3", "mediumStraight", "bangs", "bangs2",
  "bun", "bun2", "buns", "bantuKnots", "cornrows", "cornrows2", "twists", "twists2", "afro",
];
const MALE_HEADS = [
  "short1", "short2", "short3", "short4", "short5", "shaved1", "shaved2", "shaved3",
  "flatTop", "flatTopLong", "pomp", "afro", "dreads1", "dreads2", "cornrows", "twists",
  "mohawk", "mohawk2", "hatHip", "hatBeanie", "noHair1", "noHair2", "noHair3",
];

/**
 * Deterministic hand-drawn portrait (DiceBear "Open Peeps", generated locally —
 * no external requests). Expressive faces on a seeded pastel disc; the seed
 * mixes the display name with the stored "charm", so editing the charm on /me
 * re-rolls the portrait. Hairstyle pool is biased by a local name→gender guess.
 */
export default function Avatar({
  name,
  charm,
  size = 36,
  ring = false,
}: {
  name: string;
  charm: string;
  size?: number;
  ring?: boolean;
}) {
  const gender = nameGender(name);
  const svg = createAvatar(openPeeps, {
    seed: `${name}·${charm}`,
    backgroundColor: ["ffd5dc", "cdeaf7", "d1f4d9", "ffe6b3", "e6dbff", "ffd9c0", "d9f1ee"],
    scale: 85,
    translateY: 4,
    ...(gender === "f" ? { head: FEMALE_HEADS as never, facialHairProbability: 0 } : {}),
    ...(gender === "m" ? { head: MALE_HEADS as never, facialHairProbability: 35 } : {}),
  }).toString();

  return (
    <span
      className={`inline-block shrink-0 overflow-hidden rounded-full ${
        ring ? "ring-2 ring-brass-soft" : "ring-1 ring-hairline"
      }`}
      style={{ width: size, height: size }}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
