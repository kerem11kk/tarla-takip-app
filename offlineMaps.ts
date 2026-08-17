export async function downloadRegionForOffline(
  bounds: { getSouthWest: () => { lat: number, lng: number }, getNorthEast: () => { lat: number, lng: number } } | any,
  minZoom: number = 13,
  maxZoom: number = 17,
  onProgress?: (progress: number, total: number) => void
) {
  const tileUrls: string[] = [];

  const deg2num = (lat: number, lon: number, zoom: number) => {
    const latRad = lat * (Math.PI / 180);
    const n = Math.pow(2.0, zoom);
    const xtile = Math.floor((lon + 180.0) / 360.0 * n);
    const ytile = Math.floor((1.0 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2.0 * n);
    return { x: xtile, y: ytile };
  };

  for (let z = minZoom; z <= maxZoom; z++) {
    const sw = deg2num((bounds.getSouthWest ? bounds.getSouthWest() : bounds._southWest).lat, (bounds.getSouthWest ? bounds.getSouthWest() : bounds._southWest).lng, z);
    const ne = deg2num((bounds.getNorthEast ? bounds.getNorthEast() : bounds._northEast).lat, (bounds.getNorthEast ? bounds.getNorthEast() : bounds._northEast).lng, z);

    const xMin = Math.min(sw.x, ne.x);
    const xMax = Math.max(sw.x, ne.x);
    const yMin = Math.min(sw.y, ne.y);
    const yMax = Math.max(sw.y, ne.y);

    for (let x = xMin; x <= xMax; x++) {
      for (let y = yMin; y <= yMax; y++) {
        tileUrls.push(`https://tile.openstreetmap.org/${z}/${x}/${y}.png`);
        if (tileUrls.length > 50000) {
          console.warn("Too many tiles requested, stopping generation at 50,000 to prevent crash.");
          break;
        }
      }
      if (tileUrls.length > 50000) break;
    }
    if (tileUrls.length > 50000) break;
  }

  // Remove duplicates
  const uniqueUrls = [...new Set(tileUrls)];
  
  if (uniqueUrls.length === 0) return 0;

  // Open the cache used by our service worker
  const cache = await caches.open('osm-tiles');
  let downloaded = 0;

  // Process in batches so we don't overwhelm the browser or the tile server
  const BATCH_SIZE = 10;
  for (let i = 0; i < uniqueUrls.length; i += BATCH_SIZE) {
    const batch = uniqueUrls.slice(i, i + BATCH_SIZE);
    
    await Promise.all(batch.map(async (url) => {
      try {
        const response = await cache.match(url);
        if (!response) {
          await cache.add(url);
        }
      } catch (err) {
        console.warn('Failed to cache tile:', url, err);
      } finally {
        downloaded++;
      }
    }));
    
    if (onProgress) {
      onProgress(downloaded, uniqueUrls.length);
    }
  }

  return uniqueUrls.length;
}

export function calculateRegionTiles(
  bounds: { getSouthWest: () => { lat: number, lng: number }, getNorthEast: () => { lat: number, lng: number } } | any,
  minZoom: number = 13,
  maxZoom: number = 17
): number {
  let totalTiles = 0;

  const deg2num = (lat: number, lon: number, zoom: number) => {
    const latRad = lat * (Math.PI / 180);
    const n = Math.pow(2.0, zoom);
    const xtile = Math.floor((lon + 180.0) / 360.0 * n);
    const ytile = Math.floor((1.0 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2.0 * n);
    return { x: xtile, y: ytile };
  };

  for (let z = minZoom; z <= maxZoom; z++) {
    const sw = deg2num((bounds.getSouthWest ? bounds.getSouthWest() : bounds._southWest).lat, (bounds.getSouthWest ? bounds.getSouthWest() : bounds._southWest).lng, z);
    const ne = deg2num((bounds.getNorthEast ? bounds.getNorthEast() : bounds._northEast).lat, (bounds.getNorthEast ? bounds.getNorthEast() : bounds._northEast).lng, z);

    const xMin = Math.min(sw.x, ne.x);
    const xMax = Math.max(sw.x, ne.x);
    const yMin = Math.min(sw.y, ne.y);
    const yMax = Math.max(sw.y, ne.y);

    totalTiles += (xMax - xMin + 1) * (yMax - yMin + 1);
  }

  return totalTiles;
}
