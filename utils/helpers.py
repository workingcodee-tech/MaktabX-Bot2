"""
Yordamchi funksiyalar (Formatlash, vaqt zonalari va matnni tozalash).
"""

from __future__ import annotations

import datetime
import html
from typing import Any, Dict, Optional
import pytz


def escape_html(text: Optional[str]) -> str:
    """Telegram HTML formati uchun maxsus belgilarni xavfsiz qilish."""
    if not text:
        return ""
    return html.escape(str(text))


def format_datetime_tashkent(
    dt_val: Any,
    timezone_str: str = "Asia/Tashkent",
    fmt: str = "%d.%m.%Y %H:%M:%S",
) -> str:
    """
    Sana va vaqtni Asia/Tashkent vaqt mintaqasiga o'tkazib formatlash.
    Mavjud bo'lmasa 'Kiritilmagan' qaytaradi.
    """
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

    converted = dt_val.astimezone(target_tz)
    return converted.strftime(fmt)


def format_admin_start_notification(
    user: Dict[str, Any],
    is_new: bool,
    timezone_str: str = "Asia/Tashkent",
) -> str:
    """Foydalanuvchi /start bosganda adminga yuboriladigan real vaqtdagi bildirishnoma."""
    telegram_id = user.get("telegram_id")
    first_name = escape_html(user.get("first_name") or "Foydalanuvchi")
    last_name = user.get("last_name")
    username = user.get("username")
    phone = user.get("phone_number")
    channel_sub = user.get("channel_subscribed", False)
    access_granted = user.get("access_granted", False)

    start_date = format_datetime_tashkent(
        user.get("last_start_at"), timezone_str, fmt="%d.%m.%Y"
    )
    start_time = format_datetime_tashkent(
        user.get("last_start_at"), timezone_str, fmt="%H:%M:%S"
    )

    channel_status = "✅ A'zo bo'lgan" if channel_sub else "Tekshirilmadi"
    phone_status = phone if phone else "Berilmagan"
    access_status = "✅ Berilgan" if access_granted else "Berilmagan"

    header = "🔔 YANGI FOYDALANUVCHI" if is_new else "🔔 FOYDALANUVCHI BOTNI BOSHLADI"

    lines = [
        f"<b>{header}</b>\n",
        f"🆔 <b>ID:</b> <code>{telegram_id}</code>",
        f"👤 <b>Ismi:</b> {first_name}",
    ]

    if last_name:
        lines.append(f"👤 <b>Familiyasi:</b> {escape_html(last_name)}")

    if username:
        clean_user = username.lstrip("@")
        lines.append(f"🔗 <b>Username:</b> @{escape_html(clean_user)}")

    lines.extend(
        [
            f"📅 <b>Boshlangan sana:</b> {start_date}",
            f"🕐 <b>Boshlangan vaqt:</b> {start_time}",
            f"📢 <b>Kanal:</b> {channel_status}",
            f"📱 <b>Telefon:</b> {phone_status}",
            f"🔐 <b>Ruxsat:</b> {access_status}",
        ]
    )

    return "\n".join(lines)


def format_authorized_notification(
    user: Dict[str, Any],
    timezone_str: str = "Asia/Tashkent",
) -> str:
    """Foydalanuvchi tekshiruvdan to'liq o'tganda adminga yuboriladigan bildirishnoma."""
    telegram_id = user.get("telegram_id")
    first_name = escape_html(user.get("first_name") or "")
    last_name = escape_html(user.get("last_name") or "")
    full_name = f"{first_name} {last_name}".strip() or "Foydalanuvchi"
    username = user.get("username")
    phone = user.get("phone_number") or "Berilmagan"
    auth_time = format_datetime_tashkent(
        user.get("access_granted_at"), timezone_str, fmt="%d.%m.%Y %H:%M:%S"
    )

    lines = [
        "<b>✅ FOYDALANUVCHI TASDIQLANDI</b>\n",
        f"🆔 <b>ID:</b> <code>{telegram_id}</code>",
        f"👤 <b>Ismi:</b> {full_name}",
    ]

    if username:
        clean_user = username.lstrip("@")
        lines.append(f"🔗 <b>Username:</b> @{escape_html(clean_user)}")

    lines.extend(
        [
            f"📱 <b>Telefon:</b> {phone}",
            "📢 <b>Kanal:</b> ✅",
            "🔐 <b>Ruxsat:</b> ✅",
            f"🕐 <b>Tasdiqlangan vaqt:</b> {auth_time}",
        ]
    )

    return "\n".join(lines)


def format_user_card(
    user: Dict[str, Any],
    total_count: int,
    current_index: int,
    timezone_str: str = "Asia/Tashkent",
) -> str:
    """Admin uchun alohida foydalanuvchi kartochkasi."""
    telegram_id = user.get("telegram_id")
    first_name = escape_html(user.get("first_name") or "Kiritilmagan")
    last_name = user.get("last_name")
    username = user.get("username")
    phone = user.get("phone_number") or "Berilmagan"

    registered = format_datetime_tashkent(
        user.get("registered_at"), timezone_str
    )
    last_start = format_datetime_tashkent(
        user.get("last_start_at"), timezone_str
    )
    access_granted_at = format_datetime_tashkent(
        user.get("access_granted_at"), timezone_str
    )

    channel_icon = "✅" if user.get("channel_subscribed") else "❌"
    phone_icon = "✅" if user.get("phone_verified") else "❌"
    access_icon = "✅" if user.get("access_granted") else "❌"

    lines = [
        f"<b>👤 FOYDALANUVCHI ({current_index} / {total_count})</b>\n",
        f"🆔 <b>ID:</b> <code>{telegram_id}</code>",
        f"👤 <b>Ismi:</b> {first_name}",
    ]

    if last_name:
        lines.append(f"👤 <b>Familiyasi:</b> {escape_html(last_name)}")

    if username:
        clean_user = username.lstrip("@")
        lines.append(f"🔗 <b>Username:</b> @{escape_html(clean_user)}")

    lines.extend(
        [
            f"📱 <b>Telefon:</b> {phone}",
            f"📅 <b>Ro'yxatdan o'tgan:</b> {registered}",
            f"🕐 <b>Oxirgi kirgan:</b> {last_start}",
            f"📢 <b>Kanal:</b> {channel_icon}",
            f"📱 <b>Telefon:</b> {phone_icon}",
            f"🔐 <b>Ruxsat:</b> {access_icon}",
            f"🕐 <b>Ruxsat berilgan:</b> {access_granted_at}",
        ]
    )

    return "\n".join(lines)
