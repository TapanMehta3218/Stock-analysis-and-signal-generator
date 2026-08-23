import React from 'react'
import { Card } from './ui.jsx'
import { useTokens } from '../lib/useTokens.js'
import { num, pct, rupees, shortDate } from '../lib/format.js'

const COLUMNS = ['mean', 'std', 'min', 'q1', 'median', 'q3', 'max', 'skew', 'kurtosis']
const HEADERS = ['Mean', 'Std dev', 'Min', 'Q1', 'Median', 'Q3', 'Max', 'Skew', 'Kurtosis']

export function SummaryTable({ summary }) {
  return (
    <Card
      title="Descriptive statistics"
      subtitle="Price columns are in rupees; the last two rows are percentages. Prices span a ~130× range, which is the single fact that shapes every modelling decision downstream."
    >
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Column</th>
              {HEADERS.map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.entries(summary).map(([name, stats]) => {
              const isPct = name.includes('%')
              return (
                <tr key={name}>
                  <td>{name}</td>
                  {COLUMNS.map((col) => (
                    <td key={col}>
                      {['skew', 'kurtosis'].includes(col)
                        ? num(stats[col], 2)
                        : isPct
                          ? pct(stats[col], 2)
                          : rupees(stats[col], 2)}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

export function ExtremeMoves({ moves }) {
  const tokens = useTokens()
  return (
    <Card
      title="Ten largest single-day moves"
      subtitle="Days of ±20% are present in the sample. Any point forecast should be read against moves of this size, not against the average day."
    >
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Close</th>
              <th>Move</th>
              <th>Flag</th>
            </tr>
          </thead>
          <tbody>
            {moves.map((m) => (
              <tr key={m.date}>
                <td>{shortDate(m.date)}</td>
                <td>{rupees(m.close, 2)}</td>
                <td>
                  <span className="cell-key" style={{ justifyContent: 'flex-end' }}>
                    <span
                      className="dot"
                      style={{ background: m.return_pct >= 0 ? tokens.pos : tokens.neg }}
                    />
                    {m.return_pct >= 0 ? '+' : ''}
                    {m.return_pct.toFixed(2)}%
                  </span>
                </td>
                <td>{m.regime}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
