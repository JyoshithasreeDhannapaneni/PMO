/** @type {import('next').NextConfig} */
const path = require('path');
const os = require('os');

const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  webpack(config, { dev, isServer, webpack }) {
    // Redirect webpack cache outside OneDrive to prevent rename/lock errors
    if (dev) {
      config.cache = {
        type: 'filesystem',
        cacheDirectory: path.join(os.homedir(), 'pmo-webpack-cache'),
        buildDependencies: { config: [__filename] },
      };
    }

    // Stub Node built-ins used by jsPDF and similar libs on the client bundle
    if (!isServer) {
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(/^node:/, (resource) => {
          resource.request = resource.request.replace(/^node:/, '');
        })
      );
      config.resolve = config.resolve || {};
      config.resolve.fallback = {
        ...(config.resolve.fallback || {}),
        fs: false, path: false, os: false, crypto: false,
        stream: false, buffer: false, util: false, assert: false,
        url: false, zlib: false, http: false, https: false,
        net: false, tls: false, process: false, events: false,
      };
    }

    return config;
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
