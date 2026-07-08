import type { ReactElement } from "react";

// Bio-mechanical luxury avatar motifs, hand-drawn as crisp inline SVG (no image
// assets → no bundle bloat). Palette-strict: charcoal linework, sage + champagne
// accents, on the cream avatar disc. Each is a 40×40 motif of a joint/movement.
const CH = "#1a1a1a"; // charcoal
const SG = "#3b4436"; // sage
const GD = "#c5a059"; // champagne gold

const wrap = (children: ReactElement) => (
  <svg viewBox="0 0 40 40" width="100%" height="100%" fill="none" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);

export const AVATAR_SVGS: Record<string, ReactElement> = {
  knee: wrap(
    <g>
      <path d="M14 5 L18.5 17" stroke={CH} strokeWidth={2.6} />
      <path d="M26 35 L21.5 23" stroke={SG} strokeWidth={2.6} />
      <circle cx="20" cy="20" r="5.2" fill={GD} stroke={CH} strokeWidth={2} />
    </g>,
  ),
  spine: wrap(
    <g>
      <path d="M20 5 L20 35" stroke={GD} strokeWidth={1.6} />
      {[7, 13, 19, 25, 31].map((y, i) => (
        <rect key={y} x="13.5" y={y - 2.6} width="13" height="5.2" rx="2.4" fill={i % 2 ? SG : "#fff"} stroke={CH} strokeWidth={2} />
      ))}
    </g>,
  ),
  shoulder: wrap(
    <g>
      <path d="M9 26 A13 13 0 0 1 30 15" stroke={CH} strokeWidth={2.6} />
      <circle cx="27" cy="20" r="6" fill={GD} stroke={CH} strokeWidth={2} />
      <path d="M9 26 L9 33" stroke={SG} strokeWidth={2.6} />
    </g>,
  ),
  hip: wrap(
    <g>
      <circle cx="20" cy="20" r="11" stroke={CH} strokeWidth={2.4} />
      <path d="M20 9 A11 11 0 0 1 31 20" stroke={GD} strokeWidth={2.8} />
      <circle cx="20" cy="20" r="4" fill={SG} />
    </g>,
  ),
  running: wrap(
    <g stroke={CH} strokeWidth={2.6}>
      <circle cx="24" cy="9" r="3.2" fill={GD} stroke={CH} strokeWidth={1.6} />
      <path d="M24 13 L18 22 L23 27" />
      <path d="M18 22 L27 24" stroke={SG} />
      <path d="M23 27 L20 35" />
      <path d="M18 22 L11 27" stroke={SG} />
    </g>,
  ),
  ankle: wrap(
    <g stroke={CH} strokeWidth={2.6}>
      <path d="M18 5 L18 21" />
      <path d="M18 21 Q18 28 25 28 L31 28" stroke={SG} />
      <circle cx="18" cy="21" r="4.6" fill={GD} stroke={CH} strokeWidth={2} />
    </g>,
  ),
  heart: wrap(
    <g>
      <path d="M20 32 C10 24 8 16 13 12 C16.5 9 20 12 20 15 C20 12 23.5 9 27 12 C32 16 30 24 20 32 Z" fill={SG} stroke={CH} strokeWidth={2} />
      <path d="M6 21 H14 L17 15 L21 26 L24 21 H34" stroke={GD} strokeWidth={2.2} />
    </g>,
  ),
  strength: wrap(
    <g stroke={CH} strokeWidth={2.4}>
      <path d="M11 20 H29" strokeWidth={3} />
      <rect x="5" y="14.5" width="5" height="11" rx="1.6" fill={GD} />
      <rect x="30" y="14.5" width="5" height="11" rx="1.6" fill={GD} />
      <rect x="9.5" y="16.5" width="3.5" height="7" rx="1.4" fill={SG} />
      <rect x="27" y="16.5" width="3.5" height="7" rx="1.4" fill={SG} />
    </g>,
  ),
  pulse: wrap(
    <g>
      <circle cx="20" cy="20" r="14" stroke={CH} strokeWidth={2.2} />
      <path d="M8 21 H15 L17.5 14 L22 27 L24.5 21 H32" stroke={GD} strokeWidth={2.6} />
    </g>,
  ),
};

export const AVATAR_LIST: { id: string; label: string }[] = [
  { id: "knee", label: "ברך" },
  { id: "spine", label: "עמוד שדרה" },
  { id: "shoulder", label: "כתף" },
  { id: "hip", label: "אגן" },
  { id: "running", label: "ריצה" },
  { id: "ankle", label: "קרסול" },
  { id: "heart", label: "דופק" },
  { id: "strength", label: "כוח" },
  { id: "pulse", label: "מקצב" },
];

/** Render an avatar skin token — `svg:<id>` → the motif, otherwise the emoji. */
export function AvatarSkin({ skin }: { skin: string }) {
  if (skin.startsWith("svg:")) return AVATAR_SVGS[skin.slice(4)] ?? <>{skin}</>;
  return <>{skin}</>;
}
