"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  avatarUri,
  BACKGROUNDS,
  BALD,
  EARRINGS,
  EYEBROWS,
  EYES,
  FEATURES,
  GLASSES,
  HAIR,
  HAIR_COLORS,
  MOUTH,
  NONE,
  randomAvatarOptions,
  SKIN_COLORS,
  type AvatarOptions,
} from "@/lib/avatar";

type Field = keyof AvatarOptions;

/** Shape categories preview the whole face; colour categories show swatches. */
const TABS: { key: Field; label: string; values: string[]; swatch?: boolean }[] = [
  { key: "hair", label: "Hair", values: [...HAIR, BALD] },
  { key: "hairColor", label: "Hair colour", values: HAIR_COLORS, swatch: true },
  { key: "skinColor", label: "Skin", values: SKIN_COLORS, swatch: true },
  { key: "eyes", label: "Eyes", values: EYES },
  { key: "eyebrows", label: "Brows", values: EYEBROWS },
  { key: "mouth", label: "Mouth", values: MOUTH },
  { key: "glasses", label: "Glasses", values: [NONE, ...GLASSES] },
  { key: "earrings", label: "Earrings", values: [NONE, ...EARRINGS] },
  { key: "features", label: "Details", values: [NONE, ...FEATURES] },
  { key: "backgroundColor", label: "Backdrop", values: BACKGROUNDS, swatch: true },
];

export default function AvatarStudio({
  name,
  charm,
  initial,
}: {
  name: string;
  charm: string;
  initial: AvatarOptions | null;
}) {
  const router = useRouter();
  const [options, setOptions] = useState<AvatarOptions>(initial ?? {});
  const [tab, setTab] = useState<Field>("hair");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const active = TABS.find((t) => t.key === tab)!;
  const preview = useMemo(() => avatarUri(name, charm, options), [name, charm, options]);

  // Only the visible row is generated, and only when its inputs actually change.
  const thumbs = useMemo(
    () =>
      active.swatch
        ? []
        : active.values.map((v) => ({ value: v, uri: avatarUri(name, charm, { ...options, [tab]: v }) })),
    [active, name, charm, options, tab],
  );

  const set = (value: string) => {
    setSaved(false);
    setOptions((o) => ({ ...o, [tab]: value }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/me/avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(options),
      });
      if (res.ok) {
        setSaved(true);
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <span className="inline-block h-24 w-24 shrink-0 overflow-hidden rounded-full ring-2 ring-brass-soft">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Your portrait" className="block h-full w-full" draggable={false} />
        </span>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setSaved(false);
              setOptions(randomAvatarOptions());
            }}
            className="rounded-lg border border-hairline px-3 py-2 text-sm text-sub transition-colors hover:text-ink"
          >
            Surprise me
          </button>
          <button
            type="button"
            onClick={() => {
              setSaved(false);
              setOptions({});
            }}
            className="rounded-lg border border-hairline px-3 py-2 text-sm text-sub transition-colors hover:text-ink"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-brass px-4 py-2 text-sm font-semibold text-[#101518] transition-colors hover:bg-brass-soft disabled:opacity-60"
          >
            {saving ? "Saving…" : saved ? "Saved ✓" : "Save portrait"}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              t.key === tab ? "bg-lagoon text-[#101518]" : "bg-ivory text-sub hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="max-h-56 overflow-y-auto rounded-xl bg-ivory p-3">
        {active.swatch ? (
          <div className="flex flex-wrap gap-2.5">
            {active.values.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => set(v)}
                aria-label={v}
                style={{ background: v === NONE ? "transparent" : `#${v}` }}
                className={`h-9 w-9 rounded-full ring-2 transition-transform hover:scale-110 ${
                  options[tab] === v ? "ring-lagoon" : "ring-hairline"
                }`}
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(3.5rem,1fr))] gap-2">
            {thumbs.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => set(t.value)}
                aria-label={t.value}
                className={`overflow-hidden rounded-full ring-2 transition-transform hover:scale-105 ${
                  options[tab] === t.value ? "ring-lagoon" : "ring-hairline"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={t.uri} alt="" className="block h-full w-full" draggable={false} />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
