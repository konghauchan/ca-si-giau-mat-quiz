import type { NextConfig } from 'next';
const nextConfig: NextConfig = {
  distDir: process.env.BUILD_VERIFY === '1' ? '.next-verify' : '.next',
  serverExternalPackages: ['node:sqlite', 'ffmpeg-static'],
  outputFileTracingRoot: process.cwd(),
  outputFileTracingIncludes: {
    '/api/media/clip': ['./node_modules/ffmpeg-static/ffmpeg*'],
    '/api/media/preview': ['./node_modules/ffmpeg-static/ffmpeg*']
  }
};
export default nextConfig;
