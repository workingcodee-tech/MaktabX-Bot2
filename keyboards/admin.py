"""
Administrator tugmalari (Keyboards) - MaktabX bot.

Admin menyusi, sahifalash (pagination) va xabar tarqatishni tasdiqlash tugmalari.
"""

from __future__ import annotations

from telegram import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    KeyboardButton,
    ReplyKeyboardMarkup,
)


def get_admin_menu_keyboard() -> ReplyKeyboardMarkup:
    """Administrator asosiy boshqaruv menyusi."""
    buttons = [
        [
            KeyboardButton("📊 Statistika"),
            KeyboardButton("👥 Foydalanuvchilar"),
        ],
        [
            KeyboardButton("📢 Xabar tarqatish"),
        ],
    ]
    return ReplyKeyboardMarkup(buttons, resize_keyboard=True)


def get_user_view_button(telegram_id: int) -> InlineKeyboardMarkup:
    """Xabarnomalar ostidagi foydalanuvchi ma'lumotlarini ko'rish tugmasi."""
    buttons = [
        [
            InlineKeyboardButton(
                "👤 Foydalanuvchini ko'rish", callback_data=f"admin_view:{telegram_id}"
            )
        ]
    ]
    return InlineKeyboardMarkup(buttons)


def get_user_pagination_keyboard(
    current_offset: int,
    total_users: int,
    telegram_id: int,
) -> InlineKeyboardMarkup:
    """Foydalanuvchilar ro'yxatini sahifalash tugmalari."""
    nav_row = []

    if current_offset > 0:
        nav_row.append(
            InlineKeyboardButton("⬅️ Oldingi", callback_data=f"admin_page:{current_offset - 1}")
        )
    else:
        nav_row.append(
            InlineKeyboardButton("⏹️ Boshlanishi", callback_data="admin_noop")
        )

    if current_offset + 1 < total_users:
        nav_row.append(
            InlineKeyboardButton("Keyingi ➡️", callback_data=f"admin_page:{current_offset + 1}")
        )
    else:
        nav_row.append(
            InlineKeyboardButton("Oxiri ⏹️", callback_data="admin_noop")
        )

    buttons = [
        nav_row,
        [
            InlineKeyboardButton("🔄 Yangilash", callback_data=f"admin_view:{telegram_id}"),
            InlineKeyboardButton("🔙 Asosiy menyu", callback_data="admin_menu_back"),
        ],
    ]
    return InlineKeyboardMarkup(buttons)


def get_single_user_keyboard(telegram_id: int) -> InlineKeyboardMarkup:
    """Bitta foydalanuvchini ko'rish oynasi tugmalari."""
    buttons = [
        [
            InlineKeyboardButton("🔄 Ma'lumotni yangilash", callback_data=f"admin_view:{telegram_id}"),
            InlineKeyboardButton("👥 Barcha foydalanuvchilar", callback_data="admin_page:0"),
        ],
        [
            InlineKeyboardButton("🔙 Asosiy menyu", callback_data="admin_menu_back"),
        ],
    ]
    return InlineKeyboardMarkup(buttons)


def get_broadcast_confirm_keyboard() -> InlineKeyboardMarkup:
    """Xabar tarqatishni tasdiqlash yoki bekor qilish tugmalari."""
    buttons = [
        [
            InlineKeyboardButton("✅ Xabarni yuborish", callback_data="broadcast_confirm"),
            InlineKeyboardButton("❌ Bekor qilish", callback_data="broadcast_cancel"),
        ]
    ]
    return InlineKeyboardMarkup(buttons)


def get_broadcast_cancel_keyboard() -> InlineKeyboardMarkup:
    """Xabar kiritish paytidagi bekor qilish tugmasi."""
    buttons = [
        [
            InlineKeyboardButton("❌ Bekor qilish", callback_data="broadcast_cancel")
        ]
    ]
    return InlineKeyboardMarkup(buttons)
