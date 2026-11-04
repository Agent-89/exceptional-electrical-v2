/** Decorative cable routed as three matching segments through the white sections.
 *  Section boundaries intentionally alternate sides, so it reads as one cable
 *  passing behind the dark About section. No pointer or keyboard interaction.
 */
export function CableAccent({ variant }: { variant: 'services' | 'projects' | 'approach' }) {
 const paths = {
  services: 'M 1120 -12 C 1110 95 1120 125 1070 175 C 1015 240 1130 275 1090 350 C 1030 460 805 430 625 490 C 430 555 240 565 95 665 C 60 690 52 745 52 860',
  projects: 'M 52 -12 C 52 100 95 125 105 205 C 120 305 58 365 75 455 C 98 565 375 570 590 605 C 790 640 1105 630 1120 755 L 1120 860',
  approach: 'M 1120 -12 C 1120 105 1105 145 1045 210 C 955 300 1070 350 1020 435 C 955 535 730 510 555 575 C 410 625 395 695 510 735 C 560 753 595 753 640 753'
 };
 const path = paths[variant];
 return <svg className={`cable-accent cable-accent--${variant}`} viewBox="0 0 1200 850" preserveAspectRatio="none" fill="none" aria-hidden="true" focusable="false">
  <path className="cable-accent-line" d={path} stroke="#102b40" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/>
  {variant === 'approach' && <g className="cable-accent-plug" transform="translate(640 753)">
    {/* Plug enters from left, prongs face right, forming a compact letter E silhouette. */}
    <path d="M 0 0 H 10" stroke="#102b40" strokeWidth="5" strokeLinecap="round"/>
    <path d="M 10 -12 Q 10 -16 15 -16 H 36 Q 41 -16 41 -11 V 11 Q 41 16 36 16 H 15 Q 10 16 10 12 Z" fill="#102b40"/>
    <path d="M 18 -8 H 32" stroke="#238de6" strokeWidth="2.5" strokeLinecap="round"/>
    <path d="M 41 -11 H 58 M 41 0 H 61 M 41 11 H 58" stroke="#102b40" strokeWidth="5" strokeLinecap="round"/>
  </g>}
 </svg>;
}
