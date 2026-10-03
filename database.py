"""
MaktabX Database Layer.

Provides high-performance asynchronous storage supporting both PostgreSQL (via asyncpg)
and SQLite (via aiosqlite). Automatically creates tables, handles user upserts,
maintains access timestamps, and computes statistics.
"""

from __future__ import annotations

import datetime
import logging
from typing import Any, Dict, List, Optional, Tuple
import pytz

logger = logging.getLogger(__name__)


class Database:
    """Async Database manager for MaktabX bot."""

    def __init__(self, database_url: str, timezone_name: str = "Asia/Tashkent"):
        self.database_url = database_url
        self.timezone_name = timezone_name
        self.tz = pytz.timezone(timezone_name)
        self.is_sqlite = (
            database_url.startswith("sqlite") or "sqlite" in database_url
        )
        self._pg_pool = None
        self._sqlite_path = "maktabx.db"

        if self.is_sqlite:
            # Extract clean SQLite path from URI if present
            clean = database_url.replace("sqlite:///", "").replace("sqlite://", "")
            self._sqlite_path = clean or "maktabx.db"

    async def connect(self) -> None:
        """Initialize database connection and verify schema."""
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
                        access_granted_at TEXT
                    );
                    """
                )
                await db.execute(
                    "CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id);"
                )
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
                        access_granted_at TIMESTAMPTZ
                    );
                    CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id);
                    CREATE INDEX IF NOT EXISTS idx_users_registered_at ON users(registered_at);
                    """
                )
            logger.info("PostgreSQL schema initialized successfully.")

    async def close(self) -> None:
        """Close database connection pool on shutdown."""
        if self._pg_pool is not None:
            await self._pg_pool.close()
            logger.info("PostgreSQL pool closed.")

    def _now(self) -> datetime.datetime:
        """Returns current UTC timestamp with tzinfo."""
        return datetime.datetime.now(datetime.timezone.utc)

    def _parse_row(self, row: Any) -> Dict[str, Any]:
        """Convert a database row into a standardized dict."""
        if row is None:
            return None
        data = dict(row)
        # Standardize booleans for SQLite integer storage
        if isinstance(data.get("phone_verified"), int):
            data["phone_verified"] = bool(data["phone_verified"])
        if isinstance(data.get("channel_subscribed"), int):
            data["channel_subscribed"] = bool(data["channel_subscribed"])
        if isinstance(data.get("access_granted"), int):
            data["access_granted"] = bool(data["access_granted"])

        # Standardize datetime parsing for SQLite strings
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
        """
        Registers or updates a user upon /start.
        Returns a tuple: (user_dict, is_new_user).
        """
        now = self._now()
        existing = await self.get_user(telegram_id)

        if existing is None:
            # Insert brand new user
            if self.is_sqlite:
                import aiosqlite

                async with aiosqlite.connect(self._sqlite_path) as db:
                    db.row_factory = aiosqlite.Row
                    cursor = await db.execute(
                        """
                        INSERT INTO users (
                            telegram_id, first_name, last_name, username,
                            phone_verified, channel_subscribed, access_granted,
                            registered_at, last_start_at
                        ) VALUES (?, ?, ?, ?, 0, 0, 0, ?, ?);
                        """,
                        (
                            telegram_id,
                            first_name,
                            last_name,
                            username,
                            now.isoformat(),
                            now.isoformat(),
                        ),
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
                        telegram_id,
                        first_name,
                        last_name,
                        username,
                        now,
                    )
            user = await self.get_user(telegram_id)
            return user, True
        else:
            # Update existing user info and latest start timestamp
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
                        first_name,
                        last_name,
                        username,
                        now,
                        telegram_id,
                    )
            user = await self.get_user(telegram_id)
            return user, False

    async def get_user(self, telegram_id: int) -> Optional[Dict[str, Any]]:
        """Retrieve user record by numeric Telegram ID."""
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

    async def update_channel_subscribed(
        self, telegram_id: int, subscribed: bool = True
    ) -> None:
        """Update channel subscription status."""
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
                    subscribed,
                    telegram_id,
                )

    async def update_phone_number(
        self, telegram_id: int, phone_number: str
    ) -> None:
        """Update user phone number and mark phone as verified."""
        if self.is_sqlite:
            import aiosqlite

            async with aiosqlite.connect(self._sqlite_path) as db:
                await db.execute(
                    """
                    UPDATE users
                    SET phone_number = ?, phone_verified = 1
                    WHERE telegram_id = ?;
                    """,
                    (phone_number, telegram_id),
                )
                await db.commit()
        else:
            async with self._pg_pool.acquire() as conn:
                await conn.execute(
                    """
                    UPDATE users
                    SET phone_number = $1, phone_verified = TRUE
                    WHERE telegram_id = $2;
                    """,
                    phone_number,
                    telegram_id,
                )

    async def grant_access(self, telegram_id: int) -> Dict[str, Any]:
        """Mark access_granted as True and record access_granted_at timestamp."""
        now = self._now()
        if self.is_sqlite:
            import aiosqlite

            async with aiosqlite.connect(self._sqlite_path) as db:
                await db.execute(
                    """
                    UPDATE users
                    SET access_granted = 1, access_granted_at = ?
                    WHERE telegram_id = ?;
                    """,
                    (now.isoformat(), telegram_id),
                )
                await db.commit()
        else:
            async with self._pg_pool.acquire() as conn:
                await conn.execute(
                    """
                    UPDATE users
                    SET access_granted = TRUE, access_granted_at = $1
                    WHERE telegram_id = $2;
                    """,
                    now,
                    telegram_id,
                )
        return await self.get_user(telegram_id)

    async def revoke_access(self, telegram_id: int) -> None:
        """Mark channel_subscribed and access_granted as False (phone stays verified)."""
        if self.is_sqlite:
            import aiosqlite

            async with aiosqlite.connect(self._sqlite_path) as db:
                await db.execute(
                    """
                    UPDATE users
                    SET channel_subscribed = 0, access_granted = 0
                    WHERE telegram_id = ?;
                    """,
                    (telegram_id,),
                )
                await db.commit()
        else:
            async with self._pg_pool.acquire() as conn:
                await conn.execute(
                    """
                    UPDATE users
                    SET channel_subscribed = FALSE, access_granted = FALSE
                    WHERE telegram_id = $1;
                    """,
                    telegram_id,
                )

    async def get_users_count(self) -> int:
        """Return total count of registered users."""
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

    async def get_users_paginated(
        self, limit: int = 1, offset: int = 0
    ) -> List[Dict[str, Any]]:
        """Fetch users with limit and offset for pagination."""
        if self.is_sqlite:
            import aiosqlite

            async with aiosqlite.connect(self._sqlite_path) as db:
                db.row_factory = aiosqlite.Row
                async with db.execute(
                    """
                    SELECT * FROM users
                    ORDER BY id ASC
                    LIMIT ? OFFSET ?;
                    """,
                    (limit, offset),
                ) as cursor:
                    rows = await cursor.fetchall()
                    return [self._parse_row(r) for r in rows]
        else:
            async with self._pg_pool.acquire() as conn:
                rows = await conn.fetch(
                    """
                    SELECT * FROM users
                    ORDER BY id ASC
                    LIMIT $1 OFFSET $2;
                    """,
                    limit,
                    offset,
                )
                return [self._parse_row(r) for r in rows]

    async def get_statistics(self) -> Dict[str, Any]:
        """
        Compute dashboard metrics including totals and time-based metrics
        adjusted to the configured timezone (Asia/Tashkent).
        """
        now_tashkent = datetime.datetime.now(self.tz)
        today_start_tashkent = now_tashkent.replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        week_start_tashkent = today_start_tashkent - datetime.timedelta(
            days=today_start_tashkent.weekday()
        )
        month_start_tashkent = today_start_tashkent.replace(day=1)

        # Convert boundaries to UTC
        today_start_utc = today_start_tashkent.astimezone(datetime.timezone.utc)
        week_start_utc = week_start_tashkent.astimezone(datetime.timezone.utc)
        month_start_utc = month_start_tashkent.astimezone(datetime.timezone.utc)

        if self.is_sqlite:
            import aiosqlite

            today_iso = today_start_utc.isoformat()
            week_iso = week_start_utc.isoformat()
            month_iso = month_start_utc.isoformat()

            async with aiosqlite.connect(self._sqlite_path) as db:
                async with db.execute("SELECT COUNT(*) FROM users;") as cur:
                    total = (await cur.fetchone())[0]
                async with db.execute(
                    "SELECT COUNT(*) FROM users WHERE channel_subscribed = 1;"
                ) as cur:
                    channel_ver = (await cur.fetchone())[0]
                async with db.execute(
                    "SELECT COUNT(*) FROM users WHERE phone_verified = 1;"
                ) as cur:
                    phone_ver = (await cur.fetchone())[0]
                async with db.execute(
                    "SELECT COUNT(*) FROM users WHERE access_granted = 1;"
                ) as cur:
                    access_ver = (await cur.fetchone())[0]
                async with db.execute(
                    "SELECT COUNT(*) FROM users WHERE registered_at >= ?;",
                    (today_iso,),
                ) as cur:
                    today_count = (await cur.fetchone())[0]
                async with db.execute(
                    "SELECT COUNT(*) FROM users WHERE registered_at >= ?;",
                    (week_iso,),
                ) as cur:
                    week_count = (await cur.fetchone())[0]
                async with db.execute(
                    "SELECT COUNT(*) FROM users WHERE registered_at >= ?;",
                    (month_iso,),
                ) as cur:
                    month_count = (await cur.fetchone())[0]
        else:
            async with self._pg_pool.acquire() as conn:
                total = await conn.fetchval("SELECT COUNT(*) FROM users;")
                channel_ver = await conn.fetchval(
                    "SELECT COUNT(*) FROM users WHERE channel_subscribed = TRUE;"
                )
                phone_ver = await conn.fetchval(
                    "SELECT COUNT(*) FROM users WHERE phone_verified = TRUE;"
                )
                access_ver = await conn.fetchval(
                    "SELECT COUNT(*) FROM users WHERE access_granted = TRUE;"
                )
                today_count = await conn.fetchval(
                    "SELECT COUNT(*) FROM users WHERE registered_at >= $1;",
                    today_start_utc,
                )
                week_count = await conn.fetchval(
                    "SELECT COUNT(*) FROM users WHERE registered_at >= $1;",
                    week_start_utc,
                )
                month_count = await conn.fetchval(
                    "SELECT COUNT(*) FROM users WHERE registered_at >= $1;",
                    month_start_utc,
                )

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
        """Fetch all registered Telegram IDs for broadcasting."""
        if self.is_sqlite:
            import aiosqlite

            async with aiosqlite.connect(self._sqlite_path) as db:
                async with db.execute(
                    "SELECT telegram_id FROM users ORDER BY id ASC;"
                ) as cursor:
                    rows = await cursor.fetchall()
                    return [r[0] for r in rows]
        else:
            async with self._pg_pool.acquire() as conn:
                rows = await conn.fetch(
                    "SELECT telegram_id FROM users ORDER BY id ASC;"
                )
                return [r["telegram_id"] for r in rows]
