"""
Safe, rate-limited broadcast engine for Telegram.

Uses copy_message to preserve original media, documents (APK, ZIP, PDF, Word, PPT),
captions, and formatting without downloading or re-uploading.
Respects Telegram API rate limits (~20-25 msgs/sec) and handles blocked users.
"""

from __future__ import annotations

import asyncio
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
    progress_callback: Optional[
        Callable[[int, int, int, int], Coroutine[Any, Any, None]]
    ] = None,
) -> Dict[str, int]:
    """
    Broadcasts a message to all recipient IDs safely.

    Returns stats dict:
    {
        'total': total,
        'success': success,
        'blocked': blocked,
        'failed': failed,
    }
    """
    total = len(recipient_ids)
    success = 0
    blocked = 0
    failed = 0

    last_progress_time = time.time()
    # 0.045s delay per message ensures maximum ~22 messages per second
    # well below Telegram's 30 messages/second limit across all chats.
    MESSAGE_DELAY = 0.045

    logger.info("Starting broadcast to %d recipients...", total)

    for index, user_id in enumerate(recipient_ids, start=1):
        try:
            await bot.copy_message(
                chat_id=user_id,
                from_chat_id=from_chat_id,
                message_id=message_id,
            )
            success += 1
        except RetryAfter as e:
            # Telegram temporary rate limit hit - wait the requested duration
            wait_time = int(e.retry_after) + 1
            logger.warning(
                "Hit Telegram rate limit. Waiting %d seconds before resuming.",
                wait_time,
            )
            await asyncio.sleep(wait_time)
            # Retry once after waiting
            try:
                await bot.copy_message(
                    chat_id=user_id,
                    from_chat_id=from_chat_id,
                    message_id=message_id,
                )
                success += 1
            except Exception as retry_err:
                logger.error("Retry failed for user %d: %s", user_id, retry_err)
                failed += 1
        except Forbidden:
            # User has blocked the bot or deleted account
            blocked += 1
            failed += 1
            logger.debug("User %d blocked the bot or chat is forbidden.", user_id)
        except TelegramError as e:
            failed += 1
            logger.warning("Telegram error sending to %d: %s", user_id, e)
        except Exception as e:
            failed += 1
            logger.error("Unexpected error sending to %d: %s", user_id, e)

        # Rate limiting delay
        await asyncio.sleep(MESSAGE_DELAY)

        # Update progress every 2 seconds or at specific milestone intervals
        now = time.time()
        if progress_callback and (
            (now - last_progress_time >= 2.5) or (index == total)
        ):
            remaining = total - index
            try:
                await progress_callback(total, success, failed, remaining)
                last_progress_time = now
            except Exception as cb_err:
                logger.debug("Progress callback error: %s", cb_err)

    logger.info(
        "Broadcast completed: Total=%d, Success=%d, Blocked=%d, Failed=%d",
        total,
        success,
        blocked,
        failed,
    )
    return {
        "total": total,
        "success": success,
        "blocked": blocked,
        "failed": failed,
    }
