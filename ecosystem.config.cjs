/** PM2: prod frontend :3000, staging (дизайн) :3001. Backend не трогать при деплое staging. */
module.exports = {
  apps: [
    {
      name: "frontend",
      cwd: "/var/www/ref-ai/frontend",
      script: "npm",
      args: "run start",
      env: {
        NODE_ENV: "production",
        PORT: "3000",
      },
    },
    {
      name: "frontend-staging",
      cwd: "/var/www/ref-ai/frontend",
      script: "npm",
      args: "run start:staging",
      env: {
        NODE_ENV: "production",
        PORT: "3001",
        NEXT_BUILD_DIR: ".next-staging",
        NEXTAUTH_URL: "https://staging.ref-ai.ru",
        NEXT_PUBLIC_APP_URL: "https://staging.ref-ai.ru",
        NEXT_PUBLIC_IS_STAGING: "1",
      },
    },
  ],
};
