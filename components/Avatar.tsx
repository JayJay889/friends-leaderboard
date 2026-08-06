import { avatarUri, type AvatarOptions } from "@/lib/avatar";

/**
 * Deterministic cartoon portrait (DiceBear "Adventurer", generated locally —
 * no external requests). Explicit picks from the character builder win; without
 * them the portrait is seeded from the display name plus the stored "charm".
 */
export default function Avatar({
  name,
  charm,
  options,
  size = 36,
  ring = false,
}: {
  name: string;
  charm: string;
  options?: AvatarOptions | null;
  size?: number;
  ring?: boolean;
}) {
  // Rendered as an <img> so the square SVG always scales to fill the circle
  // exactly — inline SVG injection rendered at natural size and got cropped.
  const uri = avatarUri(name, charm, options);
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
