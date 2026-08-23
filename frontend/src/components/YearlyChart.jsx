import React from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card, ChartTooltip, Legend } from './ui.jsx'
import { useTokens } from '../lib/useTokens.js'
import { pct, rupees, signedPct } from '../lib/format.js'

export default function YearlyChart({ yearly }) {
  const tokens = useTokens()
  const partial = yearly[yearly.length - 1]

  return (
    <Card
      title="Calendar-year return"
      subtitle={`Open-to-close return for each year. ${partial.year} covers only ${partial.trading_days} trading days, so it is not comparable with the full years beside it.`}
    >
      <Legend
        items={[
          { label: 'Positive year', color: tokens.pos },
          { label: 'Negative year', color: tokens.neg },
        ]}
      />
      <div className="chart" style={{ height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={yearly} margin={{ top: 22, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={tokens.grid} vertical={false} />
            <XAxis
              dataKey="year"
              tick={{ fill: tokens['text-muted'], fontSize: 11 }}
              axisLine={{ stroke: tokens.axis }}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(v) => `${v.toFixed(0)}%`}
              tick={{ fill: tokens['text-muted'], fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={48}
            />
            <ReferenceLine y={0} stroke={tokens.axis} strokeWidth={1} />
            <Tooltip
              cursor={{ fill: tokens['surface-2'], opacity: 0.55 }}
              content={
                <ChartTooltip
                  rows={(payload) => {
                    const d = payload[0].payload
                    return [
                      {
                        key: 'Return',
                        color: d.return_pct >= 0 ? tokens.pos : tokens.neg,
                        value: signedPct(d.return_pct, 1),
                      },
                      { key: 'Year high', value: rupees(d.high, 0) },
                      { key: 'Year low', value: rupees(d.low, 0) },
                      { key: 'Volatility', value: pct(d.volatility_pct, 0) },
                      { key: 'Trading days', value: d.trading_days },
                    ]
                  }}
                />
              }
            />
            <Bar dataKey="return_pct" maxBarSize={24} radius={[4, 4, 0, 0]}>
              {yearly.map((row) => (
                <Cell key={row.year} fill={row.return_pct >= 0 ? tokens.pos : tokens.neg} />
              ))}
              <LabelList
                dataKey="return_pct"
                position="top"
                formatter={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(0)}%`}
                fill={tokens['text-secondary']}
                fontSize={11}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
