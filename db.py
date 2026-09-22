import os
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.engine import URL


BASE_DIR = Path(__file__).resolve().parent

for env_path in [
    BASE_DIR / ".env.local",
    BASE_DIR / ".env",
    Path.cwd() / ".env.local",
    Path.cwd() / ".env",
]:
    if env_path.exists():
        load_dotenv(env_path, override=False)


ALLOWED_QUERY_KEYS = {
    "sslmode",
    "application_name",
    "connect_timeout",
    "keepalives",
    "keepalives_idle",
    "keepalives_interval",
    "keepalives_count",
    "target_session_attrs",
    "options",
}


def clean_postgres_url(raw_url: str) -> str:
    raw_url = raw_url.strip().strip('"').strip("'")

    if raw_url.startswith("postgres://"):
        raw_url = "postgresql://" + raw_url[len("postgres://"):]

    if raw_url.startswith("postgresql://"):
        raw_url = "postgresql+psycopg2://" + raw_url[len("postgresql://"):]

    parts = urlsplit(raw_url)

    clean_query = urlencode([
        (k, v)
        for k, v in parse_qsl(parts.query, keep_blank_values=True)
        if k.lower() in ALLOWED_QUERY_KEYS
    ])

    return urlunsplit((
        parts.scheme,
        parts.netloc,
        parts.path,
        clean_query,
        parts.fragment,
    ))


def get_database_url():
    for key in [
        "PY_DATABASE_URL",
        "PYTHON_DATABASE_URL",
        "DATABASE_URL_PY",
    ]:
        value = os.getenv(key)
        if value:
            return clean_postgres_url(value)

    user = (
        os.getenv("DB_USERNAME")
        or os.getenv("DB_USER")
        or os.getenv("SUPABASE_DB_USER")
    )

    password = (
        os.getenv("DB_PASSWORD")
        or os.getenv("SUPABASE_DB_PASSWORD")
        or os.getenv("POSTGRES_PASSWORD")
    )

    host = os.getenv("DB_HOST")
    port = int(os.getenv("DB_PORT", "6543"))
    database = os.getenv("DB_NAME", "postgres")

    if user and password and host:
        return URL.create(
            drivername="postgresql+psycopg2",
            username=user,
            password=password,
            host=host,
            port=port,
            database=database,
            query={"sslmode": "require"},
        )

    for key in [
        "SUPABASE_DATABASE_URL",
        "POSTGRES_DATABASE_URL",
        "POSTGRES_URL",
        "DATABASE_URL",
    ]:
        value = os.getenv(key)
        if value:
            return clean_postgres_url(value)

    raise RuntimeError(
        "No encontré conexión Postgres. Definí PY_DATABASE_URL, PYTHON_DATABASE_URL o DB_HOST/DB_USER/DB_PASSWORD."
    )


def get_engine():
    return create_engine(
        get_database_url(),
        pool_pre_ping=True,
        pool_recycle=1800,
    )


if __name__ == "__main__":
    from sqlalchemy import text

    engine = get_engine()
    with engine.connect() as conn:
        row = conn.execute(text("select current_database(), current_schema()")).fetchone()
        print("✅ Conexión OK:", row)
