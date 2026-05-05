import { NextResponse } from 'next/server'
import { getMetrics } from '@/lib/kv'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ zohoId: string }> },
) {
  const { zohoId } = await params
  const metrics = await getMetrics(zohoId)

  if (!metrics) {
    return NextResponse.json(
      { error: 'No data found. Run /api/sync first.' },
      { status: 404 },
    )
  }

  return NextResponse.json(metrics)
}
