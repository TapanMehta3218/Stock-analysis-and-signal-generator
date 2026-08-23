"""Loading, cleaning and feature engineering for the Adani stock dataset.

The raw CSV (2016-01-01 .. 2023-01-30, 1750 trading days) has columns:
    Date, modi, Open, Low, Close, High, <trailing empty column>

`modi` is the political-regime flag carried over from the original project:
    'l' -> pre/without-win regime, 'w' -> "Modi wins" regime.

Two supervised problems are built from it:

TRACK A - "forecast": predict the NEXT day's close.
    Target is the next-day *return*, not the next-day price. Prices here move
    from ~Rs.32 to ~Rs.4175, so a chronological test split sits entirely above
    the training range. Tree models cannot extrapolate past values they have
    seen, so predicting raw price would make Random Forest and XGBoost look
    broken for a reason that has nothing to do with the algorithms. Returns are
    roughly stationary, so every model gets a fair shot; the price is
    reconstructed afterwards as close_t * (1 + predicted_return).

TRACK B - "intraday": predict today's Close/High/Low from today's Open.
    This is the original notebook's framing and it is what the dashboard's
    "what if the stock opens at X" panel needs. Targets are ratios to the open
    (Close/Open, High/Open, Low/Open) for the same non-stationarity reason;
    the rupee values are reconstructed by multiplying back by the open.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from .config import DATA_CSV

RAW_COLUMNS = ["Date", "modi", "Open", "Low", "Close", "High"]

FORECAST_FEATURES = [
    "ret_1",
    "ret_2",
    "ret_3",
    "ret_5",
    "ret_10",
    "ma_ratio_5",
    "ma_ratio_10",
    "ma_ratio_20",
    "vol_5",
    "vol_10",
    "vol_20",
    "range_pct",
    "body_pct",
    "close_pos",
    "gap_pct",
    "rsi_14",
    "regime",
]

INTRADAY_FEATURES = [
    "gap_pct",
    "prev_ret_1",
    "prev_ret_5",
    "prev_ma_ratio_5",
    "prev_ma_ratio_10",
    "prev_ma_ratio_20",
    "prev_vol_5",
    "prev_vol_10",
    "prev_range_pct",
    "regime",
]

INTRADAY_TARGETS = ["ratio_close", "ratio_high", "ratio_low"]


def load_raw(csv_path=None) -> pd.DataFrame:
    """Read the CSV, drop the trailing blank column, sort chronologically."""
    df = pd.read_csv(csv_path or DATA_CSV)
    df = df[[c for c in RAW_COLUMNS if c in df.columns]].copy()

    df["Date"] = pd.to_datetime(df["Date"], format="%d-%m-%Y", errors="coerce")
    df = df.dropna(subset=["Date"])

    for col in ("Open", "High", "Low", "Close"):
        df[col] = pd.to_numeric(df[col], errors="coerce")
    df = df.dropna(subset=["Open", "High", "Low", "Close"])

    # A handful of rows could carry a non-positive price; they would blow up the
    # ratio/return features below.
    df = df[(df[["Open", "High", "Low", "Close"]] > 0).all(axis=1)]

    df["modi"] = df["modi"].astype(str).str.strip().str.lower()
    df["regime"] = (df["modi"] == "w").astype(int)

    df = df.sort_values("Date").drop_duplicates(subset="Date").reset_index(drop=True)
    return df


def _rsi(close: pd.Series, window: int = 14) -> pd.Series:
    delta = close.diff()
    gain = delta.clip(lower=0.0)
    loss = -delta.clip(upper=0.0)
    avg_gain = gain.ewm(alpha=1 / window, adjust=False, min_periods=window).mean()
    avg_loss = loss.ewm(alpha=1 / window, adjust=False, min_periods=window).mean()
    rs = avg_gain / avg_loss.replace(0.0, np.nan)
    return (100 - 100 / (1 + rs)).fillna(50.0)


def add_features(df: pd.DataFrame) -> pd.DataFrame:
    """Attach scale-free technical features. Every one uses data available at
    the close of day t, so nothing leaks from the future."""
    out = df.copy()
    close, high, low, open_ = out["Close"], out["High"], out["Low"], out["Open"]

    for n in (1, 2, 3, 5, 10):
        out[f"ret_{n}"] = close.pct_change(n)

    for n in (5, 10, 20):
        out[f"ma_ratio_{n}"] = close / close.rolling(n).mean() - 1
        out[f"vol_{n}"] = out["ret_1"].rolling(n).std()

    span = (high - low).replace(0.0, np.nan)
    out["range_pct"] = (high - low) / close
    out["body_pct"] = (close - open_) / open_
    out["close_pos"] = ((close - low) / span).fillna(0.5)  # 0 = closed on the low
    out["gap_pct"] = open_ / close.shift(1) - 1
    out["rsi_14"] = _rsi(close)

    # Same-day derived series used by the EDA layer.
    out["daily_return"] = close.pct_change()
    return out


@dataclass
class Dataset:
    """A ready-to-train supervised problem with a chronological split."""

    name: str
    frame: pd.DataFrame
    feature_names: list[str]
    target_names: list[str]
    X_train: np.ndarray
    X_test: np.ndarray
    y_train: np.ndarray
    y_test: np.ndarray
    train_index: pd.Index
    test_index: pd.Index

    @property
    def split_date(self) -> str:
        return self.frame.loc[self.test_index[0], "Date"].strftime("%Y-%m-%d")


def _chronological_split(
    frame: pd.DataFrame, features: list[str], targets: list[str], name: str, test_size: float
) -> Dataset:
    frame = frame.dropna(subset=features + targets).reset_index(drop=True)
    split_at = int(len(frame) * (1 - test_size))

    X = frame[features].to_numpy(dtype=float)
    y = frame[targets].to_numpy(dtype=float)
    if len(targets) == 1:
        y = y.ravel()

    return Dataset(
        name=name,
        frame=frame,
        feature_names=list(features),
        target_names=list(targets),
        X_train=X[:split_at],
        X_test=X[split_at:],
        y_train=y[:split_at],
        y_test=y[split_at:],
        train_index=frame.index[:split_at],
        test_index=frame.index[split_at:],
    )


def build_forecast_dataset(df: pd.DataFrame, test_size: float) -> Dataset:
    """Track A: next-day return, with the anchor close kept for reconstruction."""
    frame = add_features(df)
    frame["target_next_return"] = frame["Close"].shift(-1) / frame["Close"] - 1
    frame["target_next_close"] = frame["Close"].shift(-1)
    frame["anchor_close"] = frame["Close"]
    return _chronological_split(
        frame, FORECAST_FEATURES, ["target_next_return"], "forecast", test_size
    )


def build_intraday_dataset(df: pd.DataFrame, test_size: float) -> Dataset:
    """Track B: today's Close/High/Low as ratios of today's Open."""
    frame = add_features(df)
    for col in ("ret_1", "ret_5", "ma_ratio_5", "ma_ratio_10", "ma_ratio_20",
                "vol_5", "vol_10", "range_pct"):
        frame[f"prev_{col}"] = frame[col].shift(1)

    frame["ratio_close"] = frame["Close"] / frame["Open"]
    frame["ratio_high"] = frame["High"] / frame["Open"]
    frame["ratio_low"] = frame["Low"] / frame["Open"]
    frame["anchor_open"] = frame["Open"]

    return _chronological_split(
        frame, INTRADAY_FEATURES, INTRADAY_TARGETS, "intraday", test_size
    )


def latest_context(df: pd.DataFrame) -> dict:
    """Everything needed to build inference features for a user-supplied open."""
    frame = add_features(df)
    last = frame.iloc[-1]
    return {
        "date": last["Date"].strftime("%Y-%m-%d"),
        "open": float(last["Open"]),
        "high": float(last["High"]),
        "low": float(last["Low"]),
        "close": float(last["Close"]),
        "regime": int(last["regime"]),
        "features": {c: float(last[c]) for c in FORECAST_FEATURES if pd.notna(last[c])},
        "prev_features": {
            f"prev_{c}": float(last[c])
            for c in ("ret_1", "ret_5", "ma_ratio_5", "ma_ratio_10", "ma_ratio_20",
                      "vol_5", "vol_10", "range_pct")
            if pd.notna(last[c])
        },
    }
