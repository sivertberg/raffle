import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config) => {
    // onnxruntime-web ships .wasm files that webpack needs to treat as assets
    config.resolve.alias = {
      ...config.resolve.alias,
      // Force onnxruntime-web to use the non-threaded WASM backend
      // (avoids SharedArrayBuffer / COOP+COEP requirements)
      "onnxruntime-web/all": "onnxruntime-web",
    };

    return config;
  },
};

export default nextConfig;
