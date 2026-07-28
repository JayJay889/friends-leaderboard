import { createAvatar } from "@dicebear/core";
import { openPeeps } from "@dicebear/collection";

/**
 * Deterministic hand-drawn portrait (DiceBear "Open Peeps", generated locally —
 * no external requests). Expressive faces on a seeded pastel disc; the seed
 * mixes the display name with the stored "charm", so editing the charm on /me
 * re-rolls the portrait.
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
  const svg = createAvatar(openPeeps, {
    seed: `${name}·${charm}`,
    backgroundColor: ["ffd5dc", "cdeaf7", "d1f4d9", "ffe6b3", "e6dbff", "ffd9c0", "d9f1ee"],
    scale: 85,
    translateY: 4,
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
