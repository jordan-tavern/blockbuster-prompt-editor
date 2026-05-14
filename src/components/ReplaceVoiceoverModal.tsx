import React, { useCallback, useState } from "react";

interface ReplaceVoiceoverModalProps {
  onClose: () => void;
  onProjectUpdated: (project: Record<string, unknown>) => void;
}

export const ReplaceVoiceoverModal: React.FC<ReplaceVoiceoverModalProps> = ({ onClose, onProjectUpdated }) => {
  const [file, setFile] = useState<File | null>(null);
  const [manualSec, setManualSec] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);

  const apply = useCallback(async () => {
    if (!file) {
      setErr("Choose an audio file.");
      return;
    }
    setBusy(true);
    setErr("");
    setWarnings([]);
    try {
      const fd = new FormData();
      fd.append("audio", file);
      const m = manualSec.trim();
      if (m) fd.append("manualDurationSec", m);
      const res = await fetch("/api/projects/replace-voiceover", { method: "POST", body: fd });
      const raw = await res.text();
      let data: Record<string, unknown> = {};
      try {
        data = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        setErr(raw.slice(0, 200) || `HTTP ${res.status}`);
        return;
      }
      if (!res.ok) {
        setErr(typeof data.error === "string" ? data.error : `Request failed (${res.status})`);
        return;
      }
      const w = data.warnings;
      if (Array.isArray(w)) setWarnings(w.filter((x): x is string => typeof x === "string"));
      if (data.project && typeof data.project === "object") {
        onProjectUpdated(data.project as Record<string, unknown>);
      }
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [file, manualSec, onClose, onProjectUpdated]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        zIndex: 1200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "min(440px, 100%)",
          background: "#1e1e1e",
          border: "1px solid #444",
          borderRadius: 10,
          color: "#ddd",
          boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: "14px 16px", borderBottom: "1px solid #333", display: "flex", alignItems: "center" }}>
          <div style={{ flex: 1, fontWeight: 600, fontSize: 15 }}>Replace voiceover</div>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", color: "#888", cursor: "pointer", fontSize: 18 }}>
            ×
          </button>
        </div>

        <div style={{ padding: "14px 16px", fontSize: 12, lineHeight: 1.45, color: "#aaa" }}>
          Copies the file into this project, updates <code style={{ color: "#8cb" }}>composition-meta.json</code> (voiceover URL + duration, caption timings scaled), and stretches{" "}
          <code style={{ color: "#8cb" }}>S*_DUR</code> / <code style={{ color: "#8cb" }}>durationInFrames</code> in the composition TSX proportionally. End-card length is unchanged.
          <div style={{ marginTop: 8, color: "#777" }}>Requires <code>ffprobe</code> (ffmpeg) for duration unless you enter seconds below.</div>
        </div>

        <div style={{ padding: "0 16px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
          <label style={{ fontSize: 12, color: "#bbb" }}>
            Audio file
            <input
              type="file"
              accept="audio/*,.mp3,.wav,.m4a,.aac,.flac,.ogg"
              style={{ display: "block", marginTop: 6, fontSize: 11, color: "#ccc" }}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <label style={{ fontSize: 12, color: "#bbb" }}>
            Duration override (seconds, optional)
            <input
              type="text"
              inputMode="decimal"
              placeholder="e.g. 28.5"
              value={manualSec}
              onChange={(e) => setManualSec(e.target.value)}
              style={{
                display: "block",
                marginTop: 6,
                width: "100%",
                padding: "6px 8px",
                borderRadius: 4,
                border: "1px solid #444",
                background: "#111",
                color: "#eee",
                fontSize: 12,
              }}
            />
          </label>
          {err ? <div style={{ fontSize: 12, color: "#f66" }}>{err}</div> : null}
          {warnings.length > 0 ? (
            <div style={{ fontSize: 11, color: "#ca8", lineHeight: 1.35 }}>
              {warnings.map((w) => (
                <div key={w}>{w}</div>
              ))}
            </div>
          ) : null}
        </div>

        <div style={{ padding: "12px 16px", borderTop: "1px solid #333", display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose} style={btnSecondary}>
            Cancel
          </button>
          <button type="button" disabled={busy || !file} onClick={() => void apply()} style={{ ...btnPrimary, opacity: busy || !file ? 0.5 : 1 }}>
            {busy ? "Applying…" : "Replace & re-time"}
          </button>
        </div>
      </div>
    </div>
  );
};

const btnSecondary: React.CSSProperties = {
  padding: "6px 14px",
  fontSize: 12,
  borderRadius: 4,
  border: "1px solid #555",
  background: "#2a2a2a",
  color: "#ccc",
  cursor: "pointer",
};

const btnPrimary: React.CSSProperties = {
  padding: "6px 14px",
  fontSize: 12,
  borderRadius: 4,
  border: "none",
  background: "#3a6a4a",
  color: "#fff",
  cursor: "pointer",
};
