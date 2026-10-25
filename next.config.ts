import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['better-sqlite3', 'kafkajs', 'firebase-admin'],
  outputFileTracingExcludes: { '/*': ['./data/**/*','./.desktop/**/*','./artifacts/**/*','./*.key','./*.crt','./*.pem','./.env*'] },
  outputFileTracingIncludes: { '/*': ['./node_modules/kafkajs/**/*','./node_modules/better-sqlite3/build/Release/*.node'] },
  /* config options here */
  reactCompiler: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
