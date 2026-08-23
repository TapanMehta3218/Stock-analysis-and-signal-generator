"""Exploratory data analysis, emitted as JSON the React dashboard can render.

Everything the EDA tab shows is computed here once (at train time) and cached to
`artifacts/eda.json`, so the API never recomputes statistics per request.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from .data_prep import add_features

TRADING_DAYS = 252


def _clean(value):
    """NaN/Inf are not valid JSON - collapse them to None."""
    if value is None:
        return None
    if isinstance(value, (np.floating, float)):
        value = float(value)
        return None if (np.isnan(value) or np.isinf(value)) else round(value, 6)
    if isinstance(value, (np.integer, int)):
        return int(value)
    return value


def _describe(series: pd.Series) -> dict:
    s = series.dropna()
    mode = s.round(2).mode()
    return {
        "count": int(s.count()),
        "mean": _clean(s.mean()),
        "std": _clean(s.std()),
        "var": _clean(s.var()),
        "min": _clean(s.min()),
        "q1": _clean(s.quantile(0.25)),
        "median": _clean(s.median()),
        "q3": _clean(s.quantile(0.75)),
        "max": _clean(s.max()),
        "mode": _clean(mode.iloc[0]) if len(mode) else None,
        "skew": _clean(s.skew()),
        "kurtosis": _clean(s.kurtosis()),
    }


def _drawdown(close: pd.Series) -> pd.Series:
    return close / close.cummax() - 1


def build_eda(df: pd.DataFrame) -> dict:
    frame = add_features(df)
    frame["drawdown"] = _drawdown(frame["Close"])
    frame["ma_20"] = frame["Close"].rolling(20).mean()
    frame["ma_50"] = frame["Close"].rolling(50).mean()
    frame["roll_vol_20"] = frame["ret_1"].rolling(20).std() * np.sqrt(TRADING_DAYS) * 100

    first_close = float(frame["Close"].iloc[0])
    last_close = float(frame["Close"].iloc[-1])
    years = (frame["Date"].iloc[-1] - frame["Date"].iloc[0]).days / 365.25
    total_return = (last_close / first_close - 1) * 100
    cagr = ((last_close / first_close) ** (1 / years) - 1) * 100 if years > 0 else float("nan")

    returns = frame["daily_return"].dropna()
    best_day = frame.loc[frame["daily_return"].idxmax()]
    worst_day = frame.loc[frame["daily_return"].idxmin()]
    peak_day = frame.loc[frame["Close"].idxmax()]
    trough_day = frame.loc[frame["drawdown"].idxmin()]

    # ---- Overview / hero numbers -------------------------------------------
    overview = {
        "rows": int(len(df)),
        "columns": ["Date", "modi", "Open", "High", "Low", "Close"],
        "start_date": frame["Date"].iloc[0].strftime("%Y-%m-%d"),
        "end_date": frame["Date"].iloc[-1].strftime("%Y-%m-%d"),
        "years_covered": _clean(years),
        "missing_values": {c: int(df[c].isna().sum()) for c in df.columns if c != "regime"},
        "duplicate_dates": int(df["Date"].duplicated().sum()),
        "first_close": _clean(first_close),
        "last_close": _clean(last_close),
        "total_return_pct": _clean(total_return),
        "cagr_pct": _clean(cagr),
        "annualised_volatility_pct": _clean(returns.std() * np.sqrt(TRADING_DAYS) * 100),
        "sharpe_naive": _clean(returns.mean() / returns.std() * np.sqrt(TRADING_DAYS)),
        "max_drawdown_pct": _clean(frame["drawdown"].min() * 100),
        "max_drawdown_date": trough_day["Date"].strftime("%Y-%m-%d"),
        "all_time_high": _clean(peak_day["High"]),
        "all_time_high_date": peak_day["Date"].strftime("%Y-%m-%d"),
        "best_day": {
            "date": best_day["Date"].strftime("%Y-%m-%d"),
            "return_pct": _clean(best_day["daily_return"] * 100),
        },
        "worst_day": {
            "date": worst_day["Date"].strftime("%Y-%m-%d"),
            "return_pct": _clean(worst_day["daily_return"] * 100),
        },
        "positive_days_pct": _clean((returns > 0).mean() * 100),
    }

    # ---- Univariate summaries ----------------------------------------------
    summary = {
        col: _describe(frame[col]) for col in ("Open", "High", "Low", "Close")
    }
    summary["Daily return %"] = _describe(frame["daily_return"] * 100)
    summary["Intraday range %"] = _describe(frame["range_pct"] * 100)

    # ---- Correlation --------------------------------------------------------
    corr_cols = {
        "Open": frame["Open"],
        "High": frame["High"],
        "Low": frame["Low"],
        "Close": frame["Close"],
        "Return %": frame["daily_return"] * 100,
        "Range %": frame["range_pct"] * 100,
        "RSI 14": frame["rsi_14"],
    }
    corr = pd.DataFrame(corr_cols).corr()
    correlation = {
        "labels": list(corr.columns),
        "matrix": [[_clean(v) for v in row] for row in corr.to_numpy()],
    }

    # ---- Price series (weekly-sampled to keep the payload light) ------------
    price_series = [
        {
            "date": r["Date"].strftime("%Y-%m-%d"),
            "open": _clean(r["Open"]),
            "high": _clean(r["High"]),
            "low": _clean(r["Low"]),
            "close": _clean(r["Close"]),
            "ma20": _clean(r["ma_20"]),
            "ma50": _clean(r["ma_50"]),
            "regime": int(r["regime"]),
            "drawdown": _clean(r["drawdown"] * 100),
            "volatility": _clean(r["roll_vol_20"]),
        }
        for _, r in frame.iterrows()
    ]

    # ---- Yearly breakdown ---------------------------------------------------
    frame["year"] = frame["Date"].dt.year
    yearly = []
    for year, grp in frame.groupby("year"):
        yearly.append(
            {
                "year": int(year),
                "trading_days": int(len(grp)),
                "open": _clean(grp["Open"].iloc[0]),
                "close": _clean(grp["Close"].iloc[-1]),
                "high": _clean(grp["High"].max()),
                "low": _clean(grp["Low"].min()),
                "return_pct": _clean((grp["Close"].iloc[-1] / grp["Open"].iloc[0] - 1) * 100),
                "volatility_pct": _clean(
                    grp["daily_return"].std() * np.sqrt(TRADING_DAYS) * 100
                ),
                "avg_range_pct": _clean(grp["range_pct"].mean() * 100),
            }
        )

    # ---- Month x year return heatmap ---------------------------------------
    monthly = (
        frame.set_index("Date")["Close"].resample("ME").last().pct_change() * 100
    ).dropna()
    monthly_returns = [
        {
            "year": int(idx.year),
            "month": int(idx.month),
            "return_pct": _clean(val),
        }
        for idx, val in monthly.items()
    ]

    # ---- Daily-return histogram --------------------------------------------
    pct_returns = (returns * 100).to_numpy()
    counts, edges = np.histogram(pct_returns, bins=40)
    distribution = [
        {
            "bin_start": _clean(edges[i]),
            "bin_end": _clean(edges[i + 1]),
            "mid": _clean((edges[i] + edges[i + 1]) / 2),
            "count": int(counts[i]),
        }
        for i in range(len(counts))
    ]

    # ---- Regime comparison (the `modi` flag from the original project) ------
    regime_comparison = []
    for flag, label in ((0, "Regime L"), (1, "Regime W")):
        grp = frame[frame["regime"] == flag]
        if grp.empty:
            continue
        grp_ret = grp["daily_return"].dropna()
        regime_comparison.append(
            {
                "regime": label,
                "flag": "l" if flag == 0 else "w",
                "days": int(len(grp)),
                "start_date": grp["Date"].iloc[0].strftime("%Y-%m-%d"),
                "end_date": grp["Date"].iloc[-1].strftime("%Y-%m-%d"),
                "mean_close": _clean(grp["Close"].mean()),
                "median_close": _clean(grp["Close"].median()),
                "min_close": _clean(grp["Close"].min()),
                "max_close": _clean(grp["Close"].max()),
                "avg_daily_return_pct": _clean(grp_ret.mean() * 100),
                "volatility_pct": _clean(grp_ret.std() * np.sqrt(TRADING_DAYS) * 100),
                "positive_days_pct": _clean((grp_ret > 0).mean() * 100),
                "avg_range_pct": _clean(grp["range_pct"].mean() * 100),
            }
        )

    # ---- Largest moves ------------------------------------------------------
    moves = frame.dropna(subset=["daily_return"]).copy()
    moves["abs_move"] = moves["daily_return"].abs()
    extremes = [
        {
            "date": r["Date"].strftime("%Y-%m-%d"),
            "close": _clean(r["Close"]),
            "return_pct": _clean(r["daily_return"] * 100),
            "regime": "w" if r["regime"] == 1 else "l",
        }
        for _, r in moves.nlargest(10, "abs_move").iterrows()
    ]

    return {
        "overview": overview,
        "summary": summary,
        "correlation": correlation,
        "price_series": price_series,
        "yearly": yearly,
        "monthly_returns": monthly_returns,
        "return_distribution": distribution,
        "regime_comparison": regime_comparison,
        "extreme_moves": extremes,
    }
