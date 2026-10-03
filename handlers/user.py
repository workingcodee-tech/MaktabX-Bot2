"""
Foydalanuvchi handlerlari - MaktabX bot.

/start buyrug'i, kanalga a'zolikni tekshirish, kontaktni tasdiqlash,
MaktabX xizmatiga ruxsat berish va adminga real vaqtda xabar yuborish.
"""

from __future__ import annotations

import logging
from typing import Optional
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
    """Foydalanuvchi kanalda faol a'zo ekanligini tekshirish."""
    return status in (
        ChatMemberStatus.MEMBER,
        ChatMemberStatus.ADMINISTRATOR,
        ChatMemberStatus.OWNER,
    )


def _get_channel_url(channel_username: str) -> str:
    """Kanal havolasini shakllantirish."""
    if channel_username.startswith("@"):
        return f"https://t.me/{channel_username.lstrip('@')}"
    return f"https://t.me/c/{channel_username.replace('-100', '')}"


async def start_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Foydalanuvchi va admin uchun /start buyrug'ini qabul qilish."""
    user = update.effective_user
    if not user:
        return

    config: Config = context.bot_data["config"]
    db: Database = context.bot_data["db"]

    # Agar foydalanuvchi administrator bo'lsa, to'g'ridan-to'g'ri admin panelni ochish
    if user.id == config.admin_id:
        from handlers.admin import show_admin_dashboard
        await show_admin_dashboard(update, context)
        return

    # 1-BOSQICH: Foydalanuvchini bazaga qo'shish yoki yangilash
    db_user, is_new = await db.upsert_user(
        telegram_id=user.id,
        first_name=user.first_name or "Foydalanuvchi",
        last_name=user.last_name,
        username=user.username,
    )

    # 2-BOSQICH: Adminga /start haqida darhol xabar yuborish
    try:
        admin_text = format_admin_start_notification(
            db_user, is_new=is_new, timezone_str=config.timezone
        )
        await context.bot.send_message(
            chat_id=config.admin_id,
            text=admin_text,
            parse_mode=ParseMode.HTML,
            reply_markup=get_user_view_button(user.id),
        )
    except Exception as notify_err:
        logger.error("Adminga /start xabarnomasini yuborishda xatolik: %s", notify_err)

    # Joriy tasdiqlash holatini tekshirish
    if db_user.get("access_granted"):
        # Foydalanuvchi allaqachon to'liq tasdiqlangan
        await update.message.reply_text(
            "✅ <b>Siz allaqachon tasdiqlangansiz.</b>\n\n"
            "MaktabX tizimidan to'liq foydalanishingiz mumkin. Quyidagi tugma orqali kiring.",
            parse_mode=ParseMode.HTML,
            reply_markup=get_maktabx_access_keyboard(config.maktabx_url),
        )
        return

    # Kanalga a'zolik holatini tekshirish
    if not db_user.get("channel_subscribed"):
        channel_url = _get_channel_url(config.channel_username)
        await update.message.reply_text(
            "📢 <b>KANALGA A'ZO BO'LISH TALAB ETILADI</b>\n\n"
            "MaktabX xizmatidan foydalanish uchun rasmiy kanalimizga a'zo bo'lishingiz kerak.\n\n"
            "A'zo bo'lgach, davom etish uchun <b>A'zolikni tekshirish</b> tugmasini bosing.",
            parse_mode=ParseMode.HTML,
            reply_markup=get_channel_subscription_keyboard(channel_url),
        )
        return

    # Kanal tasdiqlangan, lekin telefon tasdiqlanmagan bo'lsa
    if not db_user.get("phone_verified"):
        await update.message.reply_text(
            "📱 <b>TELEFON RAQAMNI TASDIQLASH</b>\n\n"
            "Xavfsizlik maqsadida va zarurat tug'ilganda siz bilan MaktabX bo'yicha bog'lanish uchun "
            "Telegram telefon raqamingizni yuboring.\n\n"
            "Telefon raqamingiz faqat ko'rsatilgan MaktabX aloqa maqsadlarida ishlatiladi.",
            parse_mode=ParseMode.HTML,
            reply_markup=get_phone_request_keyboard(),
        )
        return


