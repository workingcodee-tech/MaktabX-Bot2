import React, { useState } from 'react';
import JSZip from 'jszip';
import { PROJECT_FILES } from './projectFiles.ts';
import {
  Send,
  Download,
  Copy,
  Check,
  Terminal,
  Server,
  FileCode,
  ShieldCheck,
  Radio,
  Smartphone,
  ExternalLink,
  ChevronRight,
  RefreshCw,
  BellRing,
  FolderTree,
  Sliders,
  CheckCircle2,
} from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<'simulator' | 'code' | 'deploy' | 'env'>('simulator');
  const [selectedFile, setSelectedFile] = useState<string>('bot.py');
  const [copiedFile, setCopiedFile] = useState<boolean>(false);
  const [downloadingZip, setDownloadingZip] = useState<boolean>(false);

  // Bot Simulator State
  const [simulatorMode, setSimulatorMode] = useState<'user' | 'admin'>('user');
  const [userState, setUserState] = useState<{
    id: number;
    firstName: string;
    lastName: string;
    username: string;
    channelSubscribed: boolean;
    phoneVerified: boolean;
    accessGranted: boolean;
    phone: string;
  }>({
    id: 99881234,
    firstName: 'Ali',
    lastName: 'Karimov',
    username: 'ali_karimov',
    channelSubscribed: false,
    phoneVerified: false,
    accessGranted: false,
    phone: '',
  });

  const [chatMessages, setChatMessages] = useState<Array<{
    sender: 'bot' | 'user' | 'system';
    text: string;
    buttons?: Array<{ label: string; action: string; url?: string; primary?: boolean }>;
    timestamp: string;
  }>>([
    {
      sender: 'system',
      text: "🤖 MaktabX Bot simulyatori ishga tushirildi. Tekshiruv jarayonini sinash uchun /start tugmasini bosing.",
      timestamp: '12:00:00',
    }
  ]);

  // Admin Simulator state
  const [adminNotifications, setAdminNotifications] = useState<Array<{
    id: string;
    title: string;
    content: string;
    userId: number;
    time: string;
  }>>([]);

  const [adminCurrentOffset, setAdminCurrentOffset] = useState<number>(0);
  const [broadcastMessage, setBroadcastMessage] = useState<string>("📢 MaktabX platformasida yangi darsliklar va imtihon modullari ishga tushdi!");
  const [broadcastProgress, setBroadcastProgress] = useState<{ running: boolean; current: number; total: number } | null>(null);

  // Config builder state
  const [envVars, setEnvVars] = useState({
    token: '7192837465:AAFn4b9QjLz9p9_misol',
    adminId: '987654321',
    channel: '@maktabx_kanali',
    url: 'https://maktabx.uz',
    dbUrl: '${{Postgres.DATABASE_URL}}',
    timezone: 'Asia/Tashkent',
  });
  const [copiedEnv, setCopiedEnv] = useState<boolean>(false);

  // Helpers
  const addMessage = (msg: {
    sender: 'bot' | 'user' | 'system';
    text: string;
    buttons?: Array<{ label: string; action: string; url?: string; primary?: boolean }>;
  }) => {
    const time = new Date().toLocaleTimeString('uz-UZ', { hour12: false });
    setChatMessages((prev) => [...prev, { ...msg, timestamp: time }]);
  };

  const handleStart = () => {
    addMessage({ sender: 'user', text: '/start' });

    const isCurrentlySubscribed = userState.channelSubscribed;
    const wasPreviouslyVerified = userState.accessGranted || userState.phoneVerified;
    const effectiveAccess = isCurrentlySubscribed && userState.phoneVerified;

    // Send admin notification
    const time = new Date().toLocaleTimeString('uz-UZ', { hour12: false });
    setAdminNotifications((prev) => [
      {
        id: Math.random().toString(),
        title: wasPreviouslyVerified ? '🔄 QAYTA /START BOSILDI' : '🔔 YANGI FOYDALANUVCHI',
        content: `🆔 ID: ${userState.id}\n👤 Ismi: ${userState.firstName}\n👤 Familiyasi: ${userState.lastName}\n🔗 Username: @${userState.username}\n📅 Boshlangan sana: 03.10.2026\n🕐 Boshlangan vaqt: ${time}\n📢 Kanal: ${isCurrentlySubscribed ? "✅ A'zo bo'lgan" : "❌ A'zo emas (Chiqib ketgan)"}\n📱 Telefon: ${userState.phone || 'Berilmagan'}\n🔐 Ruxsat: ${effectiveAccess ? '✅ Berilgan' : '❌ Berilmagan'}`,
        userId: userState.id,
        time,
      },
      ...prev,
    ]);

    // 1. Har doim birinchi navbatda kanal a'zoligini jonli tekshiramiz!
    if (!isCurrentlySubscribed) {
      setUserState((prev) => ({ ...prev, accessGranted: false }));

      if (wasPreviouslyVerified) {
        addMessage({
          sender: 'bot',
          text: "⚠️ <b>DIQQAT: SIZ KANALNI TARK ETGANSIZ!</b>\n\nMaktabX xizmatidan foydalanish uchun rasmiy kanalni tark etmasligingiz so'raladi.\n\nSaytga kirish huquqini tiklash uchun iltimos kanalga <b>qayta obuna bo'ling</b> va <b>A'zolikni tekshirish</b> tugmasini bosing.",
          buttons: [
            { label: "📢 Kanalga a'zo bo'lish", action: 'sub_channel', url: `https://t.me/${envVars.channel.replace('@', '')}` },
            { label: "✅ A'zolikni tekshirish", action: 'check_sub', primary: true },
          ],
        });
      } else {
        addMessage({
          sender: 'bot',
          text: "📢 <b>KANALGA A'ZO BO'LISH TALAB ETILADI</b>\n\nMaktabX xizmatidan foydalanish uchun rasmiy kanalimizga a'zo bo'lishingiz kerak.\n\nA'zo bo'lgach, davom etish uchun <b>A'zolikni tekshirish</b> tugmasini bosing.",
          buttons: [
            { label: "📢 Kanalga a'zo bo'lish", action: 'sub_channel', url: `https://t.me/${envVars.channel.replace('@', '')}` },
            { label: "✅ A'zolikni tekshirish", action: 'check_sub', primary: true },
          ],
        });
      }
      return;
    }

    // 2. Kanalda a'zo bo'lsa va telefoni avval tasdiqlangan bo'lsa -> telefon qayta so'ralmaydi, darhol sayt beriladi!
    if (userState.phoneVerified) {
      setUserState((prev) => ({ ...prev, accessGranted: true }));
      addMessage({
        sender: 'bot',
        text: "✅ <b>Xush kelibsiz!</b>\n\nKanal a'zoligingiz va profilingiz tasdiqlangan.\nMaktabX tizimidan to'liq foydalanishingiz mumkin. Quyidagi tugma orqali kiring:",
        buttons: [{ label: '🚀 MAKTABX GA KIRISH', action: 'open_maktabx', url: envVars.url, primary: true }],
      });
      return;
    }

    // 3. Kanalda a'zo bo'lsa, lekin telefoni hali berilmagan bo'lsa -> faqat bir marta so'raladi
    addMessage({
      sender: 'bot',
      text: '📱 <b>TELEFON RAQAMNI TASDIQLASH</b>\n\nXavfsizlik maqsadida va zarurat tug\'ilganda siz bilan MaktabX bo\'yicha bog\'lanish uchun Telegram telefon raqamingizni yuboring.\n\nTelefon raqamingiz faqat ko\'rsatilgan MaktabX aloqa maqsadlarida ishlatiladi.',
      buttons: [{ label: '📱 Telefon raqamimni yuborish', action: 'share_phone', primary: true }],
    });
  };

  const handleAction = (action: string) => {
    if (action === 'check_sub') {
      if (!userState.channelSubscribed) {
        setUserState((prev) => ({ ...prev, accessGranted: false }));
        addMessage({
          sender: 'system',
          text: "⚠️ Simulyator: Foydalanuvchi hali kanalda emas! (Pastdagi 'Kanal holati' tugmasini bosib kanalga a'zo bo'ling)",
        });
        addMessage({
          sender: 'bot',
          text: "❌ Siz hali kanalga a'zo bo'lmadingiz.\n\nKanalni tark etmaslikni va qayta obuna bo'lishingizni so'raymiz.",
          buttons: [
            { label: "📢 Kanalga a'zo bo'lish", action: 'sub_channel', url: `https://t.me/${envVars.channel.replace('@', '')}` },
            { label: "✅ A'zolikni tekshirish", action: 'check_sub', primary: true },
          ],
        });
      } else {
        // Agar telefon avval tasdiqlangan bo'lsa, qayta so'ramasdan sayt linkini beramiz!
        if (userState.phoneVerified) {
          setUserState((prev) => ({ ...prev, accessGranted: true }));
          addMessage({
            sender: 'bot',
            text: "✅ <b>TASDIQLASH MUVAFFAQIYATLI YAKUNLANDI</b>\n\nKanal a'zoligingiz tasdiqlandi.\nMaktabX tizimiga kirish uchun quyidagi tugmani bosing:",
            buttons: [{ label: '🚀 MAKTABX GA KIRISH', action: 'open_maktabx', url: envVars.url, primary: true }],
          });
        } else {
          addMessage({ sender: 'bot', text: "✅ <b>Kanalga a'zolik tasdiqlandi.</b>" });
          addMessage({
            sender: 'bot',
            text: '📱 <b>TELEFON RAQAMNI TASDIQLASH</b>\n\nXavfsizlik maqsadida va zarurat tug\'ilganda siz bilan MaktabX bo\'yicha bog\'lanish uchun Telegram telefon raqamingizni yuboring.\n\nTelefon raqamingiz faqat ko\'rsatilgan MaktabX aloqa maqsadlarida ishlatiladi.',
            buttons: [{ label: '📱 Telefon raqamimni yuborish', action: 'share_phone', primary: true }],
          });
        }
      }
    } else if (action === 'share_phone') {
      const phone = '+998901234567';
      addMessage({ sender: 'user', text: `📞 [Kontakt yuborildi: ${phone}]` });

      if (!userState.channelSubscribed) {
        setUserState((prev) => ({ ...prev, phoneVerified: true, phone, accessGranted: false }));
        addMessage({
          sender: 'bot',
          text: "⚠️ <b>DIQQAT: SIZ KANALNI TARK ETGANSIZ!</b>\n\nTelefon raqamingiz saqlandi, ammo MaktabX xizmatidan foydalanish uchun rasmiy kanalni tark etmasligingiz va obuna bo'lishingiz shart.",
          buttons: [
            { label: "📢 Kanalga a'zo bo'lish", action: 'sub_channel', url: `https://t.me/${envVars.channel.replace('@', '')}` },
            { label: "✅ A'zolikni tekshirish", action: 'check_sub', primary: true },
          ],
        });
        return;
      }

      setUserState((prev) => ({ ...prev, phoneVerified: true, phone, accessGranted: true }));
      addMessage({ sender: 'bot', text: '✅ <b>Telefon raqamingiz muvaffaqiyatli tasdiqlandi!</b>' });
      addMessage({
        sender: 'bot',
        text: '✅ <b>TASDIQLASH MUVAFFAQIYATLI YAKUNLANDI</b>\n\nSiz barcha talablarni bajardingiz.\nMaktabX tizimiga kirish uchun quyidagi tugmani bosing.',
        buttons: [{ label: '🚀 MAKTABX GA KIRISH', action: 'open_maktabx', url: envVars.url, primary: true }],
      });

      // Admin notification for authorization
      const time = new Date().toLocaleTimeString('uz-UZ', { hour12: false });
      setAdminNotifications((prev) => [
        {
          id: Math.random().toString(),
          title: '✅ FOYDALANUVCHI TASDIQLANDI',
          content: `🆔 ID: ${userState.id}\n👤 Ismi: ${userState.firstName} ${userState.lastName}\n🔗 Username: @${userState.username}\n📱 Telefon: ${phone}\n📢 Kanal: ✅\n🔐 Ruxsat: ✅\n🕐 Tasdiqlangan vaqt: 03.10.2026 ${time}`,
          userId: userState.id,
          time,
        },
        ...prev,
      ]);
    } else if (action === 'admin_next') {
      setAdminCurrentOffset((prev) => prev + 1);
      handleAdminAction('users');
    } else if (action === 'admin_prev') {
      setAdminCurrentOffset((prev) => Math.max(0, prev - 1));
      handleAdminAction('users');
    } else if (action === 'admin_menu') {
      addMessage({
        sender: 'bot',
        text: '👑 <b>Admin menyusi</b>\n\nQuyidagi amallardan birini tanlang:',
      });
    }
  };

  const handleAdminAction = (type: 'stats' | 'users' | 'broadcast') => {
    if (type === 'stats') {
      addMessage({ sender: 'user', text: '📊 Statistika' });
      addMessage({
        sender: 'bot',
        text: `📊 <b>MAKTABX STATISTIKASI</b>\n\n👥 <b>Jami foydalanuvchilar:</b> 1,248\n📢 <b>Kanalga a'zo bo'lganlar:</b> 1,190\n📱 <b>Telefonini tasdiqlaganlar:</b> 1,120\n🔐 <b>Ruxsat berilganlar:</b> 1,120\n\n🆕 <b>Bugun qo'shilganlar:</b> 42\n🆕 <b>Shu haftada qo'shilganlar:</b> 289\n🆕 <b>Shu oyda qo'shilganlar:</b> 814`,
      });
    } else if (type === 'users') {
      addMessage({ sender: 'user', text: '👥 Foydalanuvchilar' });
      addMessage({
        sender: 'bot',
        text: `👤 <b>FOYDALANUVCHI (${adminCurrentOffset + 1} / 1248)</b>\n\n🆔 <b>ID:</b> <code>${userState.id}</code>\n👤 <b>Ismi:</b> ${userState.firstName}\n👤 <b>Familiyasi:</b> ${userState.lastName}\n🔗 <b>Username:</b> @${userState.username}\n📱 <b>Telefon:</b> ${userState.phone || '+998901234567'}\n📅 <b>Ro'yxatdan o'tgan:</b> 03.10.2026 09:15:22\n🕐 <b>Oxirgi kirgan:</b> 03.10.2026 12:44:10\n📢 <b>Kanal:</b> ✅\n📱 <b>Telefon:</b> ✅\n🔐 <b>Ruxsat:</b> ✅\n🕐 <b>Ruxsat berilgan:</b> 03.10.2026 09:16:04`,
        buttons: [
          { label: '⬅️ Oldingi', action: 'admin_prev' },
          { label: 'Keyingi ➡️', action: 'admin_next' },
          { label: '🔙 Asosiy menyu', action: 'admin_menu' },
        ],
      });
    }
  };

  const handleRunBroadcast = () => {
    setBroadcastProgress({ running: true, current: 0, total: 1248 });
    let sent = 0;
    const interval = setInterval(() => {
      sent += 140;
      if (sent >= 1248) {
        clearInterval(interval);
        setBroadcastProgress(null);
        addMessage({
          sender: 'bot',
          text: `✅ <b>XABAR TARQATISH YAKUNLANDI</b>\n\nJami: 1248\nMuvaffaqiyatli yuborildi: 1235\nYuborilmadi (bloklangan/faol emas): 13`,
        });
      } else {
        setBroadcastProgress({ running: true, current: sent, total: 1248 });
      }
    }, 200);
  };

  const copyCode = (content: string) => {
    navigator.clipboard.writeText(content);
    setCopiedFile(true);
    setTimeout(() => setCopiedFile(false), 2000);
  };

  const downloadProjectZip = async () => {
    setDownloadingZip(true);
    try {
      const zip = new JSZip();
      for (const [path, content] of Object.entries(PROJECT_FILES)) {
        zip.file(path, content);
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'maktabx-telegram-bot.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('ZIP yaratishda xatolik:', e);
    } finally {
      setDownloadingZip(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Yuqori Panel */}
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-30 px-4 lg:px-8 py-3.5">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-500 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <Radio className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-lg text-white tracking-tight">MaktabX Telegram Bot</h1>
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  100% O'zbek tilida • Railway & GitHub uchun tayyor
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Kanalga a'zolikni majburiy tekshirish, xavfsiz kontakt almashish va tezkor xabar tarqatish tizimi
              </p>
            </div>
          </div>

          {/* Tugmalar */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={downloadProjectZip}
              disabled={downloadingZip}
              className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-medium px-3.5 py-2 rounded-lg transition shadow-md shadow-blue-500/15 cursor-pointer disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              {downloadingZip ? 'ZIP yaratilmoqda...' : 'Bot loyihasini yuklab olish (ZIP)'}
            </button>
          </div>
        </div>
      </header>

      {/* Navigatsiya bo'limlari */}
      <div className="bg-slate-900/60 border-b border-slate-800 px-4 lg:px-8">
        <div className="max-w-7xl mx-auto flex items-center gap-2 overflow-x-auto py-2">
          <button
            onClick={() => setActiveTab('simulator')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
              activeTab === 'simulator'
                ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Smartphone className="w-4 h-4" />
            Interaktiv Bot Simulyatori
          </button>
          <button
            onClick={() => setActiveTab('code')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
              activeTab === 'code'
                ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <FileCode className="w-4 h-4" />
            Python Manba Kodlari ({Object.keys(PROJECT_FILES).length} ta fayl)
          </button>
          <button
            onClick={() => setActiveTab('deploy')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
              activeTab === 'deploy'
                ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Server className="w-4 h-4" />
            Railway va BotFather Qo'llanmasi
          </button>
          <button
            onClick={() => setActiveTab('env')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
              activeTab === 'env'
                ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Sliders className="w-4 h-4" />
            Sozlamalar Generatori (.env)
          </button>
        </div>
      </div>

      {/* Asosiy kontent maydoni */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 lg:p-8">
        {/* 1-BO'LIM: INTERAKTIV SIMULYATOR */}
        {activeTab === 'simulator' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Chap ustun: Telegram mobil qurilmasi */}
            <div className="lg:col-span-5 flex flex-col items-center">
              <div className="w-full max-w-[380px] bg-slate-900 border-4 border-slate-700/80 rounded-[36px] shadow-2xl overflow-hidden flex flex-col h-[680px]">
                {/* Holat paneli */}
                <div className="bg-slate-800 px-6 py-2 flex items-center justify-between text-[11px] text-slate-400 select-none">
                  <span>09:41</span>
                  <div className="w-16 h-3.5 bg-slate-900 rounded-full" />
                  <span>5G 100%</span>
                </div>

                {/* Bot sarlavhasi */}
                <div className="bg-slate-800/90 border-b border-slate-700/60 px-4 py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center font-bold text-xs text-white shadow">
                      MX
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-white flex items-center gap-1">
                        MaktabX Bot
                        <ShieldCheck className="w-3.5 h-3.5 text-blue-400 inline" />
                      </div>
                      <div className="text-[10px] text-slate-400">bot • faol</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setChatMessages([])}
                      title="Xabarlarni tozalash"
                      className="p-1 text-slate-400 hover:text-white rounded cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Rejim tanlash */}
                <div className="bg-slate-800/40 border-b border-slate-700/40 p-2 flex gap-1 text-xs">
                  <button
                    onClick={() => setSimulatorMode('user')}
                    className={`flex-1 py-1 rounded text-center transition font-medium cursor-pointer ${
                      simulatorMode === 'user'
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    👤 Foydalanuvchi ko'rinishi
                  </button>
                  <button
                    onClick={() => setSimulatorMode('admin')}
                    className={`flex-1 py-1 rounded text-center transition font-medium cursor-pointer ${
                      simulatorMode === 'admin'
                        ? 'bg-amber-600 text-white'
                        : 'text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    👑 Admin ko'rinishi
                  </button>
                </div>

                {/* Xabarlar oynasi */}
                <div className="flex-1 p-3.5 overflow-y-auto space-y-3 bg-slate-950/60 text-xs">
                  {chatMessages.map((msg, i) => (
                    <div
                      key={i}
                      className={`flex flex-col ${
                        msg.sender === 'user'
                          ? 'items-end'
                          : msg.sender === 'system'
                          ? 'items-center'
                          : 'items-start'
                      }`}
                    >
                      {msg.sender === 'system' ? (
                        <div className="bg-slate-800/80 text-slate-400 text-[10px] px-3 py-1 rounded-full max-w-[90%] text-center">
                          {msg.text}
                        </div>
                      ) : (
                        <div
                          className={`max-w-[85%] rounded-2xl p-3 shadow-md ${
                            msg.sender === 'user'
                              ? 'bg-blue-600 text-white rounded-br-none'
                              : 'bg-slate-800 text-slate-200 border border-slate-700/60 rounded-bl-none'
                          }`}
                        >
                          <div
                            className="whitespace-pre-wrap leading-relaxed"
                            dangerouslySetInnerHTML={{
                              __html: msg.text.replace(/\n/g, '<br/>'),
                            }}
                          />
                          <div
                            className={`text-[9px] mt-1 text-right ${
                              msg.sender === 'user' ? 'text-blue-200' : 'text-slate-400'
                            }`}
                          >
                            {msg.timestamp}
                          </div>
                        </div>
                      )}

                      {/* Xabar ostidagi tugmalar */}
                      {msg.buttons && (
                        <div className="w-[85%] mt-1.5 flex flex-col gap-1.5">
                          {msg.buttons.map((b, idx) => (
                            <button
                              key={idx}
                              onClick={() => {
                                if (b.url) {
                                  window.open(b.url, '_blank');
                                } else {
                                  handleAction(b.action);
                                }
                              }}
                              className={`w-full py-2 px-3 rounded-xl text-center font-medium transition flex items-center justify-center gap-1.5 text-xs shadow-sm cursor-pointer ${
                                b.primary
                                  ? 'bg-blue-600 hover:bg-blue-500 text-white'
                                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                              }`}
                            >
                              {b.label}
                              {b.url && <ExternalLink className="w-3 h-3 opacity-70" />}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Pastki boshqaruv maydoni */}
                <div className="bg-slate-900 border-t border-slate-800 p-2.5">
                  {simulatorMode === 'user' ? (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleStart}
                          className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer shadow"
                        >
                          <Send className="w-3.5 h-3.5" />
                          /start yuborish
                        </button>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
                        <span>Kanal holati:</span>
                        <button
                          onClick={() => {
                            setUserState((prev) => ({
                              ...prev,
                              channelSubscribed: !prev.channelSubscribed,
                            }));
                          }}
                          className={`px-2 py-0.5 rounded font-medium text-[10px] cursor-pointer ${
                            userState.channelSubscribed
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                              : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                          }`}
                        >
                          {userState.channelSubscribed ? "✅ A'zo bo'lgan" : "❌ A'zo emas"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-1.5 text-xs">
                      <button
                        onClick={() => handleAdminAction('stats')}
                        className="bg-slate-800 hover:bg-slate-700 text-slate-200 py-1.5 px-2 rounded-lg text-center font-medium border border-slate-700 cursor-pointer"
                      >
                        📊 Statistika
                      </button>
                      <button
                        onClick={() => handleAdminAction('users')}
                        className="bg-slate-800 hover:bg-slate-700 text-slate-200 py-1.5 px-2 rounded-lg text-center font-medium border border-slate-700 cursor-pointer"
                      >
                        👥 Foydalanuvchilar
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* O'ng ustun: Admin markazi va xabar tarqatish sinovi */}
            <div className="lg:col-span-7 space-y-6">
              {/* Admin xabarnomalari oqimi */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <BellRing className="w-5 h-5 text-amber-400" />
                    <h2 className="font-semibold text-sm text-white">
                      Admin Xabarnomalari (Real vaqt oqimi)
                    </h2>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">
                    ADMIN_ID: {envVars.adminId}
                  </span>
                </div>

                <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
                  {adminNotifications.length === 0 ? (
                    <div className="p-6 text-center text-slate-500 text-xs border border-dashed border-slate-800 rounded-xl">
                      Adminga keladigan real vaqtdagi bildirishnomalarni ko'rish uchun chapdagi simulyatorda <b className="text-slate-300">"/start yuborish"</b> tugmasini bosing yoki kontaktni yuboring.
                    </div>
                  ) : (
                    adminNotifications.map((notif) => (
                      <div
                        key={notif.id}
                        className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 text-xs space-y-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-amber-400">{notif.title}</span>
                          <span className="text-[10px] text-slate-500">{notif.time}</span>
                        </div>
                        <div className="text-slate-300 whitespace-pre-wrap font-mono text-[11px] leading-relaxed">
                          {notif.content}
                        </div>
                        <div className="pt-1">
                          <button
                            onClick={() => {
                              setSimulatorMode('admin');
                              handleAdminAction('users');
                            }}
                            className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-2.5 py-1 rounded text-[11px] font-medium transition cursor-pointer"
                          >
                            👤 Foydalanuvchini ko'rish
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Xabar tarqatish tizimi */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Radio className="w-5 h-5 text-blue-400" />
                    <h2 className="font-semibold text-sm text-white">
                      Xabar Tarqatish Tizimi (copy_message)
                    </h2>
                  </div>
                  <span className="text-xs text-emerald-400 font-mono">
                    Auditoriya: 1,248 ta foydalanuvchi
                  </span>
                </div>

                <p className="text-xs text-slate-400 leading-relaxed">
                  Bot Telegram’ning <code>copy_message</code> API texnologiyasidan foydalanadi. Bu orqali ixtiyoriy formatdagi xabar (matn, rasm, video, APK, ZIP, PDF, Word, PowerPoint) serverga qayta yuklanmasdan, barcha original format va izohlari (captions) bilan tarqatiladi.
                </p>

                <div className="space-y-2">
                  <label className="text-xs text-slate-300 font-medium">Yuboriladigan xabar matni:</label>
                  <textarea
                    rows={2}
                    value={broadcastMessage}
                    onChange={(e) => setBroadcastMessage(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                  />
                </div>

                {broadcastProgress && (
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-2">
                    <div className="flex justify-between text-xs text-slate-300">
                      <span>📤 XABAR YUBORILMOQDA...</span>
                      <span>{broadcastProgress.current} / {broadcastProgress.total}</span>
                    </div>
                    <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-blue-500 h-full transition-all duration-200"
                        style={{
                          width: `${(broadcastProgress.current / broadcastProgress.total) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={handleRunBroadcast}
                    disabled={broadcastProgress?.running}
                    className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white py-2 rounded-xl text-xs font-semibold transition cursor-pointer disabled:opacity-50"
                  >
                    {broadcastProgress?.running ? 'Yuborilmoqda...' : '📢 Xabar tarqatishni boshlash'}
                  </button>
                </div>
              </div>

              {/* Botning asosiy afzalliklari */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 space-y-1">
                  <div className="flex items-center gap-1.5 font-semibold text-emerald-400">
                    <CheckCircle2 className="w-4 h-4" />
                    Haqiqiy Kontakt Xavfsizligi
                  </div>
                  <p className="text-slate-400 text-[11px] leading-relaxed">
                    <code>contact.user_id == message.from.id</code> tekshiruvi orqali boshqa shaxsning kontaktini uzatish (soxtalashtirish) qat'iy cheklangan.
                  </p>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 space-y-1">
                  <div className="flex items-center gap-1.5 font-semibold text-blue-400">
                    <ShieldCheck className="w-4 h-4" />
                    PostgreSQL va SQLite Baza
                  </div>
                  <p className="text-slate-400 text-[11px] leading-relaxed">
                    Railway'da <code>asyncpg</code> orqali to'g'ridan-to'g'ri PostgreSQL ga, lokal rejimda esa SQLite ga avtomatik ulanadi.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 2-BO'LIM: KODLARNI KO'RISH */}
        {activeTab === 'code' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <span className="text-xs font-bold text-white flex items-center gap-2">
                  <FolderTree className="w-4 h-4 text-blue-400" />
                  Loyiha Fayllari
                </span>
                <span className="text-[11px] text-slate-400 font-mono">
                  {Object.keys(PROJECT_FILES).length} ta fayl
                </span>
              </div>

              <div className="space-y-1 max-h-[560px] overflow-y-auto pr-1">
                {Object.keys(PROJECT_FILES).map((fileName) => (
                  <button
                    key={fileName}
                    onClick={() => setSelectedFile(fileName)}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs flex items-center justify-between transition cursor-pointer ${
                      selectedFile === fileName
                        ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30 font-medium'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                    }`}
                  >
                    <span className="font-mono truncate">{fileName}</span>
                    <ChevronRight className="w-3.5 h-3.5 opacity-50 shrink-0 ml-2" />
                  </button>
                ))}
              </div>
            </div>

            <div className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden flex flex-col">
              <div className="bg-slate-800/80 px-4 py-3 border-b border-slate-700/60 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileCode className="w-4 h-4 text-blue-400" />
                  <span className="text-xs font-mono font-bold text-white">{selectedFile}</span>
                </div>
                <button
                  onClick={() => copyCode(PROJECT_FILES[selectedFile] || '')}
                  className="flex items-center gap-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 px-3 py-1 rounded-lg text-xs font-medium transition cursor-pointer"
                >
                  {copiedFile ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      Nusxalandi!
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      Kodni nusxalash
                    </>
                  )}
                </button>
              </div>

              <div className="p-4 bg-slate-950 font-mono text-xs overflow-x-auto max-h-[580px] leading-relaxed text-slate-300">
                <pre>{PROJECT_FILES[selectedFile] || '# Fayl bo\'sh'}</pre>
              </div>
            </div>
          </div>
        )}

        {/* 3-BO'LIM: RAILWAY VA BOTFATHER QO'LLANMASI */}
        {activeTab === 'deploy' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center font-bold text-sm">
                  1
                </div>
                <h3 className="font-semibold text-sm text-white">BotFather orqali bot ochish</h3>
                <ol className="text-xs text-slate-400 space-y-1.5 list-decimal pl-4">
                  <li>Telegram'da <b>@BotFather</b> ga kiring</li>
                  <li><code>/newbot</code> buyrug'ini yuboring</li>
                  <li>Bot nomini kiriting (masalan, <code>MaktabX Bot</code>)</li>
                  <li><code>bot</code> bilan tugovchi username bering</li>
                  <li>Olingan tokenni <code>TELEGRAM_BOT_TOKEN</code> ga qo'ying</li>
                </ol>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-bold text-sm">
                  2
                </div>
                <h3 className="font-semibold text-sm text-white">Kanal va Admin ID sozlash</h3>
                <ol className="text-xs text-slate-400 space-y-1.5 list-decimal pl-4">
                  <li><b>@userinfobot</b> orqali o'z ID raqamingizni oling</li>
                  <li>Telegram kanalingizni oching</li>
                  <li>Botni kanalingizga <b>Administrator</b> qilib qo'shing</li>
                  <li>Kanal username'ini <code>CHANNEL_USERNAME</code> ga kiriting</li>
                </ol>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
                <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center font-bold text-sm">
                  3
                </div>
                <h3 className="font-semibold text-sm text-white">Railway'ga joylash</h3>
                <ol className="text-xs text-slate-400 space-y-1.5 list-decimal pl-4">
                  <li>Loyihani GitHub'ga yuklang</li>
                  <li><b>railway.com</b> da yangi loyiha oching</li>
                  <li>PostgreSQL ma'lumotlar bazasini qo'shing</li>
                  <li>O'zgaruvchilarni (Variables) kiriting</li>
                  <li>Railway botni 24/7 rejimida avtomatik ishga tushiradi!</li>
                </ol>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
              <h3 className="font-semibold text-sm text-white flex items-center gap-2">
                <Terminal className="w-4 h-4 text-emerald-400" />
                Loyiha tarkibidagi ishlab chiqarish fayllari
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                  <div className="font-mono font-bold text-slate-200">railway.toml</div>
                  <pre className="text-slate-400 font-mono text-[11px]">{`[build]
builder = "RAILPACK"

[deploy]
startCommand = "python bot.py"
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 10`}</pre>
                </div>

                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                  <div className="font-mono font-bold text-slate-200">Procfile</div>
                  <pre className="text-slate-400 font-mono text-[11px]">{`worker: python bot.py`}</pre>
                  <p className="text-slate-500 text-[11px]">
                    Railway'ga botni doimiy ravishda (worker) fonda to'xtovsiz ishlatishni ko'rsatadi.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 4-BO'LIM: SOZLAMALAR GENERATORI */}
        {activeTab === 'env' && (
          <div className="max-w-3xl mx-auto space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5 shadow-lg">
              <div>
                <h2 className="font-bold text-base text-white">Atrof-muhit o'zgaruvchilari sozlamasi (.env)</h2>
                <p className="text-xs text-slate-400 mt-1">
                  O'z parametrlaringizni kiriting va tayyor konfiguratsiyani Railway yoki lokal <code>.env</code> faylingizga nusxalang.
                </p>
              </div>

              <div className="space-y-4 text-xs">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">
                    TELEGRAM_BOT_TOKEN <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={envVars.token}
                    onChange={(e) => setEnvVars({ ...envVars, token: e.target.value })}
                    placeholder="1234567890:ABCdefGHIjklMNOpqrSTUvwxyz"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-200 font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-slate-300 font-medium mb-1">
                      ADMIN_ID <span className="text-rose-400">*</span> (Admin Telegram raqamli ID si)
                    </label>
                    <input
                      type="text"
                      value={envVars.adminId}
                      onChange={(e) => setEnvVars({ ...envVars, adminId: e.target.value })}
                      placeholder="123456789"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-200 font-mono focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 font-medium mb-1">
                      CHANNEL_USERNAME <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={envVars.channel}
                      onChange={(e) => setEnvVars({ ...envVars, channel: e.target.value })}
                      placeholder="@maktabx_kanali"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-200 font-mono focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-slate-300 font-medium mb-1">
                      MAKTABX_URL <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={envVars.url}
                      onChange={(e) => setEnvVars({ ...envVars, url: e.target.value })}
                      placeholder="https://maktabx.uz"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-200 font-mono focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 font-medium mb-1">
                      TIMEZONE
                    </label>
                    <input
                      type="text"
                      value={envVars.timezone}
                      onChange={(e) => setEnvVars({ ...envVars, timezone: e.target.value })}
                      placeholder="Asia/Tashkent"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-200 font-mono focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">
                    DATABASE_URL (Railway PostgreSQL yoki SQLite)
                  </label>
                  <input
                    type="text"
                    value={envVars.dbUrl}
                    onChange={(e) => setEnvVars({ ...envVars, dbUrl: e.target.value })}
                    placeholder="${{Postgres.DATABASE_URL}} yoki sqlite:///maktabx.db"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-200 font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="pt-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-slate-300">Generatsiya qilingan sozlamalar:</span>
                  <button
                    onClick={() => {
                      const text = `TELEGRAM_BOT_TOKEN=${envVars.token}\nADMIN_ID=${envVars.adminId}\nCHANNEL_USERNAME=${envVars.channel}\nMAKTABX_URL=${envVars.url}\nDATABASE_URL=${envVars.dbUrl}\nBOT_NAME=MaktabX Bot\nTIMEZONE=${envVars.timezone}`;
                      navigator.clipboard.writeText(text);
                      setCopiedEnv(true);
                      setTimeout(() => setCopiedEnv(false), 2000);
                    }}
                    className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 font-medium cursor-pointer"
                  >
                    {copiedEnv ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedEnv ? 'Nusxalandi!' : 'Sozlamalarni nusxalash'}
                  </button>
                </div>
                <pre className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs font-mono text-emerald-400 overflow-x-auto">
{`TELEGRAM_BOT_TOKEN=${envVars.token}
ADMIN_ID=${envVars.adminId}
CHANNEL_USERNAME=${envVars.channel}
MAKTABX_URL=${envVars.url}
DATABASE_URL=${envVars.dbUrl}
BOT_NAME=MaktabX Bot
TIMEZONE=${envVars.timezone}`}
                </pre>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 bg-slate-900/60 px-4 py-3 text-center text-xs text-slate-500">
        MaktabX Bot • 100% O'zbek tilida ishlab chiqilgan Telegram Bot • Railway va GitHub uchun to'liq tayyor
      </footer>
    </div>
  );
}
