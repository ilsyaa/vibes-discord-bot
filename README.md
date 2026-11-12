# Vibes Discord - Bot Musik YouTube Node.js (Stream Mode)

Bot musik Discord modern dan performa tinggi menggunakan **Node.js**, **Discord.js v14**, **DisTube**, dan **@distube/youtube**. Didesain optimal dengan **Stream Mode** langsung dari YouTube ke Discord voice channel tanpa perlu mendownload file video/audio ke penyimpanan lokal (zero disk I/O, latensi rendah, dan hemat RAM).

---

## ✨ Fitur Utama

- **YouTube Playback Lengkap**:
  - 🔗 **Link Video YouTube**: `https://www.youtube.com/watch?v=...` atau `https://youtu.be/...`
  - 📑 **Link Playlist YouTube**: `https://www.youtube.com/playlist?list=...` (otomatis memuat seluruh lagu dalam antrean)
  - 🔍 **Pencarian Judul**: Cukup ketik judul lagu (misal: `!play lofi hip hop` atau `/play query:lofi hip hop`)
- **Sistem Playlist & Antrean (Queue)**:
  - Otomatis menambahkan lagu baru ke antrean jika sedang ada lagu yang berputar ("nambah di playlist").
  - Menampilkan durasi, channel pembuat, jumlah total antrean, dan siapa yang meminta lagu.
- **Navigasi & Kontrol Lengkap**:
  - ⏭️ **Skip / Next**: Lewati lagu saat ini ke lagu berikutnya.
  - ⏮️ **Prev / Previous**: Putar kembali lagu yang baru saja diputar dari riwayat.
  - 📜 **Queue / Playlist**: Lihat daftar antrean lagu saat ini.
  - ⏸️ **Pause** & ▶️ **Resume**: Jeda dan lanjutkan pemutaran.
  - ⏹️ **Stop**: Hentikan pemutaran, bersihkan antrean, dan bot keluar dari voice channel.
  - 🔀 **Shuffle**: Acak urutan lagu dalam antrean.
  - 🔁 **Loop / Repeat**: 3 Mode pengulangan (Off, Ulangi Lagu Ini, Ulangi Seluruh Antrean).
  - 🔊 **Volume**: Kontrol tingkat suara lagu (1% - 100%).
- **Interactive UI Buttons**:
  - Setiap lagu yang berputar dilengkapi dengan tombol interaktif Discord (⏮️ Prev, ⏯️ Pause/Resume, ⏭️ Skip, 🔀 Shuffle, ⏹️ Stop, 🔁 Loop, 📜 Antrean) sehingga pengguna tidak perlu repot mengetik perintah berulang kali.
- **Dua Metode Kontrol (Dual Interface)**:
  - ⚡ **Slash Commands**: `/play`, `/skip`, `/prev`, `/queue`, `/pause`, `/resume`, `/stop`, `/loop`, `/shuffle`, `/volume`, `/nowplaying`.
  - 💬 **Prefix Commands**: `!play` (alias `!p`), `!skip` (alias `!next`, `!s`), `!prev`, `!queue` (alias `!q`, `!playlist`), `!pause`, `!resume`, `!stop`, dll.
- **Optimal Stream Mode**:
  - Audio di-transcode langsung secara on-the-fly via **FFmpeg chunk streaming** ke Discord AudioPlayer Opus stream.
  - Dilengkapi fitur buffer pintar (`highWaterMark: 32MB`, live stream buffer, auto-reconnect stream flag) agar suara jernih tanpa putus-putus.
  - Dukungan opsional `cookies.json` untuk mencegah blokir/bot detection dari YouTube.

---

## 📁 Struktur Direktori

```text
vibes-discord/
├── src/
│   ├── index.js               # Entry point utama bot
│   ├── config.js              # Manajemen konfigurasi environment
│   ├── player.js              # Setup DisTube engine & YouTube streaming
│   ├── deploy-commands.js     # Skrip deploy Slash Commands ke Discord API
│   ├── ui/
│   │   ├── playerEmbed.js     # Desain Embed & Tombol Pemutar Interaktif
│   │   └── buttonHandler.js   # Handler event interaksi tombol
│   └── commands/
│       ├── play.js            # Perintah play (video, playlist, search)
│       ├── skip.js            # Perintah skip / next
│       ├── prev.js            # Perintah prev (lagu sebelumnya)
│       ├── queue.js           # Perintah queue / playlist
│       ├── pause.js           # Perintah pause
│       ├── resume.js          # Perintah resume
│       ├── stop.js            # Perintah stop
│       ├── loop.js            # Perintah loop (off/song/queue)
│       ├── shuffle.js         # Perintah shuffle antrean
│       ├── volume.js          # Perintah atur volume
│       └── nowplaying.js      # Perintah info lagu saat ini
├── .env.example               # Template environment variables
├── cookies.example.json       # Template YouTube cookies (opsional)
├── package.json
└── README.md
```

