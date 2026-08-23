import React, { useMemo } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card, ChartTooltip } from './ui.jsx'
import { useTokens } from '../lib/useTokens.js'
import { monthYear, pct, shortDate } from '../lib/format.js'

function thin(rows, target = 420) {
  if (rows.length <= target) return rows
  const step = Math.ceil(rows.length / target)
  const out = rows.filter((_, i) => i % step === 0)
  if (out[out.length - 1] !== rows[rows.length - 1]) out.push(rows[rows.length - 1])
  return out
}

/* Two measures on different scales get two charts, never two y-axes on one. */
export default function DrawdownChart({ series, maxDrawdown, maxDrawdownDate, avgVol }) {
  const tokens = useTokens()
  const data = useMemo(() => thin(series), [series])

  const axis = {
    tick: { fill: tokens['text-muted'], fontSize: 11 },
    axisLine: false,
    tickLine: false,
  }

  return (
    <div className="grid grid--2">
      <Card
        title="Drawdown from running peak"
        subtitle={`Deepest loss from a prior high was ${pct(maxDrawdown, 1)} on ${shortDate(maxDrawdownDate)}.`}
      >
        <div className="chart" style={{ height: 218 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 6, right: 12, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="ddWash" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={tokens.neg} stopOpacity={0.02} />
                  <stop offset="100%" stopColor={tokens.neg} stopOpacity={0.18} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={tokens.grid} vertical={false} />
              <XAxis dataKey="date" tickFormatter={monthYear} minTickGap={48} {...axis} />
              <YAxis tickFormatter={(v) => `${v.toFixed(0)}%`} width={44} {...axis} />
              <ReferenceLine y={0} stroke={tokens.axis} />
              <Tooltip
                cursor={{ stroke: tokens.axis, strokeWidth: 1 }}
                content={
                  <ChartTooltip
                    title={shortDate}
                    rows={(payload) => [
                      { key: 'Drawdown', color: tokens.neg, value: pct(payload[0].value, 1) },
                    ]}
                  />
                }
              />
              <Area
                type="monotone"
                dataKey="drawdown"
                stroke={tokens.neg}
                strokeWidth={2}
                fill="url(#ddWash)"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card
        title="20-day rolling volatility (annualised)"
        subtitle={`Volatility arrives in clusters rather than at a steady level — the full-period figure is ${pct(avgVol, 0)}.`}
      >
        <div className="chart" style={{ height: 218 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 6, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={tokens.grid} vertical={false} />
              <XAxis dataKey="date" tickFormatter={monthYear} minTickGap={48} {...axis} />
              <YAxis tickFormatter={(v) => `${v.toFixed(0)}%`} width={44} {...axis} />
              <ReferenceLine
                y={avgVol}
                stroke={tokens['text-muted']}
                strokeWidth={1}
                label={{
                  value: `full period ${avgVol.toFixed(0)}%`,
                  position: 'insideTopRight',
                  fill: tokens['text-muted'],
                  fontSize: 10.5,
                }}
              />
              <Tooltip
                cursor={{ stroke: tokens.axis, strokeWidth: 1 }}
                content={
                  <ChartTooltip
                    title={shortDate}
                    rows={(payload) => [
                      {
                        key: 'Volatility',
                        color: tokens['series-2'],
                        value: pct(payload[0].value, 1),
                      },
                    ]}
                  />
                }
              />
              <Line
                type="monotone"
                dataKey="volatility"
                stroke={tokens['series-2']}
                strokeWidth={2}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  )
}
