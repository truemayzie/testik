/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  experimental: {
    instrumentationHook: true,
    workerThreads: false,
    cpus: 1,
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "avatars.yandex.net" },
      { protocol: "https", hostname: "sun9-*.userapi.com" },
      { protocol: "https", hostname: "vk.com" },
    ],
  },

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ]
  },
};
module.exports = nextConfig;
