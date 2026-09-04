/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // keep the heavy market SDK out of the client/server bundle; the /api/markets
    // route requires it at runtime from node_modules.
    serverComponentsExternalPackages: ["@somnia-chain/markets-sdk"],
    // @vercel/nft (the file tracer) crashes ("RangeError: Division by zero") walking one of
    // these dependency trees. None of them need tracing: the wallet-connector extras are
    // client-only and aliased out in webpack below; the market SDK is external (line above).
    outputFileTracingExcludes: {
      "*": [
        "node_modules/@metamask/**",
        "node_modules/@coinbase/**",
        "node_modules/@base-org/**",
        "node_modules/@walletconnect/**",
        "node_modules/@safe-global/**",
        "node_modules/keccak/**",
        "node_modules/@somnia-chain/**",
      ],
    },
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
