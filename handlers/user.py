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


async def _remove_access_message(
    bot, channel_url: str, telegram_id: int, message_id: Optional[int]
) -> None:
    """Chat ichidagi saytga olib kiradigan xabarni o'chirib tashlash (yoki tahrirlab yopish)."""
    if not message_id:
        return
    try:
        await bot.delete_message(chat_id=telegram_id, message_id=message_id)
        return
    except Exception as del_err:
        logger.debug(
            "Sayt linki xabarini o'chirib bo'lmadi (%d, %s), tahrirlanmoqda: %s",
            telegram_id,
            message_id,
            del_err,
        )
    try:
        await bot.edit_message_text(
            chat_id=telegram_id,
            message_id=message_id,
            text=(
                "⚠️ <b>KANALNI TARK ETGANINGIZ SABABLI SAYT HAVOLASI O'CHIRILDI!</b>\n\n"
                "Qayta kanalga obuna bo'lmaguningizcha MaktabX sayt linki taqdim etilmaydi."
            ),
            parse_mode=ParseMode.HTML,
            reply_markup=get_channel_subscription_keyboard(channel_url),
        )
    except Exception as edit_err:
        logger.debug("Eski kirish xabarini tahrirlab ham bo'lmadi: %s", edit_err)


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

    # 3-BOSQICH: Kanalga a'zolikni Telegram API orqali REAL VAQTDA JONLI TEKSHIRISH
    is_member = False
    try:
        member = await context.bot.get_chat_member(
            chat_id=config.channel_username,
            user_id=user.id,
        )
        is_member = _is_channel_member(member.status)
    except Exception as check_err:
        logger.warning(
            "Kanal a'zoligini jonli tekshirishda xatolik (%d, %s): %s",
            user.id,
            config.channel_username,
            check_err,
        )

    channel_url = _get_channel_url(config.channel_username)

    # AGAR FOYDALANUVCHI KANALDA BO'LMASA (Chiqib ketgan yoki a'zo bo'lmagan bo'lsa):
    if not is_member:
        was_previously_subscribed = bool(
            db_user
            and (
                db_user.get("channel_subscribed")
                or db_user.get("access_granted")
                or db_user.get("phone_verified")
            )
        )
        # Agar chatda eski sayt linki xabari bo'lsa, uni darhol o'chirib tashlash
        if db_user and db_user.get("access_message_id"):
            await _remove_access_message(
                context.bot, channel_url, user.id, db_user.get("access_message_id")
            )

        # Avvalgi ruxsatni bekor qilish (lekin telefon raqami saqlanib qoladi!)
        await db.revoke_access(user.id)

        if was_previously_subscribed:
            await update.message.reply_text(
                "⚠️ <b>DIQQAT: SIZ KANALNI TARK ETGANSIZ!</b>\n\n"
                "Kanalni tark etganingiz sababli sayt havolasi o'chirildi.\n"
                "Qayta kanalga obuna bo'lmaguningizcha sayt linki taqdim etilmaydi!\n\n"
                "Saytga kirish huquqini tiklash uchun iltimos kanalga <b>qayta obuna bo'ling</b> "
                "va <b>A'zolikni tekshirish</b> tugmasini bosing.",
                parse_mode=ParseMode.HTML,
                reply_markup=get_channel_subscription_keyboard(channel_url),
            )
        else:
            await update.message.reply_text(
                "📢 <b>KANALGA A'ZO BO'LISH TALAB ETILADI</b>\n\n"
                "MaktabX xizmatidan foydalanish uchun rasmiy kanalimizga a'zo bo'lishingiz kerak.\n\n"
                "Kanalga a'zo bo'lgach, davom etish uchun <b>A'zolikni tekshirish</b> tugmasini bosing.",
                parse_mode=ParseMode.HTML,
                reply_markup=get_channel_subscription_keyboard(channel_url),
            )
        return

    # FOYDALANUVCHI KANALDA BO'LSA:
    await db.update_channel_subscribed(user.id, True)

    # 4-BOSQICH: Telefon raqamini tekshirish (faqat bir marta so'raladi)
    if db_user and db_user.get("phone_verified"):
        # Eski kirish xabari bo'lsa tozalash (chatda faqat bitta faol link turishi uchun)
        old_msg_id = db_user.get("access_message_id")
        if old_msg_id:
            try:
                await context.bot.delete_message(chat_id=user.id, message_id=old_msg_id)
            except Exception:
                pass

        # Telefon allaqachon tasdiqlangan va kanal a'zosi - darhol sayt linkini beramiz!
        await db.grant_access(user.id)
        sent_msg = await update.message.reply_text(
            "✅ <b>Xush kelibsiz!</b>\n\n"
            "Kanal a'zoligingiz va profilingiz tasdiqlangan.\n"
            "MaktabX tizimidan to'liq foydalanishingiz mumkin. Quyidagi tugma orqali kiring:",
            parse_mode=ParseMode.HTML,
            reply_markup=get_maktabx_access_keyboard(config.maktabx_url),
        )
        await db.save_access_message_id(user.id, sent_msg.message_id)
        return

    # Telefon raqami hali berilmagan bo'lsa - faqat bir marta so'rash
    await update.message.reply_text(
        "📱 <b>TELEFON RAQAMNI TASDIQLASH</b>\n\n"
        "Xavfsizlik maqsadida va zarurat tug'ilganda siz bilan MaktabX bo'yicha bog'lanish uchun "
        "Telegram telefon raqamingizni yuboring.\n\n"
        "Telefon raqamingiz faqat ko'rsatilgan MaktabX aloqa maqsadlarida ishlatiladi.",
        parse_mode=ParseMode.HTML,
        reply_markup=get_phone_request_keyboard(),
    )


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
    channel_url = _get_channel_url(config.channel_username)

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
        db_user = await db.get_user(user.id)
        if db_user and db_user.get("access_message_id"):
            await _remove_access_message(
                context.bot, channel_url, user.id, db_user.get("access_message_id")
            )
        await db.revoke_access(user.id)
        await query.answer(
            "❌ Siz hali kanalga a'zo bo'lmadingiz!\n\n"
            "Qayta kanalga obuna bo'lmaguningizcha sayt linki berilmaydi.",
            show_alert=True,
        )
        return

    # Foydalanuvchi kanal a'zosi deb belgilandi
    await db.update_channel_subscribed(user.id, True)
    db_user = await db.get_user(user.id)

    # Agar telefon raqami allaqachon mavjud bo'lsa (bir marotaba olingan), to'g'ridan-to'g'ri ruxsat berish!
    if db_user and db_user.get("phone_verified"):
        old_msg_id = db_user.get("access_message_id")
        if old_msg_id and query.message and old_msg_id != query.message.message_id:
            try:
                await context.bot.delete_message(chat_id=user.id, message_id=old_msg_id)
            except Exception:
                pass

        updated_user = await db.grant_access(user.id)
        edited_msg = await query.edit_message_text(
            "✅ <b>TASDIQLASH MUVAFFAQIYATLI YAKUNLANDI</b>\n\n"
            "Kanal a'zoligingiz tasdiqlandi.\n"
            "MaktabX tizimiga kirish uchun quyidagi tugmani bosing:",
            parse_mode=ParseMode.HTML,
            reply_markup=get_maktabx_access_keyboard(config.maktabx_url),
        )
        if query.message:
            await db.save_access_message_id(user.id, query.message.message_id)
        elif hasattr(edited_msg, "message_id"):
            await db.save_access_message_id(user.id, edited_msg.message_id)

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
    is_channel_sub = False
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
        await db.revoke_access(user.id)
        channel_url = _get_channel_url(config.channel_username)
        await update.message.reply_text(
            "📢 <b>Kanalga a'zolik mavjud emas</b>\n\n"
            "Telefon raqamingiz qabul qilindi, ammo siz hali rasmiy kanalimizga a'zo emassiz.\n"
            "Qayta obuna bo'lmaguningizcha sayt linki berilmaydi.",
            parse_mode=ParseMode.HTML,
            reply_markup=get_channel_subscription_keyboard(channel_url),
        )
        return

    # MaktabX ga kirish ruxsatini berish
    updated_user = await db.grant_access(user.id)

    await update.message.reply_text(
        "✅ <b>Telefon raqamingiz muvaffaqiyatli tasdiqlandi!</b>",
        parse_mode=ParseMode.HTML,
        reply_markup=remove_reply_keyboard(),
    )

    sent_msg = await update.message.reply_text(
        "✅ <b>TASDIQLASH MUVAFFAQIYATLI YAKUNLANDI</b>\n\n"
        "Siz barcha talablarni bajardingiz.\n"
        "MaktabX tizimiga kirish uchun quyidagi tugmani bosing.",
        parse_mode=ParseMode.HTML,
        reply_markup=get_maktabx_access_keyboard(config.maktabx_url),
    )
    await db.save_access_message_id(user.id, sent_msg.message_id)

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


