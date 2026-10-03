"""
Foydalanuvchi tugmalari (Keyboards) - MaktabX bot.

Kanalga a'zo bo'lish, kontakt yuborish va xizmatga kirish tugmalari.
"""

from __future__ import annotations

from telegram import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    KeyboardButton,
    ReplyKeyboardMarkup,
    ReplyKeyboardRemove,
)


def get_channel_subscription_keyboard(channel_url: str) -> InlineKeyboardMarkup:
    """Kanalga a'zo bo'lish va tekshirish inline tugmalari."""
    buttons = [
        [InlineKeyboardButton("📢 Kanalga a'zo bo'lish", url=channel_url)],
        [InlineKeyboardButton("✅ A'zolikni tekshirish", callback_data="check_subscription")],
    ]
    return InlineKeyboardMarkup(buttons)


def get_phone_request_keyboard() -> ReplyKeyboardMarkup:
    """Foydalanuvchidan o'z telefon raqamini yuborishni so'rovchi klaviatura."""
    buttons = [
        [
            KeyboardButton("📱 Telefon raqamimni yuborish", request_contact=True),
        ]
    ]
    return ReplyKeyboardMarkup(
        buttons,
        resize_keyboard=True,
        one_time_keyboard=True,
    )


def get_maktabx_access_keyboard(maktabx_url: str) -> InlineKeyboardMarkup:
    """MaktabX veb-saytiga kirish tugmasi."""
    buttons = [
        [InlineKeyboardButton("🚀 MAKTABX GA KIRISH", url=maktabx_url)]
    ]
    return InlineKeyboardMarkup(buttons)


def remove_reply_keyboard() -> ReplyKeyboardRemove:
    """Kontakt qabul qilingandan so'ng klaviaturani tozalash."""
    return ReplyKeyboardRemove()
