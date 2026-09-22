from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Market:
    key: str
    target: str
    stake_names: tuple[str, ...]
    component_stats: tuple[str, ...]
    objective: str = "reg:squarederror"


MARKETS: dict[str, Market] = {
    "PTS": Market("PTS", "pts", ("Puntos",), ("pts", "min", "fgm", "fga", "fg3m", "fg3a", "ftm", "fta")),
    "REB": Market("REB", "reb", ("Rebotes",), ("reb", "min", "rebound_off", "rebound_def")),
    "AST": Market("AST", "ast", ("Asistencias",), ("ast", "min")),
    "PR": Market("PR", "pr", ("Puntos+Rebotes",), ("pts", "reb", "pr", "min")),
    "PA": Market("PA", "pa", ("Puntos+Asistencias",), ("pts", "ast", "pa", "min")),
    "RA": Market("RA", "ra", ("Asistencias+Rebotes", "Rebotes+Asistencias"), ("reb", "ast", "ra", "min")),
    "PRA": Market("PRA", "pra", ("PRA",), ("pts", "reb", "ast", "pra", "min")),
    "FGM": Market("FGM", "fgm", ("GolesCampo",), ("fgm", "fga", "min")),
    "FGA": Market("FGA", "fga", ("GolesCampoInt",), ("fga", "fgm", "min")),
    "FG3M": Market("FG3M", "fg3m", ("Triples",), ("fg3m", "fg3a", "min"), "count:poisson"),
    "FG3A": Market("FG3A", "fg3a", ("TriplesInt",), ("fg3a", "fg3m", "min"), "count:poisson"),
    "FTM": Market("FTM", "ftm", ("TirosLibres",), ("ftm", "fta", "min")),
    "FTA": Market("FTA", "fta", ("TirosLibresInt",), ("fta", "ftm", "min")),
    "STL": Market("STL", "stl", ("Robos",), ("stl", "min"), "count:poisson"),
    "BLK": Market("BLK", "blk", ("Tapones",), ("blk", "min", "reb"), "count:poisson"),
    "STL+BLK": Market("STL+BLK", "stl_blk", ("Robos+Tapones",), ("stl", "blk", "stl_blk", "min"), "count:poisson"),
    "TOV": Market("TOV", "tov", ("Pérdidas", "Perdidas"), ("tov", "ast", "min"), "count:poisson"),
    "PF": Market("PF", "pf", ("Faltas",), ("pf", "min"), "count:poisson"),
}

STAKE_TO_MARKET = {
    stake_name.casefold(): key
    for key, market in MARKETS.items()
    for stake_name in market.stake_names
}


def selected_markets(raw: str | None) -> list[Market]:
    if not raw:
        return list(MARKETS.values())
    keys = [value.strip().upper() for value in raw.split(",") if value.strip()]
    unknown = sorted(set(keys) - set(MARKETS))
    if unknown:
        raise ValueError(f"Mercados desconocidos: {unknown}. Disponibles: {sorted(MARKETS)}")
    return [MARKETS[key] for key in keys]
