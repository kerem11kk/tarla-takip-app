import * as turf from '@turf/turf';
import { FieldRecord } from '../types';

/**
 * Calculates the area of a field's polygon in square meters.
 */

const areaCache = new WeakMap<any, number>();
const stringAreaCache = new Map<string, number>();

const topRightCache = new WeakMap<any, { latitude: number; longitude: number }>();
const stringTopRightCache = new Map<string, { latitude: number; longitude: number }>();

export function calculateFieldAreaSqMeters(polygon: any): number {
  if (!polygon) return 0;
  
  if (typeof polygon === 'object') {
    if (areaCache.has(polygon)) return areaCache.get(polygon)!;
  } else if (typeof polygon === 'string') {
    if (stringAreaCache.has(polygon)) return stringAreaCache.get(polygon)!;
  }

  
  try {
    // If the polygon is stored as a string, parse it
    let geometry = typeof polygon === 'string' ? JSON.parse(polygon) : polygon;
    let result = 0;
    if (geometry.type === 'FeatureCollection' || geometry.type === 'Feature') {
      result = turf.area(geometry);
    } else {
      const feature = turf.feature(geometry);
      result = turf.area(feature);
    }
    
    if (typeof polygon === 'object') {
      areaCache.set(polygon, result);
    } else if (typeof polygon === 'string') {
      stringAreaCache.set(polygon, result);
      if (stringAreaCache.size > 100) {
        const firstKey = stringAreaCache.keys().next().value;
        stringAreaCache.delete(firstKey);
      }
    }
    return result;
  } catch (err) {
    console.error("Error calculating area:", err);
    return 0;
  }
}

/**
 * Converts square meters to Dönüm (1 Dönüm = 1000 square meters)
 */
export function formatAreaDomum(sqMeters: number): string {
  const donum = sqMeters / 1000;
  // If it's less than 0.1, maybe show it with more precision or something, but usually 2 decimals is fine.
  return donum.toLocaleString('tr-TR', { maximumFractionDigits: 2 });
}

export function getTotalAreaDonum(fields: FieldRecord[]): number {
  let totalSqMeters = 0;
  fields.forEach(f => {
    totalSqMeters += calculateFieldAreaSqMeters(f.polygon);
  });
  return totalSqMeters / 1000;
}

export function getCentroidCoordinate(polygon: any): { latitude: number; longitude: number } | null {
  if (!polygon) return null;
  try {
    let geometry = typeof polygon === 'string' ? JSON.parse(polygon) : polygon;
    let feature;
    if (geometry.type === 'FeatureCollection') {
       if (geometry.features.length === 0) return null;
       feature = geometry.features[0];
    } else if (geometry.type === 'Feature') {
       feature = geometry;
    } else {
       feature = turf.feature(geometry);
    }
    const centroid = turf.centroid(feature);
    const coords = centroid.geometry.coordinates; // [lng, lat]
    return { latitude: coords[1], longitude: coords[0] };
  } catch (err) {
    console.error("Error getting centroid:", err);
    return null;
  }
}

/**
 * Gets the top-right coordinate (max lat, max lng) of a polygon
 */
export function getTopRightCoordinate(polygon: any, defaultLat: number, defaultLng: number): { latitude: number; longitude: number } {
  if (!polygon) return { latitude: defaultLat, longitude: defaultLng };

  if (typeof polygon === 'object') {
    if (topRightCache.has(polygon)) return topRightCache.get(polygon)!;
  } else if (typeof polygon === 'string') {
    if (stringTopRightCache.has(polygon)) return stringTopRightCache.get(polygon)!;
  }

  try {
    let geometry = typeof polygon === 'string' ? JSON.parse(polygon) : polygon;
    let coords: number[][] = [];
    
    if (geometry.type === 'FeatureCollection') {
      geometry.features.forEach((f: any) => {
        if (f.geometry && f.geometry.coordinates) {
          f.geometry.coordinates.forEach((ring: any) => {
            if (Array.isArray(ring[0])) {
               ring.forEach((c: any) => coords.push(c));
            } else {
               coords.push(ring);
            }
          });
        }
      });
    } else if (geometry.type === 'Feature' && geometry.geometry) {
      geometry.geometry.coordinates.forEach((ring: any) => {
         if (Array.isArray(ring[0])) {
             ring.forEach((c: any) => coords.push(c));
         } else {
             coords.push(ring);
         }
      });
    } else if (geometry.coordinates) {
      geometry.coordinates.forEach((ring: any) => {
         if (Array.isArray(ring[0])) {
             ring.forEach((c: any) => coords.push(c));
         } else {
             coords.push(ring);
         }
      });
    }
    
    if (coords.length === 0) return { latitude: defaultLat, longitude: defaultLng };
    
    // GeoJSON is usually [lng, lat]
    let maxLat = -90;
    let maxLng = -180;
    
    // Some L.geoJSON coordinates might be nested further in MultiPolygon, safe flat approach:
    const flatCoords: [number, number][] = [];
    const extract = (arr: any[]) => {
      if (!arr || arr.length === 0) return;
      if (typeof arr[0] === 'number' && typeof arr[1] === 'number') {
        flatCoords.push([arr[0], arr[1]]);
      } else if (Array.isArray(arr[0])) {
        arr.forEach(extract);
      }
    };
    extract(geometry.coordinates || (geometry.geometry && geometry.geometry.coordinates) || (geometry.features && geometry.features[0] && geometry.features[0].geometry.coordinates) || []);
    
    if (flatCoords.length === 0) return { latitude: defaultLat, longitude: defaultLng };
    
    flatCoords.forEach(c => {
       const lng = c[0];
       const lat = c[1];
       if (lat > maxLat) maxLat = lat;
       if (lng > maxLng) maxLng = lng;
    });
    
    
    const result = { latitude: maxLat, longitude: maxLng };
    if (typeof polygon === 'object') {
      topRightCache.set(polygon, result);
    } else if (typeof polygon === 'string') {
      stringTopRightCache.set(polygon, result);
      if (stringTopRightCache.size > 100) {
        const firstKey = stringTopRightCache.keys().next().value;
        stringTopRightCache.delete(firstKey);
      }
    }
    return result;

  } catch (err) {
    console.error("Error getting top right coord:", err);
    return { latitude: defaultLat, longitude: defaultLng };
  }
}
