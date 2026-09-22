from __future__ import annotations

import numpy as np
import pandas as pd
from sqlalchemy import text

POSICION_ENCODING = {
    "G": 1, "G-F": 2, "F-G": 2,
    "F": 3, "F-C": 4, "C-F": 4,
    "C": 5,
}

ROLL_COLS = [
    "min", "usage_pct", "touches", "rebound_chances", "passes_made",
    "potential_ast", "rebound_off", "rebound_def",
    "pts", "reb", "ast", "fgm", "fga", "fg3m", "fg3a", "ftm", "fta",
    "stl", "blk", "tov", "pf",
    "q1_pts", "q1_reb", "q1_ast", "pra", "pr", "pa", "ra", "stl_blk",
]

DVP_COLS = [
    "dvp_pts", "dvp_reb", "dvp_ast", "dvp_3pt", "dvp_fga", "dvp_fg3a",
    "dvp_fta", "dvp_stl", "dvp_blk", "dvp_tov", "dvp_pf",
]

def _date_col(df: pd.DataFrame) -> str:
    for c in ["event_date", "game_date", "pick_date", "date"]:
        if c in df.columns:
            return c
    raise ValueError("No encontré columna de fecha: event_date/game_date/pick_date/date")

def _required_features(registry: dict) -> set[str]:
    out = set()
    for meta in registry.get("models", {}).values():
        out.update(meta.get("features", []) or [])
    return out

def _safe_ratio(num, den):
    num = pd.to_numeric(num, errors="coerce")
    den = pd.to_numeric(den, errors="coerce")
    return np.where(den.fillna(0) > 0, num / den, 0)

def _calc_is_home(row) -> int:
    ha = str(row.get("home_away", "") or "").upper()
    if ha == "HOME":
        return 1
    if ha == "AWAY":
        return 0

    matchup = str(row.get("matchup", "") or "")
    team = str(row.get("team_abbreviation", "") or "")
    if "@" in matchup:
        left, right = [x.strip() for x in matchup.split("@", 1)]
        if left.startswith(team):
            return 0
        if right.startswith(team):
            return 1
    if " vs " in matchup.lower():
        left = matchup.lower().split(" vs ", 1)[0].strip()
        return 1 if left.upper().startswith(team) else 0
    return 0

def _load_history(engine, player_ids: list[int], max_date) -> pd.DataFrame:
    if not player_ids:
        return pd.DataFrame()

    q = text("""
        SELECT
            player_id,
            player_name,
            position,
            position_group,
            team_abbreviation,
            game_id::text AS game_id,
            game_date,
            season,
            matchup,
            opponent_abbr,
            home_away,

            min,
            usage_pct,
            touches,
            rebound_chances,
            passes_made,
            potential_ast,
            rebound_off,
            rebound_def,

            pts,
            reb,
            ast,
            fgm,
            fga,
            fg3m,
            fg3a,
            ftm,
            fta,
            stl,
            blk,
            tov,
            pf,

            q1_pts,
            q1_reb,
            q1_ast,
            q1_oreb,
            q1_dreb,

            has_q1_data,
            has_full_tracking,
            has_ast_tracking,
            tracking_status,
            has_dvp_rolling,

            dvp_pts,
            dvp_reb,
            dvp_ast,
            dvp_3pt,
            dvp_fga,
            dvp_fg3a,
            dvp_fta,
            dvp_stl,
            dvp_blk,
            dvp_tov,
            dvp_pf
        FROM nba_api_data.v_ludo_train_all_markets_gold
        WHERE player_id = ANY(:player_ids)
          AND game_date < :max_date
        ORDER BY player_id, game_date, game_id
    """)

    return pd.read_sql(
        q,
        engine,
        params={
            "player_ids": [int(x) for x in player_ids],
            "max_date": pd.to_datetime(max_date).date(),
        },
    )

