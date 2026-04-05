export const dynamic = 'force-dynamic';
export const revalidate = 0;

const MOCK_EARTHQUAKES = [
  { id: 'mock-1', magnitude: 4.2, place: '15km NNE of Ridgecrest, CA', lat: 35.8, lng: -117.6, time: new Date().toISOString(), depth: 8.2 },
  { id: 'mock-2', magnitude: 5.1, place: '42km WSW of Arica, Chile', lat: -18.5, lng: -70.9, time: new Date().toISOString(), depth: 22.4 },
  { id: 'mock-3', magnitude: 3.8, place: '10km SE of Pahala, Hawaii', lat: 19.2, lng: -155.4, time: new Date().toISOString(), depth: 31.1 },
  { id: 'mock-4', magnitude: 6.0, place: '120km E of Honshu, Japan', lat: 37.2, lng: 142.8, time: new Date().toISOString(), depth: 45.0 },
  { id: 'mock-5', magnitude: 4.7, place: '8km NW of Gaziantep, Turkey', lat: 37.1, lng: 37.3, time: new Date().toISOString(), depth: 12.5 },
];

export async function GET() {
  try {
    const res = await fetch(
      'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson',
      { signal: AbortSignal.timeout(8000) }
    );
    
    if (!res.ok) throw new Error(`USGS returned ${res.status}`);
    
    const data = await res.json();
    const earthquakes = (data.features || []).map((f: { id: string; properties: { mag: number; place: string; time: number }; geometry: { coordinates: number[] } }) => ({
      id: f.id,
      magnitude: f.properties.mag,
      place: f.properties.place,
      lat: f.geometry.coordinates[1],
      lng: f.geometry.coordinates[0],
      time: new Date(f.properties.time).toISOString(),
      depth: f.geometry.coordinates[2],
    }));
    
    if (earthquakes.length === 0) {
      console.warn('[earthquakes] USGS returned 0 features, using mock data');
      return Response.json({ earthquakes: MOCK_EARTHQUAKES, simulated: true });
    }
    
    return Response.json({ earthquakes, total: earthquakes.length });
  } catch (err) {
    console.error('[earthquakes] fetch failed:', err);
    return Response.json({ earthquakes: MOCK_EARTHQUAKES, simulated: true });
  }
}
