import React from 'react'
import { Card } from './ui.jsx'
import { num, pct, rupees, shortDate } from '../lib/format.js'

const ROWS = [
  { key: 'days', label: 'Trading days', fmt: (v) => v.toLocaleString('en-IN') },
  { key: 'start_date', label: 'First date', fmt: shortDate },
  { key: 'end_date', label: 'Last date', fmt: shortDate },
  { key: 'mean_close', label: 'Mean close', fmt: (v) => rupees(v, 0) },
  { key: 'median_close', label: 'Median close', fmt: (v) => rupees(v, 0) },
  { key: 'avg_daily_return_pct', label: 'Avg daily return', fmt: (v) => pct(v, 3) },
  { key: 'volatility_pct', label: 'Annualised volatility', fmt: (v) => pct(v, 1) },
  { key: 'positive_days_pct', label: 'Positive days', fmt: (v) => pct(v, 1) },
  { key: 'avg_range_pct', label: 'Avg intraday range', fmt: (v) => pct(v, 2) },
]

export default function RegimeCard({ regimes }) {
  return (
    <Card
      title="The `modi` regime flag"
      subtitle="The source CSV tags every row `l` or `w`. Comparing the two groups is the first thing the original project did — and it is where the dataset's biggest trap lives."
    >
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Metric</th>
              {regimes.map((r) => (
                <th key={r.flag}>{`Flag "${r.flag}"`}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.key}>
                <td className="sec">{row.label}</td>
                {regimes.map((r) => (
                  <td key={r.flag}>{row.fmt(r[row.key])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="note" style={{ marginTop: 14 }}>
        <strong>Read this before believing the gap.</strong> The two labels{' '}
        <em>overlap in time</em> — flag <code>l</code> runs{' '}
        {shortDate(regimes[0].start_date)} → {shortDate(regimes[0].end_date)} while flag{' '}
        <code>w</code> runs {shortDate(regimes[1].start_date)} →{' '}
        {shortDate(regimes[1].end_date)}. A genuine regime change would switch once and
        stay switched. Because the <code>w</code> rows are drawn disproportionately from
        later, higher-priced years, the {num(regimes[1].mean_close / regimes[0].mean_close, 1)}×
        gap in mean close is a sampling artefact, not a signal. The models agree: the
        regime flag lands at the bottom of every feature-importance ranking. It is kept as
        an input for continuity with the original project, and it earns roughly nothing.
      </div>
    </Card>
  )
}
