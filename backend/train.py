"""Train all three models on both tracks and write the dashboard artifacts.

    python train.py

Outputs into ./artifacts:
    models/<track>_<model>.joblib   fitted estimators
    metrics.json                    scores, test-set curves, feature importances
    eda.json                        the exploratory analysis payload
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import joblib
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.config import (  # noqa: E402
    ARTIFACTS_DIR,
    EDA_JSON,
    METRICS_JSON,
    MODEL_KEYS,
    MODEL_LABELS,
    MODELS_DIR,
    TEST_SIZE,
)
from app.data_prep import (  # noqa: E402
    build_forecast_dataset,
    build_intraday_dataset,
    latest_context,
    load_raw,
)
from app.eda import build_eda  # noqa: E402
from app.models import (  # noqa: E402
    build_model,
    directional_accuracy,
    feature_importance,
    price_metrics,
)


def _clip_ranges(dataset) -> dict:
    """1st/99th percentile of each training feature.

    At inference the user can type an opening price far outside anything the
    stock has ever gapped to. Clipping the derived features back into the
    training range keeps the models inside the region where they were actually
    fitted instead of silently extrapolating.
    """
    lo = np.percentile(dataset.X_train, 1, axis=0)
    hi = np.percentile(dataset.X_train, 99, axis=0)
    return {
        name: {"min": float(lo[i]), "max": float(hi[i])}
        for i, name in enumerate(dataset.feature_names)
    }


def train_forecast(dataset) -> dict:
    """Track A - next-day close, scored in rupees after reconstruction."""
    frame = dataset.frame
    anchor = frame.loc[dataset.test_index, "anchor_close"].to_numpy(dtype=float)
    actual_close = frame.loc[dataset.test_index, "target_next_close"].to_numpy(dtype=float)
    actual_return = dataset.y_test
    dates = frame.loc[dataset.test_index, "Date"].dt.strftime("%Y-%m-%d").tolist()

    results, curves = {}, {"dates": dates, "actual": [round(float(v), 2) for v in actual_close]}

    for key in MODEL_KEYS:
        model = build_model(key, multioutput=False)
        started = time.perf_counter()
        model.fit(dataset.X_train, dataset.y_train)
        train_seconds = time.perf_counter() - started

        pred_return = np.asarray(model.predict(dataset.X_test), dtype=float).ravel()
        pred_close = anchor * (1 + pred_return)

        metrics = price_metrics(actual_close, pred_close)
        metrics["directional_accuracy"] = directional_accuracy(actual_return, pred_return)
        metrics["train_seconds"] = round(train_seconds, 3)
        # Buy-and-hold style baseline: "tomorrow closes where today closed".
        metrics["naive_rmse"] = price_metrics(actual_close, anchor)["rmse"]
        metrics["beats_naive"] = bool(metrics["rmse"] < metrics["naive_rmse"])

        results[key] = {
            "label": MODEL_LABELS[key],
            "metrics": metrics,
            "importances": feature_importance(
                model, dataset.X_test, dataset.y_test, dataset.feature_names
            )[:10],
        }
        curves[key] = [round(float(v), 2) for v in pred_close]

        joblib.dump(model, MODELS_DIR / f"forecast_{key}.joblib")
        print(
            f"  forecast/{MODEL_LABELS[key]:<14} "
            f"RMSE Rs.{metrics['rmse']:>8.2f}  MAE Rs.{metrics['mae']:>8.2f}  "
            f"MAPE {metrics['mape']:>5.2f}%  R2 {metrics['r2']:>6.3f}  "
            f"Dir {metrics['directional_accuracy']:>5.1f}%"
        )

    return {
        "models": results,
        "curves": curves,
        "feature_names": dataset.feature_names,
        "clip": _clip_ranges(dataset),
        "split_date": dataset.split_date,
        "train_rows": int(len(dataset.X_train)),
        "test_rows": int(len(dataset.X_test)),
    }


def train_intraday(dataset) -> dict:
    """Track B - today's Close/High/Low from today's Open."""
    frame = dataset.frame
    anchor = frame.loc[dataset.test_index, "anchor_open"].to_numpy(dtype=float)
    actual_prices = np.column_stack(
        [
            frame.loc[dataset.test_index, "Close"].to_numpy(dtype=float),
            frame.loc[dataset.test_index, "High"].to_numpy(dtype=float),
            frame.loc[dataset.test_index, "Low"].to_numpy(dtype=float),
        ]
    )
    target_labels = ["Close", "High", "Low"]
    results = {}

    for key in MODEL_KEYS:
        model = build_model(key, multioutput=True)
        started = time.perf_counter()
        model.fit(dataset.X_train, dataset.y_train)
        train_seconds = time.perf_counter() - started

        pred_ratio = np.asarray(model.predict(dataset.X_test), dtype=float)
        pred_prices = pred_ratio * anchor[:, None]

        per_target = {
            label: price_metrics(actual_prices[:, i], pred_prices[:, i])
            for i, label in enumerate(target_labels)
        }
        overall = price_metrics(actual_prices.ravel(), pred_prices.ravel())
        overall["train_seconds"] = round(train_seconds, 3)

        results[key] = {
            "label": MODEL_LABELS[key],
            "metrics": overall,
            "per_target": per_target,
        }

        joblib.dump(model, MODELS_DIR / f"intraday_{key}.joblib")
        print(
            f"  intraday/{MODEL_LABELS[key]:<14} "
            f"RMSE Rs.{overall['rmse']:>8.2f}  MAE Rs.{overall['mae']:>8.2f}  "
            f"MAPE {overall['mape']:>5.2f}%  R2 {overall['r2']:>6.3f}"
        )

    return {
        "models": results,
        "feature_names": dataset.feature_names,
        "target_names": target_labels,
        "clip": _clip_ranges(dataset),
        "split_date": dataset.split_date,
        "train_rows": int(len(dataset.X_train)),
        "test_rows": int(len(dataset.X_test)),
    }


def main() -> None:
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)

    print("Loading data ...")
    df = load_raw()
    print(f"  {len(df)} trading days, "
          f"{df['Date'].min():%Y-%m-%d} -> {df['Date'].max():%Y-%m-%d}")

    print("Building EDA ...")
    eda = build_eda(df)
    EDA_JSON.write_text(json.dumps(eda, indent=None), encoding="utf-8")
    print(f"  wrote {EDA_JSON.name} ({EDA_JSON.stat().st_size / 1024:.0f} KB)")

    print("Training track A - next-day close forecast ...")
    forecast = train_forecast(build_forecast_dataset(df, TEST_SIZE))

    print("Training track B - intraday Close/High/Low from Open ...")
    intraday = train_intraday(build_intraday_dataset(df, TEST_SIZE))

    payload = {
        "generated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "test_size": TEST_SIZE,
        "dataset": {
            "rows": int(len(df)),
            "start": df["Date"].min().strftime("%Y-%m-%d"),
            "end": df["Date"].max().strftime("%Y-%m-%d"),
        },
        "latest": latest_context(df),
        "forecast": forecast,
        "intraday": intraday,
    }
    METRICS_JSON.write_text(json.dumps(payload, indent=None), encoding="utf-8")
    print(f"  wrote {METRICS_JSON.name} ({METRICS_JSON.stat().st_size / 1024:.0f} KB)")
    print("Done.")


if __name__ == "__main__":
    main()
