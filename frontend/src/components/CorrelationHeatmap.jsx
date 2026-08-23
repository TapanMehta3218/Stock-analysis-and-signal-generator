import React, { useState } from 'react'
import { Card } from './ui.jsx'
import { useTokens } from '../lib/useTokens.js'
import { diverging, inkFor } from '../lib/scales.js'

export default function CorrelationHeatmap({ correlation }) {
  const tokens = useTokens()
  const [hover, setHover] = useState(null)
  const { labels, matrix } = correlation
  const mid = tokens['surface-2']

  return (
    <Card
      title="Correlation matrix"
      subtitle="Open/High/Low/Close move together almost perfectly — which is exactly why predicting High from Open scores well while learning very little. The derived columns carry the real information."
    >
      <div className="legend">
        <span className="legend__item">
          <span
            className="legend__swatch"
            style={{ background: diverging(-1, 1, tokens.neg, tokens['series-1'], mid) }}
          />
          −1
        </span>
        <span className="legend__item">
          <span className="legend__swatch" style={{ background: mid }} />0
        </span>
        <span className="legend__item">
          <span
            className="legend__swatch"
            style={{ background: diverging(1, 1, tokens.neg, tokens['series-1'], mid) }}
          />
          +1
        </span>
      </div>

      <div className="table-wrap">
        <div
          className="heatmap"
          style={{
            gridTemplateColumns: `84px repeat(${labels.length}, minmax(52px, 1fr))`,
            minWidth: 520,
          }}
        >
          <div />
          {labels.map((label) => (
            <div className="heatmap__col" key={`col-${label}`}>
              {label}
            </div>
          ))}

          {matrix.map((row, r) => (
            <React.Fragment key={`row-${labels[r]}`}>
              <div className="heatmap__label">{labels[r]}</div>
              {row.map((value, c) => {
                const isHover = hover?.r === r && hover?.c === c
                return (
                  <div
                    key={`${r}-${c}`}
                    className="heatmap__cell"
                    title={`${labels[r]} vs ${labels[c]}: ${value?.toFixed(2)}`}
                    onMouseEnter={() => setHover({ r, c })}
                    onMouseLeave={() => setHover(null)}
                    style={{
                      background: diverging(value, 1, tokens.neg, tokens['series-1'], mid),
                      color: inkFor(value, 1),
                      outline: isHover ? `2px solid ${tokens['text-primary']}` : 'none',
                      outlineOffset: '-2px',
                    }}
                  >
                    {value?.toFixed(2)}
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
