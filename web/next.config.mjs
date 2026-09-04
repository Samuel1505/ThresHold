/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // keep the heavy market SDK out of the client/server bundle; the /api/markets
    // route requires it at runtime from node_modules.
    serverComponentsExternalPackages: ["@somnia-chain/markets-sdk"],
  },
  webpack: (config) => {
    config.externals.push("pino-pretty", "lokijs", "encoding");
    config.resolve.alias = {
      ...config.resolve.alias,
      "@x402/evm": false,
      "@x402/svm": false,
      "@x402/svm/exact/client": false,
      "@coinbase/cdp-sdk": false,
      "@base-org/account": false,
    };
    return config;
  },
};

export default nextConfig;
