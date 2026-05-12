import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: '/:zohoId(\\d{10,})',
        destination: '/p/:zohoId',
        permanent: false,
      },
    ]
  },
}

export default nextConfig
