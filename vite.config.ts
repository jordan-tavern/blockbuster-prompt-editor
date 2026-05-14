import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import fs from "fs";

/**
 * `import.meta.glob("../editor-workspaces/**")` is fixed at transform time. When a new
 * Blockbuster import writes TSX under `editor-workspaces/`, invalidate this module so Vite
 * rescans and new keys appear in `allModules`.
 */
function invalidateWorkspaceCompositionGlob(): Plugin {
  const invalidateDynamicComposition = (server: import("vite").ViteDevServer) => {
    const dc = path.resolve(__dirname, "src/DynamicComposition.tsx");
    const set = server.moduleGraph.getModulesByFile(dc);
    if (!set) return;
    for (const mod of set) server.moduleGraph.invalidateModule(mod);
  };

  return {
    name: "invalidate-workspace-composition-glob",
    configureServer(server) {
      const wsRoot = path.resolve(__dirname, "editor-workspaces");
      try {
        fs.mkdirSync(wsRoot, { recursive: true });
      } catch {
        /* ignore */
      }
      server.watcher.add(wsRoot);

      const maybeInvalidate = (raw: string) => {
        const fp = path.normalize(raw);
        const root = path.normalize(wsRoot);
        if (!fp.startsWith(root)) return;
        if (!/\.(tsx|ts|json|mp3|wav|m4a|aac|flac|ogg)$/i.test(fp)) return;
        invalidateDynamicComposition(server);
      };

      server.watcher.on("add", maybeInvalidate);
      server.watcher.on("unlink", maybeInvalidate);
      server.watcher.on("change", maybeInvalidate);
    },
    handleHotUpdate({ file, server }) {
      const n = path.normalize(file);
      if (n.endsWith(`${path.sep}__projects-fingerprint.ts`)) {
        invalidateDynamicComposition(server);
      }
    },
  };
}

/**
 * Remotion's staticFile() returns paths like /public/broll/foo.mp4
 * but Vite serves the public dir at /. This middleware rewrites
 * /public/* requests to /* so the files are found.
 */
function remotionPublicRewrite(): Plugin {
  return {
    name: "remotion-public-rewrite",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url?.startsWith("/public/")) {
          req.url = req.url.replace("/public/", "/");
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), remotionPublicRewrite(), invalidateWorkspaceCompositionGlob()],
  resolve: {
    alias: {
      "@video": path.resolve(__dirname, "remotion-jobs/src"),
      // Force a single React instance — prevents "useCurrentFrame outside Player" error
      // caused by the composition resolving React from remotion/node_modules
      "react": path.resolve(__dirname, "node_modules/react"),
      "react-dom": path.resolve(__dirname, "node_modules/react-dom"),
      "remotion": path.resolve(__dirname, "node_modules/remotion"),
    },
  },
  server: {
    port: 3100,
    fs: {
      allow: [
        path.resolve(__dirname, "."),
        path.resolve(__dirname, "remotion-jobs"),
        path.resolve(__dirname, "editor-workspaces"),
        path.resolve(__dirname, ".editor-workspaces"),
        path.resolve(__dirname, "editor-workspace"),
      ],
    },
    proxy: {
      "/api": "http://localhost:3101",
    },
  },
});
