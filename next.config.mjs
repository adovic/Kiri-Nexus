/** @type {import('next').NextConfig} */
const nextConfig = {
  // Force Next.js to run the Firebase SDK through its own bundler so that
  // server and client both resolve to the same module format (no .mjs/.cjs split).
  transpilePackages: ["firebase"],
  serverExternalPackages: ["cheerio"],
};

export default nextConfig;