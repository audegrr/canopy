import type { NextConfig } from 'next'
const nextConfig: NextConfig = {
  // @sparticuz/chromium's Brotli-compressed Chromium binary isn't picked up
  // by Next's automatic file tracing (it's read at runtime by path, not
  // imported), so it has to be explicitly included for this route's
  // serverless function bundle — otherwise chromium.executablePath() fails
  // with "the input directory ... does not exist" at runtime.
  outputFileTracingIncludes: {
    '/api/export-pdf': ['./node_modules/@sparticuz/chromium/bin/**/*'],
  },
}
export default nextConfig
