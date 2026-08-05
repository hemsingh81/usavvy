export interface AvatarProps {
  /** The learner's display name or email — used for initials. */
  label: string;
  /**
   * A stable identifier (e.g. the user's id) the background color is derived from.
   * Review finding: keying the color on `label` itself made a learner's avatar color
   * change every time they edited their display name — the exact interaction this
   * story ships — directly contradicting "the same learner always sees the same
   * color." Defaults to `label` only for callers with no better stable identifier.
   */
  colorSeed?: string;
}

// No DESIGN.md token covers a conventional profile-identity avatar (its own "Avatar
// Presence Indicator" is the AI tutor's waveform mark, a different concept — Story
// 1.5's Dev Notes). A simple string hash picks a hue so the same seed always renders
// the same color with no external service, upload, or randomness involved.
function hashToHue(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 360;
}

// Review finding: indexing/slicing by UTF-16 code unit splits a surrogate pair (an
// astral-plane character, e.g. some emoji) into a broken glyph. Array.from() iterates
// by code point instead, so a two-code-unit character survives intact.
function initialsFor(label: string): string {
  const words = label.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return Array.from(words[0]!).slice(0, 2).join("").toUpperCase();
  return (Array.from(words[0]!)[0]! + Array.from(words[1]!)[0]!).toUpperCase();
}

export function Avatar({ label, colorSeed }: AvatarProps) {
  const hue = hashToHue(colorSeed ?? label);
  return (
    <div
      className="usavvy-avatar"
      aria-hidden="true"
      style={{ backgroundColor: `hsl(${hue}, 45%, 88%)`, color: `hsl(${hue}, 45%, 25%)` }}
    >
      {initialsFor(label)}
    </div>
  );
}
