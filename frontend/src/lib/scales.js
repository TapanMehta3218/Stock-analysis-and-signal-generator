/* Colour scales.

   Diverging = two hues either side of a NEUTRAL GRAY midpoint, so "zero" reads
   as nothing rather than as a colour. Never a rainbow, never a hue at the
   middle. Negative takes the warm pole (red), positive the cool pole (blue) for
   correlation; return heatmaps flip to red-down / aqua-up to match the
   up-is-good convention used elsewhere in the dashboard.  */

const hexToRgb = (hex) => {
  const clean = hex.replace('#', '').trim()
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean
  const int = parseInt(full, 16)
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255]
}

const mix = (a, b, t) => {
  const [r1, g1, b1] = hexToRgb(a)
  const [r2, g2, b2] = hexToRgb(b)
  const round = (x, y) => Math.round(x + (y - x) * t)
  return `rgb(${round(r1, r2)}, ${round(g1, g2)}, ${round(b1, b2)})`
}

/**
 * @param value    the datum
 * @param max      absolute value that saturates either pole
 * @param negHex   colour for the negative pole
 * @param posHex   colour for the positive pole
 * @param midHex   neutral midpoint
 */
export function diverging(value, max, negHex, posHex, midHex) {
  if (value == null || Number.isNaN(value)) return 'transparent'
  const t = Math.min(Math.abs(value) / max, 1)
  return mix(midHex, value < 0 ? negHex : posHex, t)
}

/** Ink that stays legible on a filled cell: white on a saturated fill, the
    card's own text colour on a pale one. */
export function inkFor(value, max, threshold = 0.55) {
  if (value == null || Number.isNaN(value)) return 'var(--text-muted)'
  return Math.abs(value) / max > threshold ? '#ffffff' : 'var(--text-secondary)'
}
