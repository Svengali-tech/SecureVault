import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

interface Document {
    id: string;
    title: string;
    content: string;
    created_at: number;
    updated_at: number;
}

export default function App() {
    const [unlocked, setUnlocked] = useState(false);
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [docs, setDocs] = useState<Document[]>([]);
    const [selected, setSelected] = useState<Document | null>(null);
    const [editTitle, setEditTitle] = useState("");
    const [editContent, setEditContent] = useState("");
    const [search, setSearch] = useState("");
    const [isNew, setIsNew] = useState(false);

    async function unlock() {
        try {
            await invoke("unlock_vault", { password });
            setUnlocked(true);
            setError("");
            loadDocs();
        } catch (e) {
            setError("Invalid password or failed to open vault.");
        }
    }

    async function loadDocs() {
        const result = await invoke<Document[]>("get_documents");
        setDocs(result);
    }

    async function saveDoc() {
        if (!editTitle.trim()) return;
        if (isNew) {
            await invoke("create_document", { title: editTitle, content: editContent });
        } else if (selected) {
            await invoke("update_document", { id: selected.id, title: editTitle, content: editContent });
        }
        setIsNew(false);
        setSelected(null);
        loadDocs();
    }

    async function deleteDoc(id: string) {
        await invoke("delete_document", { id });
        setSelected(null);
        setIsNew(false);
        loadDocs();
    }

    async function lock() {
        await invoke("lock_vault");
        setUnlocked(false);
        setDocs([]);
        setSelected(null);
        setPassword("");
    }

    function newDoc() {
        setSelected(null);
        setEditTitle("");
        setEditContent("");
        setIsNew(true);
    }

    function selectDoc(doc: Document) {
        setSelected(doc);
        setEditTitle(doc.title);
        setEditContent(doc.content);
        setIsNew(false);
    }

    const filtered = docs.filter(d =>
        d.title.toLowerCase().includes(search.toLowerCase()) ||
        d.content.toLowerCase().includes(search.toLowerCase())
    );

    if (!unlocked) {
        return (
            <div style={styles.lockScreen}>
                <div style={styles.lockBox}>
                    <h1 style={styles.lockTitle}>🔒 SecureVault</h1>
                    <p style={styles.lockSub}>Enter your password to unlock</p>
                    <input
                        style={styles.input}
                        type="password"
                        placeholder="Password"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && unlock()}
                    />
                    {error && <p style={styles.error}>{error}</p>}
                    <button style={styles.btn} onClick={unlock}>Unlock</button>
                </div>
            </div>
        );
    }

    return (
        <div style={styles.app}>
            {/* Sidebar */}
            <div style={styles.sidebar}>
                <div style={styles.sidebarHeader}>
                    <span style={{ fontWeight: 700, fontSize: 16 }}>SecureVault</span>
                    <button style={styles.iconBtn} onClick={lock} title="Lock vault">🔒</button>
                </div>
                <input
                    style={styles.searchInput}
                    placeholder="Search..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                />
                <button style={styles.newBtn} onClick={newDoc}>+ New Document</button>
                <div style={styles.docList}>
                    {filtered.length === 0 && (
                        <p style={{ color: "#666", padding: "12px", fontSize: 13 }}>No documents yet.</p>
                    )}
                    {filtered.map(doc => (
                        <div
                            key={doc.id}
                            style={{
                                ...styles.docItem,
                                background: selected?.id === doc.id ? "#2a2a2a" : "transparent",
                            }}
                            onClick={() => selectDoc(doc)}
                        >
                            <div style={{ fontWeight: 600, fontSize: 14 }}>{doc.title}</div>
                            <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>
                                {doc.content.slice(0, 40)}{doc.content.length > 40 ? "..." : ""}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Editor */}
            <div style={styles.editor}>
                {(selected || isNew) ? (
                    <>
                        <input
                            style={styles.titleInput}
                            placeholder="Document title"
                            value={editTitle}
                            onChange={e => setEditTitle(e.target.value)}
                        />
                        <textarea
                            style={styles.textarea}
                            placeholder="Start writing..."
                            value={editContent}
                            onChange={e => setEditContent(e.target.value)}
                        />
                        <div style={styles.editorActions}>
                            <button style={styles.btn} onClick={saveDoc}>Save</button>
                            {selected && (
                                <button style={styles.deleteBtn} onClick={() => deleteDoc(selected.id)}>Delete</button>
                            )}
                        </div>
                    </>
                ) : (
                    <div style={styles.empty}>
                        <p>Select a document or create a new one.</p>
                    </div>
                )}
            </div>
        </div>
    );
}

const styles: Record<string, React.CSSProperties> = {
    app: { display: "flex", height: "100vh", background: "#1a1a1a", color: "#eee", fontFamily: "sans-serif" },
    lockScreen: { display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#1a1a1a" },
    lockBox: { display: "flex", flexDirection: "column", gap: 12, width: 300, padding: 32, background: "#242424", borderRadius: 12 },
    lockTitle: { margin: 0, fontSize: 24, textAlign: "center" },
    lockSub: { margin: 0, color: "#888", textAlign: "center", fontSize: 13 },
    input: { padding: "10px 12px", borderRadius: 6, border: "1px solid #333", background: "#1a1a1a", color: "#eee", fontSize: 14 },
    btn: { padding: "10px 16px", borderRadius: 6, border: "none", background: "#4f8ef7", color: "#fff", cursor: "pointer", fontWeight: 600 },
    deleteBtn: { padding: "10px 16px", borderRadius: 6, border: "none", background: "#c0392b", color: "#fff", cursor: "pointer", fontWeight: 600 },
    error: { color: "#e74c3c", fontSize: 13, margin: 0 },
    sidebar: { width: 240, borderRight: "1px solid #2a2a2a", display: "flex", flexDirection: "column" },
    sidebarHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 12px", borderBottom: "1px solid #2a2a2a" },
    iconBtn: { background: "none", border: "none", cursor: "pointer", fontSize: 16 },
    searchInput: { margin: "10px 10px 4px", padding: "8px 10px", borderRadius: 6, border: "1px solid #333", background: "#1a1a1a", color: "#eee", fontSize: 13 },
    newBtn: { margin: "6px 10px", padding: "8px 10px", borderRadius: 6, border: "1px solid #4f8ef7", background: "transparent", color: "#4f8ef7", cursor: "pointer", fontSize: 13 },
    docList: { flex: 1, overflowY: "auto" },
    docItem: { padding: "10px 12px", cursor: "pointer", borderBottom: "1px solid #222" },
    editor: { flex: 1, display: "flex", flexDirection: "column", padding: 24, gap: 12 },
    titleInput: { fontSize: 22, fontWeight: 700, background: "none", border: "none", borderBottom: "1px solid #333", color: "#eee", padding: "8px 0", outline: "none" },
    textarea: { flex: 1, background: "#242424", border: "1px solid #2a2a2a", borderRadius: 8, color: "#eee", padding: 16, fontSize: 14, resize: "none", outline: "none", lineHeight: 1.6 },
    editorActions: { display: "flex", gap: 10 },
    empty: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#555" },
};