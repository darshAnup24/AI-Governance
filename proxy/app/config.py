"""
Proxy service configuration loaded from environment variables.
Uses Pydantic Settings for validation and type coercion.
"""

from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # ─── General ──────────────────────────────────────────
    environment: str = "development"
    log_level: str = "INFO"

    # ─── Proxy ────────────────────────────────────────────
    proxy_host: str = "0.0.0.0"
    proxy_port: int = 8000
    upstream_openai_url: str = "https://api.openai.com"
    upstream_anthropic_url: str = "https://api.anthropic.com"
    upstream_azure_openai_url: str = "https://your-resource.openai.azure.com"
    detection_service_url: str = "http://detection:8001"
    detection_timeout_ms: int = 200
    internal_service_token: str = "dev-internal-token"
    internal_service_token_file: str | None = None

    # ─── Auth ─────────────────────────────────────────────
    jwks_url: str = "https://your-idp.com/.well-known/jwks.json"
    jwt_algorithm: str = "RS256"
    jwt_audience: str = "ai-governance-firewall"
    dev_jwt_secret: str = "dev-secret-change-in-production"
    dev_jwt_secret_file: str | None = None
    jwt_issuer: str | None = None

    # ─── Database ─────────────────────────────────────────
    database_url: str = "postgresql+asyncpg://aigw:aigw_password@postgres:5432/ai_governance"
    database_pool_size: int = 20
    database_max_overflow: int = 10

    # ─── Redis ────────────────────────────────────────────
    redis_url: str = "redis://redis:6379/0"

    # ─── Ollama ───────────────────────────────────────────
    ollama_url: str = "http://ollama:11434"
    ollama_model: str = "llama3.1:8b"

    # ─── Rate Limits ──────────────────────────────────────
    rate_limit_user_rpm: int = 100
    rate_limit_user_tpm: int = 100_000
    rate_limit_dept_rpm: int = 1000
    rate_limit_dept_tpm: int = 1_000_000

    # ─── Security hardening ────────────────────────────────
    data_encryption_key: str = "dev-data-key-change-in-production"
    data_encryption_key_file: str | None = None
    mtls_enabled: bool = False
    mtls_client_cert_path: str | None = None
    mtls_client_key_path: str | None = None
    mtls_ca_bundle_path: str | None = None

    @property
    def is_dev(self) -> bool:
        return self.environment == "development"


@lru_cache
def get_settings() -> Settings:
    """Cached settings singleton."""
    return Settings()
