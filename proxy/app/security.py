"""
Security helpers for secrets and encryption-at-rest.
"""

from __future__ import annotations

import base64
import hashlib
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken


def _fernet_key_from_secret(secret: str) -> bytes:
    """Derive a valid Fernet key from an arbitrary secret string."""
    digest = hashlib.sha256(secret.encode("utf-8")).digest()
    return base64.urlsafe_b64encode(digest)


def read_secret(value: str | None, value_file: str | None = None, default: str = "") -> str:
    """Read secret from env value or mounted file path."""
    if value_file:
        path = Path(value_file)
        if path.exists():
            return path.read_text(encoding="utf-8").strip()
    if value is not None:
        return value
    return default


class DataEncryptor:
    """Small Fernet wrapper for optional column encryption."""

    def __init__(self, secret: str) -> None:
        self._fernet = Fernet(_fernet_key_from_secret(secret))

    def encrypt(self, value: str) -> str:
        if not value:
            return ""
        return self._fernet.encrypt(value.encode("utf-8")).decode("utf-8")

    def decrypt(self, value: str) -> str:
        if not value:
            return ""
        try:
            return self._fernet.decrypt(value.encode("utf-8")).decode("utf-8")
        except InvalidToken:
            return ""
