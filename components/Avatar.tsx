import { createAvatar } from "@dicebear/core";
import { lorelei } from "@dicebear/collection";

/**
 * Deterministic line-art portrait (DiceBear "Lorelei", generated locally —
 * no external requests, in keeping with the privacy promise). The seed mixes
 * the display name with the stored "charm" (the old avatar_emoji column), so
 * editing the charm on /me re-rolls the portrait.
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
  const svg = createAvatar(lorelei, {
    seed: `${name}·${charm}`,
    backgroundColor: [],
  }).toString();

  return (
    <span
      className={`inline-block shrink-0 overflow-hidden rounded-full bg-brass-wash ${
        ring ? "ring-2 ring-brass-soft" : "ring-1 ring-hairline"
      }`}
      style={{ width: size, height: size }}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
