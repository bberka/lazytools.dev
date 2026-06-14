import bundleAnalyzer from '@next/bundle-analyzer';

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export for Cloudflare Pages
  output: 'export',

  // Disable image optimization for static export
  images: {
    unoptimized: true,
  },

  // Trailing slashes configuration
  trailingSlash: true,

  // Enable React strict mode for better development experience
  reactStrictMode: true,

  // Allow development access from local network IP
  allowedDevOrigins: ['192.168.0.17', '192.168.0.17:3000'],
};

export default withBundleAnalyzer(nextConfig);
