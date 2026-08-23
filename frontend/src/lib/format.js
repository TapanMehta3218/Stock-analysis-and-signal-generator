/* Number formatting. Large standalone figures use proportional digits;
   tabular-nums is applied by CSS only inside tables and axis ticks. */

const inr = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const inr0 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })

export const rupees = (v, decimals = 2) =>
  v == null || Number.isNaN(v) ? '—' : `₹${(decimals === 0 ? inr0 : inr).format(v)}`

/** Compact axis labels: 4,175 → ₹4.2K, 1,250,000 → ₹1.3M */
export const rupeesCompact = (v) => {
  if (v == null || Number.isNaN(v)) return '—'
  const abs = Math.abs(v)
  if (abs >= 1e6) return `₹${(v / 1e6).toFixed(1)}M`
  if (abs >= 1e3) return `₹${(v / 1e3).toFixed(abs >= 1e4 ? 0 : 1)}K`
  return `₹${v.toFixed(0)}`
}

export const pct = (v, decimals = 2) =>
  v == null || Number.isNaN(v) ? '—' : `${v.toFixed(decimals)}%`

export const signedPct = (v, decimals = 2) =>
  v == null || Number.isNaN(v) ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(decimals)}%`

export const num = (v, decimals = 2) =>
  v == null || Number.isNaN(v) ? '—' : v.toFixed(decimals)

export const shortDate = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export const monthYear = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })
}

export const titleCase = (s) =>
  String(s ?? '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())

/** Feature names → human labels for the importance chart. */
const FEATURE_LABELS = {
  ret_1: '1-day return',
  ret_2: '2-day return',
  ret_3: '3-day return',
  ret_5: '5-day return',
  ret_10: '10-day return',
  ma_ratio_5: 'Price vs 5-day MA',
  ma_ratio_10: 'Price vs 10-day MA',
  ma_ratio_20: 'Price vs 20-day MA',
  vol_5: '5-day volatility',
  vol_10: '10-day volatility',
  vol_20: '20-day volatility',
  range_pct: 'Intraday range',
  body_pct: 'Open-to-close body',
  close_pos: 'Close position in range',
  gap_pct: 'Opening gap',
  rsi_14: 'RSI (14)',
  regime: 'Regime flag',
}

export const featureLabel = (name) => FEATURE_LABELS[name] ?? titleCase(name)
