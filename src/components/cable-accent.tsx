/** Decorative cable, routed around content rather than across headings or cards.
 * The endpoint reuses the real brand logo artwork (cropped to its plug),
 * rather than approximating its distinctive shape with SVG primitives.
 */
export function CableAccent({ variant }: { variant: 'services' | 'projects' | 'approach' }) {
 const paths = {
  // Enter along right margin, cross the bottom whitespace below service cards.
  services: 'M 1168 -20 C 1168 140 1170 310 1168 465 C 1166 625 1070 740 860 770 C 630 810 320 800 42 840',
  // Reappear on left edge; sweep through the lower white area.
  projects: 'M 42 -20 C 38 175 36 350 42 540 C 46 690 115 765 340 792 C 550 818 880 798 1165 840',
  // Follow right margin, then turn across below the three process steps.
  approach: 'M 1165 -20 C 1165 165 1163 320 1160 470 C 1155 650 1030 770 820 782 C 700 790 595 790 525 790'
 };
 return <svg className={`cable-accent cable-accent--${variant}`} viewBox="0 0 1200 850" preserveAspectRatio="none" fill="none" aria-hidden="true" focusable="false">
  <path className="cable-accent-line" d={paths[variant]} stroke="#102b40" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round"/>
  {variant === 'approach' && <g className="cable-accent-plug" transform="translate(520 755)">
    {/* Use the genuine logo plug. Mirroring makes the plug face right. */}
    <svg x="-4" y="-16" width="92" height="76" viewBox="0 0 620 724" preserveAspectRatio="xMinYMid meet" overflow="hidden">
      <g transform="translate(620 0) scale(-1 1)">
        <image href="/exceptional-electrical-logo.png" x="0" y="0" width="2172" height="724" preserveAspectRatio="xMinYMid meet"/>
      </g>
    </svg>
  </g>}
 </svg>;
}
