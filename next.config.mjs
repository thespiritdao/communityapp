// Deployment-specific hosts, derived from the environment at build time.
const originOf = (url) => {
  try {
    return url ? new URL(url).origin : '';
  } catch {
    return '';
  }
};
const SUPABASE_ORIGIN = originOf(process.env.NEXT_PUBLIC_SUPABASE_URL);
const SUPABASE_HOST = SUPABASE_ORIGIN ? new URL(SUPABASE_ORIGIN).hostname : '';
const LIVEKIT_ORIGIN = originOf(
  (process.env.NEXT_PUBLIC_LIVEKIT_URL || process.env.LIVEKIT_URL || '').replace(/^ws/, 'http'),
);
const FILES_ORIGIN = originOf(process.env.NEXT_PUBLIC_FILES_HOST);
const cspHosts = (...hosts) => hosts.filter(Boolean).join(' ');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Disable React Strict Mode in development for faster loading
  // Strict Mode causes double-rendering which slows down auth flows
  reactStrictMode: process.env.NODE_ENV === 'production',
  // (OnchainKit removed 2026-11; no packages need transpiling)
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

      // Optimize chunk splitting for better loading performance
      config.optimization = {
        ...config.optimization,
        splitChunks: {
          chunks: 'all',
          cacheGroups: {
            // REMOVED: Aggressive CSS chunk splitting that caused FOUC (Flash of Unstyled Content)
            // CSS is now loaded inline with components for faster initial render
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
      ...(SUPABASE_HOST
        ? [{ protocol: 'https', hostname: SUPABASE_HOST, pathname: '/**' }]
        : []),
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
              script-src 'self' 'unsafe-eval' 'unsafe-inline' https://keys.coinbase.com https://js.stripe.com https://www.googletagmanager.com;
              connect-src 'self'
                https://www.googletagmanager.com
                https://www.google-analytics.com
                https://*.google-analytics.com
                https://analytics.google.com
                https://*.coinbase.com
                https://*.wallet.coinbase.com
                wss://*.wallet.coinbase.com
                https://api.developer.coinbase.com
                https://api.cdp.coinbase.com
                https://onramp-buy.coinbase.com
                https://keys.coinbase.com
                https://mainnet.base.org
                https://base-mainnet.infura.io
                ${cspHosts(SUPABASE_ORIGIN, SUPABASE_ORIGIN.replace(/^https/, 'wss'))}
                https://api.thegraph.com
                https://gateway-arbitrum.network.thegraph.com
                https://api.pinata.cloud
                https://uploads.pinata.cloud
                https://gateway.pinata.cloud
                https://ipfs.io
                https://api.stripe.com
                https://*.livekit.cloud
                wss://*.livekit.cloud
                ${cspHosts(LIVEKIT_ORIGIN, LIVEKIT_ORIGIN.replace(/^https/, 'wss'))}
                https://tiles.openfreemap.org;
              worker-src 'self' blob:;
              child-src 'self' blob:;
              img-src 'self' data: blob: https:
                https://ipfs.io
                https://gateway.pinata.cloud
                https://cloudflare-ipfs.com
                https://dweb.link
                https://ui-avatars.com;
              style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
              font-src 'self' https://fonts.gstatic.com;
              media-src 'self' ${cspHosts(FILES_ORIGIN)};
              frame-src 'self'
                https://*.coinbase.com
                https://keys.coinbase.com
                https://js.stripe.com
                https://hooks.stripe.com;
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
