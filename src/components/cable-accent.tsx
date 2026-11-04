import type { ReactNode } from 'react';

/** Decorative, non-interactive cable. The plug is a stylised SVG echo of the logo. */
export function CableAccent({ variant }: { variant: 'services' | 'projects' | 'approach' }) {
 const paths = {
  services: 'M 1030 -30 C 990 105 1130 160 1035 255 S 850 365 955 455 S 1110 555 1010 680',
  projects: 'M 1080 -35 C 1020 105 1130 170 1020 280 S 880 420 1040 540 S 1120 680 1015 810',
  approach: 'M 1020 -30 C 960 70 1080 145 1010 235 S 875 335 985 435 S 1110 500 970 575'
 };
 return <svg className={`cable-accent cable-accent--${variant}`} viewBox="0 0 1200 850" preserveAspectRatio="none" fill="none" aria-hidden="true" focusable="false">
  <path className="cable-accent-line" d={paths[variant]} stroke="#102b40" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/>
  {variant === 'approach' && <g className="cable-accent-plug" transform="translate(969 572) rotate(30)">
    <path d="M 0 0 L 0 18" stroke="#102b40" strokeWidth="5" strokeLinecap="round"/>
    <rect x="-13" y="17" width="26" height="33" rx="5" fill="#102b40"/>
    <path d="M -9 27 H 9" stroke="#238de6" strokeWidth="2.5" strokeLinecap="round"/>
    <rect x="-8" y="48" width="5" height="14" rx="1" fill="#102b40"/>
    <rect x="3" y="48" width="5" height="14" rx="1" fill="#102b40"/>
  </g>}
 </svg>;
}
