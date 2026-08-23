import React from 'react'
import { Card } from './ui.jsx'
import { useTokens } from '../lib/useTokens.js'
import { diverging, inkFor } from '../lib/scales.js'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const SCALE = 25 // ±25% saturates the colour ramp

export default function MonthlyHeatmap({ monthlyReturns }) {
  const tokens = useTokens()
  const years = [...new Set(monthlyReturns.map((r) => r.year))].sort()

  const lookup = new Map(
    monthlyReturns.map((r) => [`${r.year}-${r.month}`, r.return_pct]),
  )

  return (
    <Card
      title="Monthly returns"
      subtitle="Month-on-month close-to-close change. No month repeats reliably across years — there is no seasonal pattern to trade here."
    >
      <div className="legend">
        <span className="legend__item">
          <span
            className="legend__swatch"
            style={{ background: diverging(-SCALE, SCALE, tokens.neg, tokens.pos, tokens['surface-2']) }}
          />
          −25% or worse
        </span>
        <span className="legend__item">
          <span className="legend__swatch" style={{ background: tokens['surface-2'] }} />
          flat
        </span>
        <span className="legend__item">
          <span
            className="legend__swatch"
            style={{ background: diverging(SCALE, SCALE, tokens.neg, tokens.pos, tokens['surface-2']) }}
          />
          +25% or better
        </span>
      </div>

      <div className="table-wrap">
        <div
          className="heatmap"
          style={{ gridTemplateColumns: `52px repeat(12, minmax(38px, 1fr))`, minWidth: 560 }}
        >
          <div />
          {MONTHS.map((m) => (
            <div className="heatmap__col" key={m}>
              {m}
            </div>
          ))}

          {years.map((year) => (
            <React.Fragment key={year}>
              <div className="heatmap__label">{year}</div>
              {MONTHS.map((_, index) => {
                const value = lookup.get(`${year}-${index + 1}`)
                const missing = value == null
                return (
                  <div
                    key={`${year}-${index}`}
                    className="heatmap__cell"
                    title={
                      missing
                        ? `${MONTHS[index]} ${year}: no data`
                        : `${MONTHS[index]} ${year}: ${value.toFixed(1)}%`
                    }
                    style={{
                      background: missing
                        ? 'transparent'
                        : diverging(value, SCALE, tokens.neg, tokens.pos, tokens['surface-2']),
                      color: missing ? 'var(--text-muted)' : inkFor(value, SCALE),
                      border: missing ? `1px dashed ${tokens.grid}` : 'none',
                    }}
                  >
                    {missing ? '·' : value.toFixed(0)}
                  </div>
                )
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
    </Card>
  )
}
