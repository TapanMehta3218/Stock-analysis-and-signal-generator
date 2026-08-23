import React from 'react'
import { Card, StatTile } from './ui.jsx'
import PriceChart from './PriceChart.jsx'
import { modelColor, useTokens } from '../lib/useTokens.js'
import { num, pct, rupees, shortDate, signedPct } from '../lib/format.js'

export default function OverviewTab({ overview, latest, priceSeries, board }) {
  const tokens = useTokens()
  const o = overview

  return (
    <div className="stack">
      <Card
        title="Adani Enterprises · ADANIENT"
        subtitle={`Daily open, high, low and close for ${o.rows.toLocaleString('en-IN')} trading days between ${shortDate(o.start_date)} and ${shortDate(o.end_date)}. No missing values, no duplicate dates, no volume column.`}
      >
        {/* Exactly one hero figure per view. */}
        <div className="hero">
          <span className="hero__value">{rupees(o.last_close)}</span>
          <span className="hero__meta">
            last close · {shortDate(o.end_date)}
            <br />
            <span className={o.total_return_pct >= 0 ? 'up' : 'down'}>
              {signedPct(o.total_return_pct, 0)}
            </span>{' '}
            since {shortDate(o.start_date)} ({rupees(o.first_close)})
          </span>
        </div>
      </Card>

      <div className="grid grid--kpi">
        <StatTile
          label="Compound annual growth"
          value={pct(o.cagr_pct, 1)}
          delta={`over ${num(o.years_covered, 1)} years`}
        />
        <StatTile
          label="Annualised volatility"
          value={pct(o.annualised_volatility_pct, 1)}
          delta={`naive Sharpe ${num(o.sharpe_naive, 2)}`}
        />
        <StatTile
          label="Maximum drawdown"
          value={pct(o.max_drawdown_pct, 1)}
          delta={`trough ${shortDate(o.max_drawdown_date)}`}
          deltaTone="down"
        />
        <StatTile
          label="All-time high"
          value={rupees(o.all_time_high, 0)}
          delta={shortDate(o.all_time_high_date)}
        />
        <StatTile
          label="Positive days"
          value={pct(o.positive_days_pct, 1)}
          delta={`best ${signedPct(o.best_day.return_pct, 1)} · worst ${signedPct(o.worst_day.return_pct, 1)}`}
        />
      </div>

      <PriceChart series={priceSeries} />

      <Card
        title="Model scoreboard at a glance"
        subtitle="Three algorithms on one chronological hold-out split. Full detail, including the naive baseline they are measured against, is on the Models tab."
      >
        <div className="grid grid--4">
          {board.forecast.models.map((m) => (
            <div key={m.key}>
              <div className="tile__label">
                <span className="cell-key">
                  <span className="dot" style={{ background: modelColor(tokens, m.key) }} />
                  {m.label}
                  {m.key === board.best_model.key && (
                    <span className="badge" style={{ marginLeft: 2 }}>
                      best
                    </span>
                  )}
                </span>
              </div>
              <div className="tile__value">{rupees(m.rmse)}</div>
              <div className="tile__delta">
                RMSE · {pct(m.mape)} MAPE ·{' '}
                <span className={m.directional_accuracy > 50 ? 'up' : 'down'}>
                  {pct(m.directional_accuracy, 1)} direction
                </span>
              </div>
            </div>
          ))}
          <div>
            <div className="tile__label">
              <span className="cell-key">
                <span className="dot" style={{ background: tokens['text-muted'] }} />
                Naive baseline
              </span>
            </div>
            <div className="tile__value">{rupees(board.forecast.naive_rmse)}</div>
            <div className="tile__delta">RMSE · carry today's close forward</div>
          </div>
        </div>

        <div className="note" style={{ marginTop: 16 }}>
          Latest market state in the dataset: {shortDate(latest.date)} closed at{' '}
          {rupees(latest.close)} after opening at {rupees(latest.open)}, with an intraday
          range of {rupees(latest.low)}–{rupees(latest.high)}. That row is what the
          next-day forecast on the Predict tab is anchored to.
        </div>
      </Card>
    </div>
  )
}
