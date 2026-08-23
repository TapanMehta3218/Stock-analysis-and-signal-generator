"""Loads the trained artifacts and serves predictions from all three models."""

from __future__ import annotations

import json
import threading

import joblib
import numpy as np

from .config import EDA_JSON, METRICS_JSON, MODEL_KEYS, MODEL_LABELS, MODELS_DIR


class ArtifactsMissing(RuntimeError):
    """Raised when the API starts before `python train.py` has been run."""


class Registry:
    """Lazy, process-wide cache of metrics, EDA payload and fitted models."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._metrics: dict | None = None
        self._eda: dict | None = None
        self._models: dict[str, object] = {}

    # ---- artifact access ----------------------------------------------------
    @property
    def metrics(self) -> dict:
        if self._metrics is None:
            if not METRICS_JSON.exists():
                raise ArtifactsMissing(
                    "artifacts/metrics.json not found - run `python train.py` first."
                )
            with self._lock:
                self._metrics = json.loads(METRICS_JSON.read_text(encoding="utf-8"))
        return self._metrics

    @property
    def eda(self) -> dict:
        if self._eda is None:
            if not EDA_JSON.exists():
                raise ArtifactsMissing(
                    "artifacts/eda.json not found - run `python train.py` first."
                )
            with self._lock:
                self._eda = json.loads(EDA_JSON.read_text(encoding="utf-8"))
        return self._eda

    def model(self, track: str, key: str):
        cache_key = f"{track}_{key}"
        if cache_key not in self._models:
            path = MODELS_DIR / f"{cache_key}.joblib"
            if not path.exists():
                raise ArtifactsMissing(
                    f"artifacts/models/{path.name} not found - run `python train.py` first."
                )
            with self._lock:
                self._models[cache_key] = joblib.load(path)
        return self._models[cache_key]

    def ready(self) -> bool:
        return METRICS_JSON.exists() and EDA_JSON.exists() and any(MODELS_DIR.glob("*.joblib"))

    # ---- feature assembly ---------------------------------------------------
    def _vector(self, track: str, values: dict) -> tuple[np.ndarray, list[str]]:
        """Order features as the model expects and clip to the training range."""
        spec = self.metrics[track]
        names = spec["feature_names"]
        clip = spec["clip"]

        row, clamped = [], []
        for name in names:
            raw = float(values.get(name, 0.0))
            bounds = clip.get(name)
            if bounds:
                bounded = min(max(raw, bounds["min"]), bounds["max"])
                if not np.isclose(bounded, raw):
                    clamped.append(name)
                raw = bounded
            row.append(raw)
        return np.array([row], dtype=float), clamped

    # ---- prediction ---------------------------------------------------------
    def predict_intraday(self, open_price: float, regime: int) -> dict:
        """Today's Close / High / Low given today's opening price."""
        latest = self.metrics["latest"]
        last_close = float(latest["close"])

        values = dict(latest["prev_features"])
        values["gap_pct"] = open_price / last_close - 1
        values["regime"] = int(regime)

        X, clamped = self._vector("intraday", values)
        targets = self.metrics["intraday"]["target_names"]

        predictions = []
        for key in MODEL_KEYS:
            ratios = np.asarray(self.model("intraday", key).predict(X), dtype=float).ravel()
            prices = {
                label.lower(): round(float(open_price * ratios[i]), 2)
                for i, label in enumerate(targets)
            }
            metrics = self.metrics["intraday"]["models"][key]["metrics"]
            predictions.append(
                {
                    "model": key,
                    "label": MODEL_LABELS[key],
                    "prediction": prices,
                    "change_pct": round((prices["close"] / open_price - 1) * 100, 2),
                    "test_mae": round(metrics["mae"], 2),
                    "test_mape": round(metrics["mape"], 2),
                }
            )

        consensus = {
            field: round(float(np.mean([p["prediction"][field] for p in predictions])), 2)
            for field in ("close", "high", "low")
        }
        return {
            "track": "intraday",
            "input": {
                "open": round(open_price, 2),
                "regime": "w" if regime == 1 else "l",
                "gap_vs_last_close_pct": round((open_price / last_close - 1) * 100, 2),
            },
            "reference": {"last_close": round(last_close, 2), "last_date": latest["date"]},
            "predictions": predictions,
            "consensus": consensus,
            "clamped_features": clamped,
        }

    def predict_next_day(self, regime: int | None = None) -> dict:
        """Next trading day's close, anchored on the last row in the dataset."""
        latest = self.metrics["latest"]
        anchor = float(latest["close"])

        values = dict(latest["features"])
        if regime is not None:
            values["regime"] = int(regime)

        X, clamped = self._vector("forecast", values)

        predictions = []
        for key in MODEL_KEYS:
            ret = float(np.asarray(self.model("forecast", key).predict(X), dtype=float).ravel()[0])
            metrics = self.metrics["forecast"]["models"][key]["metrics"]
            predictions.append(
                {
                    "model": key,
                    "label": MODEL_LABELS[key],
                    "predicted_close": round(anchor * (1 + ret), 2),
                    "predicted_return_pct": round(ret * 100, 3),
                    "direction": "up" if ret > 0 else "down" if ret < 0 else "flat",
                    "test_mae": round(metrics["mae"], 2),
                    "directional_accuracy": round(metrics["directional_accuracy"], 1),
                }
            )

        mean_close = float(np.mean([p["predicted_close"] for p in predictions]))
        up_votes = sum(1 for p in predictions if p["direction"] == "up")
        return {
            "track": "forecast",
            "anchor": {"date": latest["date"], "close": round(anchor, 2)},
            "regime": "w" if (regime if regime is not None else latest["regime"]) == 1 else "l",
            "predictions": predictions,
            "consensus": {
                "close": round(mean_close, 2),
                "return_pct": round((mean_close / anchor - 1) * 100, 3),
                "direction": "up" if up_votes >= 2 else "down",
                "agreement": f"{max(up_votes, 3 - up_votes)}/3",
            },
            "clamped_features": clamped,
        }

    def leaderboard(self) -> dict:
        """Everything the Models tab renders."""
        forecast = self.metrics["forecast"]
        intraday = self.metrics["intraday"]
        best = min(
            MODEL_KEYS, key=lambda k: forecast["models"][k]["metrics"]["rmse"]
        )
        return {
            "generated_at": self.metrics["generated_at"],
            "best_model": {"key": best, "label": MODEL_LABELS[best]},
            "forecast": {
                "split_date": forecast["split_date"],
                "train_rows": forecast["train_rows"],
                "test_rows": forecast["test_rows"],
                "feature_count": len(forecast["feature_names"]),
                "naive_rmse": round(
                    forecast["models"]["knn"]["metrics"]["naive_rmse"], 2
                ),
                "models": [
                    {
                        "key": k,
                        "label": MODEL_LABELS[k],
                        **forecast["models"][k]["metrics"],
                        "importances": forecast["models"][k]["importances"],
                    }
                    for k in MODEL_KEYS
                ],
                "curves": forecast["curves"],
            },
            "intraday": {
                "split_date": intraday["split_date"],
                "train_rows": intraday["train_rows"],
                "test_rows": intraday["test_rows"],
                "models": [
                    {
                        "key": k,
                        "label": MODEL_LABELS[k],
                        **intraday["models"][k]["metrics"],
                        "per_target": intraday["models"][k]["per_target"],
                    }
                    for k in MODEL_KEYS
                ],
            },
        }


registry = Registry()
