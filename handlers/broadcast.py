"""
Xabar tarqatish (Broadcast) handleri - MaktabX bot.

Administratorlarga barcha ro'yxatdan o'tgan foydalanuvchilarga matn, media,
hujjatlar (APK, ZIP, PDF, Word, PowerPoint) yuborish, yuborishdan oldin ko'rib chiqish
va real vaqtda jarayonni kuzatish imkoniyatini beradi.
"""

from __future__ import annotations

import logging
from typing import Optional
from telegram import Update
from telegram.constants import ParseMode
from telegram.ext import (
    ContextTypes,
    ConversationHandler,
)

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

# Suhbat holatlari
WAITING_FOR_CONTENT, WAITING_FOR_CONFIRMATION = range(2)


async def broadcast_start_handler(
    update: Update, context: ContextTypes.DEFAULT_TYPE
) -> int:
    """Administratorga xabar yoki media faylni yuborishni so'rash."""
    user = update.effective_user
    config: Config = context.bot_data["config"]

    if not user or not is_admin(user.id, config.admin_id):
        await update.effective_message.reply_text(
            "❌ Sizda bu funksiyadan foydalanish huquqi yo'q."
        )
        return ConversationHandler.END

    await update.effective_message.reply_text(
        "📢 <b>XABAR TARQATISH</b>\n\n"
        "Foydalanuvchilarga yubormoqchi bo'lgan xabaringizni yuboring.\n\n"
        "Qo'llab-quvvatlanadigan formatlar:\n"
        "• Oddiy matn\n"
        "• Rasm va videolar\n"
        "• Hujjatlar (APK, ZIP, PDF, Word, PowerPoint va boshqalar)\n"
        "• Izohli (caption) media fayllar\n\n"
        "Xabarni hoziroq yuboring yoki quyidagi bekor qilish tugmasini bosing.",
        parse_mode=ParseMode.HTML,
        reply_markup=get_broadcast_cancel_keyboard(),
    )
    return WAITING_FOR_CONTENT


async def broadcast_content_received(
    update: Update, context: ContextTypes.DEFAULT_TYPE
) -> int:
    """Xabar ma'lumotlarini saqlab, adminga tasdiqlash uchun ko'rsatish."""
    user = update.effective_user
    config: Config = context.bot_data["config"]
    db: Database = context.bot_data["db"]

    if not user or not is_admin(user.id, config.admin_id):
        return ConversationHandler.END

    message = update.effective_message
    if not message:
        return WAITING_FOR_CONTENT

    context.user_data["broadcast_from_chat_id"] = message.chat_id
    context.user_data["broadcast_message_id"] = message.message_id

    total_recipients = await db.get_users_count()

    await message.reply_text(
        f"📢 <b>XABARNI KO'RIB CHIQISH</b>\n\n"
        f"👥 <b>Qabul qiluvchilar:</b> {total_recipients} ta foydalanuvchi\n\n"
        f"Ushbu xabarni barcha ro'yxatdan o'tgan foydalanuvchilarga yuborishni tasdiqlaysizmi?",
        parse_mode=ParseMode.HTML,
        reply_markup=get_broadcast_confirm_keyboard(),
    )
    return WAITING_FOR_CONFIRMATION


async def broadcast_confirm_callback(
    update: Update, context: ContextTypes.DEFAULT_TYPE
) -> int:
    """Xabarni barcha foydalanuvchilarga xavfsiz tezlikda tarqatish."""
    query = update.callback_query
    await query.answer()

    user = update.effective_user
    config: Config = context.bot_data["config"]
    db: Database = context.bot_data["db"]

    if not user or not is_admin(user.id, config.admin_id):
        await query.answer("Ruxsat berilmagan.", show_alert=True)
        return ConversationHandler.END

    from_chat_id = context.user_data.get("broadcast_from_chat_id")
    message_id = context.user_data.get("broadcast_message_id")

    if not from_chat_id or not message_id:
        await query.edit_message_text(
            "❌ Xabar ma'lumotlari topilmadi. Iltimos, xabar yuborishni qaytadan boshlang."
        )
        return ConversationHandler.END

    recipients = await db.get_all_recipient_ids()
    total = len(recipients)

    if total == 0:
        await query.edit_message_text("❌ Xabar yuborish uchun ro'yxatdan o'tgan foydalanuvchilar topilmadi.")
        return ConversationHandler.END

    status_msg = await query.edit_message_text(
        f"📤 <b>XABAR YUBORILMOQDA...</b>\n\n"
        f"Jami: {total}\n"
        f"Yuborildi: 0\n"
        f"Yuborilmadi: 0\n"
        f"Qoldi: {total}",
        parse_mode=ParseMode.HTML,
    )

    async def update_progress(
        tot: int, sent: int, failed: int, remaining: int
    ) -> None:
        try:
            await status_msg.edit_text(
                f"📤 <b>XABAR YUBORILMOQDA...</b>\n\n"
                f"Jami: {tot}\n"
                f"Yuborildi: {sent}\n"
                f"Yuborilmadi: {failed}\n"
                f"Qoldi: {remaining}",
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
        f"✅ <b>XABAR TARQATISH YAKUNLANDI</b>\n\n"
        f"Jami: {stats['total']}\n"
        f"Muvaffaqiyatli yuborildi: {stats['success']}\n"
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


async def broadcast_cancel_callback(
    update: Update, context: ContextTypes.DEFAULT_TYPE
) -> int:
    """Xabar tarqatish jarayonini bekor qilish."""
    query = update.callback_query
    if query:
        await query.answer()
        await query.edit_message_text(
            "❌ <b>Xabar tarqatish bekor qilindi.</b>", parse_mode=ParseMode.HTML
        )
    else:
        await update.effective_message.reply_text(
            "❌ <b>Xabar tarqatish bekor qilindi.</b>", parse_mode=ParseMode.HTML
        )

    context.user_data.pop("broadcast_from_chat_id", None)
    context.user_data.pop("broadcast_message_id", None)

    return ConversationHandler.END
