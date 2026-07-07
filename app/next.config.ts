import path from "node:path";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // Local workspace package (file:../packages/doc-engine) — ship its ESM dist
  // through Next's bundler so the symlinked source outside the app root
  // resolves and transpiles.
  transpilePackages: ["@derech/doc-engine"],
  turbopack: {
    // The doc-engine lives at ../packages/doc-engine (symlinked into
    // node_modules). Turbopack won't resolve files outside its project root,
    // so point the root at the monorepo parent that contains BOTH app/ and
    // packages/. Per Next docs (turbopack.root, linked-dependency guidance).
    root: path.join(__dirname, ".."),
  },
};

export default withNextIntl(nextConfig);
