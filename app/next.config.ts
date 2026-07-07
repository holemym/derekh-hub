import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  experimental: {
    // Document-vault uploads (death-cert scans, ID copies) and the base64
    // permit save both flow through Server Actions; the 1MB default is too
    // small for scans. Cap generously — the private bucket is the real store.
    serverActions: {
      bodySizeLimit: "15mb",
    },
  },
};

export default withNextIntl(nextConfig);
