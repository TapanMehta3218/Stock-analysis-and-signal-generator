"""The three regressors compared by the dashboard, plus their scoring.

* KNN            - the algorithm carried over from the original notebook
                   (KNeighborsRegressor, distance weighting), now behind a
                   StandardScaler because the engineered features live on very
                   different scales and raw Euclidean distance would otherwise be
                   dominated by whichever feature has the widest spread.
* Random Forest  - bagged trees, low-variance baseline.
* XGBoost        - gradient-boosted trees.

All three are fitted on both tracks defined in `data_prep`, so the comparison is
like-for-like: same features, same chronological split, same metrics.
"""

from __future__ import annotations

import numpy as np
from sklearn.ensemble import RandomForestRegressor
from sklearn.inspection import permutation_importance
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.multioutput import MultiOutputRegressor
from sklearn.neighbors import KNeighborsRegressor
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from xgboost import XGBRegressor

from .config import RANDOM_STATE


def build_model(key: str, multioutput: bool = False):
    """Return an unfitted estimator for one of the three model keys."""
    if key == "knn":
        return Pipeline(
            [
                ("scaler", StandardScaler()),
                # k=10 with distance weighting is the setting from the original
                # notebook, kept so the ported model stays recognisable.
                ("model", KNeighborsRegressor(n_neighbors=10, weights="distance")),
            ]
        )

    if key == "random_forest":
        return RandomForestRegressor(
            n_estimators=400,
            max_depth=8,
            min_samples_leaf=5,
            max_features="sqrt",
            random_state=RANDOM_STATE,
            n_jobs=-1,
        )

    if key == "xgboost":
        xgb = XGBRegressor(
            n_estimators=500,
            learning_rate=0.03,
            max_depth=4,
            subsample=0.8,
            colsample_bytree=0.8,
            min_child_weight=5,
            reg_lambda=1.0,
            random_state=RANDOM_STATE,
            n_jobs=-1,
            tree_method="hist",
        )
        # Wrap for the 3-target intraday track so behaviour is identical across
        # xgboost versions rather than relying on native multi-output support.
        return MultiOutputRegressor(xgb) if multioutput else xgb

    raise ValueError(f"unknown model key: {key}")


def _safe_mape(actual: np.ndarray, predicted: np.ndarray) -> float:
    mask = np.abs(actual) > 1e-9
    if not mask.any():
        return float("nan")
    return float(np.mean(np.abs((actual[mask] - predicted[mask]) / actual[mask])) * 100)


def price_metrics(actual: np.ndarray, predicted: np.ndarray) -> dict:
    """RMSE / MAE / MAPE / R^2 on reconstructed rupee prices."""
    actual = np.asarray(actual, dtype=float).ravel()
    predicted = np.asarray(predicted, dtype=float).ravel()
    return {
        "rmse": float(np.sqrt(mean_squared_error(actual, predicted))),
        "mae": float(mean_absolute_error(actual, predicted)),
        "mape": _safe_mape(actual, predicted),
        "r2": float(r2_score(actual, predicted)),
    }


def directional_accuracy(actual_returns: np.ndarray, predicted_returns: np.ndarray) -> float:
    """Share of days where the model got the direction of the move right.

    For a next-day price call this matters more than rupee error: a model can
    have a small RMSE and still be a coin flip on up-vs-down.
    """
    actual = np.sign(np.asarray(actual_returns, dtype=float).ravel())
    predicted = np.sign(np.asarray(predicted_returns, dtype=float).ravel())
    mask = actual != 0
    if not mask.any():
        return float("nan")
    return float(np.mean(actual[mask] == predicted[mask]) * 100)


def feature_importance(model, X_test, y_test, feature_names, n_repeats: int = 5) -> list[dict]:
    """Permutation importance - the one importance measure that is defined for
    all three estimators, so the dashboard can chart them on the same axis."""
    try:
        result = permutation_importance(
            model, X_test, y_test, n_repeats=n_repeats,
            random_state=RANDOM_STATE, n_jobs=1,
        )
    except Exception:
        return []

    importances = np.asarray(result.importances_mean, dtype=float)
    total = np.sum(np.clip(importances, 0, None))
    ranked = sorted(
        (
            {
                "feature": name,
                "importance": float(value),
                "share": float(max(value, 0.0) / total * 100) if total > 0 else 0.0,
            }
            for name, value in zip(feature_names, importances)
        ),
        key=lambda d: d["importance"],
        reverse=True,
    )
    return ranked
