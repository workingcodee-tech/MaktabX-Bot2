"""
Administrator handlerlari - MaktabX bot.

Admin avtorizatsiyasi, real vaqtdagi statistika,
sahifalangan foydalanuvchilar ro'yxati va foydalanuvchi ma'lumotlarini ko'rish.
"""

from __future__ import annotations

import logging
from typing import Optional
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
    """Foydalanuvchi ADMIN_ID raqamiga mos kelishini tekshirish."""
    return user_id == admin_id


async def show_admin_dashboard(
    update: Update, context: ContextTypes.DEFAULT_TYPE
) -> None:
    """Admin asosiy menyusi va xush kelibsiz xabarini ko'rsatish."""
    await update.effective_message.reply_text(
        "👑 <b>Xush kelibsiz, Admin!</b>\n\n"
        "MaktabX botini boshqarish uchun quyidagi menyudan kerakli bo'limni tanlang.",
        parse_mode=ParseMode.HTML,
        reply_markup=get_admin_menu_keyboard(),
    )


async def admin_stats_handler(
    update: Update, context: ContextTypes.DEFAULT_TYPE
) -> None:
    """Umumiy va vaqt bo'yicha hisoblangan statistikani ko'rsatish."""
    user = update.effective_user
    config: Config = context.bot_data["config"]
    db: Database = context.bot_data["db"]

    if not user or not is_admin(user.id, config.admin_id):
        await update.effective_message.reply_text(
            "❌ Sizda bu funksiyadan foydalanish huquqi yo'q."
        )
        return

    stats = await db.get_statistics()

    text = (
        "📊 <b>MAKTABX STATISTIKASI</b>\n\n"
        f"👥 <b>Jami foydalanuvchilar:</b> {stats['total_users']}\n"
        f"📢 <b>Kanalga a'zo bo'lganlar:</b> {stats['channel_verified']}\n"
        f"📱 <b>Telefonini tasdiqlaganlar:</b> {stats['phone_verified']}\n"
        f"🔐 <b>Ruxsat berilganlar:</b> {stats['access_granted']}\n\n"
        f"🆕 <b>Bugun qo'shilganlar:</b> {stats['users_today']}\n"
        f"🆕 <b>Shu haftada qo'shilganlar:</b> {stats['users_this_week']}\n"
        f"🆕 <b>Shu oyda qo'shilganlar:</b> {stats['users_this_month']}"
    )

    await update.effective_message.reply_text(text, parse_mode=ParseMode.HTML)


async def admin_users_handler(
    update: Update, context: ContextTypes.DEFAULT_TYPE
) -> None:
    """Foydalanuvchilar ro'yxatini birma-bir sahifalash bilan ko'rsatish."""
    user = update.effective_user
    config: Config = context.bot_data["config"]
    db: Database = context.bot_data["db"]

    if not user or not is_admin(user.id, config.admin_id):
        await update.effective_message.reply_text(
            "❌ Sizda bu funksiyadan foydalanish huquqi yo'q."
        )
        return

    total = await db.get_users_count()
    if total == 0:
        await update.effective_message.reply_text(
            "👥 <b>JAMI FOYDALANUVCHILAR: 0</b>\n\nHali ro'yxatdan o'tgan foydalanuvchilar yo'q.",
            parse_mode=ParseMode.HTML,
        )
        return

    users = await db.get_users_paginated(limit=1, offset=0)
    if not users:
        await update.effective_message.reply_text("Foydalanuvchi ma'lumotlari topilmadi.")
        return

    current_user = users[0]
    card_text = format_user_card(
        current_user,
        total_count=total,
        current_index=1,
        timezone_str=config.timezone,
    )
    keyboard = get_user_pagination_keyboard(
        current_offset=0,
        total_users=total,
        telegram_id=current_user["telegram_id"],
    )

    await update.effective_message.reply_text(
        card_text, parse_mode=ParseMode.HTML, reply_markup=keyboard
    )


async def admin_pagination_callback(
    update: Update, context: ContextTypes.DEFAULT_TYPE
) -> None:
    """Sahifalash tugmalari (Oldingi / Keyingi) bosilganda."""
    query = update.callback_query
    await query.answer()

    user = update.effective_user
    config: Config = context.bot_data["config"]
    db: Database = context.bot_data["db"]

    if not user or not is_admin(user.id, config.admin_id):
        await query.answer(
            "❌ Sizda bu funksiyadan foydalanish huquqi yo'q.", show_alert=True
        )
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

    if offset < 0:
        offset = 0
    elif offset >= total:
        offset = total - 1

    users = await db.get_users_paginated(limit=1, offset=offset)
    if not users:
        await query.answer("Foydalanuvchi ma'lumoti topilmadi.", show_alert=True)
        return

    current_user = users[0]
    card_text = format_user_card(
        current_user,
        total_count=total,
        current_index=offset + 1,
        timezone_str=config.timezone,
    )
    keyboard = get_user_pagination_keyboard(
        current_offset=offset,
        total_users=total,
        telegram_id=current_user["telegram_id"],
    )

    await query.edit_message_text(
        card_text, parse_mode=ParseMode.HTML, reply_markup=keyboard
    )


async def admin_view_user_callback(
    update: Update, context: ContextTypes.DEFAULT_TYPE
) -> None:
    """
    Xabarnomadagi 'Foydalanuvchini ko'rish' tugmasi bosilganda.
    Ma'lumot to'g'ridan-to'g'ri ma'lumotlar bazasidan yangilab olinadi.
    """
    query = update.callback_query
    await query.answer()

    user = update.effective_user
    config: Config = context.bot_data["config"]
    db: Database = context.bot_data["db"]

    if not user or not is_admin(user.id, config.admin_id):
        await query.answer(
            "❌ Sizda bu funksiyadan foydalanish huquqi yo'q.", show_alert=True
        )
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
    card_text = format_user_card(
        db_user,
        total_count=total,
        current_index=1,
        timezone_str=config.timezone,
    )

    await query.message.reply_text(
        card_text,
        parse_mode=ParseMode.HTML,
        reply_markup=get_single_user_keyboard(target_telegram_id),
    )


async def admin_menu_back_callback(
    update: Update, context: ContextTypes.DEFAULT_TYPE
) -> None:
    """Asosiy admin menyusiga qaytish."""
    query = update.callback_query
    await query.answer()

    user = update.effective_user
    config: Config = context.bot_data["config"]

    if not user or not is_admin(user.id, config.admin_id):
        await query.answer(
            "❌ Sizda bu funksiyadan foydalanish huquqi yo'q.", show_alert=True
        )
        return

    await query.message.reply_text(
        "👑 <b>Admin menyusi</b>\n\nQuyidagi amallardan birini tanlang:",
        parse_mode=ParseMode.HTML,
        reply_markup=get_admin_menu_keyboard(),
    )
