use aes_gcm::{
    aead::{Aead, AeadCore, KeyInit, OsRng},
    Aes256Gcm, Key, Nonce,
};
use argon2::Argon2;
use base64::{Engine as _, engine::general_purpose};
use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::State;
use uuid::Uuid;

#[derive(Serialize, Deserialize, Clone)]
pub struct Document {
    pub id: String,
    pub title: String,
    pub content: String,
    pub created_at: i64,
    pub updated_at: i64,
}

pub struct AppState {
    pub db: Mutex<Option<Connection>>,
    pub cipher: Mutex<Option<Aes256Gcm>>,
}

fn init_db(conn: &Connection) {
    conn.execute_batch("
        CREATE TABLE IF NOT EXISTS documents (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            content_encrypted TEXT NOT NULL,
            nonce TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );
    ").expect("Failed to create table");
}

pub fn unlock_vault_cmd(password: String, state: State<AppState>) -> Result<(), String> {
    let mut key_bytes = [0u8; 32];
    Argon2::default()
        .hash_password_into(password.as_bytes(), b"securevaultsalt1", &mut key_bytes)
        .map_err(|e| e.to_string())?;

    let key = Key::<Aes256Gcm>::from_slice(&key_bytes);
    let cipher = Aes256Gcm::new(key);

    let conn = Connection::open("securevault.db").map_err(|e| e.to_string())?;
    init_db(&conn);

    *state.db.lock().unwrap() = Some(conn);
    *state.cipher.lock().unwrap() = Some(cipher);

    Ok(())
}

pub fn lock_vault_cmd(state: State<AppState>) {
    *state.db.lock().unwrap() = None;
    *state.cipher.lock().unwrap() = None;
}

pub fn create_document_cmd(title: String, content: String, state: State<AppState>) -> Result<Document, String> {
    let cipher_guard = state.cipher.lock().unwrap();
    let cipher = cipher_guard.as_ref().ok_or("Vault is locked")?;
    let db_guard = state.db.lock().unwrap();
    let conn = db_guard.as_ref().ok_or("Vault is locked")?;

    let nonce_bytes = Aes256Gcm::generate_nonce(&mut OsRng);
    let encrypted = cipher.encrypt(&nonce_bytes, content.as_bytes()).map_err(|e| e.to_string())?;

    let id = Uuid::new_v4().to_string();
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    let content_b64 = general_purpose::STANDARD.encode(&encrypted);
    let nonce_b64 = general_purpose::STANDARD.encode(&nonce_bytes);

    conn.execute(
        "INSERT INTO documents (id, title, content_encrypted, nonce, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![id, title, content_b64, nonce_b64, now, now],
    ).map_err(|e| e.to_string())?;

    Ok(Document { id, title, content, created_at: now, updated_at: now })
}

pub fn get_documents_cmd(state: State<AppState>) -> Result<Vec<Document>, String> {
    let cipher_guard = state.cipher.lock().unwrap();
    let cipher = cipher_guard.as_ref().ok_or("Vault is locked")?;
    let db_guard = state.db.lock().unwrap();
    let conn = db_guard.as_ref().ok_or("Vault is locked")?;

    let mut stmt = conn
        .prepare("SELECT id, title, content_encrypted, nonce, created_at, updated_at FROM documents ORDER BY updated_at DESC")
        .map_err(|e| e.to_string())?;

    let docs = stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, i64>(4)?,
            row.get::<_, i64>(5)?,
        ))
    })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .map(|(id, title, content_b64, nonce_b64, created_at, updated_at)| {
            let encrypted = general_purpose::STANDARD.decode(&content_b64).unwrap_or_default();
            let nonce_bytes = general_purpose::STANDARD.decode(&nonce_b64).unwrap_or_default();
            let nonce = Nonce::from_slice(&nonce_bytes);
            let decrypted = cipher.decrypt(nonce, encrypted.as_ref()).unwrap_or_default();
            let content = String::from_utf8(decrypted).unwrap_or_default();
            Document { id, title, content, created_at, updated_at }
        })
        .collect();

    Ok(docs)
}

pub fn delete_document_cmd(id: String, state: State<AppState>) -> Result<(), String> {
    let db_guard = state.db.lock().unwrap();
    let conn = db_guard.as_ref().ok_or("Vault is locked")?;
    conn.execute("DELETE FROM documents WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn update_document_cmd(id: String, title: String, content: String, state: State<AppState>) -> Result<(), String> {
    let cipher_guard = state.cipher.lock().unwrap();
    let cipher = cipher_guard.as_ref().ok_or("Vault is locked")?;
    let db_guard = state.db.lock().unwrap();
    let conn = db_guard.as_ref().ok_or("Vault is locked")?;

    let nonce_bytes = Aes256Gcm::generate_nonce(&mut OsRng);
    let encrypted = cipher.encrypt(&nonce_bytes, content.as_bytes()).map_err(|e| e.to_string())?;

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    let content_b64 = general_purpose::STANDARD.encode(&encrypted);
    let nonce_b64 = general_purpose::STANDARD.encode(&nonce_bytes);

    conn.execute(
        "UPDATE documents SET title = ?1, content_encrypted = ?2, nonce = ?3, updated_at = ?4 WHERE id = ?5",
        params![title, content_b64, nonce_b64, now, id],
    ).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn unlock_vault(password: String, state: State<AppState>) -> Result<(), String> {
    unlock_vault_cmd(password, state)
}

#[tauri::command]
fn lock_vault(state: State<AppState>) {
    lock_vault_cmd(state)
}

#[tauri::command]
fn create_document(title: String, content: String, state: State<AppState>) -> Result<Document, String> {
    create_document_cmd(title, content, state)
}

#[tauri::command]
fn get_documents(state: State<AppState>) -> Result<Vec<Document>, String> {
    get_documents_cmd(state)
}

#[tauri::command]
fn delete_document(id: String, state: State<AppState>) -> Result<(), String> {
    delete_document_cmd(id, state)
}

#[tauri::command]
fn update_document(id: String, title: String, content: String, state: State<AppState>) -> Result<(), String> {
    update_document_cmd(id, title, content, state)
}

pub fn run() {
    tauri::Builder::default()
        .manage(AppState {
            db: Mutex::new(None),
            cipher: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            unlock_vault,
            lock_vault,
            create_document,
            get_documents,
            delete_document,
            update_document,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}