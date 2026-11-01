# Tic Tac Toe Online Arena

Website Tic Tac Toe terpisah dengan tampilan black & gold, memakai Firebase project yang sama dengan Math Battle.

## Fitur
- Login dan registrasi memakai **username + password** (tanpa input email).
- Online multiplayer 1 vs 1 memakai kode room real-time.
- Vs Computer dengan tingkat Easy, Medium, dan Hard.
- Deteksi menang/seri, penguncian langkah yang tidak sah, indikator giliran.
- Rematch online dengan persetujuan kedua pemain.
- Statistik akun dan leaderboard khusus Tic Tac Toe.
- Efek suara langkah dan hasil pertandingan.
- Statistik Tic Tac Toe disimpan di `profiles/{uid}/games/tictactoe`, terpisah dari statistik Math Battle.

## Cara menjalankan
1. Ekstrak folder ini.
2. Pastikan `firebase-config.js` memakai konfigurasi Firebase project yang sama dengan Math Battle.
3. Di Firebase Console → Authentication → Sign-in method, aktifkan **Email/Password**.
4. Di Realtime Database → Rules, gabungkan aturan di `database.rules.json` dengan aturan Math Battle yang sudah ada. Jangan menghapus aturan `rooms` milik Math Battle.
5. Jalankan folder dengan VS Code Live Server atau hosting HTTPS. Jangan buka `index.html` langsung dengan `file://`.

## Catatan penting tentang akun username-only
Firebase Authentication menyediakan provider Email/Password, bukan username/password native. Karena itu website mengubah username menjadi alamat internal berbentuk `username@tictactoe.local`. Pengguna tetap hanya mengisi username dan password. Agar akun yang sama bisa dipakai di Math Battle, Math Battle juga harus menggunakan metode konversi username internal yang persis sama dan tidak lagi memakai Anonymous Authentication. Jika Math Battle masih memakai anonymous sign-in, akun kedua website belum otomatis tersambung.

## Keamanan
Rules di `database.rules.json` adalah aturan dasar agar pengguna login dapat membaca leaderboard dan menulis profil miliknya sendiri. Untuk penggunaan publik, validasi room dan statistik sebaiknya dipindahkan ke Cloud Functions/server agar klien tidak dapat memanipulasi data pertandingan.
