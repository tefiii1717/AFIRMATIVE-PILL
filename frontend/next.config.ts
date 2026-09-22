import type { NextConfig } from 'next';
import path from 'node:path';

/**
 * Zero-REST: este frontend NO define rutas /api ni route handlers. Toda la
 * comunicación con el backend ocurre mediante Apollo Client contra /graphql.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: { root: path.resolve(__dirname) },
};

export default nextConfig;