def _features_for_player(hist: pd.DataFrame, event_date) -> dict:
    h = hist.copy()
    h["game_date"] = pd.to_datetime(h["game_date"])
    event_date = pd.to_datetime(event_date)
    h = h[h["game_date"] < event_date].sort_values(["game_date", "game_id"])

    if h.empty:
        return {}

    h["pra"] = h["pts"] + h["reb"] + h["ast"]
    h["pr"] = h["pts"] + h["reb"]
    h["pa"] = h["pts"] + h["ast"]
    h["ra"] = h["reb"] + h["ast"]
    h["stl_blk"] = h["stl"] + h["blk"]

    last = h.iloc[-1]
    feat = {}

    feat["position"] = last.get("position")
    feat["position_group"] = last.get("position_group")
    feat["pos_enc"] = POSICION_ENCODING.get(str(last.get("position_group") or last.get("position") or "F"), 3)

    last_game_date = pd.to_datetime(last["game_date"])
    rest = (event_date.normalize() - last_game_date.normalize()).days
    feat["rest_days"] = max(0, min(7, rest))
    feat["is_b2b"] = 1 if feat["rest_days"] <= 1 else 0

    feat["is_home"] = _calc_is_home(last)

    for flag in ["has_q1_data", "has_full_tracking", "has_ast_tracking", "has_dvp_rolling"]:
        val = last.get(flag)
        try:
            feat[flag] = int(0 if pd.isna(val) else val)
        except Exception:
            feat[flag] = 0

    for col in DVP_COLS:
        # Si el dataframe actual ya trae DVP del rival de hoy, no lo pisamos después.
        # Esto solo deja fallback disponible.
        feat[col] = last.get(col, np.nan)

    for col in ROLL_COLS:
        if col not in h.columns:
            h[col] = np.nan

        s = pd.to_numeric(h[col], errors="coerce")

        for w in [5, 10, 20]:
            feat[f"{col}_L{w}"] = float(s.tail(w).mean()) if s.notna().any() else np.nan

        feat[f"{col}_season"] = float(s.mean()) if s.notna().any() else np.nan

        if s.tail(10).notna().sum() >= 3:
            feat[f"{col}_std_L10"] = float(s.tail(10).std())
        else:
            feat[f"{col}_std_L10"] = np.nan

        if s.tail(20).notna().sum() >= 5:
            feat[f"{col}_std_L20"] = float(s.tail(20).std())
        else:
            feat[f"{col}_std_L20"] = np.nan

        feat[f"{col}_trend_L5_L20"] = feat[f"{col}_L5"] - feat[f"{col}_L20"]
        feat[f"{col}_momentum"] = feat[f"{col}_L5"] - feat[f"{col}_season"]

    feat["q1_pts_pct_L5"] = _safe_ratio(pd.Series([feat.get("q1_pts_L5")]), pd.Series([feat.get("pts_L5")]))[0]
    feat["q1_reb_pct_L5"] = _safe_ratio(pd.Series([feat.get("q1_reb_L5")]), pd.Series([feat.get("reb_L5")]))[0]
    feat["q1_ast_pct_L5"] = _safe_ratio(pd.Series([feat.get("q1_ast_L5")]), pd.Series([feat.get("ast_L5")]))[0]

    feat["ppm_L5"] = _safe_ratio(pd.Series([feat.get("pts_L5")]), pd.Series([feat.get("min_L5")]))[0]
    feat["fga_pm_L5"] = _safe_ratio(pd.Series([feat.get("fga_L5")]), pd.Series([feat.get("min_L5")]))[0]
    feat["ast_pm_L5"] = _safe_ratio(pd.Series([feat.get("ast_L5")]), pd.Series([feat.get("min_L5")]))[0]
    feat["reb_pm_L5"] = _safe_ratio(pd.Series([feat.get("reb_L5")]), pd.Series([feat.get("min_L5")]))[0]

    return feat

def add_v35_prediction_features(df: pd.DataFrame, engine, registry: dict) -> pd.DataFrame:
    if df.empty:
        return df

    required = _required_features(registry)
    date_col = _date_col(df)

    out = df.copy()
    out["__ludo_event_date"] = pd.to_datetime(out[date_col]).dt.date

    player_ids = (
        pd.to_numeric(out["player_id"], errors="coerce")
        .dropna()
        .astype(int)
        .unique()
        .tolist()
    )

    max_date = pd.to_datetime(out["__ludo_event_date"]).max()
    hist = _load_history(engine, player_ids, max_date)

    if hist.empty:
        print("⚠️ v35 feature bridge: no encontré historial en gold view.")
        for f in required:
            if f not in out.columns:
                out[f] = np.nan
        return out.drop(columns=["__ludo_event_date"], errors="ignore")

    hist["player_id"] = pd.to_numeric(hist["player_id"], errors="coerce").astype("Int64")

    rows = []
    for (pid, ev_date), _grp in out.groupby(["player_id", "__ludo_event_date"], dropna=False):
        if pd.isna(pid):
            continue
        ph = hist[hist["player_id"] == int(pid)]
        feat = _features_for_player(ph, ev_date)
        if feat:
            feat["player_id"] = int(pid)
            feat["__ludo_event_date"] = ev_date
            rows.append(feat)

    if rows:
        feat_df = pd.DataFrame(rows)
        out = out.merge(
            feat_df,
            on=["player_id", "__ludo_event_date"],
            how="left",
            suffixes=("", "__v35"),
        )

        for col in feat_df.columns:
            if col in ["player_id", "__ludo_event_date"]:
                continue

            v35 = f"{col}__v35"
            if v35 in out.columns:
                if col in out.columns:
                    out[col] = out[col].combine_first(out[v35])
                else:
                    out[col] = out[v35]
                out.drop(columns=[v35], inplace=True)

    # No pisamos DVP actual si ya viene en v_ludo_today_props_base.
    # Solo garantizamos que existan todas las columnas que pide el registry.
    for f in required:
        if f not in out.columns:
            out[f] = np.nan

    out.drop(columns=["__ludo_event_date"], errors="ignore", inplace=True)

    missing_after = sorted([f for f in required if f not in out.columns])
    if missing_after:
        print("⚠️ v35 feature bridge: siguen faltando columnas:", missing_after)
    else:
        print("✅ v35 feature bridge: features L20/std/trend listas para predicción.")

    return out
