import React, { useState, useEffect, useCallback } from "react";

interface Version {
  id: string;
  name: string;
  timestamp: string;
  description: string;
}

export const VersionPanel: React.FC = () => {
  const [versions, setVersions] = useState<Version[]>([]);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");

  const refresh = useCallback(async () => {
    const res = await fetch("/api/versions");
    setVersions(await res.json());
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const showFeedback = (msg: string) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(""), 3000);
  };

  const saveVersion = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    await fetch("/api/versions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    });
    setNewName("");
    await refresh();
    setSaving(false);
    showFeedback("Version saved");
  };

  const restoreVersion = async (id: string, name: string) => {
    await fetch(`/api/versions/${id}/restore`, { method: "POST" });
    showFeedback(`Restored "${name}"`);
  };

  const deleteVersion = async (id: string) => {
    await fetch(`/api/versions/${id}`, { method: "DELETE" });
    await refresh();
    showFeedback("Deleted");
  };

  const formatTime = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  };

  return (
    <div style={{ padding: "8px 12px" }}>
      <div style={{ fontSize: 10, color: "#888", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
        Versions
      </div>

      {/* Save new version */}
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && saveVersion()}
          placeholder="Version name..."
          style={{
            flex: 1,
            padding: "4px 8px",
            background: "#252525",
            border: "1px solid #444",
            borderRadius: 3,
            color: "#ccc",
            fontSize: 11,
          }}
        />
        <button
          onClick={saveVersion}
          disabled={saving || !newName.trim()}
          style={{
            padding: "4px 10px",
            background: "#3a6a3a",
            color: "#cfc",
            border: "none",
            borderRadius: 3,
            fontSize: 10,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          Save
        </button>
      </div>

      {feedback && (
        <div style={{ fontSize: 10, color: "#6c6", marginBottom: 6, fontFamily: "monospace" }}>
          {feedback}
        </div>
      )}

      {/* Version list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 120, overflowY: "auto" }}>
        {versions.length === 0 && (
          <div style={{ fontSize: 10, color: "#555", fontStyle: "italic" }}>No saved versions</div>
        )}
        {[...versions].reverse().map((v) => (
          <div
            key={v.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 6px",
              background: "#222",
              borderRadius: 3,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, color: "#ccc", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {v.name}
              </div>
              <div style={{ fontSize: 9, color: "#666", fontFamily: "monospace" }}>
                {formatTime(v.timestamp)}
              </div>
            </div>
            <button
              onClick={() => restoreVersion(v.id, v.name)}
              style={{
                padding: "2px 8px",
                background: "#4a5a7a",
                color: "#bcd",
                border: "none",
                borderRadius: 3,
                fontSize: 9,
                cursor: "pointer",
              }}
            >
              Restore
            </button>
            <button
              onClick={() => deleteVersion(v.id)}
              style={{
                padding: "2px 6px",
                background: "#5a3a3a",
                color: "#daa",
                border: "none",
                borderRadius: 3,
                fontSize: 9,
                cursor: "pointer",
              }}
            >
              x
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