async def check_subscription_callback(
    update: Update, context: ContextTypes.DEFAULT_TYPE
) -> None:
    """'A'zolikni tekshirish' inline tugmasi bosilganda."""
    query = update.callback_query
    await query.answer()

    user = update.effective_user
    if not user:
        return

    config: Config = context.bot_data["config"]
    db: Database = context.bot_data["db"]

    # Telegram Bot API orqali kanal a'zoligini tekshirish
    is_member = False
    try:
        member = await context.bot.get_chat_member(
            chat_id=config.channel_username,
            user_id=user.id,
        )
        is_member = _is_channel_member(member.status)
    except TelegramError as e:
        logger.warning(
            "Kanal a'zoligini tekshirishda xatolik (%d, %s): %s",
            user.id,
            config.channel_username,
            e,
        )
        await query.answer(
            "❌ Kanal a'zoligini tekshirib bo'lmadi. Iltimos, kanalga qo'shilganingizga ishonch hosil qiling.",
            show_alert=True,
        )
        return

    if not is_member:
        await query.answer(
            "❌ Siz hali kanalga a'zo bo'lmadingiz.\n\n"
            "Iltimos, kanalga a'zo bo'ling va tugmani qayta bosing.",
            show_alert=True,
        )
        return

    # Foydalanuvchi kanal a'zosi deb belgilandi
    await db.update_channel_subscribed(user.id, True)
    db_user = await db.get_user(user.id)

    # Agar telefon raqami allaqachon mavjud bo'lsa, to'g'ridan-to'g'ri ruxsat berish
    if db_user and db_user.get("phone_verified"):
        updated_user = await db.grant_access(user.id)
        await query.edit_message_text(
            "✅ <b>TASDIQLASH MUVAFFAQIYATLI YAKUNLANDI</b>\n\n"
            "Siz barcha talablarni bajardingiz.\n"
            "MaktabX tizimiga kirish uchun quyidagi tugmani bosing.",
            parse_mode=ParseMode.HTML,
            reply_markup=get_maktabx_access_keyboard(config.maktabx_url),
        )
        try:
            admin_text = format_authorized_notification(
                updated_user, timezone_str=config.timezone
            )
            await context.bot.send_message(
                chat_id=config.admin_id,
                text=admin_text,
                parse_mode=ParseMode.HTML,
                reply_markup=get_user_view_button(user.id),
            )
        except Exception as notify_err:
            logger.error("Adminga ruxsat xabarnomasini yuborishda xatolik: %s", notify_err)
        return

    # Aks holda telefon raqamini so'rash
    try:
        await query.edit_message_text(
            "✅ <b>Kanalga a'zolik tasdiqlandi.</b>",
            parse_mode=ParseMode.HTML,
        )
    except Exception:
        pass

    await context.bot.send_message(
        chat_id=user.id,
        text=(
            "📱 <b>TELEFON RAQAMNI TASDIQLASH</b>\n\n"
            "Xavfsizlik maqsadida va zarurat tug'ilganda siz bilan MaktabX bo'yicha bog'lanish uchun "
            "Telegram telefon raqamingizni yuboring.\n\n"
            "Telefon raqamingiz faqat ko'rsatilgan MaktabX aloqa maqsadlarida ishlatiladi."
        ),
        parse_mode=ParseMode.HTML,
        reply_markup=get_phone_request_keyboard(),
    )


async def contact_handler(
    update: Update, context: ContextTypes.DEFAULT_TYPE
) -> None:
    """Foydalanuvchi kontakt yuborganida tekshirish va qabul qilish."""
    user = update.effective_user
    contact = update.effective_message.contact
    if not user or not contact:
        return

    config: Config = context.bot_data["config"]
    db: Database = context.bot_data["db"]

    # XAVFSIZLIK TEKSHIRUVI: Yuborilgan kontakt haqiqatan ham ushbu foydalanuvchiga tegishli ekanligini tekshirish
    if contact.user_id != user.id:
        await update.message.reply_text(
            "❌ <b>Noto'g'ri kontakt</b>\n\n"
            "Ushbu telefon raqami sizning Telegram hisobingizga tegishli emas.\n"
            "Iltimos, quyidagi tugma orqali o'zingizning Telegram kontaktingizni yuboring.",
            parse_mode=ParseMode.HTML,
            reply_markup=get_phone_request_keyboard(),
        )
        return

    phone = contact.phone_number
    if not phone.startswith("+"):
        phone = f"+{phone}"

    await db.update_phone_number(user.id, phone)

    # Ruxsat berishdan oldin kanal a'zoligini qayta tekshirish
    db_user = await db.get_user(user.id)
    is_channel_sub = db_user.get("channel_subscribed", False) if db_user else False

    try:
        member = await context.bot.get_chat_member(
            chat_id=config.channel_username, user_id=user.id
        )
        if _is_channel_member(member.status):
            is_channel_sub = True
            await db.update_channel_subscribed(user.id, True)
    except Exception as e:
        logger.debug("Qayta kanal tekshiruvi: %s", e)

    if not is_channel_sub:
        channel_url = _get_channel_url(config.channel_username)
        await update.message.reply_text(
            "📢 <b>Kanalga a'zolik mavjud emas</b>\n\n"
            "Telefon raqamingiz qabul qilindi, ammo siz hali rasmiy kanalimizga a'zo emassiz.",
            parse_mode=ParseMode.HTML,
            reply_markup=get_channel_subscription_keyboard(channel_url),
        )
        return

    # MaktabX ga kirish ruxsatini berish
    updated_user = await db.grant_access(user.id)

    await update.message.reply_text(
        "✅ <b>Telefon raqamingiz muvaffaqiyatli tasdiqlandi!</b>",
        reply_markup=remove_reply_keyboard(),
    )

    await update.message.reply_text(
        "✅ <b>TASDIQLASH MUVAFFAQIYATLI YAKUNLANDI</b>\n\n"
        "Siz barcha talablarni bajardingiz.\n"
        "MaktabX tizimiga kirish uchun quyidagi tugmani bosing.",
        parse_mode=ParseMode.HTML,
        reply_markup=get_maktabx_access_keyboard(config.maktabx_url),
    )

    # Adminga real vaqtda xabar berish
    try:
        admin_text = format_authorized_notification(
            updated_user, timezone_str=config.timezone
        )
        await context.bot.send_message(
            chat_id=config.admin_id,
            text=admin_text,
            parse_mode=ParseMode.HTML,
            reply_markup=get_user_view_button(user.id),
        )
    except Exception as notify_err:
        logger.error("Adminga ruxsat xabarnomasini yuborishda xatolik: %s", notify_err)
