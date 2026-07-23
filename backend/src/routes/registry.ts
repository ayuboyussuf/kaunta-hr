/**
 * Filesystem route auto-loader.
 *
 * Every feature module drops a `*.route.ts` file anywhere under src/routes that
 * default-exports a `RouteModule` ({ basePath, router }). This file discovers and
 * mounts them all at boot — so modules never touch a shared index/registry file
 * and can be built in parallel without merge conflicts.
 */
import fs from "fs";
import path from "path";
import type { Express, Router } from "express";

export interface RouteModule {
  basePath: string; // e.g. "/api/workplaces"
  router: Router;
}

function walk(dir: string, ext: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, ext, out);
    else if (entry.name.endsWith(`.route${ext}`)) out.push(full);
  }
  return out;
}

export function loadRoutes(app: Express): string[] {
  // In dev (ts-node-dev) __dirname → src and files are .ts; in prod → dist/.js.
  const ext = __filename.endsWith(".ts") ? ".ts" : ".js";
  const files = walk(__dirname, ext).sort();
  const mounted: string[] = [];

  for (const file of files) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require(file);
    const route: RouteModule | undefined = mod.default ?? mod.route;
    if (!route?.basePath || !route?.router) {
      console.warn(`[routes] skipping ${file} — no { basePath, router } default export`);
      continue;
    }
    app.use(route.basePath, route.router);
    mounted.push(route.basePath);
  }

  return mounted;
}
