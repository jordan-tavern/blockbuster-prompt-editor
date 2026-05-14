import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface AssetSearchHit {
  video_id: string;
  score: number;
  start_sec?: number;
  end_sec?: number;
  filename?: string | null;
  labels?: string[];
}

interface CatalogLabel {
  label: string;
  count: number;
}

interface ReplaceClipModalProps {
  clipIndex: number;
  clipLabel: string;
  onClose: () => void;
  onProjectUpdated: (project: Record<string, unknown>) => void;
}

function parseSearchResponse(data: unknown): AssetSearchHit[] {
  if (!data || typeof data !== "object") return [];
  const o = data as Record<string, unknown>;
  const hits = o.hits;
  if (!Array.isArray(hits)) return [];
  const out: AssetSearchHit[] = [];
  for (const h of hits) {
    if (!h || typeof h !== "object") continue;
    const r = h as Record<string, unknown>;
    const id = typeof r.video_id === "string" ? r.video_id : "";
    const score = typeof r.score === "number" ? r.score : 0;
    if (!id) continue;
    out.push({
      video_id: id,
      score,
      start_sec: typeof r.start_sec === "number" ? r.start_sec : undefined,
      end_sec: typeof r.end_sec === "number" ? r.end_sec : undefined,
      filename: typeof r.filename === "string" ? r.filename : null,
      labels: Array.isArray(r.labels) ? r.labels.filter((x): x is string => typeof x === "string") : undefined,
    });
  }
  return out;
}

function parseLabelsCatalog(data: unknown): CatalogLabel[] {
  if (!data || typeof data !== "object") return [];
  const labels = (data as { labels?: unknown }).labels;
  if (!Array.isArray(labels)) return [];
  const out: CatalogLabel[] = [];
  for (const row of labels) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const label =
      (typeof r.label === "string" ? r.label : typeof r.name === "string" ? r.name : "").trim();
    const count = typeof r.count === "number" ? r.count : typeof r.video_count === "number" ? r.video_count : 0;
    if (label) out.push({ label, count });
  }
  return out;
}

/** Vite often returns HTML for 502 when `tsx server.ts` (3101) is not running — `res.json()` then yields `{}` and hides the real problem. */
function formatHttpError(res: Response, rawBody: string): string {
  const head = `${res.status} ${res.statusText || ""}`.trim();
  const compact = rawBody.replace(/\s+/g, " ").trim();
  if (res.status === 502 || /bad gateway/i.test(compact)) {
    return `${head}: editor API not reachable — run \`npm run dev\` from the editor folder (needs Vite on 3100 and API on 3101).`;
  }
  if (!compact) return head || "Request failed";
  try {
    const j = JSON.parse(rawBody) as Record<string, unknown>;
    if (typeof j.error === "string") return j.error;
    if (typeof j.message === "string") return j.message;
    const d = j.detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d)) {
      return d
        .map((x) => {
          if (x && typeof x === "object") {
            const o = x as Record<string, unknown>;
            if (typeof o.msg === "string") return o.msg;
            if (typeof o.message === "string") return o.message;
          }
          return JSON.stringify(x);
        })
        .join("; ");
    }
  } catch {
    /* fall through */
  }
  return `${head}: ${compact.slice(0, 180)}${compact.length > 180 ? "…" : ""}`;
}

