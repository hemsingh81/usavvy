export interface AvatarProps {
  /** The learner's display name or email — used both for initials and for the
   * deterministic background color, so the same learner always sees the same avatar. */
  label: string;
}

// No DESIGN.md token covers a conventional profile-identity avatar (its own "Avatar
// Presence Indicator" is the AI tutor's waveform mark, a different concept — Story
// 1.5's Dev Notes). A simple string hash picks a hue so the same label always renders
// the same color with no external service, upload, or randomness involved.
function hashToHue(label: string): number {
  let hash = 0;
  for (let i = 0; i < label.length; i++) {
    hash = (hash * 31 + label.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 360;
}

function initialsFor(label: string): string {
  const words = label.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[1]![0]!).toUpperCase();
}

export function Avatar({ label }: AvatarProps) {
  const hue = hashToHue(label);
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
