SecureVault

A local-first encrypted document vault built as a Windows desktop app using Tauri and Rust.
What it does
SecureVault lets you store and retrieve private documents on your local machine. All data is encrypted at rest using AES-256-GCM. Nothing leaves your device — no cloud sync, no network requests, no accounts.
How it works
Key derivation
When you enter your password, Argon2 (the winner of the Password Hashing Competition) derives a 32-byte encryption key from it. Argon2 is memory-hard, meaning brute-force attacks are computationally expensive even with specialized hardware.
Encryption
Each document is encrypted individually using AES-256-GCM before being written to disk. AES-GCM is an authenticated encryption scheme — it both encrypts the content and produces an authentication tag, so any tampering with the ciphertext is detected on read. Each document gets a fresh random nonce on every write, so encrypting the same content twice produces different ciphertext.
Storage
Encrypted ciphertext and nonces are stored in a local SQLite database (securevault.db). The encryption key exists only in memory while the vault is unlocked and is wiped when you lock it.
Desktop
Built with Tauri 2, which uses the OS webview (WebView2 on Windows) to render the React frontend while the Rust backend handles all sensitive operations. The frontend communicates with Rust via Tauri's typed command system — no raw IPC, no eval.

Tech stack

Rust — backend logic, encryption, database access
Tauri 2 — desktop app framework
aes-gcm — AES-256-GCM authenticated encryption
argon2 — password-based key derivation
rusqlite — SQLite bindings with bundled libsqlite3
React + TypeScript — frontend UI
Vite — frontend build tooling

Getting started
Prerequisites: Rust, Node.js
bashgit clone https://github.com/yourhandle/securevault
cd securevault
npm install
npm run tauri dev
To build a release binary:
bashnpm run tauri build
Security notes

The vault password is never stored anywhere. If you forget it, your data is unrecoverable.
The Argon2 salt is currently static. A production version would generate and persist a random salt per vault.
This is a personal project built to learn Rust and Tauri. It has not been audited.