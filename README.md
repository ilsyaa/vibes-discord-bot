# Vibes Discord - Modular Personal Bot (ESM)

Bot Discord serbaguna (*multi-purpose*) untuk kebutuhan server pribadi Anda. Dirancang dengan **arsitektur modular berbasis fitur terisolasi**, menggunakan **ECMAScript Modules (ESM)** modern, serta mendukung **Slash Commands (/)** standar Discord dan **Prefix Commands (!)** secara bersamaan.

---

## 🏗️ Konsep Arsitektur Terisolasi (`features/`)

Setiap fitur berada di dalam foldernya masing-masing di bawah direktori `features/`. Jika Anda ingin:
- **Menambah fitur baru** (misal: AI chat, giveaway, level, reminder): Cukup buat folder baru di `features/<nama_fitur>/` dengan file `index.js`. Loader akan otomatis memuatnya tanpa mengganggu fitur lain.
- **Menghapus / Menonaktifkan fitur**: Cukup hapus atau ubah nama foldernya. Fitur lain tidak akan terdampak.

Struktur folder:

```text
vibes-discord/
├── index.js                  # Entry point utama bot
├── core/                     # Fondasi inti bot (tidak perlu sering diubah)
│   ├── client.js             # Setup Discord Client, event bus & dispatcher
│   ├── loader.js             # Auto-discovery loader untuk seluruh fitur
│   ├── deploy.js             # Deployer Slash Commands otomatis ke Discord API
│   └── config.js             # Konfigurasi environment (.env)
├── features/                 # FITUR TERISOLASI (Modular Feature Bags)
│   ├── general/              # Modul fitur umum (ping, help, dll.)
│   │   ├── index.js          # Export manifest fitur General
│   │   └── commands.js       # Command definition & logic
│   └── music/                # Modul fitur musik YouTube Stream Mode
│       ├── index.js          # Export manifest fitur Music
│       ├── player.js         # Setup DisTube engine & YouTube streaming
│       ├── ui.js             # Komponen Embed & Tombol Pemutar Interaktif
│       ├── interactions.js   # Event handler tombol musik
│       └── commands.js       # Commands (/play, /skip, /prev, /queue, dll.)
├── .env.example
├── cookies.example.json
├── package.json
└── README.md
```

---

## 🎵 Fitur Musik (YouTube Stream Mode)

- **On-the-fly Transcoding (FFmpeg)**: Audio langsung dialirkan sebagai chunk data ke Discord tanpa perlu mendownload file `.mp4`/`.mp3` ke disk penyimpanan.
- **Format YouTube Fleksibel**:
  - Link Video: `https://www.youtube.com/watch?v=...`
  - Link Playlist: `https://www.youtube.com/playlist?list=...`
  - Pencarian Judul Teks: `/play query:lofi beats` atau `!play lofi beats`
- **Antrean Playlist Dinamis**: Memutar lagu sambil menambah antrean berikutnya secara otomatis.
- **Navigasi Lengkap**:
  - `skip` / `next`: Lanjut ke lagu berikutnya.
  - `prev` / `previous`: Putar balik ke lagu sebelumnya dari riwayat.
  - `queue` / `playlist`: Tinjau urutan daftar putar.
  - `pause` & `resume`: Jeda dan lanjutkan pemutaran.
  - `stop`: Hentikan musik, bersihkan playlist, dan keluar dari voice channel.
  - `shuffle`: Mengacak urutan antrean.
  - `loop`: Mode repeat (Off, Song, Queue).
  - `volume`: Atur volume (1% - 100%).
- **Interactive UI Buttons**: Pesan status musik dilengkapi tombol kontrol langsung (⏮️ Prev, ⏯️ Pause/Resume, ⏭️ Skip, 🔀 Shuffle, ⏹️ Stop, 🔁 Loop, 📜 Antrean).

## 👤 Profile Musik

`/profile` atau `!profile` menghasilkan kartu PNG personal seperti profile card bot musik populer:

- avatar dan nama Discord;
- total plays, command, dan server aktif;
- top servers berdasarkan aktivitas musik;
- top friends berdasarkan listener yang sering berbagi server musik;
- top tracks berdasarkan jumlah play.

Data disimpan sebagai aggregate activity. URL media tidak disimpan; track identifier di-hash sebelum masuk database.


---

## ⌨️ Daftar Perintah

