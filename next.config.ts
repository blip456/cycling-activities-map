import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @napi-rs/canvas is a native module — keep it out of the bundler.
  serverExternalPackages: ["@napi-rs/canvas"],
};

export default nextConfig;
