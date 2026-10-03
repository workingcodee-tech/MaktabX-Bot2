"""
MaktabX Bot Configuration Module.

Loads and validates environment variables from .env or system environment.
Ensures zero hardcoded secrets and protects sensitive credentials from log exposure.
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass
from typing import Optional
from dotenv import load_dotenv

# Load local .env file if available
load_dotenv()


@dataclass(frozen=True)
class Config:
    """Immutable application configuration."""

    telegram_bot_token: str
    admin_id: int
    channel_username: str
    maktabx_url: str
    database_url: str
    bot_name: str = "MaktabX Bot"
    timezone: str = "Asia/Tashkent"

    @classmethod
    def load(cls) -> "Config":
        """Load and validate configuration from environment variables."""
        token = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
        if not token:
            raise ValueError(
                "CRITICAL: 'TELEGRAM_BOT_TOKEN' environment variable is missing! "
                "Obtain a token from @BotFather and set it in your environment."
            )

        admin_id_raw = os.getenv("ADMIN_ID", "").strip()
        if not admin_id_raw:
            raise ValueError(
                "CRITICAL: 'ADMIN_ID' environment variable is missing! "
                "Set your numeric Telegram ID (use @userinfobot to find it)."
            )
        try:
            admin_id = int(admin_id_raw)
        except ValueError:
            raise ValueError(
                f"CRITICAL: 'ADMIN_ID' must be a valid integer, got: '{admin_id_raw}'"
            )

        channel_username = os.getenv("CHANNEL_USERNAME", "").strip()
        if not channel_username:
            raise ValueError(
                "CRITICAL: 'CHANNEL_USERNAME' environment variable is missing! "
                "Example: @maktabx_channel or -1001234567890"
            )

        # Normalize channel username if not numeric chat ID
        if not channel_username.startswith(("@", "-")):
            channel_username = f"@{channel_username}"

        maktabx_url = os.getenv("MAKTABX_URL", "").strip()
        if not maktabx_url:
            raise ValueError(
                "CRITICAL: 'MAKTABX_URL' environment variable is missing! "
                "Example: https://maktabx.uz"
            )
        if not (maktabx_url.startswith("http://") or maktabx_url.startswith("https://")):
            maktabx_url = f"https://{maktabx_url}"

        # Database URL: defaults to local SQLite file if not provided
        database_url = os.getenv("DATABASE_URL", "").strip()
        if not database_url:
            database_url = "sqlite:///maktabx.db"

        # Fix Railway legacy postgres:// prefix for asyncpg compatibility
        if database_url.startswith("postgres://"):
            database_url = database_url.replace("postgres://", "postgresql://", 1)

        bot_name = os.getenv("BOT_NAME", "MaktabX Bot").strip() or "MaktabX Bot"
        timezone = os.getenv("TIMEZONE", "Asia/Tashkent").strip() or "Asia/Tashkent"

        return cls(
            telegram_bot_token=token,
            admin_id=admin_id,
            channel_username=channel_username,
            maktabx_url=maktabx_url,
            database_url=database_url,
            bot_name=bot_name,
            timezone=timezone,
        )

    def is_sqlite(self) -> bool:
        """Returns True if database is SQLite."""
        return self.database_url.startswith("sqlite")

    def __repr__(self) -> str:
        """Safe representation hiding token and password from logs."""
        masked_token = (
            f"{self.telegram_bot_token[:6]}...{self.telegram_bot_token[-4:]}"
            if len(self.telegram_bot_token) > 10
            else "***"
        )
        masked_db = re.sub(r"://([^:]+):([^@]+)@", r"://\1:***@", self.database_url)
        return (
            f"Config(bot_name={self.bot_name!r}, admin_id={self.admin_id}, "
            f"channel={self.channel_username!r}, maktabx_url={self.maktabx_url!r}, "
            f"database={masked_db!r}, timezone={self.timezone!r}, "
            f"token={masked_token!r})"
        )
