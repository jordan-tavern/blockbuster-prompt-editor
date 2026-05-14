# Blockbuster Prompt Editor

A **local-first** web app for editing **Remotion** video compositions: a bundled **Rivet** sample (`remotion-jobs/`) and **Blockbuster** ads imported into isolated workspaces (`editor-workspaces/`). The UI includes a Remotion **Player**, **timeline** (Rivet layers or Blockbuster simple tracks), **Monaco** source editor, **chat/agent** panel, **asset server** search, **right‑click → replace clip** for Blockbuster projects, versioning, undo, uploads, preview proxy, and render hooks.

This repository is the **application root** (Vite + Express live here alongside `remotion-jobs/`).

**GitHub:** [jordan-tavern/blockbuster-prompt-editor](https://github.com/jordan-tavern/blockbuster-prompt-editor) — default branch **`main`**.

---

## Features (high level)

| Area | What it does |
|------|----------------|
| **Projects** | Switch active project, import Blockbuster ads, hydrate signed asset URLs, replace a clip’s indexed video |
| **Editor** | Edit TS/TSX under each project’s `src/`, glob‑loaded compositions, HMR via fingerprint |
| **Timeline** | Rivet: scenes / text / CTA / layers. Blockbuster: clips / VO / music / captions from `composition-meta.json` |
| **Assets** | Proxy to Tavern Asset Server: label catalog, text + label search, signed URLs, attach to `public/assets/` |
| **Agent** | `/api/prompt` and related flows (see server) |
| **Versions** | Snapshot / restore under each project’s `.editor-versions/` |

---

## Requirements

- **Node.js** 20+ (18 may work; 20+ recommended)
- **npm** (or compatible client)
- **Environment:** at minimum `ASSET_SERVER_API_KEY` for asset search / hydration / clip replace. **Blockbuster import** needs `BLOCKBUSTER_API_KEY` (or pass `apiKey` in the import request body).

Optional URL overrides: `ASSET_SERVER_BASE_URL`, `BLOCKBUSTER_BASE_URL`, `CURSOR_MODEL`, etc. (see `.env.example`).

---

## Quick start

```bash
git clone <your-repo-url> blockbuster-prompt-editor
cd blockbuster-prompt-editor

cp .env.example .env
# Edit .env and set ASSET_SERVER_API_KEY (and BLOCKBUSTER_API_KEY if you use Blockbuster import).

npm install
(cd remotion-jobs && npm install)
```

**Sample video/audio** under `remotion-jobs/public/` is **not stored in git** (see `remotion-jobs/public/MEDIA.md`). Copy those assets from another machine or from a tarball before expecting the Rivet preview to play all scenes.

```bash
npm run dev
```

Then open **http://localhost:3100** (Vite). The browser talks to the API via the dev **proxy**; the API listens on **http://localhost:3101**.

| Script | Purpose |
|--------|---------|
| `npm run dev` | Migrate workspace dir name if needed, then **Vite + `tsx server.ts`** concurrently |
| `npm run dev:client` | Vite only (API must be started separately) |
| `npm run dev:server` | Express API only |

**Static files:** repo root `public/` is a **symlink** → `remotion-jobs/public` (fonts, audio, sample video). On Windows without symlinks, replace with a copy or junction.

---

## Environment variables

| Variable | Required | Role |
|----------|----------|------|
| `ASSET_SERVER_API_KEY` | For asset features | Auth to Tavern Asset Server (search, signed URLs, clip hydration) |
| `BLOCKBUSTER_API_KEY` | For Blockbuster import UI | Blockbuster v2 API when importing an ad |
| `ASSET_SERVER_BASE_URL` | No | Default is the public Cloud Run asset server |
| `BLOCKBUSTER_BASE_URL` | No | Default Blockbuster v2 base URL |
| `CURSOR_MODEL` | No | Model slug for agent/prompt path when used |

Never commit `.env`.

---

## Repository layout

```
blockbuster-prompt-editor/
├── src/                      # React app (Vite entry: src/main.tsx)
├── server.ts                 # Express app + HTTP API
├── server-projects.ts        # Project registry, paths, workspace dir
├── server-integrations.ts    # Blockbuster + Asset Server HTTP (keys server-side only)
├── server-blockbuster-import.ts
├── scripts/migrate-editor-workspaces.ts
├── vite.config.ts            # Port 3100, /api → 3101, @video alias, fs.allow
├── remotion-jobs/            # Bundled Remotion package (default “rivet” project)
├── editor-workspaces/        # Blockbuster imports (bb-* dirs); contents gitignored
├── public → remotion-jobs/public   # Symlink
├── .editor-projects.json     # Created at runtime (gitignored): active project + paths
└── .uploads-tmp/             # Upload scratch (gitignored)
```

**Registry:** `.editor-projects.json` stores **absolute** `rootDir` paths per machine. After clone, the app recreates defaults if the file is missing; re‑import Blockbuster projects if paths from another machine are invalid.

---

## Architecture

- **Frontend:** React 19 + Vite 6. Dev server **proxies** `/api` → Express on **3101** (`vite.config.ts`).
- **Backend:** Node + Express (`server.ts`). Reads/writes project files under each `ProjectRecord.rootDir`.
- **Dynamic compositions:** `src/DynamicComposition.tsx` uses `import.meta.glob` over `../remotion-jobs/src/**/*.tsx` and `../editor-workspaces/**/src/**/*.tsx` (plus legacy dot‑workspace paths). `clientSrcRootRel` in the API payload tells the client which glob subtree to load.
- **Secrets:** Only the **server** calls Asset Server / Blockbuster with API keys. The browser calls **same-origin** `/api/...` only.

---

## HTTP API (cheat sheet)

Grouped by concern (all under `/api` unless noted):

**Projects**

- `GET /api/projects` — list  
- `GET /api/projects/current` — active project + `compositionDefaultProps` when `composition-meta.json` exists  
- `POST /api/projects/active` — set active `{ id }`  
- `POST /api/projects/import-blockbuster` — `{ adId, apiKey? }`  
- `POST /api/projects/hydrate-blockbuster-assets` — refresh signed URLs in `composition-meta.json` (bb-* only)  
- `POST /api/projects/blockbuster-replace-clip` — `{ clipIndex, videoId }` indexed asset (bb-* only)

**Assets (proxy + helpers)**

- `GET /api/assets/labels` — label catalog  
- `GET /api/assets/search?q=…&labels=a,b` — text search (optional label filter)  
- `POST /api/assets/search` — `{ kind: "text", query, k?, labels? }` or `{ kind: "labels", labels, matchAll? }`  
- `GET /api/assets/indexed-signed-url?videoId=` — short‑lived MP4 URL for previews  
- `POST /api/assets/attach` — download asset into active project `public/assets/`

**Files / editor**

- `GET/PUT /api/file/:path`, `GET /api/files`, `GET /api/file-list`, `POST /api/upload`

**Versions & undo**

- `GET/POST /api/versions`, `POST /api/versions/:id/restore`, `DELETE /api/versions/:id`  
- `POST /api/undo`, `GET /api/undo-count`

**Prompt / preview / render**

- `POST /api/prompt`  
- `GET /api/save-dialog`, `POST /api/preview`, `GET /api/preview-file`, `GET /api/preview-status`  
- `POST /api/render`

Exact bodies and errors are defined in `server.ts` and related modules.

---

## Blockbuster vs Rivet

| | **rivet** | **bb-…** |
|---|-----------|----------|
| **Source** | `remotion-jobs/src` | `editor-workspaces/bb-<uuid>/src` |
| **ID prefix** | `rivet` | `bb-` |
| **composition-meta** | Not used | `src/composition-meta.json` drives default props + simple timeline |
| **Clip replace** | N/A | Right‑click clip → modal → asset search → `blockbuster-replace-clip` |

---

## Typecheck (no emit)

```bash
npx tsc --noEmit
```

---

## Troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| **502** on `/api/...` in the browser | Only Vite running — start full `npm run dev` so **3101** is up |
| “Could not load labels” / asset errors | Missing or invalid `ASSET_SERVER_API_KEY`, or network to asset server |
| Blockbuster import fails | Missing `BLOCKBUSTER_API_KEY` or wrong `adId` |
| Player “module not found” after import | Restart dev or refresh — Vite rescans `editor-workspaces` via fingerprint / HMR |
| Broken `public/` | Ensure symlink `public` → `remotion-jobs/public` exists (clone on Windows) |

---

## Security & git

**Do not commit:** `.env`, `.editor-projects.json`, `editor-workspaces/*` (except `.gitkeep`), `.uploads-tmp/`, `node_modules/`, `dist/`.

Large **sample media** lives under `remotion-jobs/public/`. For a smaller public repo, consider Git LFS, trimming b‑roll, or replacing with placeholders.

---

## Agent / AI instructions

For automated agents and coding assistants, see **`AGENTS.md`** in this repo (Cursor and similar tools use that filename by convention). A short pointer file **`AGENT.md`** links there if you look for the singular name.

---

## License

Add a `LICENSE` file when you publish this repo (not included in the initial import).
