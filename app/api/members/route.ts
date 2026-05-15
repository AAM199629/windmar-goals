import { NextResponse } from 'next/server'
import { getMembersList } from '@/lib/kv'

export async function GET() {
  const members = await getMembersList()
  return NextResponse.json(members)
}
