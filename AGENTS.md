# Agent instructions (Cursor / coding agents)

This file is the **canonical** agent guide for **blockbuster-prompt-editor**. (Some tools or people look for `AGENT.md` — that file only points here.)

**When the user asks how to use this app** (“getting started”, “how do I run the editor”, “what do I do first”): give them the steps in **[User guide — getting started](#user-guide--getting-started)** below. Use short numbered steps in your reply; do not assume they have read this file. If something fails, check **Troubleshooting** in that same section.

---

## User guide — getting started

Use this section when onboarding someone who only wants to **run and use** the editor (not extend the codebase).

### 1. What you need

- **Node.js 20+** (18 may work; 20+ recommended) and **npm**
- A **terminal** in the project folder (`blockbuster-prompt-editor/`)
- **Optional but recommended:** [ffmpeg](https://ffmpeg.org/) installed so `ffprobe` is on your `PATH` (used when **replacing the voiceover** file to read duration automatically)

### 2. One-time setup

```bash
cd blockbuster-prompt-editor
cp .env.example .env
```

Edit **`.env`** and set at least:

| Variable | Why |
|----------|-----|
| `BLOCKBUSTER_API_KEY` | Lets you **import** ads from Blockbuster (same key as Blockbuster v2 API) |
| `ASSET_SERVER_API_KEY` | Lets the editor **search** catalog video, **refresh signed URLs** for clips/music, and **replace b-roll** |

Then install dependencies:

```bash
npm install
(cd remotion-jobs && npm install)
```

> **Rivet sample:** Video/audio under `remotion-jobs/public/` may be missing from git. See `remotion-jobs/public/MEDIA.md` if the bundled Rivet composition has broken media.

### 3. Start the app

```bash
npm run dev
```

Wait until the terminal shows **Vite** on **port 3100** and **Editor API** on **port 3101**.

Open a browser: **[http://localhost:3100](http://localhost:3100)**

If the page loads but API calls fail with **502** or empty errors, the API is not running — use `npm run dev` (starts both), or in two terminals: `npm run dev:server` then `npm run dev:client`.

### 4. Projects (top bar)

- Use the **Project** dropdown to switch between the bundled **Rivet** sample and any **Blockbuster** imports (IDs like `bb-…`).
- **Import ad:** paste a Blockbuster **ad UUID** or a URL that contains `/ads/<uuid>`. Optionally paste **BB API key** in the small field if it is not in `.env`. Click **Import ad** and wait for the spinner to finish; the new project is selected automatically.

### 5. Main layout

| Area | What it does |
|------|----------------|
| **Center** | **Remotion Player** — scrub and play the active composition |
| **Timeline** (below) | **Rivet:** scene/text/CTA tracks. **Blockbuster:** clips, voiceover, music, captions |
| **Right** | **Chat** (agent / prompt) and **Code** (Monaco) tabs; **Versions** above |
| **Bottom** | **Sync frame**, **Undo**, **Render out** |

### 6. Blockbuster-only shortcuts (simple timeline)

- **Replace b-roll:** **Right-click** a **clip** block → pick a replacement from **asset search** → apply.
- **Replace voiceover:** **Right-click** the **Voiceover** block → choose an audio file from disk → **Replace & re-time**. This copies the file into the workspace, updates `composition-meta.json`, scales **caption word timings**, and stretches **scene duration constants** in the TSX proportionally. If duration detection fails, enter **Duration override (seconds)** in the modal (or install ffmpeg / `ffprobe`).

### 7. Preview and export

- **Generate Preview** — renders a lower-resolution proxy into the project’s `out/` folder; use **Live** / **Preview** toggles to switch between the interactive composition and the finished proxy.
- **Render out** — full export (uses Remotion CLI in the active project); follow the save dialog when prompted (macOS).

### 8. Troubleshooting (users)

| Symptom | What to try |
|---------|-------------|
| Blank or broken UI for `/api/…` | Confirm `npm run dev` is running; API must be on **3101** |
| Import fails | Check `BLOCKBUSTER_API_KEY` in `.env` or paste key in the import field |
| Clips / music won’t play, or replace-clip errors | Set `ASSET_SERVER_API_KEY`; for stale URLs, re-import the ad or call `POST /api/projects/hydrate-blockbuster-assets` (see `README.md`) |
| Voice replace asks for duration | Install ffmpeg so `ffprobe` works, or use the **seconds** override in the modal |

For deeper API and repo layout, see **`README.md`**.

---

## What this repo is

Single-package app: **Vite** (React UI, port **3100**) + **Express** (`server.ts`, port **3101**). Vite proxies `/api` → 3101. **Remotion Player** loads composition modules discovered via `import.meta.glob` from:

- `remotion-jobs/src/**` (bundled **rivet** project)
- `editor-workspaces/**/src/**` (imported **Blockbuster** workspaces, `bb-*` ids)

`REPO_ROOT` in `server-projects.ts` is the **repository root** (directory containing `server.ts`, `src/`, `remotion-jobs/`).

---

## Golden rules

1. **Never commit** `.env`, `.editor-projects.json`, or contents of `editor-workspaces/` (only `.gitkeep` is tracked).
2. **API keys exist only on the server** (`server-integrations.ts`, `server.ts`). Do not move keys to the client or log them.
3. **Prefer small, focused diffs** — match existing style; avoid unrelated refactors.
4. After changing **workspace layout** or **glob paths**, verify `vite.config.ts`, `src/DynamicComposition.tsx`, and `server-projects.ts` (`clientSrcRootRel`, `EDITOR_WORKSPACES_DIR`) stay consistent.
5. **`public/`** at repo root must stay a **symlink** to `remotion-jobs/public` (or document a Windows alternative). Large **video/audio** under `remotion-jobs/public/` is **gitignored**; see `remotion-jobs/public/MEDIA.md`.

---

## Key files (map)

| File | Responsibility |
|------|------------------|
| `server.ts` | All HTTP routes, multer uploads, prompt/render/preview |
| `server-projects.ts` | `.editor-projects.json`, `ProjectRecord`, paths, fingerprint, workspace migration |
| `server-integrations.ts` | Blockbuster + Asset Server fetch helpers (uses `ASSET_SERVER_API_KEY`, etc.) |
| `server-blockbuster-import.ts` | Scaffold `bb-*` workspace + write `composition-meta.json` |
| `server-blockbuster-voiceover-replace.ts` | Local VO file → `public/`, meta + TSX proportional re-time |
| `src/App.tsx` | Player, timeline, tabs, project state, replace-clip / replace-voiceover modals |
| `src/DynamicComposition.tsx` | `import.meta.glob`, `loadCompositionComponent`, Remotion composition mount |
| `src/components/ReplaceClipModal.tsx` | Asset search UI, previews, replace clip |
| `src/components/ReplaceVoiceoverModal.tsx` | Upload local VO, call replace-voiceover API |
| `vite.config.ts` | Aliases (`@video` → `remotion-jobs/src`), `fs.allow`, workspace watcher for HMR |
| `remotion-jobs/` | Default Rivet composition + sample assets |

---

## How to run

*(Same install as [User guide — getting started](#user-guide--getting-started); this block is the short agent reference.)*

```bash
npm install && (cd remotion-jobs && npm install)
cp .env.example .env   # then set keys
npm run dev
```

Typecheck: `npx tsc --noEmit` from repo root.

---

## Domain concepts

- **Project:** entry in registry with `rootDir` (absolute), `compositionModule` (e.g. `RivetAd.tsx`), `compositionId`, dimensions, fps.
- **Blockbuster import:** creates `editor-workspaces/bb-*/` with TSX + `composition-meta.json`; project id starts with `bb-`.
- **Hydration:** server resolves `assetId` → signed `url` in `composition-meta.json` via asset server.
- **Replace clip:** `POST /api/projects/blockbuster-replace-clip` updates one `clips[]` entry, re-hydrates, writes JSON, bumps fingerprint.
- **Replace voiceover:** `POST /api/projects/replace-voiceover` (multipart `audio`) — see `server-blockbuster-voiceover-replace.ts`.

---

## When changing features

- **Timeline / selection:** `src/components/Timeline.tsx`, `src/blockbusterSimpleTimeline.ts`, selection passed to chat/prompt builders in `server.ts` if applicable.
- **Asset UI:** `ReplaceClipModal.tsx` + routes under `/api/assets/*` in `server.ts` + `server-integrations.ts`.
- **Voiceover replace:** `ReplaceVoiceoverModal.tsx` + `POST /api/projects/replace-voiceover` + `server-blockbuster-voiceover-replace.ts`.
- **New API routes:** add in `server.ts`, keep JSON errors as `{ error: string }` for consistent client parsing.

---

## Testing

There is **no** Jest/Vitest suite in-tree as of initial import. Rely on `npx tsc --noEmit` and manual smoke of `npm run dev` (load Player, switch project, import path if keys present).

---

## Docs for external APIs

- Tavern Asset Server: OpenAPI at the default base URL + `/openapi.json` (referenced in original project docs).
- Blockbuster v2: render / TSX download patterns live in `server-integrations.ts` and `server-blockbuster-import.ts`.
