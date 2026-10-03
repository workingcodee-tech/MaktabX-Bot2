"""
MaktabX Bot Configuration Module.

Loads and validates environment variables from .env or system environment.
Ensures zero hardcoded secrets and protects sensitive credentials from log exposure.
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass
from typing import List, Optional
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
    def get_missing_variables(cls) -> List[str]:
        """Tekshiruv: qaysi majburiy o'zgaruvchilar yo'qligini aniqlash."""
        missing = []
        if not os.getenv("TELEGRAM_BOT_TOKEN", "").strip():
            missing.append("TELEGRAM_BOT_TOKEN")
        if not os.getenv("ADMIN_ID", "").strip():
            missing.append("ADMIN_ID")
        if not os.getenv("CHANNEL_USERNAME", "").strip():
            missing.append("CHANNEL_USERNAME")
        if not os.getenv("MAKTABX_URL", "").strip():
            missing.append("MAKTABX_URL")
        return missing

    @classmethod
    def load(cls) -> "Config":
        """Load and validate configuration from environment variables."""
        token = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
        if not token:
            raise ValueError(
                "CRITICAL: 'TELEGRAM_BOT_TOKEN' muhit o'zgaruvchisi topilmadi! "
                "@BotFather dan token oling va Railway 'Variables' bo'limiga kiriting."
            )

        admin_id_raw = os.getenv("ADMIN_ID", "").strip()
        if not admin_id_raw:
            raise ValueError(
                "CRITICAL: 'ADMIN_ID' muhit o'zgaruvchisi topilmadi! "
                "@userinfobot orqali o'z Telegram ID raqamingizni oling va Railway 'Variables' bo'limiga kiriting."
            )
        try:
            admin_id = int(admin_id_raw)
        except ValueError:
            raise ValueError(
                f"CRITICAL: 'ADMIN_ID' faqat butun sondan iborat bo'lishi kerak, kiritilgan qiymat: '{admin_id_raw}'"
            )

        channel_username = os.getenv("CHANNEL_USERNAME", "").strip()
        if not channel_username:
            raise ValueError(
                "CRITICAL: 'CHANNEL_USERNAME' muhit o'zgaruvchisi topilmadi! "
                "Misol: @maktabx_kanali yoki -1001234567890"
            )

        # Agar raqamli chat ID bo'lmasa, @ belgisini to'g'rilash
        if not channel_username.startswith(("@", "-")):
            channel_username = f"@{channel_username}"

        maktabx_url = os.getenv("MAKTABX_URL", "").strip()
        if not maktabx_url:
            raise ValueError(
                "CRITICAL: 'MAKTABX_URL' muhit o'zgaruvchisi topilmadi! "
                "Misol: https://maktabx.uz"
            )
        if not (maktabx_url.startswith("http://") or maktabx_url.startswith("https://")):
            maktabx_url = f"https://{maktabx_url}"

        # Baza manzili: kiritilmagan bo'lsa lokal sqlite ga o'tadi
        database_url = os.getenv("DATABASE_URL", "").strip()
        if not database_url:
            database_url = "sqlite:///maktabx.db"

        # Railway postgres:// prefiksini asyncpg talab qiladigan postgresql:// ga o'tkazish
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
