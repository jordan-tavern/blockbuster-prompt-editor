/**
 * Run before Vite so import.meta.glob can resolve TSX under `editor-workspaces/` (non-dot path).
 * Vite does not reliably include `.editor-workspaces/` in dev globs.
 */
import { ensureEditorWorkspacesMigrated } from "../server-projects.js";

await ensureEditorWorkspacesMigrated();
