import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config) => {
    // Alias pour forcer l'utilisation du module générique
    config.resolve.alias['@ffmpeg-installer/linux-x64'] =
      require.resolve('@ffmpeg-installer/ffmpeg');
    return config;
  },
};

export default nextConfig;
