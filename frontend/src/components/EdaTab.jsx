import React from 'react'
import CorrelationHeatmap from './CorrelationHeatmap.jsx'
import DrawdownChart from './DrawdownChart.jsx'
import MonthlyHeatmap from './MonthlyHeatmap.jsx'
import RegimeCard from './RegimeCard.jsx'
import ReturnDistribution from './ReturnDistribution.jsx'
import YearlyChart from './YearlyChart.jsx'
import { ExtremeMoves, SummaryTable } from './SummaryTables.jsx'

export default function EdaTab({ eda }) {
  return (
    <div className="stack">
      <SummaryTable summary={eda.summary} />

      <DrawdownChart
        series={eda.price_series}
        maxDrawdown={eda.overview.max_drawdown_pct}
        maxDrawdownDate={eda.overview.max_drawdown_date}
        avgVol={eda.overview.annualised_volatility_pct}
      />

      <div className="grid grid--2">
        <YearlyChart yearly={eda.yearly} />
        <ReturnDistribution distribution={eda.return_distribution} summary={eda.summary} />
      </div>

      <MonthlyHeatmap monthlyReturns={eda.monthly_returns} />

      <div className="grid grid--2">
        <CorrelationHeatmap correlation={eda.correlation} />
        <ExtremeMoves moves={eda.extreme_moves} />
      </div>

      <RegimeCard regimes={eda.regime_comparison} />
    </div>
  )
}
