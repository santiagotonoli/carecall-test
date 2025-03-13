import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config, { isServer }) => {
    if (isServer) {
      // S'assurer que config.externals est un tableau
      config.externals = Array.isArray(config.externals)
        ? config.externals
        : [config.externals];
      // Ajouter ffmpeg‑static en tant qu'external
      config.externals.push({ 'ffmpeg-static': 'commonjs ffmpeg-static' });
    }
    return config;
  },
};

export default nextConfig;
