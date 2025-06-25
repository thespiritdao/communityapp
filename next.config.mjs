/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@coinbase/onchainkit'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'ipfs.io',
        pathname: '/ipfs/**',
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
    ],
    domains: [
      "yqgqodofeliuurrmxlks.supabase.co"
    ],
  },
  async headers() {
    return [
      {
        source: '/manifest.json',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET' },
          { key: 'Access-Control-Allow-Headers', value: 'X-Requested-With, content-type, Authorization' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'self' https://app.safe.global;" },
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
                https://mainnet.base.org
                https://*.infura.io
                https://base-mainnet.infura.io
                https://yqgqodofeliuurrmxlks.supabase.co;
              img-src 'self' data: https:;
              style-src 'self' 'unsafe-inline';
              frame-src 'self' https://*.coinbase.com;
            `.replace(/\s+/g, ' ').trim()
          }
        ]
      }
    ];
  },
};

export default nextConfig;