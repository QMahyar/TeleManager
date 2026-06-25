// Beacon logomark geometry, shared by the <BrandMark> component and the favicon
// generator. Kept in a plain module (no component exports) so both can import it
// without tripping react-refresh's only-export-components rule.

export const BEACON_VIEWBOX = "0 0 24 24"

// The beacon's inner SVG markup at the 24×24 viewBox, drawn in one concrete
// colour. The favicon renders in the browser chrome — outside the DOM — so it
// can't use CSS vars / Tailwind classes and needs a literal colour. Keep these
// coordinates identical to the <BrandMark> JSX.
export function beaconMarkup(color: string): string {
  return (
    `<circle cx="12" cy="12" r="2.6" fill="${color}"/>` +
    `<circle cx="12" cy="12" r="5.3" fill="none" stroke="${color}" stroke-width="2"/>` +
    `<path d="M5.15 17.2 A 8.6 8.6 0 1 1 18.85 17.2" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round"/>`
  )
}
