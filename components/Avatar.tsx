import { createAvatar } from "@dicebear/core";
import { adventurer } from "@dicebear/collection";
import { nameGender } from "@/lib/gender";

// Adventurer draws a full head centered INSIDE the frame (no bust bleeding off
// the edges), which is what finally makes circular crops safe at every size.
const FEMALE_HAIR = [
  "long01", "long02", "long03", "long04", "long05", "long06", "long07", "long08",
  "long09", "long10", "long11", "long12", "long13", "long14", "long15", "long16",
  "long17", "long18", "long19", "long20", "long21", "long22", "long23", "long24",
  "long25", "long26",
];
const MALE_HAIR = [
  "short01", "short02", "short03", "short04", "short05", "short06", "short07",
  "short08", "short09", "short10", "short11", "short12", "short13", "short14",
  "short15", "short16", "short17", "short18", "short19",
];
// Light European skin + blonde-to-black (and ginger) hair range.
const SKIN = ["f2d3b1", "ffdfc4"];
const HAIR_COLORS = ["e5d7a3", "b9a05f", "6a4e35", "562306", "0e0e0e", "ac6511", "ab2a18"];

/**
 * Deterministic cartoon portrait (DiceBear "Adventurer", generated locally —
 * no external requests). The seed mixes the display name with the stored
 * "charm", so editing the charm on /me re-rolls the portrait. Hair pool is
 * biased by a local name→gender guess; unknown names get the full variety.
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
  const svg = createAvatar(adventurer, {
    seed: `${name}·${charm}`,
    backgroundColor: ["ffd5dc", "cdeaf7", "d1f4d9", "ffe6b3", "e6dbff", "ffd9c0", "d9f1ee"],
    skinColor: SKIN,
    hairColor: HAIR_COLORS,
    glassesProbability: 45,
    featuresProbability: 15,
    // A few hair variants are drawn to the frame edge — shrink everything so
    // even the biggest heads keep a margin inside the circular crop.
    scale: 80,
    ...(gender === "f" ? { hair: FEMALE_HAIR as never } : {}),
    ...(gender === "m" ? { hair: MALE_HAIR as never } : {}),
  }).toString();

  // Rendered as an <img> so the square SVG always scales to fill the circle
  // exactly — inline SVG injection rendered at natural size and got cropped.
  const uri = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  return (
    <span
      className={`inline-block shrink-0 overflow-hidden rounded-full ${
        ring ? "ring-2 ring-brass-soft" : "ring-1 ring-hairline"
      }`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={uri} alt="" width={size} height={size} className="block h-full w-full" draggable={false} />
    </span>
  );
}
