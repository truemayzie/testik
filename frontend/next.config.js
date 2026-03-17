/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "avatars.yandex.net" },
      { protocol: "https", hostname: "sun9-*.userapi.com" },
      { protocol: "https", hostname: "vk.com" },
    ],
  },
};
module.exports = nextConfig;
