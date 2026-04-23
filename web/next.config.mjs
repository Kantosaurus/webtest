/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  // Next 15 caps request bodies passing through its rewrite/middleware
  // pipeline at 10MB by default, and its proxy at 30s. The api accepts up
  // to 32MB (VirusTotal free-tier limit) and the UI advertises 32MB.
  // Without these, uploads >10MB truncate silently and the upstream
  // socket resets — surfacing in the browser as
  // `NetworkError when attempting to fetch resource.`.
  experimental: {
    middlewareClientMaxBodySize: '32mb',
    proxyTimeout: 120_000,
  },
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${process.env.INTERNAL_API_BASE ?? 'http://api:4000'}/api/:path*` },
    ];
  },
};
export default nextConfig;