function HitPreview({
  videoId,
  listRoot,
}: {
  videoId: string;
  listRoot: HTMLElement | null;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const requestedRef = useRef(false);

  useEffect(() => {
    requestedRef.current = false;
    setUrl(null);
    setFailed(false);
    const host = hostRef.current;
    if (!host) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const e = entries[0];
        if (!e?.isIntersecting || requestedRef.current) return;
        requestedRef.current = true;
        void (async () => {
          try {
            const r = await fetch(`/api/assets/indexed-signed-url?videoId=${encodeURIComponent(videoId)}`);
            const raw = await r.text();
            let j: { url?: string };
            try {
              j = raw ? (JSON.parse(raw) as { url?: string }) : {};
            } catch {
              setFailed(true);
              return;
            }
            if (!r.ok || typeof j.url !== "string" || !j.url) {
              setFailed(true);
              return;
            }
            setUrl(j.url);
          } catch {
            setFailed(true);
          }
        })();
      },
      { root: listRoot, rootMargin: "48px", threshold: 0.08 }
    );
    obs.observe(host);
    return () => obs.disconnect();
  }, [videoId, listRoot]);

  return (
    <div
      ref={hostRef}
      style={{
        width: 128,
        minWidth: 128,
        height: 72,
        background: "#0a0a0a",
        borderRadius: 4,
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      {failed ? (
        <div
          style={{
            fontSize: 9,
            color: "#555",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            padding: 4,
          }}
        >
          Preview unavailable
        </div>
      ) : url ? (
        <video
          src={url}
          muted
          playsInline
          preload="metadata"
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          onError={() => setFailed(true)}
          onLoadedMetadata={(e) => {
            try {
              const v = e.currentTarget;
              const dur = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 1;
              v.currentTime = Math.min(0.15, dur * 0.03);
            } catch {
              /* ignore */
            }
          }}
          onLoadedData={(e) => {
            try {
              const v = e.currentTarget;
              if (v.readyState >= 2 && v.currentTime === 0) v.currentTime = Math.min(0.15, (v.duration || 1) * 0.03);
            } catch {
              /* ignore */
            }
          }}
        />
      ) : (
        <div
          style={{
            fontSize: 9,
            color: "#444",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          …
        </div>
      )}
    </div>
  );
}

function LabelChip({
  text,
  active,
  sub,
  onClick,
}: {
  text: string;
  active: boolean;
  sub?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={text}
      style={{
        fontSize: 10,
        padding: "3px 8px",
        borderRadius: 999,
        border: active ? "1px solid #6aaacc" : "1px solid #444",
        background: active ? "#2a3540" : "#222",
        color: active ? "#e8f4ff" : "#bbb",
        cursor: "pointer",
        maxWidth: 160,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}
    >
      {text}
      {sub ? <span style={{ color: "#666", marginLeft: 4 }}>{sub}</span> : null}
    </button>
  );
}

export const ReplaceClipModal: React.FC<ReplaceClipModalProps> = ({
  clipIndex,
  clipLabel,
  onClose,
  onProjectUpdated,
}) => {
  const [searchMode, setSearchMode] = useState<"text" | "labels">("text");
  const [query, setQuery] = useState("");
  const [textFilterLabels, setTextFilterLabels] = useState<string[]>([]);
  const [labelSearchTags, setLabelSearchTags] = useState<string[]>([]);
  const [labelMatchAll, setLabelMatchAll] = useState(false);
  const [customLabelDraft, setCustomLabelDraft] = useState("");

  const [catalog, setCatalog] = useState<CatalogLabel[]>([]);
  const [catalogError, setCatalogError] = useState("");
  const [labelsLoaded, setLabelsLoaded] = useState(false);
  const [hitListRoot, setHitListRoot] = useState<HTMLDivElement | null>(null);

  const [hits, setHits] = useState<AssetSearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const textFilterKey = useMemo(() => [...textFilterLabels].sort().join("|"), [textFilterLabels]);
  const labelTagsKey = useMemo(() => [...labelSearchTags].sort().join("|"), [labelSearchTags]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/assets/labels");
        const raw = await res.text();
        if (!res.ok) {
          setCatalogError(formatHttpError(res, raw));
          return;
        }
        let data: unknown;
        try {
          data = raw ? JSON.parse(raw) : {};
        } catch {
          setCatalogError("Invalid JSON from /api/assets/labels");
          return;
        }
        setCatalogError("");
        setCatalog(parseLabelsCatalog(data));
      } catch (e: unknown) {
        setCatalogError(e instanceof Error ? e.message : String(e));
      } finally {
        setLabelsLoaded(true);
      }
    })();
  }, []);

  const runSearch = useCallback(async () => {
    if (searchMode === "labels" && labelSearchTags.length < 1) {
      setHits([]);
      setSearchError("");
      return;
    }
    const trimmed = query.trim();
    if (searchMode === "text" && trimmed.length < 2) {
      setHits([]);
      setSearchError("");
      return;
    }

    setSearching(true);
    setSearchError("");
    try {
      if (searchMode === "labels") {
        const res = await fetch("/api/assets/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: "labels",
            labels: labelSearchTags,
            matchAll: labelMatchAll,
          }),
        });
        const raw = await res.text();
        if (!res.ok) {
          setHits([]);
          setSearchError(formatHttpError(res, raw));
          return;
        }
        let data: unknown;
        try {
          data = raw ? JSON.parse(raw) : {};
        } catch {
          setHits([]);
          setSearchError("Invalid JSON from search");
          return;
        }
        setHits(parseSearchResponse(data));
        return;
      }

      const res = await fetch("/api/assets/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "text",
          query: trimmed,
          k: 12,
          labels: textFilterLabels.length ? textFilterLabels : undefined,
        }),
      });
      const raw = await res.text();
      if (!res.ok) {
        setHits([]);
        setSearchError(formatHttpError(res, raw));
        return;
      }
      let data: unknown;
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        setHits([]);
        setSearchError("Invalid JSON from search");
        return;
      }
      setHits(parseSearchResponse(data));
    } catch (e: unknown) {
      setHits([]);
      setSearchError(e instanceof Error ? e.message : String(e));
    } finally {
      setSearching(false);
    }
  }, [searchMode, query, textFilterKey, labelTagsKey, labelMatchAll, labelSearchTags, textFilterLabels]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void runSearch();
    }, 380);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchMode, query, textFilterKey, labelTagsKey, labelMatchAll, labelSearchTags, runSearch]);

  const toggleTextFilterLabel = (label: string) => {
    setTextFilterLabels((prev) => (prev.includes(label) ? prev.filter((x) => x !== label) : [...prev, label]));
  };

  const toggleLabelSearchTag = (label: string) => {
    setLabelSearchTags((prev) => (prev.includes(label) ? prev.filter((x) => x !== label) : [...prev, label]));
  };

  const addCustomLabel = () => {
    const t = customLabelDraft.trim();
    if (!t || t.length > 100) return;
    setLabelSearchTags((prev) => (prev.includes(t) ? prev : [...prev, t]));
    setCustomLabelDraft("");
  };

  const handleApply = async () => {
    if (!selectedId) return;
    setApplying(true);
    setApplyError("");
    try {
      const res = await fetch("/api/projects/blockbuster-replace-clip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clipIndex, videoId: selectedId }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; project?: Record<string, unknown> };
      if (!res.ok) {
        setApplyError(data.error ?? (res.statusText || "Replace failed"));
        return;
      }
      if (data.project) onProjectUpdated(data.project);
      onClose();
    } catch (e: unknown) {
      setApplyError(e instanceof Error ? e.message : String(e));
    } finally {
      setApplying(false);
    }
  };

  const overlayStyle: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.55)",
    zIndex: 2000,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  };

  const panelStyle: React.CSSProperties = {
    width: "min(720px, 100%)",
    maxHeight: "min(86vh, 720px)",
    background: "#1e1e1e",
    border: "1px solid #444",
    borderRadius: 8,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
  };

  const btnStyle: React.CSSProperties = {
    padding: "6px 14px",
    borderRadius: 4,
    border: "1px solid #555",
    background: "#333",
    color: "#ddd",
    cursor: "pointer",
    fontSize: 12,
  };

  const modeBtn = (active: boolean): React.CSSProperties => ({
    ...btnStyle,
    flex: 1,
    background: active ? "#3a5a7a" : "#2a2a2a",
    color: active ? "#fff" : "#888",
    border: active ? "1px solid #6aaacc" : "1px solid #444",
  });

  const catalogCloud = (mode: "textFilter" | "labelPick") => (
    <div
      style={{
        marginTop: 8,
        maxHeight: 112,
        overflowY: "auto",
        display: "flex",
        flexWrap: "wrap",
        gap: 5,
        alignContent: "flex-start",
      }}
    >
      {labelsLoaded && catalog.length === 0 && !catalogError ? (
        <span style={{ fontSize: 10, color: "#666" }}>No catalog labels returned (empty index or unexpected JSON).</span>
      ) : !labelsLoaded ? (
        <span style={{ fontSize: 10, color: "#555" }}>Loading labels…</span>
      ) : (
        catalog.map((c) => (
          <LabelChip
            key={c.label}
            text={c.label}
            sub={`${c.count}`}
            active={mode === "textFilter" ? textFilterLabels.includes(c.label) : labelSearchTags.includes(c.label)}
            onClick={() => (mode === "textFilter" ? toggleTextFilterLabel(c.label) : toggleLabelSearchTag(c.label))}
          />
        ))
      )}
    </div>
  );

  return (
    <div style={overlayStyle} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div style={panelStyle} onMouseDown={(e) => e.stopPropagation()}>
        <div style={{ padding: "14px 16px", borderBottom: "1px solid #333", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#eee" }}>Replace clip</div>
            <div style={{ fontSize: 11, color: "#888", fontFamily: "monospace", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis" }}>
              {clipLabel} · index {clipIndex}
            </div>
          </div>
          <button type="button" onClick={onClose} style={{ ...btnStyle, flexShrink: 0 }}>
            Close
          </button>
        </div>

        <div style={{ padding: "10px 16px", borderBottom: "1px solid #333", display: "flex", gap: 8 }}>
          <button type="button" style={modeBtn(searchMode === "text")} onClick={() => setSearchMode("text")}>
            Text search
          </button>
          <button type="button" style={modeBtn(searchMode === "labels")} onClick={() => setSearchMode("labels")}>
            Search by label
          </button>
        </div>

        <div style={{ padding: "12px 16px", borderBottom: "1px solid #333", overflowY: "auto", maxHeight: 260 }}>
          {catalogError ? (
            <div style={{ fontSize: 11, color: "#c66", marginBottom: 8 }}>{catalogError}</div>
          ) : null}

          {searchMode === "text" ? (
            <>
              <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 6 }}>Semantic text query</label>
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g. factory workers at dusk"
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "8px 10px",
                  borderRadius: 4,
                  border: "1px solid #444",
                  background: "#111",
                  color: "#eee",
                  fontSize: 13,
                }}
              />
              <div style={{ fontSize: 10, color: "#666", marginTop: 8 }}>Optional: narrow results to assets that have these catalog labels (TwelveLabs metadata).</div>
              {catalogCloud("textFilter")}
              {textFilterLabels.length > 0 && (
                <button
                  type="button"
                  onClick={() => setTextFilterLabels([])}
                  style={{ ...btnStyle, marginTop: 8, fontSize: 10, padding: "4px 10px" }}
                >
                  Clear label filters
                </button>
              )}
            </>
          ) : (
            <>
              <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 6 }}>
                Videos matching labels (asset server <code style={{ color: "#aaa" }}>/index/search/labels</code>)
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#ccc", marginBottom: 8 }}>
                <input type="checkbox" checked={labelMatchAll} onChange={(e) => setLabelMatchAll(e.target.checked)} />
                Require all selected labels
              </label>
              <div style={{ fontSize: 10, color: "#888", marginBottom: 4 }}>Tap labels below or add a custom tag.</div>
              {catalogCloud("labelPick")}
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <input
                  value={customLabelDraft}
                  onChange={(e) => setCustomLabelDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCustomLabel())}
                  placeholder="Custom label"
                  style={{
                    flex: 1,
                    padding: "6px 10px",
                    borderRadius: 4,
                    border: "1px solid #444",
                    background: "#111",
                    color: "#eee",
                    fontSize: 12,
                  }}
                />
                <button type="button" onClick={addCustomLabel} style={btnStyle}>
                  Add
                </button>
              </div>
              {labelSearchTags.length > 0 && (
                <div style={{ marginTop: 10, fontSize: 10, color: "#aaa" }}>
                  Searching: {labelSearchTags.join(", ")}
                  <button
                    type="button"
                    onClick={() => setLabelSearchTags([])}
                    style={{ ...btnStyle, marginLeft: 8, fontSize: 10, padding: "2px 8px" }}
                  >
                    Clear
                  </button>
                </div>
              )}
            </>
          )}

          {searching && <div style={{ fontSize: 10, color: "#666", marginTop: 8 }}>Searching…</div>}
          {searchError && <div style={{ fontSize: 11, color: "#f66", marginTop: 8 }}>{searchError}</div>}
        </div>

        <div ref={setHitListRoot} style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "8px 12px" }}>
          {hits.length === 0 && !searching && searchMode === "text" && query.trim().length >= 2 && !searchError && (
            <div style={{ fontSize: 12, color: "#666", padding: 8 }}>No hits.</div>
          )}
          {hits.length === 0 && !searching && searchMode === "labels" && labelSearchTags.length > 0 && !searchError && (
            <div style={{ fontSize: 12, color: "#666", padding: 8 }}>No hits.</div>
          )}
          {hits.map((h) => {
            const sel = selectedId === h.video_id;
            const title = h.filename || h.video_id;
            return (
              <button
                key={h.video_id}
                type="button"
                onClick={() => setSelectedId(h.video_id)}
                style={{
                  display: "flex",
                  alignItems: "stretch",
                  gap: 10,
                  width: "100%",
                  textAlign: "left",
                  marginBottom: 8,
                  padding: 8,
                  borderRadius: 6,
                  border: sel ? "1px solid #6aaacc" : "1px solid #333",
                  background: sel ? "#252a30" : "#181818",
                  color: "#ddd",
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                <HitPreview videoId={h.video_id} listRoot={hitListRoot} />
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                  <div style={{ fontWeight: 600, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
                  <div style={{ fontSize: 10, color: "#888", fontFamily: "monospace", marginTop: 4, wordBreak: "break-all" }}>
                    {h.video_id} · score {h.score.toFixed(3)}
                  </div>
                  {h.labels && h.labels.length > 0 ? (
                    <div style={{ fontSize: 10, color: "#9ab", marginTop: 6, lineHeight: 1.35 }}>{h.labels.join(", ")}</div>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>

        <div style={{ padding: "12px 16px", borderTop: "1px solid #333", display: "flex", gap: 10, alignItems: "center" }}>
          {applyError && <span style={{ flex: 1, fontSize: 11, color: "#f66" }}>{applyError}</span>}
          <div style={{ flex: 1 }} />
          <button
            type="button"
            disabled={!selectedId || applying}
            onClick={() => void handleApply()}
            style={{ ...btnStyle, background: selectedId ? "#3a5a7a" : "#2a2a2a", color: selectedId ? "#fff" : "#666" }}
          >
            {applying ? "Applying…" : "Use selected video"}
          </button>
        </div>
      </div>
    </div>
  );
};
