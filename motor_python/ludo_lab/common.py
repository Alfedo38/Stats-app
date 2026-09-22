from __future__ import annotations

import json
import os
from pathlib import Path

LAB_DIR = Path(__file__).resolve().parent
MOTOR_DIR = LAB_DIR.parent
DEFAULT_CONFIG = LAB_DIR / "configuracion.json"
OUTPUTS_DIR = LAB_DIR / "outputs"
MODELS_DIR = LAB_DIR / "models"


def load_environment() -> None:
    from dotenv import load_dotenv

    for path in (MOTOR_DIR / ".env.local", MOTOR_DIR / ".env", MOTOR_DIR.parent / ".env.local"):
        if path.is_file():
            load_dotenv(path, override=False)


def load_config(path: str | Path | None = None) -> dict:
    config_path = Path(path).expanduser().resolve() if path else DEFAULT_CONFIG
    with config_path.open("r", encoding="utf-8") as handle:
        config = json.load(handle)
    required = {
        "source_view", "history_start", "base_train_end", "evaluation_start",
        "evaluation_end", "adaptive_retrain_days", "prior_season_weight",
        "min_prior_games", "min_training_rows", "model",
    }
    missing = required - set(config)
    if missing:
        raise ValueError(f"Faltan claves en configuración: {sorted(missing)}")
    return config


def get_engine():
    from sqlalchemy import create_engine
    from sqlalchemy.engine import URL

    load_environment()
    direct = (
        os.getenv("NBA_DIRECT_DATABASE_URL")
        or os.getenv("DIRECT_DATABASE_URL")
        or os.getenv("DATABASE_URL")
        or os.getenv("POSTGRES_URL")
    )
    if direct:
        return create_engine(direct, pool_pre_ping=True)

    password = os.getenv("DB_PASSWORD")
    if not password:
        raise RuntimeError("Falta NBA_DIRECT_DATABASE_URL/DATABASE_URL o DB_PASSWORD.")
    url = URL.create(
        drivername="postgresql",
        username=os.getenv("DB_USERNAME") or os.getenv("DB_USER") or "postgres",
        password=password,
        host=os.getenv("DB_HOST"),
        port=int(os.getenv("DB_PORT") or 5432),
        database=os.getenv("DB_NAME") or "postgres",
        query={"sslmode": "require"},
    )
    return create_engine(url, pool_pre_ping=True)


def ensure_dirs() -> None:
    OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)
    MODELS_DIR.mkdir(parents=True, exist_ok=True)


def atomic_csv(df, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    df.to_csv(temporary, index=False, encoding="utf-8")
    temporary.replace(path)
