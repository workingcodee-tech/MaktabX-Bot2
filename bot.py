"""
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
    check_subscription_callback,
    contact_handler,
    start_handler,
)

# Log sozlamalari
logging.basicConfig(
    format="%(asctime)s - [%(levelname)s] - %(name)s: %(message)s",
    level=logging.INFO,
)
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("telegram").setLevel(logging.INFO)
logging.getLogger("asyncio").setLevel(logging.WARNING)

logger = logging.getLogger("MaktabXBot")


async def error_handler(update: object, context: object) -> None:
    """Xatoliklarni jimgina qayd qilish va botning to'xtab qolishini oldini olish."""
    logger.error("Xatolik yuz berdi: %s", context.error, exc_info=True)


async def on_startup(application: Application) -> None:
    """Bot ishga tushganda bajariladigan dastlabki amallar."""
    config: Config = application.bot_data["config"]
    db: Database = application.bot_data["db"]

    logger.info("Ma'lumotlar bazasiga ulanish tekshirilmoqda...")
    await db.connect()
    logger.info("MaktabX Bot muvaffaqiyatli ishga tushdi. Sozlamalar: %s", config)

    # Administratorga bot faollashgani haqida bildirishnoma yuborish
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
    """Bot to'xtaganda bajariladigan amallar."""
    logger.info("MaktabX Bot to'xtatilmoqda...")
    db: Database = application.bot_data.get("db")
    if db:
        await db.close()
    logger.info("MaktabX Bot to'xtatildi.")


def main() -> None:
    """Konfiguratsiyani tekshirish va botni ishga tushirish."""
    try:
        config = Config.load()
    except Exception as e:
        logger.critical("Konfiguratsiya xatosi: %s", e)
        sys.exit(1)

    db = Database(
        database_url=config.database_url,
        timezone_name=config.timezone,
    )

    # Telegram Bot ilovasini yaratish
    application = (
        ApplicationBuilder()
        .token(config.telegram_bot_token)
        .post_init(on_startup)
        .post_shutdown(on_shutdown)
        .build()
    )

    # Bot ma'lumotlarida obyektlarni saqlash
    application.bot_data["config"] = config
    application.bot_data["db"] = db

    # 1. Xabar tarqatish (Broadcast) suhbat handleri
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
                CallbackQueryHandler(
                    broadcast_cancel_callback, pattern="^broadcast_cancel$"
                ),
                MessageHandler(
                    filters.ALL & ~filters.COMMAND, broadcast_content_received
                ),
            ],
            WAITING_FOR_CONFIRMATION: [
                CallbackQueryHandler(
                    broadcast_confirm_callback, pattern="^broadcast_confirm$"
                ),
                CallbackQueryHandler(
                    broadcast_cancel_callback, pattern="^broadcast_cancel$"
                ),
            ],
        },
        fallbacks=[
            CommandHandler("cancel", broadcast_cancel_callback),
            CallbackQueryHandler(
                broadcast_cancel_callback, pattern="^broadcast_cancel$"
            ),
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
    application.add_handler(
        CallbackQueryHandler(admin_pagination_callback, pattern=r"^admin_page:")
    )
    application.add_handler(
        CallbackQueryHandler(admin_view_user_callback, pattern=r"^admin_view:")
    )
    application.add_handler(
        CallbackQueryHandler(admin_menu_back_callback, pattern="^admin_menu_back$")
    )

    # 3. Foydalanuvchi handlerlari
    application.add_handler(CommandHandler("start", start_handler))
    application.add_handler(
        CallbackQueryHandler(
            check_subscription_callback, pattern="^check_subscription$"
        )
    )
    application.add_handler(MessageHandler(filters.CONTACT, contact_handler))

    # 4. Global xatolik tutuvchi
    application.add_error_handler(error_handler)

    # Long polling orqali xabarlarni qabul qilishni boshlash
    logger.info("Telegram long polling ishga tushirilmoqda...")
    application.run_polling(
        allowed_updates=Update.ALL_TYPES,
        drop_pending_updates=True,
    )


if __name__ == "__main__":
    main()
