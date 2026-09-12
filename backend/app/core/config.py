from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings, loaded from environment variables / .env."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "NORD-48"
    app_env: str = "development"
    app_debug: bool = True

    api_v1_prefix: str = "/api/v1"

    cors_origins: str = "http://localhost:3000"

    log_level: str = "INFO"

    # Optional override for where bundled example scenarios live. Needed in
    # Docker, where the backend container only has the backend/ directory
    # bind-mounted and can't reach the repo-root data/ dir by relative path.
    # Local dev leaves this unset and scenario_service falls back to
    # resolving it relative to this file.
    scenarios_dir: str | None = None

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
