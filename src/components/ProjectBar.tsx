import React, { useCallback, useEffect, useState } from "react";

const AD_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Accept a bare ad UUID or a full Spigot/Blockbuster URL; returns normalized lower-case id (or trimmed input if no UUID found). */
function extractBlockbusterAdUuid(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  const afterAds = s.match(/\/ads\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  if (afterAds) return afterAds[1].toLowerCase();
  if (AD_UUID_RE.test(s)) return s.toLowerCase();
  const any = s.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  return any ? any[0].toLowerCase() : s;
}

type ProjectRow = {
  id: string;
  label: string;
  compositionId: string;
};

export const ProjectBar: React.FC<{
  onProjectSwitched: () => void;
}> = ({ onProjectSwitched }) => {
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [activeId, setActiveId] = useState("");
  const [adId, setAdId] = useState("");
  const [bbKey, setBbKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState("");

  const refresh = useCallback(async () => {
    const res = await fetch("/api/projects");
    const data = await res.json();
    setProjects(data.projects ?? []);
    setActiveId(data.activeId ?? "");
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const switchTo = async (id: string) => {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/projects/active", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        setMsg(e.error || res.statusText);
        return;
      }
      const body = await res.json();
      setActiveId(body.id);
      onProjectSwitched();
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const importAd = async () => {
    const id = extractBlockbusterAdUuid(adId);
    if (!id.trim()) return;
    setImporting(true);
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/projects/import-blockbuster", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adId: id,
          apiKey: bbKey.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data.error || "Import failed");
        return;
      }
      setAdId("");
      onProjectSwitched();
      await refresh();
      if (data.project?.id) await switchTo(data.project.id);
      if (Array.isArray(data.hydrationWarnings) && data.hydrationWarnings.length > 0) {
        const short = data.hydrationWarnings.slice(0, 2).join(" · ");
        setMsg(
          `⚠ Import ok; some media URLs unresolved (${data.hydrationWarnings.length}): ${short}${
            data.hydrationWarnings.length > 2 ? " · …" : ""
          }`
        );
      }
    } finally {
      setImporting(false);
      setBusy(false);
    }
  };

  return (
    <div
      aria-busy={importing}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 10px",
        background: "#222",
        borderBottom: "1px solid #333",
        fontSize: 12,
        flexWrap: "wrap",
      }}
    >
      <span style={{ color: "#888" }}>Project</span>
      <select
        value={activeId}
        disabled={busy}
        onChange={(e) => switchTo(e.target.value)}
        style={{ background: "#111", color: "#ddd", border: "1px solid #444", borderRadius: 4, padding: "2px 8px" }}
      >
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
      <span style={{ color: "#555" }}>|</span>
      <input
        placeholder="Ad UUID or Spigot / …/ads/… link"
        value={adId}
        onChange={(e) => setAdId(e.target.value)}
        onPaste={(e) => {
          const t = e.clipboardData.getData("text").trim();
          if (/https?:\/\//i.test(t) || /\/ads\//i.test(t)) {
            e.preventDefault();
            setAdId(extractBlockbusterAdUuid(t));
          }
        }}
        onBlur={() =>
          setAdId((v) => (/https?:\/\//i.test(v) || /\/ads\//i.test(v) ? extractBlockbusterAdUuid(v) : v))
        }
        style={{ flex: 1, minWidth: 180, maxWidth: 320, background: "#111", color: "#ddd", border: "1px solid #444", borderRadius: 4, padding: "3px 8px" }}
      />
      <input
        placeholder="BB API key (optional if env set)"
        value={bbKey}
        onChange={(e) => setBbKey(e.target.value)}
        type="password"
        style={{ width: 200, background: "#111", color: "#ddd", border: "1px solid #444", borderRadius: 4, padding: "3px 8px" }}
      />
      <button
        type="button"
        disabled={busy || !extractBlockbusterAdUuid(adId)}
        onClick={importAd}
        style={{
          padding: "4px 10px",
          background: busy ? "#333" : "#3a5a7a",
          color: "#fff",
          border: "none",
          borderRadius: 4,
          cursor: busy ? "default" : "pointer",
          fontSize: 11,
        }}
      >
        Import ad
      </button>
      {importing ? (
        <>
          <style
            dangerouslySetInnerHTML={{
              __html: `@keyframes bpe-import-spin { to { transform: rotate(360deg); } }`,
            }}
          />
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              color: "#9cc8e8",
              fontSize: 11,
              letterSpacing: "0.02em",
            }}
          >
            <span
              aria-hidden
              style={{
                display: "inline-block",
                width: 14,
                height: 14,
                border: "2px solid #3a4550",
                borderTopColor: "#8ac4ea",
                borderRadius: "50%",
                animation: "bpe-import-spin 0.65s linear infinite",
                flexShrink: 0,
              }}
            />
            Importing from Blockbuster…
          </span>
        </>
      ) : null}
      {msg ? (
        <span
          style={{
            color: msg.startsWith("⚠") ? "#fa4" : "#f88",
            fontFamily: "monospace",
            fontSize: 11,
            maxWidth: 480,
          }}
        >
          {msg}
        </span>
      ) : null}
    </div>
  );
};
