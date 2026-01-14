/** @type {import('next').NextConfig} */
const nextConfig = {
  // Disable React Strict Mode in development for faster loading
  // Strict Mode causes double-rendering which slows down auth flows
  reactStrictMode: process.env.NODE_ENV === 'production',
  transpilePackages: ['@coinbase/onchainkit'],
  outputFileTracingRoot: process.cwd(),
  typescript: {
    // TEMPORARY: Skip type checking during build to prevent OOM errors
    // Type errors are caught during development and in IDE
    ignoreBuildErrors: true,
  },
  eslint: {
    // Skip ESLint during build for faster deployments
    ignoreDuringBuilds: true,
  },
  compiler: {
    styledComponents: true,
    // Remove console statements in production (keeps console.error for critical errors)
    removeConsole:
      process.env.NODE_ENV === 'production'
        ? {
            exclude: ['error'], // Keep console.error for production error tracking
          }
        : false,
  },
  // Enable compression
  compress: true,
  // Optimize chunks to prevent loading issues and improve HMR stability
  webpack: (config, { isServer, dev, webpack }) => {
    // TEMPORARY: Disable minification to see actual CSS error
    if (!dev && !isServer) {
      config.optimization.minimize = false;
    }

    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };

      // Improve HMR stability in development
      if (dev) {
        // Use native file watching instead of polling for better performance
        config.watchOptions = {
          aggregateTimeout: 300,
          ignored: ['**/node_modules/**', '**/.git/**', '**/.next/**'],
        };

        // Enable caching for faster rebuilds (opposite of what was here)
        // This significantly speeds up development server
        config.cache = {
          type: 'filesystem',
          allowCollectingMemory: true,
        };
      }

      // Optimize chunk splitting
      config.optimization = {
        ...config.optimization,
        splitChunks: {
          chunks: 'all',
          cacheGroups: {
            vendor: {
              test: /[\\/]node_modules[\\/]/,
              name: 'vendors',
              chunks: 'all',
              maxSize: 244000, // Limit chunk size to prevent loading issues
            },
          },
        },
      };

      // Add module resolution error handling
      const originalResolve = config.resolve;
      config.resolve = {
        ...originalResolve,
        modules: [...(originalResolve.modules || []), 'node_modules'],
      };
    }
    return config;
  },
  images: {
    formats: ['image/webp', 'image/avif'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 60,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'ipfs.io',
        pathname: '/ipfs/**',
      },
      {
        protocol: 'https',
        hostname: 'bafybeifu6ekty7ufky6wccvq5bx6oge6wjmfftnxa7fqe6bqj6zmajagzm',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'storage.unlock-protocol.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.coinbase.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.wallet.coinbase.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'yqgqodofeliuurrmxlks.supabase.co',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'gateway.pinata.cloud',
        pathname: '/ipfs/**',
      },
      {
        protocol: 'https',
        hostname: 'cloudflare-ipfs.com',
        pathname: '/ipfs/**',
      },
      {
        protocol: 'https',
        hostname: 'dweb.link',
        pathname: '/ipfs/**',
      },
      {
        protocol: 'https',
        hostname: '*.infura-ipfs.io',
        pathname: '/ipfs/**',
      },
      {
        protocol: 'https',
        hostname: 'ui-avatars.com',
        pathname: '/api/**',
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/manifest.json',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET' },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'X-Requested-With, content-type, Authorization',
          },
          { key: 'X-Frame-Options', value: 'ALLOWALL' },
        ],
      },
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: `
              default-src 'self';
              script-src 'self' 'unsafe-eval' 'unsafe-inline' https://keys.coinbase.com;
              connect-src 'self'
                https://*.coinbase.com
                https://*.wallet.coinbase.com
                wss://*.wallet.coinbase.com
                https://api.developer.coinbase.com
                https://api.cdp.coinbase.com
                https://onramp-buy.coinbase.com
                https://keys.coinbase.com
                https://mainnet.base.org
                https://base-mainnet.infura.io
                https://yqgqodofeliuurrmxlks.supabase.co
                wss://yqgqodofeliuurrmxlks.supabase.co
                https://api.thegraph.com
                https://gateway-arbitrum.network.thegraph.com
                https://api.pinata.cloud
                https://uploads.pinata.cloud
                https://gateway.pinata.cloud
                https://ipfs.io;
              img-src 'self' data: https:
                https://ipfs.io
                https://gateway.pinata.cloud
                https://cloudflare-ipfs.com
                https://dweb.link
                https://ui-avatars.com;
              style-src 'self' 'unsafe-inline';
              frame-src 'self'
                https://*.coinbase.com
                https://keys.coinbase.com
                https://spiritdao.pythonanywhere.com;
            `
              .replace(/\s+/g, ' ')
              .trim(),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
