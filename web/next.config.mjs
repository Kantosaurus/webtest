/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${process.env.INTERNAL_API_BASE ?? 'http://api:4000'}/api/:path*` },
    ];
  },
};
export default nextConfig;
