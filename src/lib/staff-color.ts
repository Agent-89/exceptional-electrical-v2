/** Stable per-staff colour for schedule avatars. Keyed by scheduling_staff.id, never by name. */

export const STAFF_COLOR_PALETTE = [
  '#1676c4',
  '#a34ecb',
  '#0e9875',
  '#d16a21',
  '#d34876',
  '#6b65c8',
  '#138d9b',
  '#7a8533',
] as const;

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export function staffColor(id: string, avatarColor?: string | null): string {
  const custom = avatarColor?.trim();
  if (custom && HEX_COLOR.test(custom)) return custom;
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return STAFF_COLOR_PALETTE[Math.abs(hash) % STAFF_COLOR_PALETTE.length];
}
