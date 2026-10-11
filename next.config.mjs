import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bundleAnalyzer from '@next/bundle-analyzer';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

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

  // Pin the workspace root to this project. Without it Next walks up looking
  // for lockfiles and can pick a parent directory that happens to hold one.
  // Both settings must name the same directory.
  outputFileTracingRoot: projectRoot,
  turbopack: {
    root: projectRoot,
  },

  // Allow development access from local network IP
  allowedDevOrigins: ['192.168.0.17', '192.168.0.17:3000'],
};

export default withBundleAnalyzer(nextConfig);
