/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Redirect webpack cache to TEMP to avoid OneDrive file-lock rename errors
  webpack(config, { dev }) {
    if (dev) {
      config.cache = {
        ...config.cache,
        cacheDirectory: require('path').join(
          require('os').tmpdir(),
          'pmo-tracker-next-cache'
        ),
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
