/** @type {import('next').NextConfig} */
const nextConfig = {
  productionBrowserSourceMaps: false,
  /* config options here */
  webpack: (config, { dev }) => {
    if (dev) {
      config.devtool = false;
    }
    config.externals.push('pino-pretty', 'lokijs', 'encoding');
    // @coinbase/cdp-sdk (transitively pulled by @reown/appkit-adapter-ethers) does
    // optional dynamic imports of @x402/* client entry points. Stub them out;
    // they are lazy and unused by this app.
    config.resolve.alias = {
      ...config.resolve.alias,
      '@x402/core/client': false,
      '@x402/evm/exact/client': false,
      '@x402/evm/upto/client': false,
      '@x402/evm/exact/v1/client': false,
      '@x402/evm/batch-settlement/client': false,
      '@x402/svm/exact/client': false,
      '@x402/svm/upto/client': false,
      '@x402/svm/exact/v1/client': false,
    };
    return config;
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'placehold.co',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'drive.google.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'ipfs.io',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'gateway.pinata.cloud',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'cloudflare-ipfs.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'w3s.link',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'dweb.link',
        pathname: '/**',
      },
    ],
    unoptimized: false,
  },
  serverExternalPackages: [
    '@google-cloud/functions-framework',
    'firebase-functions',
    'firebase-admin',
    'genkit',
    '@genkit-ai/google-genai',
  ],
  experimental: {
    cpus: 1,
    workerThreads: false,
    webpackMemoryOptimizations: true,
    serverActions: {
      allowedOrigins: [
        "inkfinity-2d470.web.app",
        "*.inkfinity-2d470.web.app",
        "ssrinkfinity2d470-no4spoqgaq-uc.a.run.app",
        "*.run.app",
        "localhost:3000",
      ],
    },
  },
};

module.exports = nextConfig;