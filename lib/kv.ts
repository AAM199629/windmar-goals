import { Redis } from '@upstash/redis'
import type { GoalsMetrics } from './metrics'

const redis = new Redis({
  url:   process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

const PREFIX = 'goals'

function key(zohoId: string) {
  return `${PREFIX}:metrics:${zohoId}`
}

export async function getMetrics(zohoId: string): Promise<GoalsMetrics | null> {
  return redis.get<GoalsMetrics>(key(zohoId))
}

export async function setMetrics(zohoId: string, metrics: GoalsMetrics): Promise<void> {
  // TTL 25 hours — expires before next daily sync
  await redis.set(key(zohoId), metrics, { ex: 60 * 60 * 25 })
}

export async function getAllMetricKeys(): Promise<string[]> {
  return redis.keys(`${PREFIX}:metrics:*`)
}

export interface MemberEntry { zohoId: string; name: string }

export async function setMembersList(members: MemberEntry[]): Promise<void> {
  await redis.set(`${PREFIX}:members`, members, { ex: 60 * 60 * 25 })
}

export async function getMembersList(): Promise<MemberEntry[]> {
  return (await redis.get<MemberEntry[]>(`${PREFIX}:members`)) ?? []
}

export async function getAllMetrics(): Promise<GoalsMetrics[]> {
  const keys = await getAllMetricKeys()
  if (!keys.length) return []
  const results = await redis.mget<GoalsMetrics[]>(...keys)
  return results.filter((r): r is GoalsMetrics => r !== null)
}
