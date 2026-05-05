import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Allow the dashboard page to be rendered fresh on every request
  // (metrics come from KV which updates via sync)
}

export default nextConfig
