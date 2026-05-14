import React, { useState, useEffect, useCallback, useRef } from "react";
import Editor, { OnMount } from "@monaco-editor/react";

interface CodeEditorProps {
  onEditApplied?: () => void;
  /** Bump when the active Remotion project changes. */
  projectReloadKey?: number;
}

export const CodeEditor: React.FC<CodeEditorProps> = ({ onEditApplied, projectReloadKey = 0 }) => {
  const [fileList, setFileList] = useState<string[]>([]);
  const [activeFile, setActiveFile] = useState("");
  const [content, setContent] = useState("");
  const [savedContent, setSavedContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState("");
  const editorRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/file-list");
        const data = await res.json();
        const files: string[] = data.files ?? [];
        if (cancelled) return;
        setFileList(files);
        setActiveFile((prev) => (prev && files.includes(prev) ? prev : files[0] ?? ""));
      } catch {
        if (!cancelled) {
          setFileList([]);
          setActiveFile("");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectReloadKey]);

  const loadFile = useCallback(async (filePath: string) => {
    if (!filePath) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/file/${filePath}`);
      const data = await res.json();
      if (data.content != null) {
        setContent(data.content);
        setSavedContent(data.content);
      }
    } catch {}
    setLoading(false);
  }, []);

  // Load file on selection change
  useEffect(() => {
    if (activeFile) loadFile(activeFile);
  }, [activeFile, loadFile]);

  // Poll for external changes (from Claude edits) every 2 seconds
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/file/${activeFile}`);
        const data = await res.json();
        if (data.content != null && data.content !== savedContent) {
          setContent(data.content);
          setSavedContent(data.content);
        }
      } catch {}
    }, 2000);
    return () => clearInterval(interval);
  }, [activeFile, savedContent]);

  const saveFile = useCallback(async () => {
    const res = await fetch(`/api/file/${activeFile}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    const data = await res.json();
    setSavedContent(content);
    setFeedback(data.message || "Saved");
    setTimeout(() => setFeedback(""), 2000);
    onEditApplied?.();
  }, [activeFile, content, onEditApplied]);

  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;

    // Cmd+S / Ctrl+S to save
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      saveFile();
    });
  };

  const isDirty = content !== savedContent;
  const shortName = (f: string) => f.split("/").pop() || f;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* File tree */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 2,
          padding: "8px 8px 4px",
          borderBottom: "1px solid #333",
        }}
      >
        {fileList.map((f) => (
          <button
            key={f}
            onClick={() => setActiveFile(f)}
            style={{
              padding: "3px 8px",
              background: f === activeFile ? "#3a5a7a" : "#252525",
              color: f === activeFile ? "#fff" : "#999",
              border: "1px solid",
              borderColor: f === activeFile ? "#5a8aba" : "#333",
              borderRadius: 3,
              fontSize: 10,
              cursor: "pointer",
              fontFamily: "monospace",
            }}
          >
            {shortName(f)}
          </button>
        ))}
      </div>

      {/* Active file header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "4px 8px",
          gap: 8,
          borderBottom: "1px solid #333",
        }}
      >
        <span style={{ fontSize: 11, color: "#888", fontFamily: "monospace", flex: 1 }}>
          {activeFile}
          {isDirty && <span style={{ color: "#cc8800" }}> (unsaved)</span>}
        </span>
        <button
          onClick={saveFile}
          disabled={!isDirty}
          style={{
            padding: "2px 10px",
            background: isDirty ? "#3a6a3a" : "#333",
            color: isDirty ? "#cfc" : "#666",
            border: "none",
            borderRadius: 3,
            fontSize: 10,
            cursor: isDirty ? "pointer" : "default",
          }}
        >
          Save
        </button>
        {feedback && (
          <span style={{ fontSize: 10, color: "#6c6", fontFamily: "monospace" }}>{feedback}</span>
        )}
      </div>

      {/* Monaco editor */}
      <div style={{ flex: 1, minHeight: 0 }}>
        {loading ? (
          <div style={{ padding: 20, color: "#666" }}>Loading...</div>
        ) : (
          <Editor
            height="100%"
            language="typescript"
            theme="vs-dark"
            value={content}
            onChange={(val) => setContent(val || "")}
            onMount={handleEditorMount}
            options={{
              fontSize: 12,
              minimap: { enabled: false },
              lineNumbers: "on",
              wordWrap: "on",
              tabSize: 2,
              scrollBeyondLastLine: false,
              automaticLayout: true,
            }}
          />
        )}
      </div>
    </div>
  );
};
