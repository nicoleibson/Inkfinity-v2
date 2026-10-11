/** @type {import('next').NextConfig} */
const nextConfig = {
  productionBrowserSourceMaps: false,
  /* config options here */
  webpack: (config, { dev }) => {
    if (dev) {
      config.devtool = false;
    }
    config.externals.push('pino-pretty', 'lokijs', 'encoding');
    // @coinbase/cdp-sdk and @base-org/account are transitively and optionally pulled
    // by @reown/appkit-adapter-ethers. They are unused by Inkfinity and pull in
    // massive Solana/CDP module trees that overwhelm dev memory.
    config.resolve.alias = {
      ...config.resolve.alias,
      '@coinbase/cdp-sdk': false,
      '@base-org/account': false,
      '@solana/web3.js': false,
      '@solana/kit': false,
      '@solana/rpc': false,
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
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; worker-src 'self' blob:; child-src 'self' blob:; connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://*.appspot.com https://*.googleusercontent.com https://api.worldcoin.org https://api.world.org https://*.vercel.app https://cloudflare-eth.com https://polygon-rpc.com https://rpc-amoy.polygon.technology https://worldchain-mainnet.g.alchemy.com https://worldchain-sepolia.g.alchemy.com; img-src 'self' data: blob: https:; media-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; frame-src 'self' https://auth.walletconnect.com https://verify.walletconnect.com https://*.walletconnect.com; object-src 'none'; base-uri 'self';"
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin'
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(self), microphone=(self), geolocation=(), interest-cohort=()'
          }
        ]
      }
    ];
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
        hostname: 'firebasestorage.googleapis.com',
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
        "inkfinity-ten.vercel.app",
        "*.vercel.app",
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