import { computeSatellites } from '@/lib/orbital';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const satellites = computeSatellites(new Date());
  return Response.json({ satellites, total: satellites.length });
}