| Slash Command | Prefix Command | Deskripsi |
| :--- | :--- | :--- |
| `/play <query>` | `!play <query>` atau `!p <query>` | Putar link video, playlist, atau kata kunci judul YouTube |
| `/skip` | `!skip`, `!next`, `!s` | Lewati lagu yang sedang diputar |
| `/prev` | `!prev`, `!previous` | Putar kembali lagu sebelumnya |
| `/queue` | `!queue`, `!q`, `!playlist` | Lihat daftar antrean musik |
| `/pause` | `!pause` | Jeda pemutaran lagu |
| `/resume` | `!resume`, `!unpause` | Lanjutkan pemutaran lagu |
| `/stop` | `!stop`, `!leave` | Hentikan pemutaran dan kosongkan antrean |
| `/loop [mode]` | `!loop` | Atur perulangan (Lagu / Playlist / Off) |
| `/shuffle` | `!shuffle`, `!mix` | Acak urutan playlist |
| `/volume <1-100>` | `!volume <1-100>`, `!vol` | Atur intensitas suara |
| `/nowplaying` | `!nowplaying`, `!np` | Lihat detail lagu yang sedang berjalan |
| `/diagnose` | `!diagnose`, `!diag` | Cek voice channel, permission, queue, dan koneksi bot |
| `/stats` | `!stats`, `!status` | Lihat statistik operasional runtime bot |
| `/profile` | `!profile`, `!me` | Tampilkan kartu profil musik personal |
| `/ping` | `!ping` | Cek latensi bot dan koneksi Discord Gateway |
| `/help` | `!help`, `!h` | Tampilkan menu bantuan |

---

## 🚀 Panduan Menjalankan

### 1. Konfigurasi Token di `.env`
Salin template `.env.example` ke `.env`:
```bash
cp .env.example .env
```
Isi file `.env` dengan kredensial aplikasi Discord Anda:
```env
DISCORD_TOKEN=token_bot_anda_disini
CLIENT_ID=client_id_anda_disini
PREFIX=!
DEFAULT_VOLUME=50
DATABASE_PATH=data/vibes.sqlite

# Optional dashboard
DASHBOARD_ENABLED=false
DASHBOARD_HOST=127.0.0.1
DASHBOARD_PORT=8787
DASHBOARD_PUBLIC_URL=https://dashboard.example.com
DASHBOARD_CLIENT_ID=
DASHBOARD_CLIENT_SECRET=
DASHBOARD_SESSION_SECRET=replace-with-a-long-random-secret
```

> **Penting**: Di **Discord Developer Portal -> Bot -> Privileged Gateway Intents**, pastikan opsi **Message Content Intent** sudah diaktifkan agar prefix command `!` dapat dibaca.

### 2. Deploy Slash Commands
Jalankan perintah ini sekali untuk mendaftarkan semua slash commands dari semua modul fitur ke Discord API:
```bash
npm run deploy
```

### 3. Dashboard (opsional)

Dashboard memakai Discord OAuth2 authorization-code flow dan hanya menampilkan guild yang:

- dapat dikelola oleh akun Discord yang login (`Manage Server` atau `Administrator`);
- sudah memiliki bot Vibes.

1. Daftarkan redirect URL `<DASHBOARD_PUBLIC_URL>/auth/callback` di Discord Developer Portal.
2. Isi `DASHBOARD_CLIENT_SECRET` dan buat `DASHBOARD_SESSION_SECRET` acak.
3. Set `DASHBOARD_ENABLED=true`.
4. Jalankan bot; buka `DASHBOARD_PUBLIC_URL`.

Dashboard menyediakan health check, aggregate metrics, audit log, dan pengaturan volume/channel musik. Bot tetap bisa dijalankan tanpa dashboard dengan `DASHBOARD_ENABLED=false`.

### 4. Jalankan Bot

Mode produksi:
```bash
npm start
```
Mode pengembangan (*auto-restart saat kode diubah*):
```bash
npm run dev
```

---

## 🧩 Cara Membuat Fitur Baru (Contoh: Fitur Catatan / Notes)

Cukup buat folder baru di `features/notes/index.js`:

```javascript
import { SlashCommandBuilder } from 'discord.js';

export const noteCommand = {
  data: new SlashCommandBuilder()
    .setName('note')
    .setDescription('Simpan catatan sederhana')
    .addStringOption(opt => opt.setName('text').setDescription('Isi catatan').setRequired(true)),
  aliases: ['catatan'],

  async executeSlash(interaction) {
    const text = interaction.options.getString('text');
    return interaction.reply(`📝 Catatan tersimpan: "${text}"`);
  },

  async executePrefix(message, args) {
    return message.reply(`📝 Catatan tersimpan: "${args.join(' ')}"`);
  }
};

export default {
  name: 'Notes',
  description: 'Fitur catatan pribadi',
  commands: [noteCommand],
};
```
Selesai! Fitur baru langsung otomatis terdaftar ke bot dan siap di-deploy dengan `npm run deploy`.