async def channel_member_update_handler(
    update: Update, context: ContextTypes.DEFAULT_TYPE
) -> None:
    """
    Foydalanuvchi kanalni tark etgan zahoti (real-time) buni aniqlash,
    chat ichidagi sayt linki xabarini o'chirib tashlash va foydalanuvchini ogohlantirish.
    """
    chat_member_update = update.chat_member
    if not chat_member_update:
        return

    config: Config = context.bot_data["config"]
    db: Database = context.bot_data["db"]

    chat = chat_member_update.chat
    target_channel = config.channel_username.strip()

    # Hodisa aynan bizning kanalimizda yuz berganini tekshirish
    is_target_channel = False
    if target_channel.startswith("@"):
        if chat.username and f"@{chat.username.lower()}" == target_channel.lower():
            is_target_channel = True
    else:
        if str(chat.id) == target_channel:
            is_target_channel = True

    if not is_target_channel:
        return

    old_status = chat_member_update.old_chat_member.status
    new_status = chat_member_update.new_chat_member.status

    was_member = _is_channel_member(old_status)
    is_now_member = _is_channel_member(new_status)

    target_user = chat_member_update.new_chat_member.user
    if not target_user or target_user.is_bot or target_user.id == config.admin_id:
        return

    # 1-HOLAT: Foydalanuvchi kanaldan chiqib ketdi!
    if was_member and not is_now_member:
        db_user = await db.get_user(target_user.id)
        if not db_user:
            return

        channel_url = _get_channel_url(config.channel_username)
        old_msg_id = db_user.get("access_message_id")

        # Chat ichidagi saytga olib kiradigan xabarni darhol o'chirib tashlash!
        await _remove_access_message(context.bot, channel_url, target_user.id, old_msg_id)

        # Bazada ruxsatni bekor qilish (telefon raqami esa saqlanib qoladi)
        await db.revoke_access(target_user.id)

        # Foydalanuvchiga kanalni tark etgani va qayta obuna bo'lmaguncha sayt berilmasligini xabar qilish
        try:
            await context.bot.send_message(
                chat_id=target_user.id,
                text=(
                    "⚠️ <b>DIQQAT: SIZ KANALNI TARK ETDINGIZ!</b>\n\n"
                    "Siz rasmiy kanalimizdan chiqib ketganingiz sababli chat ichidagi "
                    "<b>MaktabX saytiga kirish havolasi o'chirib tashlandi!</b>\n\n"
                    "Qayta kanalga obuna bo'lmaguningizcha sayt linki taqdim etilmaydi.\n"
                    "Saytga kirishni tiklash uchun quyidagi tugma orqali kanalga <b>qayta obuna bo'ling</b> "
                    "va <b>A'zolikni tekshirish</b> tugmasini bosing:"
                ),
                parse_mode=ParseMode.HTML,
                reply_markup=get_channel_subscription_keyboard(channel_url),
            )
        except Exception as notify_err:
            logger.debug(
                "Kanaldan chiqqan foydalanuvchiga (%d) ogohlantirish yuborib bo'lmadi: %s",
                target_user.id,
                notify_err,
            )
