import { NextResponse } from 'next/server';
import { getXoilacMatches } from '@/lib/xoilac';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const matches = await getXoilacMatches();
    return NextResponse.json({ matches, success: true });
  } catch (error: any) {
    return NextResponse.json(
      { matches: [], success: false, error: error?.message || 'Error fetching Xoilac matches' },
      { status: 500 }
    );
  }
}
