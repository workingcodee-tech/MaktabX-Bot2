export const PROJECT_FILES: Record<string, string> = {
  "bot.py": `"""
MaktabX Telegram Bot.

Asosiy dastur nuqtasi (Entry Point).
Konfiguratsiya, ma'lumotlar bazasi, xavfsiz tezlikdagi handlerlar,
xatoliklarni tutish va Telegram long-polling jarayonini ishga tushiradi.
"""

from __future__ import annotations

import logging
import sys
from telegram import Update
from telegram.constants import ParseMode
from telegram.ext import (
    Application,
    ApplicationBuilder,
    CallbackQueryHandler,
    ChatMemberHandler,
    CommandHandler,
    ConversationHandler,
    MessageHandler,
    filters,
)

from config import Config
from database import Database
from handlers.admin import (
    admin_menu_back_callback,
    admin_pagination_callback,
    admin_stats_handler,
    admin_users_handler,
    admin_view_user_callback,
    show_admin_dashboard,
)
from handlers.broadcast import (
    WAITING_FOR_CONFIRMATION,
    WAITING_FOR_CONTENT,
    broadcast_cancel_callback,
    broadcast_confirm_callback,
    broadcast_content_received,
    broadcast_start_handler,
)
from handlers.user import (
    channel_member_update_handler,
    check_subscription_callback,
    contact_handler,
    start_handler,
)

logging.basicConfig(
    format="%(asctime)s - [%(levelname)s] - %(name)s: %(message)s",
    level=logging.INFO,
)
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("telegram").setLevel(logging.INFO)
logging.getLogger("asyncio").setLevel(logging.WARNING)

logger = logging.getLogger("MaktabXBot")


async def error_handler(update: object, context: object) -> None:
    logger.error("Xatolik yuz berdi: %s", context.error, exc_info=True)


async def on_startup(application: Application) -> None:
    config: Config = application.bot_data["config"]
    db: Database = application.bot_data["db"]

    logger.info("Ma'lumotlar bazasiga ulanish tekshirilmoqda...")
    await db.connect()
    logger.info("MaktabX Bot muvaffaqiyatli ishga tushdi. Sozlamalar: %s", config)

    try:
        await application.bot.send_message(
            chat_id=config.admin_id,
            text=f"🟢 <b>{config.bot_name} ishga tushdi va faol holatda!</b>",
            parse_mode=ParseMode.HTML,
        )
    except Exception as e:
        logger.warning(
            "Adminga (%d) xabar yuborib bo'lmadi: %s. "
            "(Admin botda kamida bir marta /start bosgan bo'lishi kerak).",
            config.admin_id,
            e,
        )


async def on_shutdown(application: Application) -> None:
    logger.info("MaktabX Bot to'xtatilmoqda...")
    db: Database = application.bot_data.get("db")
    if db:
        await db.close()
    logger.info("MaktabX Bot to'xtatildi.")


def main() -> None:
    missing = Config.get_missing_variables()
    if missing:
        box_line = "=" * 70
        logger.critical(
            "\\n%s\\n"
            "⚠️  MAKTABX BOT: MUHIT O'ZGARUVCHILARI (VARIABLES) TOPILMADI!\\n"
            "%s\\n"
            "Quyidagi majburiy o'zgaruvchilar kiritilmagan: %s\\n\\n"
            "Railway'da sozlash bo'yicha ko'rsatma:\\n"
            "1. Railway konsoliga kiring: https://railway.com\\n"
            "2. 'ishchi' xizmatingiz ustiga bosing.\\n"
            "3. 'Variables' (O'zgaruvchilar) bo'limini oching.\\n"
            "4. 'RAW Editor' tugmasini bosing va qiymatlarni kiriting.\\n"
            "%s\\n"
            "Konteyner tez-tez qulab tushmasligi uchun 30 soniya kutilmoqda...\\n",
            box_line,
            box_line,
            ", ".join(missing),
            box_line,
        )
        time.sleep(30)
        sys.exit(1)

    try:
        config = Config.load()
    except Exception as e:
        logger.critical("Konfiguratsiya xatosi: %s", e)
        time.sleep(10)
        sys.exit(1)

    db = Database(
        database_url=config.database_url,
        timezone_name=config.timezone,
    )

    application = (
        ApplicationBuilder()
        .token(config.telegram_bot_token)
        .post_init(on_startup)
        .post_shutdown(on_shutdown)
        .build()
    )

    application.bot_data["config"] = config
    application.bot_data["db"] = db

    # 1. Xabar tarqatish (Broadcast)
    broadcast_conv = ConversationHandler(
        entry_points=[
            MessageHandler(
                filters.Regex("^(📢 Xabar tarqatish|📢 Broadcast)$"),
                broadcast_start_handler,
            ),
            CommandHandler("broadcast", broadcast_start_handler),
        ],
        states={
            WAITING_FOR_CONTENT: [
                CallbackQueryHandler(broadcast_cancel_callback, pattern="^broadcast_cancel$"),
                MessageHandler(filters.ALL & ~filters.COMMAND, broadcast_content_received),
            ],
            WAITING_FOR_CONFIRMATION: [
                CallbackQueryHandler(broadcast_confirm_callback, pattern="^broadcast_confirm$"),
                CallbackQueryHandler(broadcast_cancel_callback, pattern="^broadcast_cancel$"),
            ],
        },
        fallbacks=[
            CommandHandler("cancel", broadcast_cancel_callback),
            CallbackQueryHandler(broadcast_cancel_callback, pattern="^broadcast_cancel$"),
        ],
        per_chat=True,
        per_user=True,
    )
    application.add_handler(broadcast_conv)

    # 2. Administrator handlerlari
    application.add_handler(CommandHandler("admin", show_admin_dashboard))
    application.add_handler(
        MessageHandler(
            filters.Regex("^(📊 Statistika|📊 Statistics)$"),
            admin_stats_handler,
        )
    )
    application.add_handler(
        MessageHandler(
            filters.Regex("^(👥 Foydalanuvchilar|👥 Users)$"),
            admin_users_handler,
        )
    )
    application.add_handler(CallbackQueryHandler(admin_pagination_callback, pattern=r"^admin_page:"))
    application.add_handler(CallbackQueryHandler(admin_view_user_callback, pattern=r"^admin_view:"))
    application.add_handler(CallbackQueryHandler(admin_menu_back_callback, pattern="^admin_menu_back$"))

    # 3. Foydalanuvchi handlerlari
    application.add_handler(CommandHandler("start", start_handler))
    application.add_handler(
        CallbackQueryHandler(
            check_subscription_callback, pattern="^check_subscription$"
        )
    )
    application.add_handler(MessageHandler(filters.CONTACT, contact_handler))
    application.add_handler(
        ChatMemberHandler(
            channel_member_update_handler, ChatMemberHandler.CHAT_MEMBER
        )
    )

    # 4. Global xatolik tutuvchi
    application.add_error_handler(error_handler)

    logger.info("Telegram long polling ishga tushirilmoqda...")
    application.run_polling(
        allowed_updates=Update.ALL_TYPES,
        drop_pending_updates=True,
    )


if __name__ == "__main__":
    main()`,

  "config.py": `"""
MaktabX Bot Configuration Module.
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass
from typing import Optional
from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class Config:
    telegram_bot_token: str
    admin_id: int
    channel_username: str
    maktabx_url: str
    database_url: str
    bot_name: str = "MaktabX Bot"
    timezone: str = "Asia/Tashkent"

    @classmethod
    def get_missing_variables(cls) -> list[str]:
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
        token = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
        if not token:
            raise ValueError("CRITICAL: 'TELEGRAM_BOT_TOKEN' environment variable is missing!")

        admin_id_raw = os.getenv("ADMIN_ID", "").strip()
        if not admin_id_raw:
            raise ValueError("CRITICAL: 'ADMIN_ID' environment variable is missing!")
        try:
            admin_id = int(admin_id_raw)
        except ValueError:
            raise ValueError(f"CRITICAL: 'ADMIN_ID' must be integer, got: '{admin_id_raw}'")

        channel_username = os.getenv("CHANNEL_USERNAME", "").strip()
        if not channel_username:
            raise ValueError("CRITICAL: 'CHANNEL_USERNAME' is missing! Example: @maktabx_channel")
        if not channel_username.startswith(("@", "-")):
            channel_username = f"@{channel_username}"

        maktabx_url = os.getenv("MAKTABX_URL", "").strip()
        if not maktabx_url:
            raise ValueError("CRITICAL: 'MAKTABX_URL' is missing! Example: https://maktabx.uz")
        if not (maktabx_url.startswith("http://") or maktabx_url.startswith("https://")):
            maktabx_url = f"https://{maktabx_url}"

        database_url = os.getenv("DATABASE_URL", "").strip() or "sqlite:///maktabx.db"
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
        return self.database_url.startswith("sqlite")

    def __repr__(self) -> str:
        masked_token = (
            f"{self.telegram_bot_token[:6]}...{self.telegram_bot_token[-4:]}"
            if len(self.telegram_bot_token) > 10
            else "***"
        )
        masked_db = re.sub(r"://([^:]+):([^@]+)@", r"://\\\\1:***@", self.database_url)
        return (
            f"Config(bot_name={self.bot_name!r}, admin_id={self.admin_id}, "
            f"channel={self.channel_username!r}, maktabx_url={self.maktabx_url!r}, "
            f"database={masked_db!r}, timezone={self.timezone!r}, "
            f"token={masked_token!r})"
        )`,

  "database.py": `"""
MaktabX Database Layer with PostgreSQL (asyncpg) & SQLite (aiosqlite) support.
"""

from __future__ import annotations

import datetime
import logging
from typing import Any, Dict, List, Optional, Tuple
import pytz

logger = logging.getLogger(__name__)


class Database:
    def __init__(self, database_url: str, timezone_name: str = "Asia/Tashkent"):
        self.database_url = database_url
        self.timezone_name = timezone_name
        self.tz = pytz.timezone(timezone_name)
        self.is_sqlite = database_url.startswith("sqlite") or "sqlite" in database_url
        self._pg_pool = None
        self._sqlite_path = "maktabx.db"

        if self.is_sqlite:
            clean = database_url.replace("sqlite:///", "").replace("sqlite://", "")
            self._sqlite_path = clean or "maktabx.db"

    async def connect(self) -> None:
        if self.is_sqlite:
            import aiosqlite
            logger.info("Initializing SQLite database at: %s", self._sqlite_path)
            async with aiosqlite.connect(self._sqlite_path) as db:
                await db.execute("PRAGMA journal_mode=WAL;")
                await db.execute(
                    """
                    CREATE TABLE IF NOT EXISTS users (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        telegram_id INTEGER UNIQUE NOT NULL,
                        first_name TEXT NOT NULL,
                        last_name TEXT,
                        username TEXT,
                        phone_number TEXT,
                        phone_verified INTEGER DEFAULT 0,
                        channel_subscribed INTEGER DEFAULT 0,
                        access_granted INTEGER DEFAULT 0,
                        registered_at TEXT NOT NULL,
                        last_start_at TEXT NOT NULL,
                        access_granted_at TEXT,
                        access_message_id INTEGER
                    );
                    """
                )
                try:
                    await db.execute("ALTER TABLE users ADD COLUMN access_message_id INTEGER;")
                except Exception:
                    pass
                await db.execute("CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id);")
                await db.commit()
            logger.info("SQLite schema initialized successfully.")
        else:
            import asyncpg
            logger.info("Connecting to PostgreSQL database pool...")
            self._pg_pool = await asyncpg.create_pool(
                self.database_url,
                min_size=1,
                max_size=10,
                command_timeout=60,
            )
            async with self._pg_pool.acquire() as conn:
                await conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS users (
                        id BIGSERIAL PRIMARY KEY,
                        telegram_id BIGINT UNIQUE NOT NULL,
                        first_name TEXT NOT NULL,
                        last_name TEXT,
                        username TEXT,
                        phone_number TEXT,
                        phone_verified BOOLEAN DEFAULT FALSE,
                        channel_subscribed BOOLEAN DEFAULT FALSE,
                        access_granted BOOLEAN DEFAULT FALSE,
                        registered_at TIMESTAMPTZ NOT NULL,
                        last_start_at TIMESTAMPTZ NOT NULL,
                        access_granted_at TIMESTAMPTZ,
                        access_message_id BIGINT
                    );
                    ALTER TABLE users ADD COLUMN IF NOT EXISTS access_message_id BIGINT;
                    CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id);
                    CREATE INDEX IF NOT EXISTS idx_users_registered_at ON users(registered_at);
                    """
                )
            logger.info("PostgreSQL schema initialized successfully.")

    async def close(self) -> None:
        if self._pg_pool is not None:
            await self._pg_pool.close()
            logger.info("PostgreSQL pool closed.")

    def _now(self) -> datetime.datetime:
        return datetime.datetime.now(datetime.timezone.utc)

    def _parse_row(self, row: Any) -> Dict[str, Any]:
        if row is None:
            return None
        data = dict(row)
        if isinstance(data.get("phone_verified"), int):
            data["phone_verified"] = bool(data["phone_verified"])
        if isinstance(data.get("channel_subscribed"), int):
            data["channel_subscribed"] = bool(data["channel_subscribed"])
        if isinstance(data.get("access_granted"), int):
            data["access_granted"] = bool(data["access_granted"])

        for field in ("registered_at", "last_start_at", "access_granted_at"):
            val = data.get(field)
            if isinstance(val, str) and val:
                try:
                    data[field] = datetime.datetime.fromisoformat(val)
                except Exception:
                    pass
        return data

    async def upsert_user(
        self,
        telegram_id: int,
        first_name: str,
        last_name: Optional[str] = None,
        username: Optional[str] = None,
    ) -> Tuple[Dict[str, Any], bool]:
        now = self._now()
        existing = await self.get_user(telegram_id)

        if existing is None:
            if self.is_sqlite:
                import aiosqlite
                async with aiosqlite.connect(self._sqlite_path) as db:
                    await db.execute(
                        """
                        INSERT INTO users (
                            telegram_id, first_name, last_name, username,
                            phone_verified, channel_subscribed, access_granted,
                            registered_at, last_start_at
                        ) VALUES (?, ?, ?, ?, 0, 0, 0, ?, ?);
                        """,
                        (telegram_id, first_name, last_name, username, now.isoformat(), now.isoformat()),
                    )
                    await db.commit()
            else:
                async with self._pg_pool.acquire() as conn:
                    await conn.execute(
                        """
                        INSERT INTO users (
                            telegram_id, first_name, last_name, username,
                            phone_verified, channel_subscribed, access_granted,
                            registered_at, last_start_at
                        ) VALUES ($1, $2, $3, $4, FALSE, FALSE, FALSE, $5, $5);
                        """,
                        telegram_id, first_name, last_name, username, now,
                    )
            user = await self.get_user(telegram_id)
            return user, True
        else:
            if self.is_sqlite:
                import aiosqlite
                async with aiosqlite.connect(self._sqlite_path) as db:
                    await db.execute(
                        """
                        UPDATE users
                        SET first_name = ?, last_name = ?, username = ?, last_start_at = ?
                        WHERE telegram_id = ?;
                        """,
                        (first_name, last_name, username, now.isoformat(), telegram_id),
                    )
                    await db.commit()
            else:
                async with self._pg_pool.acquire() as conn:
                    await conn.execute(
                        """
                        UPDATE users
                        SET first_name = $1, last_name = $2, username = $3, last_start_at = $4
                        WHERE telegram_id = $5;
                        """,
                        first_name, last_name, username, now, telegram_id,
                    )
            user = await self.get_user(telegram_id)
            return user, False

    async def get_user(self, telegram_id: int) -> Optional[Dict[str, Any]]:
        if self.is_sqlite:
            import aiosqlite
            async with aiosqlite.connect(self._sqlite_path) as db:
                db.row_factory = aiosqlite.Row
                async with db.execute(
                    "SELECT * FROM users WHERE telegram_id = ? LIMIT 1;", (telegram_id,)
                ) as cursor:
                    row = await cursor.fetchone()
                    return self._parse_row(row)
        else:
            async with self._pg_pool.acquire() as conn:
                row = await conn.fetchrow(
                    "SELECT * FROM users WHERE telegram_id = $1 LIMIT 1;", telegram_id
                )
                return self._parse_row(row)

    async def update_channel_subscribed(self, telegram_id: int, subscribed: bool = True) -> None:
        if self.is_sqlite:
            import aiosqlite
            async with aiosqlite.connect(self._sqlite_path) as db:
                await db.execute(
                    "UPDATE users SET channel_subscribed = ? WHERE telegram_id = ?;",
                    (1 if subscribed else 0, telegram_id),
                )
                await db.commit()
        else:
            async with self._pg_pool.acquire() as conn:
                await conn.execute(
                    "UPDATE users SET channel_subscribed = $1 WHERE telegram_id = $2;",
                    subscribed, telegram_id,
                )

    async def update_phone_number(self, telegram_id: int, phone_number: str) -> None:
        if self.is_sqlite:
            import aiosqlite
            async with aiosqlite.connect(self._sqlite_path) as db:
                await db.execute(
                    "UPDATE users SET phone_number = ?, phone_verified = 1 WHERE telegram_id = ?;",
                    (phone_number, telegram_id),
                )
                await db.commit()
        else:
            async with self._pg_pool.acquire() as conn:
                await conn.execute(
                    "UPDATE users SET phone_number = $1, phone_verified = TRUE WHERE telegram_id = $2;",
                    phone_number, telegram_id,
                )

    async def grant_access(self, telegram_id: int) -> Dict[str, Any]:
        now = self._now()
        if self.is_sqlite:
            import aiosqlite
            async with aiosqlite.connect(self._sqlite_path) as db:
                await db.execute(
                    "UPDATE users SET access_granted = 1, access_granted_at = ? WHERE telegram_id = ?;",
                    (now.isoformat(), telegram_id),
                )
                await db.commit()
        else:
            async with self._pg_pool.acquire() as conn:
                await conn.execute(
                    "UPDATE users SET access_granted = TRUE, access_granted_at = $1 WHERE telegram_id = $2;",
                    now, telegram_id,
                )
        return await self.get_user(telegram_id)

    async def save_access_message_id(self, telegram_id: int, message_id: Optional[int]) -> None:
        if self.is_sqlite:
            import aiosqlite
            async with aiosqlite.connect(self._sqlite_path) as db:
                await db.execute("UPDATE users SET access_message_id = ? WHERE telegram_id = ?;", (message_id, telegram_id))
                await db.commit()
        else:
            async with self._pg_pool.acquire() as conn:
                await conn.execute("UPDATE users SET access_message_id = $1 WHERE telegram_id = $2;", message_id, telegram_id)

    async def revoke_access(self, telegram_id: int) -> None:
        if self.is_sqlite:
            import aiosqlite
            async with aiosqlite.connect(self._sqlite_path) as db:
                await db.execute("UPDATE users SET channel_subscribed = 0, access_granted = 0, access_message_id = NULL WHERE telegram_id = ?;", (telegram_id,))
                await db.commit()
        else:
            async with self._pg_pool.acquire() as conn:
                await conn.execute("UPDATE users SET channel_subscribed = FALSE, access_granted = FALSE, access_message_id = NULL WHERE telegram_id = $1;", telegram_id)

    async def get_users_count(self) -> int:
        if self.is_sqlite:
            import aiosqlite
            async with aiosqlite.connect(self._sqlite_path) as db:
                async with db.execute("SELECT COUNT(*) FROM users;") as cursor:
                    row = await cursor.fetchone()
                    return row[0] if row else 0
        else:
            async with self._pg_pool.acquire() as conn:
                val = await conn.fetchval("SELECT COUNT(*) FROM users;")
                return val or 0

    async def get_users_paginated(self, limit: int = 1, offset: int = 0) -> List[Dict[str, Any]]:
        if self.is_sqlite:
            import aiosqlite
            async with aiosqlite.connect(self._sqlite_path) as db:
                db.row_factory = aiosqlite.Row
                async with db.execute(
                    "SELECT * FROM users ORDER BY id ASC LIMIT ? OFFSET ?;", (limit, offset)
                ) as cursor:
                    rows = await cursor.fetchall()
                    return [self._parse_row(r) for r in rows]
        else:
            async with self._pg_pool.acquire() as conn:
                rows = await conn.fetch(
                    "SELECT * FROM users ORDER BY id ASC LIMIT $1 OFFSET $2;", limit, offset
                )
                return [self._parse_row(r) for r in rows]

    async def get_statistics(self) -> Dict[str, Any]:
        now_tashkent = datetime.datetime.now(self.tz)
        today_start_tashkent = now_tashkent.replace(hour=0, minute=0, second=0, microsecond=0)
        week_start_tashkent = today_start_tashkent - datetime.timedelta(days=today_start_tashkent.weekday())
        month_start_tashkent = today_start_tashkent.replace(day=1)

        today_start_utc = today_start_tashkent.astimezone(datetime.timezone.utc)
        week_start_utc = week_start_tashkent.astimezone(datetime.timezone.utc)
        month_start_utc = month_start_tashkent.astimezone(datetime.timezone.utc)

        if self.is_sqlite:
            import aiosqlite
            async with aiosqlite.connect(self._sqlite_path) as db:
                async with db.execute("SELECT COUNT(*) FROM users;") as cur:
                    total = (await cur.fetchone())[0]
                async with db.execute("SELECT COUNT(*) FROM users WHERE channel_subscribed = 1;") as cur:
                    channel_ver = (await cur.fetchone())[0]
                async with db.execute("SELECT COUNT(*) FROM users WHERE phone_verified = 1;") as cur:
                    phone_ver = (await cur.fetchone())[0]
                async with db.execute("SELECT COUNT(*) FROM users WHERE access_granted = 1;") as cur:
                    access_ver = (await cur.fetchone())[0]
                async with db.execute("SELECT COUNT(*) FROM users WHERE registered_at >= ?;", (today_start_utc.isoformat(),)) as cur:
                    today_count = (await cur.fetchone())[0]
                async with db.execute("SELECT COUNT(*) FROM users WHERE registered_at >= ?;", (week_start_utc.isoformat(),)) as cur:
                    week_count = (await cur.fetchone())[0]
                async with db.execute("SELECT COUNT(*) FROM users WHERE registered_at >= ?;", (month_start_utc.isoformat(),)) as cur:
                    month_count = (await cur.fetchone())[0]
        else:
            async with self._pg_pool.acquire() as conn:
                total = await conn.fetchval("SELECT COUNT(*) FROM users;")
                channel_ver = await conn.fetchval("SELECT COUNT(*) FROM users WHERE channel_subscribed = TRUE;")
                phone_ver = await conn.fetchval("SELECT COUNT(*) FROM users WHERE phone_verified = TRUE;")
                access_ver = await conn.fetchval("SELECT COUNT(*) FROM users WHERE access_granted = TRUE;")
                today_count = await conn.fetchval("SELECT COUNT(*) FROM users WHERE registered_at >= $1;", today_start_utc)
                week_count = await conn.fetchval("SELECT COUNT(*) FROM users WHERE registered_at >= $1;", week_start_utc)
                month_count = await conn.fetchval("SELECT COUNT(*) FROM users WHERE registered_at >= $1;", month_start_utc)

        return {
            "total_users": total or 0,
            "channel_verified": channel_ver or 0,
            "phone_verified": phone_ver or 0,
            "access_granted": access_ver or 0,
            "users_today": today_count or 0,
            "users_this_week": week_count or 0,
            "users_this_month": month_count or 0,
        }

    async def get_all_recipient_ids(self) -> List[int]:
        if self.is_sqlite:
            import aiosqlite
            async with aiosqlite.connect(self._sqlite_path) as db:
                async with db.execute("SELECT telegram_id FROM users ORDER BY id ASC;") as cursor:
                    rows = await cursor.fetchall()
                    return [r[0] for r in rows]
        else:
            async with self._pg_pool.acquire() as conn:
                rows = await conn.fetch("SELECT telegram_id FROM users ORDER BY id ASC;")
                return [r["telegram_id"] for r in rows]`,

  "handlers/user.py": `"""Foydalanuvchi handlerlari - MaktabX bot."""
from __future__ import annotations
import logging
from telegram import Update
from telegram.constants import ChatMemberStatus, ParseMode
from telegram.error import TelegramError
from telegram.ext import ContextTypes

from config import Config
from database import Database
from keyboards.admin import get_user_view_button
from keyboards.user import (
    get_channel_subscription_keyboard,
    get_maktabx_access_keyboard,
    get_phone_request_keyboard,
    remove_reply_keyboard,
)
from utils.helpers import (
    format_admin_start_notification,
    format_authorized_notification,
)

logger = logging.getLogger(__name__)


def _is_channel_member(status: str) -> bool:
    return status in (ChatMemberStatus.MEMBER, ChatMemberStatus.ADMINISTRATOR, ChatMemberStatus.OWNER)


def _get_channel_url(channel_username: str) -> str:
    if channel_username.startswith("@"):
        return f"https://t.me/{channel_username.lstrip('@')}"
    return f"https://t.me/c/{channel_username.replace('-100', '')}"


async def _remove_access_message(bot, channel_url: str, telegram_id: int, message_id: int | None) -> None:
    if not message_id:
        return
    try:
        await bot.delete_message(chat_id=telegram_id, message_id=message_id)
        return
    except Exception:
        pass
    try:
        await bot.edit_message_text(
            chat_id=telegram_id,
            message_id=message_id,
            text=(
                "⚠️ <b>KANALNI TARK ETGANINGIZ SABABLI SAYT HAVOLASI O'CHIRILDI!</b>\\n\\n"
                "Qayta kanalga obuna bo'lmaguningizcha MaktabX sayt linki taqdim etilmaydi."
            ),
            parse_mode=ParseMode.HTML,
            reply_markup=get_channel_subscription_keyboard(channel_url),
        )
    except Exception:
        pass


async def start_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    user = update.effective_user
    if not user:
        return

    config: Config = context.bot_data["config"]
    db: Database = context.bot_data["db"]

    if user.id == config.admin_id:
        from handlers.admin import show_admin_dashboard
        await show_admin_dashboard(update, context)
        return

    db_user, is_new = await db.upsert_user(
        telegram_id=user.id,
        first_name=user.first_name or "Foydalanuvchi",
        last_name=user.last_name,
        username=user.username,
    )

    try:
        admin_text = format_admin_start_notification(db_user, is_new=is_new, timezone_str=config.timezone)
        await context.bot.send_message(
            chat_id=config.admin_id,
            text=admin_text,
            parse_mode=ParseMode.HTML,
            reply_markup=get_user_view_button(user.id),
        )
    except Exception as notify_err:
        logger.error("Adminga /start xabarnomasini yuborishda xatolik: %s", notify_err)

    # 3-BOSQICH: Telegram API orqali kanalga a'zolikni jonli tekshirish
    is_member = False
    try:
        member = await context.bot.get_chat_member(chat_id=config.channel_username, user_id=user.id)
        is_member = _is_channel_member(member.status)
    except Exception as check_err:
        logger.warning("Kanal a'zoligini jonli tekshirishda xatolik (%d): %s", user.id, check_err)

    channel_url = _get_channel_url(config.channel_username)

    if not is_member:
        was_previously_subscribed = bool(
            db_user
            and (
                db_user.get("channel_subscribed")
                or db_user.get("access_granted")
                or db_user.get("phone_verified")
            )
        )
        if db_user and db_user.get("access_message_id"):
            await _remove_access_message(context.bot, channel_url, user.id, db_user.get("access_message_id"))
        await db.revoke_access(user.id)
        if was_previously_subscribed:
            await update.message.reply_text(
                "⚠️ <b>DIQQAT: SIZ KANALNI TARK ETGANSIZ!</b>\\n\\n"
                "Kanalni tark etganingiz sababli sayt havolasi o'chirildi.\\n"
                "Qayta kanalga obuna bo'lmaguningizcha sayt linki taqdim etilmaydi!\\n\\n"
                "Saytga kirish huquqini tiklash uchun iltimos kanalga <b>qayta obuna bo'ling</b> "
                "va <b>A'zolikni tekshirish</b> tugmasini bosing.",
                parse_mode=ParseMode.HTML,
                reply_markup=get_channel_subscription_keyboard(channel_url),
            )
        else:
            await update.message.reply_text(
                "📢 <b>KANALGA A'ZO BO'LISH TALAB ETILADI</b>\\n\\n"
                "MaktabX xizmatidan foydalanish uchun rasmiy kanalimizga a'zo bo'lishingiz kerak.\\n\\n"
                "Kanalga a'zo bo'lgach, davom etish uchun <b>A'zolikni tekshirish</b> tugmasini bosing.",
                parse_mode=ParseMode.HTML,
                reply_markup=get_channel_subscription_keyboard(channel_url),
            )
        return

    await db.update_channel_subscribed(user.id, True)

    # 4-BOSQICH: Telefon raqamini tekshirish (faqat bir marta olinadi)
    if db_user and db_user.get("phone_verified"):
        old_msg_id = db_user.get("access_message_id")
        if old_msg_id:
            try:
                await context.bot.delete_message(chat_id=user.id, message_id=old_msg_id)
            except Exception:
                pass
        await db.grant_access(user.id)
        sent_msg = await update.message.reply_text(
            "✅ <b>Xush kelibsiz!</b>\\n\\n"
            "Kanal a'zoligingiz va profilingiz tasdiqlangan.\\n"
            "MaktabX tizimidan to'liq foydalanishingiz mumkin. Quyidagi tugma orqali kiring:",
            parse_mode=ParseMode.HTML,
            reply_markup=get_maktabx_access_keyboard(config.maktabx_url),
        )
        await db.save_access_message_id(user.id, sent_msg.message_id)
        return

    await update.message.reply_text(
        "📱 <b>TELEFON RAQAMNI TASDIQLASH</b>\\n\\n"
        "Xavfsizlik maqsadida va zarurat tug'ilganda siz bilan MaktabX bo'yicha bog'lanish uchun "
        "Telegram telefon raqamingizni yuboring.\\n\\n"
        "Telefon raqamingiz faqat ko'rsatilgan MaktabX aloqa maqsadlarida ishlatiladi.",
        parse_mode=ParseMode.HTML,
        reply_markup=get_phone_request_keyboard(),
    )


async def check_subscription_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()

    user = update.effective_user
    if not user:
        return

    config: Config = context.bot_data["config"]
    db: Database = context.bot_data["db"]
    channel_url = _get_channel_url(config.channel_username)

    try:
        member = await context.bot.get_chat_member(chat_id=config.channel_username, user_id=user.id)
        is_member = _is_channel_member(member.status)
    except TelegramError as e:
        logger.warning("Kanal a'zoligini tekshirishda xatolik: %s", e)
        await query.answer("❌ Kanal a'zoligini tekshirib bo'lmadi. Iltimos, kanalga qo'shilganingizga ishonch hosil qiling.", show_alert=True)
        return

    if not is_member:
        db_user = await db.get_user(user.id)
        if db_user and db_user.get("access_message_id"):
            await _remove_access_message(context.bot, channel_url, user.id, db_user.get("access_message_id"))
        await db.revoke_access(user.id)
        await query.answer("❌ Siz hali kanalga a'zo bo'lmadingiz!\\n\\nQayta kanalga obuna bo'lmaguningizcha sayt linki berilmaydi.", show_alert=True)
        return

    await db.update_channel_subscribed(user.id, True)
    db_user = await db.get_user(user.id)

    if db_user and db_user.get("phone_verified"):
        old_msg_id = db_user.get("access_message_id")
        if old_msg_id and query.message and old_msg_id != query.message.message_id:
            try:
                await context.bot.delete_message(chat_id=user.id, message_id=old_msg_id)
            except Exception:
                pass
        updated_user = await db.grant_access(user.id)
        await query.edit_message_text(
            "✅ <b>TASDIQLASH MUVAFFAQIYATLI YAKUNLANDI</b>\\n\\nKanal a'zoligingiz tasdiqlandi.\\nMaktabX tizimiga kirish uchun quyidagi tugmani bosing:",
            parse_mode=ParseMode.HTML,
            reply_markup=get_maktabx_access_keyboard(config.maktabx_url),
        )
        if query.message:
            await db.save_access_message_id(user.id, query.message.message_id)
        try:
            admin_text = format_authorized_notification(updated_user, timezone_str=config.timezone)
            await context.bot.send_message(chat_id=config.admin_id, text=admin_text, parse_mode=ParseMode.HTML, reply_markup=get_user_view_button(user.id))
        except Exception:
            pass
        return

    try:
        await query.edit_message_text("✅ <b>Kanalga a'zolik tasdiqlandi.</b>", parse_mode=ParseMode.HTML)
    except Exception:
        pass

    await context.bot.send_message(
        chat_id=user.id,
        text=(
            "📱 <b>TELEFON RAQAMNI TASDIQLASH</b>\\n\\n"
            "Xavfsizlik maqsadida va zarurat tug'ilganda siz bilan MaktabX bo'yicha bog'lanish uchun "
            "Telegram telefon raqamingizni yuboring.\\n\\n"
            "Telefon raqamingiz faqat ko'rsatilgan MaktabX aloqa maqsadlarida ishlatiladi."
        ),
        parse_mode=ParseMode.HTML,
        reply_markup=get_phone_request_keyboard(),
    )


async def contact_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    user = update.effective_user
    contact = update.effective_message.contact
    if not user or not contact:
        return

    config: Config = context.bot_data["config"]
    db: Database = context.bot_data["db"]

    if contact.user_id != user.id:
        await update.message.reply_text(
            "❌ <b>Noto'g'ri kontakt</b>\\n\\n"
            "Ushbu telefon raqami sizning Telegram hisobingizga tegishli emas.\\n"
            "Iltimos, quyidagi tugma orqali o'zingizning Telegram kontaktingizni yuboring.",
            parse_mode=ParseMode.HTML,
            reply_markup=get_phone_request_keyboard(),
        )
        return

    phone = contact.phone_number if contact.phone_number.startswith("+") else f"+{contact.phone_number}"
    await db.update_phone_number(user.id, phone)

    updated_user = await db.grant_access(user.id)

    await update.message.reply_text("✅ <b>Telefon raqamingiz muvaffaqiyatli tasdiqlandi!</b>", reply_markup=remove_reply_keyboard())
    sent_msg = await update.message.reply_text(
        "✅ <b>TASDIQLASH MUVAFFAQIYATLI YAKUNLANDI</b>\\n\\n"
        "Siz barcha talablarni bajardingiz.\\n"
        "MaktabX tizimiga kirish uchun quyidagi tugmani bosing.",
        parse_mode=ParseMode.HTML,
        reply_markup=get_maktabx_access_keyboard(config.maktabx_url),
    )
    await db.save_access_message_id(user.id, sent_msg.message_id)

    try:
        admin_text = format_authorized_notification(updated_user, timezone_str=config.timezone)
        await context.bot.send_message(chat_id=config.admin_id, text=admin_text, parse_mode=ParseMode.HTML, reply_markup=get_user_view_button(user.id))
    except Exception as notify_err:
        logger.error("Adminga ruxsat xabarnomasini yuborishda xatolik: %s", notify_err)


async def channel_member_update_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    chat_member_update = update.chat_member
    if not chat_member_update:
        return

    config: Config = context.bot_data["config"]
    db: Database = context.bot_data["db"]

    chat = chat_member_update.chat
    target_channel = config.channel_username.strip()

    is_target_channel = False
    if target_channel.startswith("@"):
        if chat.username and f"@{chat.username.lower()}" == target_channel.lower():
            is_target_channel = True
    else:
        if str(chat.id) == target_channel:
            is_target_channel = True

    if not is_target_channel:
        return

    was_member = _is_channel_member(chat_member_update.old_chat_member.status)
    is_now_member = _is_channel_member(chat_member_update.new_chat_member.status)
    target_user = chat_member_update.new_chat_member.user

    if not target_user or target_user.is_bot or target_user.id == config.admin_id:
        return

    if was_member and not is_now_member:
        db_user = await db.get_user(target_user.id)
        if not db_user:
            return
        channel_url = _get_channel_url(config.channel_username)
        await _remove_access_message(context.bot, channel_url, target_user.id, db_user.get("access_message_id"))
        await db.revoke_access(target_user.id)
        try:
            await context.bot.send_message(
                chat_id=target_user.id,
                text=(
                    "⚠️ <b>DIQQAT: SIZ KANALNI TARK ETDINGIZ!</b>\\n\\n"
                    "Siz rasmiy kanalimizdan chiqib ketganingiz sababli chat ichidagi "
                    "<b>MaktabX saytiga kirish havolasi o'chirib tashlandi!</b>\\n\\n"
                    "Qayta kanalga obuna bo'lmaguningizcha sayt linki taqdim etilmaydi.\\n"
                    "Saytga kirishni tiklash uchun quyidagi tugma orqali kanalga <b>qayta obuna bo'ling</b> "
                    "va <b>A'zolikni tekshirish</b> tugmasini bosing:"
                ),
                parse_mode=ParseMode.HTML,
                reply_markup=get_channel_subscription_keyboard(channel_url),
            )
        except Exception:
            pass`,

  "handlers/admin.py": `"""Administrator handlerlari - MaktabX bot."""
from __future__ import annotations
import logging
from telegram import Update
from telegram.constants import ParseMode
from telegram.ext import ContextTypes

from config import Config
from database import Database
from keyboards.admin import (
    get_admin_menu_keyboard,
    get_single_user_keyboard,
    get_user_pagination_keyboard,
)
from utils.helpers import format_user_card

logger = logging.getLogger(__name__)


def is_admin(user_id: int, admin_id: int) -> bool:
    return user_id == admin_id


async def show_admin_dashboard(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.effective_message.reply_text(
        "👑 <b>Xush kelibsiz, Admin!</b>\\n\\nMaktabX botini boshqarish uchun quyidagi menyudan kerakli bo'limni tanlang.",
        parse_mode=ParseMode.HTML,
        reply_markup=get_admin_menu_keyboard(),
    )


async def admin_stats_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    user = update.effective_user
    config: Config = context.bot_data["config"]
    db: Database = context.bot_data["db"]

    if not user or not is_admin(user.id, config.admin_id):
        await update.effective_message.reply_text("❌ Sizda bu funksiyadan foydalanish huquqi yo'q.")
        return

    stats = await db.get_statistics()
    text = (
        "📊 <b>MAKTABX STATISTIKASI</b>\\n\\n"
        f"👥 <b>Jami foydalanuvchilar:</b> {stats['total_users']}\\n"
        f"📢 <b>Kanalga a'zo bo'lganlar:</b> {stats['channel_verified']}\\n"
        f"📱 <b>Telefonini tasdiqlaganlar:</b> {stats['phone_verified']}\\n"
        f"🔐 <b>Ruxsat berilganlar:</b> {stats['access_granted']}\\n\\n"
        f"🆕 <b>Bugun qo'shilganlar:</b> {stats['users_today']}\\n"
        f"🆕 <b>Shu haftada qo'shilganlar:</b> {stats['users_this_week']}\\n"
        f"🆕 <b>Shu oyda qo'shilganlar:</b> {stats['users_this_month']}"
    )
    await update.effective_message.reply_text(text, parse_mode=ParseMode.HTML)


async def admin_users_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    user = update.effective_user
    config: Config = context.bot_data["config"]
    db: Database = context.bot_data["db"]

    if not user or not is_admin(user.id, config.admin_id):
        await update.effective_message.reply_text("❌ Sizda bu funksiyadan foydalanish huquqi yo'q.")
        return

    total = await db.get_users_count()
    if total == 0:
        await update.effective_message.reply_text("👥 <b>JAMI FOYDALANUVCHILAR: 0</b>\\n\\nHali ro'yxatdan o'tgan foydalanuvchilar yo'q.", parse_mode=ParseMode.HTML)
        return

    users = await db.get_users_paginated(limit=1, offset=0)
    current_user = users[0]
    card_text = format_user_card(current_user, total_count=total, current_index=1, timezone_str=config.timezone)
    keyboard = get_user_pagination_keyboard(current_offset=0, total_users=total, telegram_id=current_user["telegram_id"])

    await update.effective_message.reply_text(card_text, parse_mode=ParseMode.HTML, reply_markup=keyboard)


async def admin_pagination_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()

    user = update.effective_user
    config: Config = context.bot_data["config"]
    db: Database = context.bot_data["db"]

    if not user or not is_admin(user.id, config.admin_id):
        await query.answer("❌ Sizda bu funksiyadan foydalanish huquqi yo'q.", show_alert=True)
        return

    data = query.data or ""
    if data == "admin_noop":
        return

    try:
        offset = int(data.split(":")[1])
    except (IndexError, ValueError):
        offset = 0

    total = await db.get_users_count()
    if total == 0:
        await query.edit_message_text("Foydalanuvchilar mavjud emas.")
        return

    offset = max(0, min(offset, total - 1))
    users = await db.get_users_paginated(limit=1, offset=offset)
    current_user = users[0]

    card_text = format_user_card(current_user, total_count=total, current_index=offset + 1, timezone_str=config.timezone)
    keyboard = get_user_pagination_keyboard(current_offset=offset, total_users=total, telegram_id=current_user["telegram_id"])

    await query.edit_message_text(card_text, parse_mode=ParseMode.HTML, reply_markup=keyboard)


async def admin_view_user_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()

    user = update.effective_user
    config: Config = context.bot_data["config"]
    db: Database = context.bot_data["db"]

    if not user or not is_admin(user.id, config.admin_id):
        await query.answer("❌ Sizda bu funksiyadan foydalanish huquqi yo'q.", show_alert=True)
        return

    try:
        target_telegram_id = int(query.data.split(":")[1])
    except (IndexError, ValueError):
        await query.answer("Noto'g'ri foydalanuvchi identifikatori.", show_alert=True)
        return

    db_user = await db.get_user(target_telegram_id)
    if not db_user:
        await query.answer("Foydalanuvchi bazadan topilmadi.", show_alert=True)
        return

    total = await db.get_users_count()
    card_text = format_user_card(db_user, total_count=total, current_index=1, timezone_str=config.timezone)

    await query.message.reply_text(card_text, parse_mode=ParseMode.HTML, reply_markup=get_single_user_keyboard(target_telegram_id))


async def admin_menu_back_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()
    await query.message.reply_text("👑 <b>Admin menyusi</b>\\n\\nQuyidagi amallardan birini tanlang:", parse_mode=ParseMode.HTML, reply_markup=get_admin_menu_keyboard())`,

  "handlers/broadcast.py": `"""Xabar tarqatish (Broadcast) handleri - MaktabX bot."""
from __future__ import annotations
import logging
from telegram import Update
from telegram.constants import ParseMode
from telegram.ext import ContextTypes, ConversationHandler

from config import Config
from database import Database
from handlers.admin import is_admin
from keyboards.admin import (
    get_admin_menu_keyboard,
    get_broadcast_cancel_keyboard,
    get_broadcast_confirm_keyboard,
)
from utils.broadcast import send_broadcast_message

logger = logging.getLogger(__name__)

WAITING_FOR_CONTENT, WAITING_FOR_CONFIRMATION = range(2)


async def broadcast_start_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    user = update.effective_user
    config: Config = context.bot_data["config"]

    if not user or not is_admin(user.id, config.admin_id):
        await update.effective_message.reply_text("❌ Sizda bu funksiyadan foydalanish huquqi yo'q.")
        return ConversationHandler.END

    await update.effective_message.reply_text(
        "📢 <b>XABAR TARQATISH</b>\\n\\n"
        "Foydalanuvchilarga yubormoqchi bo'lgan xabaringizni yuboring.\\n\\n"
        "Qo'llab-quvvatlanadigan formatlar:\\n"
        "• Oddiy matn\\n"
        "• Rasm va videolar\\n"
        "• Hujjatlar (APK, ZIP, PDF, Word, PowerPoint va boshqalar)\\n"
        "• Izohli (caption) media fayllar\\n\\n"
        "Xabarni hoziroq yuboring yoki quyidagi bekor qilish tugmasini bosing.",
        parse_mode=ParseMode.HTML,
        reply_markup=get_broadcast_cancel_keyboard(),
    )
    return WAITING_FOR_CONTENT


async def broadcast_content_received(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    message = update.effective_message
    db: Database = context.bot_data["db"]

    context.user_data["broadcast_from_chat_id"] = message.chat_id
    context.user_data["broadcast_message_id"] = message.message_id

    total_recipients = await db.get_users_count()

    await message.reply_text(
        f"📢 <b>XABARNI KO'RIB CHIQISH</b>\\n\\n"
        f"👥 <b>Qabul qiluvchilar:</b> {total_recipients} ta foydalanuvchi\\n\\n"
        f"Ushbu xabarni barcha ro'yxatdan o'tgan foydalanuvchilarga yuborishni tasdiqlaysizmi?",
        parse_mode=ParseMode.HTML,
        reply_markup=get_broadcast_confirm_keyboard(),
    )
    return WAITING_FOR_CONFIRMATION


async def broadcast_confirm_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()

    config: Config = context.bot_data["config"]
    db: Database = context.bot_data["db"]

    from_chat_id = context.user_data.get("broadcast_from_chat_id")
    message_id = context.user_data.get("broadcast_message_id")

    recipients = await db.get_all_recipient_ids()
    total = len(recipients)

    if total == 0:
        await query.edit_message_text("❌ Xabar yuborish uchun ro'yxatdan o'tgan foydalanuvchilar topilmadi.")
        return ConversationHandler.END

    status_msg = await query.edit_message_text(
        f"📤 <b>XABAR YUBORILMOQDA...</b>\\n\\nJami: {total}\\nYuborildi: 0\\nYuborilmadi: 0\\nQoldi: {total}",
        parse_mode=ParseMode.HTML,
    )

    async def update_progress(tot: int, sent: int, failed: int, remaining: int) -> None:
        try:
            await status_msg.edit_text(
                f"📤 <b>XABAR YUBORILMOQDA...</b>\\n\\nJami: {tot}\\nYuborildi: {sent}\\nYuborilmadi: {failed}\\nQoldi: {remaining}",
                parse_mode=ParseMode.HTML,
            )
        except Exception:
            pass

    stats = await send_broadcast_message(
        bot=context.bot,
        from_chat_id=from_chat_id,
        message_id=message_id,
        recipient_ids=recipients,
        progress_callback=update_progress,
    )

    await status_msg.edit_text(
        f"✅ <b>XABAR TARQATISH YAKUNLANDI</b>\\n\\n"
        f"Jami: {stats['total']}\\n"
        f"Muvaffaqiyatli yuborildi: {stats['success']}\\n"
        f"Yuborilmadi (bloklangan/faol emas): {stats['failed']}",
        parse_mode=ParseMode.HTML,
    )

    await context.bot.send_message(
        chat_id=config.admin_id,
        text="👑 <b>Admin menyusi</b>",
        parse_mode=ParseMode.HTML,
        reply_markup=get_admin_menu_keyboard(),
    )

    context.user_data.pop("broadcast_from_chat_id", None)
    context.user_data.pop("broadcast_message_id", None)
    return ConversationHandler.END


async def broadcast_cancel_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    if query:
        await query.answer()
        await query.edit_message_text("❌ <b>Xabar tarqatish bekor qilindi.</b>", parse_mode=ParseMode.HTML)
    else:
        await update.effective_message.reply_text("❌ <b>Xabar tarqatish bekor qilindi.</b>", parse_mode=ParseMode.HTML)

    context.user_data.pop("broadcast_from_chat_id", None)
    context.user_data.pop("broadcast_message_id", None)
    return ConversationHandler.END`,

  "keyboards/user.py": `from telegram import InlineKeyboardButton, InlineKeyboardMarkup, KeyboardButton, ReplyKeyboardMarkup, ReplyKeyboardRemove

def get_channel_subscription_keyboard(channel_url: str) -> InlineKeyboardMarkup:
    buttons = [
        [InlineKeyboardButton("📢 Kanalga a'zo bo'lish", url=channel_url)],
        [InlineKeyboardButton("✅ A'zolikni tekshirish", callback_data="check_subscription")],
    ]
    return InlineKeyboardMarkup(buttons)

def get_phone_request_keyboard() -> ReplyKeyboardMarkup:
    buttons = [[KeyboardButton("📱 Telefon raqamimni yuborish", request_contact=True)]]
    return ReplyKeyboardMarkup(buttons, resize_keyboard=True, one_time_keyboard=True)

def get_maktabx_access_keyboard(maktabx_url: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([[InlineKeyboardButton("🚀 MAKTABX GA KIRISH", url=maktabx_url)]])

def remove_reply_keyboard() -> ReplyKeyboardRemove:
    return ReplyKeyboardRemove()`,

  "keyboards/admin.py": `from telegram import InlineKeyboardButton, InlineKeyboardMarkup, KeyboardButton, ReplyKeyboardMarkup

def get_admin_menu_keyboard() -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup([
        [KeyboardButton("📊 Statistika"), KeyboardButton("👥 Foydalanuvchilar")],
        [KeyboardButton("📢 Xabar tarqatish")],
    ], resize_keyboard=True)

def get_user_view_button(telegram_id: int) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([[InlineKeyboardButton("👤 Foydalanuvchini ko'rish", callback_data=f"admin_view:{telegram_id}")]])

def get_user_pagination_keyboard(current_offset: int, total_users: int, telegram_id: int) -> InlineKeyboardMarkup:
    nav_row = []
    if current_offset > 0:
        nav_row.append(InlineKeyboardButton("⬅️ Oldingi", callback_data=f"admin_page:{current_offset - 1}"))
    else:
        nav_row.append(InlineKeyboardButton("⏹️ Boshlanishi", callback_data="admin_noop"))

    if current_offset + 1 < total_users:
        nav_row.append(InlineKeyboardButton("Keyingi ➡️", callback_data=f"admin_page:{current_offset + 1}"))
    else:
        nav_row.append(InlineKeyboardButton("Oxiri ⏹️", callback_data="admin_noop"))

    return InlineKeyboardMarkup([
        nav_row,
        [
            InlineKeyboardButton("🔄 Yangilash", callback_data=f"admin_view:{telegram_id}"),
            InlineKeyboardButton("🔙 Asosiy menyu", callback_data="admin_menu_back"),
        ],
    ])

def get_single_user_keyboard(telegram_id: int) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([
        [
            InlineKeyboardButton("🔄 Ma'lumotni yangilash", callback_data=f"admin_view:{telegram_id}"),
            InlineKeyboardButton("👥 Barcha foydalanuvchilar", callback_data="admin_page:0"),
        ],
        [InlineKeyboardButton("🔙 Asosiy menyu", callback_data="admin_menu_back")],
    ])

def get_broadcast_confirm_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([[
        InlineKeyboardButton("✅ Xabarni yuborish", callback_data="broadcast_confirm"),
        InlineKeyboardButton("❌ Bekor qilish", callback_data="broadcast_cancel"),
    ]])

def get_broadcast_cancel_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([[InlineKeyboardButton("❌ Bekor qilish", callback_data="broadcast_cancel")]])`,

  "utils/helpers.py": `import datetime
import html
from typing import Any, Dict, Optional
import pytz

def escape_html(text: Optional[str]) -> str:
    return html.escape(str(text)) if text else ""

def format_datetime_tashkent(dt_val: Any, timezone_str: str = "Asia/Tashkent", fmt: str = "%d.%m.%Y %H:%M:%S") -> str:
    if not dt_val:
        return "Kiritilmagan"
    target_tz = pytz.timezone(timezone_str)
    if isinstance(dt_val, str):
        try:
            dt_val = datetime.datetime.fromisoformat(dt_val)
        except Exception:
            return dt_val
    if not isinstance(dt_val, (datetime.datetime, datetime.date)):
        return str(dt_val)
    if dt_val.tzinfo is None:
        dt_val = pytz.utc.localize(dt_val)
    return dt_val.astimezone(target_tz).strftime(fmt)

def format_admin_start_notification(user: Dict[str, Any], is_new: bool, timezone_str: str = "Asia/Tashkent") -> str:
    telegram_id = user.get("telegram_id")
    first_name = escape_html(user.get("first_name") or "Foydalanuvchi")
    last_name = user.get("last_name")
    username = user.get("username")
    phone = user.get("phone_number")
    channel_sub = user.get("channel_subscribed", False)
    access_granted = user.get("access_granted", False)

    start_date = format_datetime_tashkent(user.get("last_start_at"), timezone_str, fmt="%d.%m.%Y")
    start_time = format_datetime_tashkent(user.get("last_start_at"), timezone_str, fmt="%H:%M:%S")

    channel_status = "✅ A'zo bo'lgan" if channel_sub else "Tekshirilmadi"
    phone_status = phone if phone else "Berilmagan"
    access_status = "✅ Berilgan" if access_granted else "Berilmagan"
    header = "🔔 YANGI FOYDALANUVCHI" if is_new else "🔔 FOYDALANUVCHI BOTNI BOSHLADI"

    lines = [
        f"<b>{header}</b>\\n",
        f"🆔 <b>ID:</b> <code>{telegram_id}</code>",
        f"👤 <b>Ismi:</b> {first_name}",
    ]
    if last_name:
        lines.append(f"👤 <b>Familiyasi:</b> {escape_html(last_name)}")
    if username:
        lines.append(f"🔗 <b>Username:</b> @{escape_html(username.lstrip('@'))}")
    lines.extend([
        f"📅 <b>Boshlangan sana:</b> {start_date}",
        f"🕐 <b>Boshlangan vaqt:</b> {start_time}",
        f"📢 <b>Kanal:</b> {channel_status}",
        f"📱 <b>Telefon:</b> {phone_status}",
        f"🔐 <b>Ruxsat:</b> {access_status}",
    ])
    return "\\n".join(lines)

def format_authorized_notification(user: Dict[str, Any], timezone_str: str = "Asia/Tashkent") -> str:
    telegram_id = user.get("telegram_id")
    full_name = f"{escape_html(user.get('first_name') or '')} {escape_html(user.get('last_name') or '')}".strip() or "Foydalanuvchi"
    username = user.get("username")
    phone = user.get("phone_number") or "Berilmagan"
    auth_time = format_datetime_tashkent(user.get("access_granted_at"), timezone_str, fmt="%d.%m.%Y %H:%M:%S")

    lines = [
        "<b>✅ FOYDALANUVCHI TASDIQLANDI</b>\\n",
        f"🆔 <b>ID:</b> <code>{telegram_id}</code>",
        f"👤 <b>Ismi:</b> {full_name}",
    ]
    if username:
        lines.append(f"🔗 <b>Username:</b> @{escape_html(username.lstrip('@'))}")
    lines.extend([
        f"📱 <b>Telefon:</b> {phone}",
        "📢 <b>Kanal:</b> ✅",
        "🔐 <b>Ruxsat:</b> ✅",
        f"🕐 <b>Tasdiqlangan vaqt:</b> {auth_time}",
    ])
    return "\\n".join(lines)

def format_user_card(user: Dict[str, Any], total_count: int, current_index: int, timezone_str: str = "Asia/Tashkent") -> str:
    telegram_id = user.get("telegram_id")
    first_name = escape_html(user.get("first_name") or "Kiritilmagan")
    last_name = user.get("last_name")
    username = user.get("username")
    phone = user.get("phone_number") or "Berilmagan"
    registered = format_datetime_tashkent(user.get("registered_at"), timezone_str)
    last_start = format_datetime_tashkent(user.get("last_start_at"), timezone_str)
    access_granted_at = format_datetime_tashkent(user.get("access_granted_at"), timezone_str)

    lines = [
        f"<b>👤 FOYDALANUVCHI ({current_index} / {total_count})</b>\\n",
        f"🆔 <b>ID:</b> <code>{telegram_id}</code>",
        f"👤 <b>Ismi:</b> {first_name}",
    ]
    if last_name:
        lines.append(f"👤 <b>Familiyasi:</b> {escape_html(last_name)}")
    if username:
        lines.append(f"🔗 <b>Username:</b> @{escape_html(username.lstrip('@'))}")
    lines.extend([
        f"📱 <b>Telefon:</b> {phone}",
        f"📅 <b>Ro'yxatdan o'tgan:</b> {registered}",
        f"🕐 <b>Oxirgi kirgan:</b> {last_start}",
        f"📢 <b>Kanal:</b> {'✅' if user.get('channel_subscribed') else '❌'}",
        f"📱 <b>Telefon:</b> {'✅' if user.get('phone_verified') else '❌'}",
        f"🔐 <b>Ruxsat:</b> {'✅' if user.get('access_granted') else '❌'}",
        f"🕐 <b>Ruxsat berilgan:</b> {access_granted_at}",
    ])
    return "\\n".join(lines)`,

  "utils/broadcast.py": `import asyncio
import logging
import time
from typing import Any, Callable, Coroutine, Dict, List, Optional
from telegram import Bot
from telegram.error import Forbidden, RetryAfter, TelegramError

logger = logging.getLogger(__name__)

async def send_broadcast_message(
    bot: Bot,
    from_chat_id: int,
    message_id: int,
    recipient_ids: List[int],
    progress_callback: Optional[Callable[[int, int, int, int], Coroutine[Any, Any, None]]] = None,
) -> Dict[str, int]:
    total = len(recipient_ids)
    success = 0
    blocked = 0
    failed = 0
    last_progress_time = time.time()
    MESSAGE_DELAY = 0.045

    for index, user_id in enumerate(recipient_ids, start=1):
        try:
            await bot.copy_message(chat_id=user_id, from_chat_id=from_chat_id, message_id=message_id)
            success += 1
        except RetryAfter as e:
            wait_time = int(e.retry_after) + 1
            await asyncio.sleep(wait_time)
            try:
                await bot.copy_message(chat_id=user_id, from_chat_id=from_chat_id, message_id=message_id)
                success += 1
            except Exception:
                failed += 1
        except Forbidden:
            blocked += 1
            failed += 1
        except Exception:
            failed += 1

        await asyncio.sleep(MESSAGE_DELAY)

        now = time.time()
        if progress_callback and ((now - last_progress_time >= 2.5) or (index == total)):
            remaining = total - index
            try:
                await progress_callback(total, success, failed, remaining)
                last_progress_time = now
            except Exception:
                pass

    return {"total": total, "success": success, "blocked": blocked, "failed": failed}`,

  "requirements.txt": `python-telegram-bot[rate-limiter]>=21.0
asyncpg>=0.29.0
aiosqlite>=0.20.0
python-dotenv>=1.0.1
pytz>=2024.1`,

  "Procfile": `worker: python bot.py`,

  "railway.toml": `[build]
builder = "RAILPACK"

[deploy]
startCommand = "python bot.py"
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 10`,

  ".env.example": `# ==============================================================================
# MaktabX Telegram Bot Konfiguratsiyasi (O'zbekcha)
# ==============================================================================
TELEGRAM_BOT_TOKEN=your_bot_token_here
ADMIN_ID=123456789
CHANNEL_USERNAME=@your_channel_username
MAKTABX_URL=https://maktabx.uz
DATABASE_URL=sqlite:///maktabx.db
BOT_NAME=MaktabX Bot
TIMEZONE=Asia/Tashkent`,

  ".gitignore": `# Python environment & cache
__pycache__/
*.py[cod]
*$py.class
*.so
.Python
env/
venv/
.venv/
build/
dist/
*.egg-info/

# Maxfiy fayllar
.env
.env.local

# Ma'lumotlar bazasi
*.db
*.sqlite
*.sqlite3

# Loglar
*.log
logs/

# Tahrirlovchi keshlar
.idea/
.vscode/
.DS_Store`
};