---

## 🚀 Panduan Instalasi & Menjalankan Bot

### 1. Prasyarat Sistem
- **Node.js**: Versi 20, 22, atau 24+
- **FFmpeg**: Terpasang di sistem (`sudo apt install ffmpeg` di Ubuntu/Debian)

### 2. Konfigurasi Bot di Discord Developer Portal
1. Buka [Discord Developer Portal](https://discord.com/developers/applications).
2. Buat aplikasi baru (**New Application**), beri nama (misal: `Vibes Music`).
3. Masuk ke menu **Bot**:
   - Klik **Reset Token** dan salin bot token Anda.
   - Di bagian **Privileged Gateway Intents**, **AKTIFKAN**:
     - ✅ **Message Content Intent** (diperlukan untuk prefix command `!play`)
     - ✅ **Server Members Intent** (opsional tapi disarankan)
4. Masuk ke menu **OAuth2 -> URL Generator**:
   - Centang scopes: `bot`, `applications.commands`
   - Centang permissions:
     - `Connect`
     - `Speak`
     - `Send Messages`
     - `Embed Links`
     - `Read Message History`
     - `Use Slash Commands`
   - Salin link undangan dan buka di browser untuk mengundang bot ke server Discord Anda.

### 3. Konfigurasi File Environment (.env)
Salin file `.env.example` menjadi `.env`:
```bash
cp .env.example .env
```
Buka `.env` dan masukkan data bot Anda:
```env
DISCORD_TOKEN=masukkan_token_bot_anda_disini
CLIENT_ID=masukkan_application_id_anda_disini
PREFIX=!
DEFAULT_VOLUME=50
```

### 4. Daftarkan Slash Commands ke Discord
Jalankan perintah ini sekali untuk mendaftarkan semua slash commands (`/play`, `/skip`, `/prev`, dll):
```bash
npm run deploy
```

### 5. Jalankan Bot
Untuk mode produksi:
```bash
npm start
```
Untuk mode pengembangan (auto-reload saat file diedit):
```bash
npm run dev
```

---

## 📖 Daftar Perintah

| Slash Command | Prefix Command | Deskripsi |
| :--- | :--- | :--- |
| `/play <query>` | `!play <query>` atau `!p <query>` | Putar lagu dari link YouTube, playlist YouTube, atau kata kunci judul |
| `/skip` | `!skip`, `!next`, `!s` | Lewati lagu yang sedang diputar ke lagu berikutnya di playlist |
| `/prev` | `!prev`, `!previous` | Putar kembali lagu yang baru saja selesai dari riwayat pemutaran |
| `/queue` | `!queue`, `!playlist`, `!q` | Lihat daftar antrean lagu yang sedang diputar |
| `/pause` | `!pause` | Jeda pemutaran musik sementara |
| `/resume` | `!resume`, `!unpause` | Lanjutkan lagu yang sedang dijeda |
| `/stop` | `!stop`, `!leave` | Hentikan musik, kosongkan antrean, dan keluar dari voice channel |
| `/loop [mode]` | `!loop [off/song/queue]` | Atur mode pengulangan (Lagu / Seluruh Playlist / Nonaktif) |
| `/shuffle` | `!shuffle`, `!mix` | Acak urutan lagu yang belum diputar di antrean |
| `/volume <1-100>` | `!volume <1-100>`, `!vol <1-100>` | Atur tingkat suara lagu |
| `/nowplaying` | `!nowplaying`, `!np` | Tampilkan kartu info lagu yang sedang aktif beserta tombol kontrol |

---

## 💡 Tips & Optimalisasi Stream Mode YouTube

1. **Mengapa Stream Mode?**
   Bot ini tidak pernah mendownload file `.mp4` atau `.mp3` ke dalam harddisk / SSD VPS Anda. Setiap audio di-stream langsung berupa buffer bitstream yang dikonversi langsung oleh FFmpeg menjadi paket Opus Discord. Hal ini mencegah penggunaan disk penuh dan membuat lagu langsung berbunyi dalam hitungan detik setelah di-request.

2. **Menghindari Error 403 / "Sign in to confirm you're not a bot"**:
   Jika Anda menjalankan bot di server hosting/VPS (seperti AWS, DigitalOcean, Oracle Cloud, GCP, Hetzner), IP server cloud terkadang dibatasi atau diberi bot challenge oleh YouTube.
   - Solusi: Ekspor cookie YouTube Anda menggunakan ekstensi browser (misalnya *EditThisCookie* atau *Get cookies.txt LOCALLY*).
   - Simpan cookies dalam bentuk format JSON ke file `cookies.json` di root folder proyek ini (lihat contoh format di `cookies.example.json`).
   - Bot akan otomatis membaca `cookies.json` saat startup untuk autentikasi stream tanpa terkena batasan IP.
