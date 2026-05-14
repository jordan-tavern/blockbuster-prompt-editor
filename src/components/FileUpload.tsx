import React, { useState, useRef, useCallback } from "react";

interface FileUploadProps {
  onUploaded: (info: { path: string; filename: string; type: string }) => void;
}

const ACCEPTED = ".mp4,.mov,.wav,.mp3,.png,.jpg,.jpeg,.pdf,.pptx";

export const FileUpload: React.FC<FileUploadProps> = ({ onUploaded }) => {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = useCallback(
    async (file: File) => {
      setUploading(true);
      setProgress(`Uploading ${file.name}...`);

      const form = new FormData();
      form.append("file", file);

      try {
        const res = await fetch("/api/upload", { method: "POST", body: form });
        const data = await res.json();
        if (data.error) {
          setProgress(`Error: ${data.error}`);
        } else {
          setProgress(`Uploaded: ${data.filename}`);
          onUploaded({ path: data.path, filename: data.filename, type: data.type });
        }
      } catch (err: any) {
        setProgress(`Error: ${err.message}`);
      } finally {
        setUploading(false);
        setTimeout(() => setProgress(""), 3000);
      }
    },
    [onUploaded]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) upload(file);
    },
    [upload]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) upload(file);
      e.target.value = "";
    },
    [upload]
  );

  return (
    <div style={{ padding: "0 12px 8px" }}>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `1px dashed ${dragging ? "#6aaacc" : "#444"}`,
          borderRadius: 6,
          padding: "8px 12px",
          textAlign: "center",
          cursor: "pointer",
          background: dragging ? "rgba(106,170,204,0.08)" : "transparent",
          transition: "all 0.15s",
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          onChange={handleFileSelect}
          style={{ display: "none" }}
        />
        {uploading ? (
          <span style={{ fontSize: 11, color: "#aaa" }}>{progress}</span>
        ) : progress ? (
          <span style={{ fontSize: 11, color: "#6c6" }}>{progress}</span>
        ) : (
          <span style={{ fontSize: 11, color: "#888" }}>
            Drop a file or click to upload
          </span>
        )}
      </div>
    </div>
  );
};
