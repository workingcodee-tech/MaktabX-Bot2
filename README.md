# MaktabX Telegram Bot 🚀

**MaktabX** xizmati uchun 100% o'zbek tilida ishlab chiqilgan, ishlab chiqarishga (production) to'liq tayyor Telegram bot shlyuzi.

MaktabX boti foydalanuvchilarning rasmiy Telegram kanalingizga a'zo bo'lganligini va o'zlarining haqiqiy Telegram telefon raqamini yuborganliklarini tekshirgandan so'ng, ularga MaktabX platformasiga bir marta bosish orqali xavfsiz kirish imkoniyatini taqdim etadi. Bot real vaqtdagi admin bildirishnomalari, sahifalangan foydalanuvchilar boshqaruvi, Toshkent vaqti bo'yicha hisoblanadigan statistika va barcha turdagi fayllarni (APK, ZIP, PDF, Word, PowerPoint, rasm, video) xavfsiz tezlikda tarqatish tizimini o'z ichiga oladi.

---

## 📋 Mundarija

1. [Imkoniyatlar va Funksiyalar](#-imkoniyatlar-va-funksiyalar)
2. [Loyiha Tuzilishi (Arxitektura)](#-loyiha-tuzilishi-arxitektura)
3. [Muhit O'zgaruvchilari (Environment Variables)](#-muhit-ozgaruvchilari-environment-variables)
4. [Bosqichma-bosqich O'rnatish Qo'llanmasi](#-bosqichma-bosqich-ornatish-qollanmasi)
   - [1-qadam: BotFather orqali bot ochish](#1-qadam-botfather-orqali-bot-ochish)
   - [2-qadam: Administrator ID sini aniqlash](#2-qadam-administrator-id-sini-aniqlash)
   - [3-qadam: Telegram kanalini tayyorlash](#3-qadam-telegram-kanalini-tayyorlash)
   - [4-qadam: Mahalliy (Lokal) ishga tushirish](#4-qadam-mahalliy-lokal-ishga-tushirish)
5. [GitHub'ga yuklash](#-githubga-yuklash)
6. [Railway'ga joylash (Production 24/7)](#-railwayga-joylash-production-247)
7. [Admin Panel va Xabar Tarqatish](#-admin-panel-va-xabar-tarqatish)
8. [Xatoliklarni Bartaraf Etish (Troubleshooting)](#-xatoliklarni-bartaraf-etish-troubleshooting)

---

## ✨ Imkoniyatlar va Funksiyalar

- **100% O'zbek Tili:** Barcha xabarlar, bildirishnomalar, klaviaturalar va xatolik matnlari toza va tushunarli o'zbek tilida.
- **Majburiy Kanal A'zoligi:** Telegram Bot API (`member`, `administrator`, `creator`) orqali foydalanuvchi kanalda bor yoki yo'qligini tekshiradi.
- **Soxtalashtirib Bo'lmaydigan Telefon Tasdiqlash:** Telegram'ning maxsus `KeyboardButton(request_contact=True)` tugmasidan foydalaniladi va `contact.user_id == update.user.id` tekshiriladi. Birovning kontaktini uzatish taqiqlanadi.
- **Xizmatga Kirish:** Tekshiruv yakunlangach, foydalanuvchiga MaktabX xizmatiga eltuvchi `[🚀 MAKTABX GA KIRISH]` tugmasi ochiladi.
- **Real Vaqtdagi Admin Bildirishnomalari:** Har safar yangi foydalanuvchi botni boshlaganda yoki tekshiruvni yakunlaganda adminga bir zumda xabar keladi.
- **Foydalanuvchi Kartochkasini Ko'rish:** Admin bildirishnomasidagi `[👤 Foydalanuvchini ko'rish]` tugmasi orqali istalgan vaqtda foydalanuvchining bazadagi yangi holatini ko'rish mumkin.
- **Sahifalangan Foydalanuvchilar Ro'yxati:** `[⬅️ Oldingi]` va `[Keyingi ➡️]` tugmalari orqali minglab foydalanuvchilarni xotirani to'ldirmasdan SQL `LIMIT`/`OFFSET` yordamida varaqlash.
- **Toshkent Vaqti Bo'yicha Statistika:** `Asia/Tashkent` vaqt mintaqasida bugun, shu haftada, shu oyda qo'shilganlar, kanalni va telefonni tasdiqlaganlar sonini hisoblash.
- **Keng Qamrovli Xabar Tarqatish:** Telegram'ning `copy_message` metodi orqali fayllarni qayta yuklamasdan barcha turdagi fayllarni (APK, ZIP, PDF, Word, PowerPoint, rasm, video) tarqatadi.
- **Xavfsiz Tezlik Nazorati (Rate Limiting):** Telegram'ning daqiqasiga yoki soniyasiga qo'ygan cheklovlariga (flood limit) tushmaslik uchun xabarlar xavfsiz navbat bilan yuboriladi.

---

## 🗂️ Loyiha Tuzilishi (Arxitektura)

```text
maktabx-bot/
├── bot.py                  # Asosiy ishga tushirish fayli va long-polling
├── config.py               # Sozlamalarni tekshirish va maxfiy kalitlarni himoyalash
├── database.py             # Asinxron PostgreSQL (asyncpg) va SQLite (aiosqlite)
├── requirements.txt        # Kerakli Python kutubxonalari
├── Procfile                # Railway uchun fon ishchisi (worker) sozlamasi
├── railway.toml            # Railway Nixpacks deployment konfiguratsiyasi
├── .env.example            # Sozlamalar namunasi
├── .gitignore              # Git uchun e'tiborga olinmaydigan fayllar
├── README.md               # To'liq hujjat
│
├── handlers/
│   ├── user.py             # /start, kanal tekshiruvi, telefon tasdiqlash
│   ├── admin.py            # Admin paneli, statistika, foydalanuvchilarni ko'rish
│   └── broadcast.py        # Xabar yuborish, ko'rib chiqish va tasdiqlash
│
├── keyboards/
│   ├── user.py             # Kanalga a'zolik, kontakt va kirish tugmalari
│   └── admin.py            # Admin boshqaruv, sahifalash va tasdiqlash tugmalari
│
└── utils/
    ├── helpers.py          # Toshkent vaqti formati va HTML xavfsizligi
    └── broadcast.py        # Xavfsiz tezlikdagi copy_message xabar yuboruvchisi
```

---

## ⚙️ Muhit O'zgaruvchilari (Environment Variables)

Barcha sozlamalar va maxfiy kalitlar faqat muhit o'zgaruvchilari orqali o'qiladi. **Koddagi hech qanday maxfiy ma'lumot qattiq yozilmaydi (hardcode qilinmaydi).**

| O'zgaruvchi | Majburiyligi | Tavsif | Misol |
| :--- | :---: | :--- | :--- |
| `TELEGRAM_BOT_TOKEN` | **Ha** | [@BotFather](https://t.me/BotFather) dan olingan bot tokeni | `7123456789:AAFn...` |
| `ADMIN_ID` | **Ha** | Administratorning raqamli Telegram ID si | `123456789` |
| `CHANNEL_USERNAME` | **Ha** | Obuna talab qilinadigan kanal username yoki ID si | `@maktabx_kanali` |
| `MAKTABX_URL` | **Ha** | MaktabX veb-ilovasining rasmiy manzili | `https://maktabx.uz` |
| `DATABASE_URL` | Ixtiyoriy | PostgreSQL yoki SQLite ma'lumotlar bazasi manzili | `postgresql://...` yoki `sqlite:///maktabx.db` |
| `BOT_NAME` | Ixtiyoriy | Botning tizimdagi nomi | `MaktabX Bot` |
| `TIMEZONE` | Ixtiyoriy | Sana va vaqt ko'rsatiladigan vaqt mintaqasi | `Asia/Tashkent` |

---

## 🚀 Bosqichma-bosqich O'rnatish Qo'llanmasi

### 1-qadam: BotFather orqali bot ochish

1. Telegram'da **[@BotFather](https://t.me/BotFather)** botini oching.
2. `/newbot` buyrug'ini yuboring.
3. Bot uchun nom tanlang (masalan, `MaktabX Bot`).
4. `bot` bilan tugovchi yagona username bering (masalan, `maktabx_rasmiy_bot`).
5. BotFather bergan **HTTP API tokenni** nusxalab oling. Bu sizning `TELEGRAM_BOT_TOKEN`ingiz bo'ladi.

### 2-qadam: Administrator ID sini aniqlash

1. Telegram'da **[@userinfobot](https://t.me/userinfobot)** yoki **[@raw_data_bot](https://t.me/raw_data_bot)** ga kiring.
2. `/start` buyrug'ini yuboring.
3. `Id` qarshisidagi sonni oling (masalan, `987654321`). Bu sizning `ADMIN_ID`ingiz bo'ladi.

### 3-qadam: Telegram kanalini tayyorlash

1. Telegram kanalingizni oching (masalan, `@maktabx_kanali`).
2. Kanal sozlamalariga kirib **Administrators (Adminlar)** bo'limiga o'ting.
3. **Add Administrator (Admin qo'shish)** tugmasini bosib, yangi ochgan botingizni qidiring va kanalga admin qilib qo'shing.
4. Botga kamida taklif havolalarini boshqarish yoki xabarlarni ko'rish huquqini bering.
   > **Muhim:** Bot kanal a'zoligini tekshirishi (`getChatMember`) uchun u kanalda Administrator bo'lishi shart!

### 4-qadam: Mahalliy (Lokal) ishga tushirish

1. Loyihani yuklab oling:
   ```bash
   git clone https://github.com/<sizning-username>/maktabx-bot.git
   cd maktabx-bot
   ```

2. Virtual muhit (venv) yarating:
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate  # Windows uchun: .venv\Scripts\activate
   ```

3. Kutubxonalarni o'rnating:
   ```bash
   pip install -r requirements.txt
   ```

4. `.env` faylini yarating:
   ```bash
   cp .env.example .env
   ```
   Faylni ochib o'z ma'lumotlaringizni kiriting:
   ```ini
   TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrSTUvwxyz
   ADMIN_ID=123456789
   CHANNEL_USERNAME=@maktabx_kanali
   MAKTABX_URL=https://maktabx.uz
   DATABASE_URL=sqlite:///maktabx.db
   TIMEZONE=Asia/Tashkent
   ```

5. Botni ishga tushiring:
   ```bash
   python bot.py
   ```
   Konsolda quyidagi xabarni ko'rasiz:
   ```text
   [INFO] - Ma'lumotlar bazasiga ulanish tekshirilmoqda...
   [INFO] - SQLite schema initialized successfully.
   [INFO] - MaktabX Bot muvaffaqiyatli ishga tushdi.
   [INFO] - Telegram long polling ishga tushirilmoqda...
   ```

---

## 📦 GitHub'ga yuklash

1. `.env` fayli Git'ga tushmasligiga ishonch hosil qiling (`.gitignore` faylida ko'rsatilgan):
   ```bash
   git status
   ```
2. Loyihani kommit qiling:
   ```bash
   git init
   git add .
   git commit -m "MaktabX 100% o'zbek tilidagi Telegram bot"
   ```
3. GitHub'da yangi ombor (repository) oching.
4. Kodni GitHub'ga yuklang:
   ```bash
   git remote add origin https://github.com/<sizning-username>/maktabx-bot.git
   git branch -M main
   git push -u origin main
   ```

---

## ☁️ Railway'ga joylash (Production 24/7)

Railway botni doimiy ravishda 24/7 fonga o'rnatish va PostgreSQL bazasini boshqarish uchun eng qulay platformadir.

### 1. Railway'da loyiha yaratish

1. **[railway.com](https://railway.com/)** saytiga kiring.
2. **New Project** > **Deploy from GitHub repo** tugmasini bosing.
3. O'zingizning `maktabx-bot` omboringizni tanlang.

### 2. PostgreSQL ma'lumotlar bazasini qo'shish

1. Railway loyiha oynasida **New** (yoki `+`) tugmasini bosing.
2. **Database** > **Add PostgreSQL** ni tanlang.
3. Railway bir necha soniyada PostgreSQL bazasini sozlaydi.

### 3. O'zgaruvchilarni kiritish

Bot xizmatingizni (Service) tanlang va **Variables** bo'limiga o'tib, quyidagi qiymatlarni kiriting:

- `TELEGRAM_BOT_TOKEN`: `botfather_dan_olingan_token`
- `ADMIN_ID`: `sizning_telegram_id_raqamingiz`
- `CHANNEL_USERNAME`: `@kanalingiz_username`
- `MAKTABX_URL`: `https://maktabx.uz`
- `DATABASE_URL`: `${{Postgres.DATABASE_URL}}` *(Railway avtomatik tarzda PostgreSQL bazasini ulaydi)*
- `TIMEZONE`: `Asia/Tashkent`
- `BOT_NAME`: `MaktabX Bot`

### 4. Ishga tushirishni tekshirish

1. Railway `railway.toml` va `Procfile` fayllarini avtomatik aniqlaydi.
2. **View Logs** bo'limini oching. Quyidagi loglarni ko'rasiz:
   ```text
   [INFO] - Ma'lumotlar bazasiga ulanish tekshirilmoqda...
   [INFO] - PostgreSQL schema initialized successfully.
   [INFO] - MaktabX Bot muvaffaqiyatli ishga tushdi.
   [INFO] - Telegram long polling ishga tushirilmoqda...
   ```
3. Bot ishga tushgan zahoti sizning Telegram hisobingizga adminga salom xabari keladi:
   ```text
   🟢 MaktabX Bot ishga tushdi va faol holatda!
   ```

---

## 🛠️ Admin Panel va Xabar Tarqatish

### Admin Buyruqlari

Telegram orqali `ADMIN_ID` ga mos hisobdan `/start` yoki `/admin` yuboring:
- **📊 Statistika:** Jami foydalanuvchilar, kanal tasdiqlanganlar, telefon tasdiqlanganlar va bugun, bu hafta, bu oy qo'shilganlar hisoboti.
- **👥 Foydalanuvchilar:** Foydalanuvchilarni bittalab sahifalash orqali ko'rish (`[⬅️ Oldingi]`, `[Keyingi ➡️]`).
- **📢 Xabar tarqatish:** Foydalanuvchilarga xabar yoki fayl yuborish.

### Fayl va Media Tarqatish Bosqichlari

1. Admin menyusida **📢 Xabar tarqatish** tugmasini bosing.
2. Foydalanuvchilarga yubormoqchi bo'lgan xabaringizni yuboring:
   - Matn (linklar va emojilar bilan)
   - Bitta rasm yoki video
   - APK fayl (Android ilova)
   - ZIP yoki RAR arxivi
   - PDF hujjat
   - Word (`.docx`) yoki PowerPoint (`.pptx`)
   - Ovozli xabar yoki audio
3. Bot darhol **XABARNI KO'RIB CHIQISH** oynasini va umumiy qabul qiluvchilar sonini ko'rsatadi.
4. **[✅ Xabarni yuborish]** tugmasini bosing.
5. Bot real vaqtda jarayonni yangilab boradi:
   ```text
   📤 XABAR YUBORILMOQDA...
   Jami: 1250
   Yuborildi: 800
   Yuborilmadi: 10
   Qoldi: 440
   ```
6. Jarayon yakunlangach:
   ```text
   ✅ XABAR TARQATISH YAKUNLANDI
   Jami: 1250
   Muvaffaqiyatli yuborildi: 1235
   Yuborilmadi (bloklangan/faol emas): 15
   ```

---

## 🔍 Xatoliklarni Bartaraf Etish (Troubleshooting)

| Muammo | Sababi | Yechimi |
| :--- | :--- | :--- |
| `Konfiguratsiya xatosi` bilan bot to'xtab qolmoqda | Majburiy o'zgaruvchi yo'q | `.env` yoki Railway Variables'da `TELEGRAM_BOT_TOKEN`, `ADMIN_ID` to'g'ri kiritilganini tekshiring. |
| "Kanal a'zoligini tekshirib bo'lmadi" xatosi | Bot kanalda admin emas | Telegram kanalingiz sozlamalariga kirib, botni Administrator qilib qo'shing. |
| "Noto'g'ri kontakt" xatosi | Boshqa birovning kontakto' yuborilgan | Foydalanuvchi `[📱 Telefon raqamimni yuborish]` tugmasini bosib, o'z raqamini yuborishi shart. |
| Railway'da PostgreSQL ulanmadi | `DATABASE_URL` formati | Railway'da `DATABASE_URL` qiymatini `${{Postgres.DATABASE_URL}}` deb qo'ying. |
