import * as turf from '@turf/turf';

export interface PointCoord {
  latitude: number;
  longitude: number;
}

export function calculateDistanceMeters(p1: [number, number], p2: [number, number]): number {
  const from = turf.point([p1[1], p1[0]]); // [lng, lat]
  const to = turf.point([p2[1], p2[0]]);
  return turf.distance(from, to, { units: 'meters' });
}

export function calculateBearingDegrees(p1: [number, number], p2: [number, number]): number {
  const from = turf.point([p1[1], p1[0]]);
  const to = turf.point([p2[1], p2[0]]);
  let bearing = turf.bearing(from, to);
  if (bearing < 0) bearing += 360;
  return Math.round(bearing);
}

export function calculatePolygonStats(coordinates: [number, number][]) {
  if (coordinates.length < 3) {
    return { areaSqMeters: 0, donum: 0, hectare: 0, perimeterMeters: 0 };
  }

  // Ensure closed ring: [[lng, lat], ...]
  const lngLatRing = coordinates.map(c => [c[1], c[0]]);
  if (
    lngLatRing[0][0] !== lngLatRing[lngLatRing.length - 1][0] ||
    lngLatRing[0][1] !== lngLatRing[lngLatRing.length - 1][1]
  ) {
    lngLatRing.push([lngLatRing[0][0], lngLatRing[0][1]]);
  }

  try {
    const polygon = turf.polygon([lngLatRing]);
    const areaSqM = turf.area(polygon);
    const line = turf.polygonToLine(polygon);
    const perimeterM = line ? turf.length(line, { units: 'meters' }) : 0;

    return {
      areaSqMeters: Math.round(areaSqM * 10) / 10,
      donum: Math.round((areaSqM / 1000) * 100) / 100,
      hectare: Math.round((areaSqM / 10000) * 100) / 100,
      perimeterMeters: Math.round(perimeterM * 10) / 10,
      geojson: polygon.geometry
    };
  } catch (err) {
    console.error("Error calculating polygon stats:", err);
    return { areaSqMeters: 0, donum: 0, hectare: 0, perimeterMeters: 0 };
  }
}

/**
 * Splits a polygon into N parts along its longest bounding box axis
 */
export function splitPolygonIntoParts(
  geometryOrCoords: any,
  partsCount: number = 2,
  direction: 'auto' | 'vertical' | 'horizontal' = 'auto'
): Array<{ name: string; polygon: any; areaDonum: number }> {
  if (partsCount < 2) partsCount = 2;
  if (partsCount > 10) partsCount = 10;

  try {
    let turfPoly: any;
    if (geometryOrCoords.type === 'Feature') {
      turfPoly = geometryOrCoords;
    } else if (geometryOrCoords.type === 'Polygon' || geometryOrCoords.type === 'MultiPolygon') {
      turfPoly = turf.feature(geometryOrCoords);
    } else if (Array.isArray(geometryOrCoords)) {
      const ring = geometryOrCoords.map((c: any) => [c[1], c[0]]);
      if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) {
        ring.push([...ring[0]]);
      }
      turfPoly = turf.polygon([ring]);
    } else {
      return [];
    }

    const bbox = turf.bbox(turfPoly); // [minX, minY, maxX, maxY] -> [minLng, minLat, maxLng, maxLat]
    const width = bbox[2] - bbox[0];
    const height = bbox[3] - bbox[1];

    let splitAlongX = direction === 'vertical' ? true : direction === 'horizontal' ? false : width >= height;

    const results: Array<{ name: string; polygon: any; areaDonum: number }> = [];

    for (let i = 0; i < partsCount; i++) {
      let sliceBbox: [number, number, number, number];

      if (splitAlongX) {
        const step = width / partsCount;
        const x1 = bbox[0] + i * step - (i === 0 ? 0.0001 : 0);
        const x2 = bbox[0] + (i + 1) * step + (i === partsCount - 1 ? 0.0001 : 0);
        sliceBbox = [x1, bbox[1] - 0.0001, x2, bbox[3] + 0.0001];
      } else {
        const step = height / partsCount;
        const y1 = bbox[1] + i * step - (i === 0 ? 0.0001 : 0);
        const y2 = bbox[1] + (i + 1) * step + (i === partsCount - 1 ? 0.0001 : 0);
        sliceBbox = [bbox[0] - 0.0001, y1, bbox[2] + 0.0001, y2];
      }

      const slicePoly = turf.bboxPolygon(sliceBbox);
      const intersected = turf.intersect(turf.featureCollection([turfPoly, slicePoly]));

      if (intersected && intersected.geometry) {
        const areaSqM = turf.area(intersected);
        results.push({
          name: `Parça ${i + 1}`,
          polygon: intersected.geometry,
          areaDonum: Math.round((areaSqM / 1000) * 100) / 100
        });
      }
    }

    return results;
  } catch (error) {
    console.error("splitPolygonIntoParts error:", error);
    return [];
  }
}

/**
 * Calculates equipment passes & swaths (e.g. 180cm / 1.8m or 24m spray boom)
 */
export function calculateEquipmentPlan(geometryOrCoords: any, equipmentWidthMeters: number = 1.8) {
  try {
    let turfPoly: any;
    if (geometryOrCoords.type === 'Feature') {
      turfPoly = geometryOrCoords;
    } else if (geometryOrCoords.type === 'Polygon' || geometryOrCoords.type === 'MultiPolygon') {
      turfPoly = turf.feature(geometryOrCoords);
    } else if (Array.isArray(geometryOrCoords)) {
      const ring = geometryOrCoords.map((c: any) => [c[1], c[0]]);
      if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) {
        ring.push([...ring[0]]);
      }
      turfPoly = turf.polygon([ring]);
    } else {
      return null;
    }

    const areaSqM = turf.area(turfPoly);
    const donum = areaSqM / 1000;
    const bbox = turf.bbox(turfPoly); // [minLng, minLat, maxLng, maxLat]

    // Calculate approximate field width perpendicular to working direction
    const widthMeters = turf.distance(
      turf.point([bbox[0], bbox[1]]),
      turf.point([bbox[2], bbox[1]]),
      { units: 'meters' }
    );
    const heightMeters = turf.distance(
      turf.point([bbox[0], bbox[1]]),
      turf.point([bbox[0], bbox[3]]),
      { units: 'meters' }
    );

    const minDimension = Math.min(widthMeters, heightMeters);
    const maxDimension = Math.max(widthMeters, heightMeters);

    const estimatedPasses = Math.max(1, Math.ceil(minDimension / equipmentWidthMeters));
    const totalWorkingDistanceMeters = estimatedPasses * maxDimension;
    
    // Average tractor working speed: 6 km/h (~100m/min) or Drone: 20 km/h
    const estimatedWorkTimeMinutes = Math.round((totalWorkingDistanceMeters / 100) * 1.1); // +10% turning time

    // Recommended liquid / fertilizer estimates
    const recommendedWaterLiters = Math.round(donum * 25); // 25L per donum standard
    const droneWaterLiters = Math.round(donum * 1.5); // 1.5L per donum ULV spray

    return {
      equipmentWidthMeters,
      totalAreaDonum: Math.round(donum * 100) / 100,
      estimatedPasses,
      totalDistanceMeters: Math.round(totalWorkingDistanceMeters),
      estimatedWorkTimeMinutes,
      recommendedWaterLiters,
      droneWaterLiters
    };
  } catch (error) {
    console.error("calculateEquipmentPlan error:", error);
    return null;
  }
}

/**
 * Extracts an array of [lat, lng] points from any Polygon / MultiPolygon GeoJSON
 */
export function extractLatLngPointsFromGeometry(geometryOrCoords: any): [number, number][] {
  if (!geometryOrCoords) return [];

  let ring: any[] = [];
  if (Array.isArray(geometryOrCoords)) {
    if (geometryOrCoords.length > 0 && Array.isArray(geometryOrCoords[0])) {
      if (typeof geometryOrCoords[0][0] === 'number') {
        // [lat, lng] or [lng, lat]
        return geometryOrCoords.map((c: any) => [Number(c[0]), Number(c[1])]);
      }
    }
  }

  let geom = geometryOrCoords;
  if (geom.type === 'Feature') geom = geom.geometry;

  if (geom.type === 'Polygon' && Array.isArray(geom.coordinates) && geom.coordinates.length > 0) {
    ring = geom.coordinates[0];
  } else if (geom.type === 'MultiPolygon' && Array.isArray(geom.coordinates) && geom.coordinates.length > 0) {
    ring = geom.coordinates[0][0] || [];
  }

  if (ring.length === 0) return [];

  // Convert from GeoJSON [lng, lat] to Leaflet [lat, lng]
  const points: [number, number][] = [];
  for (let i = 0; i < ring.length; i++) {
    const pt = ring[i];
    if (Array.isArray(pt) && pt.length >= 2) {
      // If first point is repeated at end, skip duplicate for clean editing
      if (i === ring.length - 1 && points.length >= 3) {
        if (Math.abs(pt[1] - points[0][0]) < 1e-7 && Math.abs(pt[0] - points[0][1]) < 1e-7) {
          continue;
        }
      }
      points.push([Number(pt[1]), Number(pt[0])]);
    }
  }
  return points;
}

export interface GuidanceLine {
  id: string;
  name: string;
  points: [number, number][]; // [lat, lng] pair of start (A) and end (B) or path
  bearingDegrees: number;
  lengthMeters: number;
  info: string;
}

/**
 * Calculates dividing lines (A-B Dümenleme / Bölme Hatları) across a field polygon
 */
export function calculateGuidanceSplitLines(
  geometryOrCoords: any,
  partsCount: number = 2,
  direction: 'auto' | 'vertical' | 'horizontal' = 'auto'
): GuidanceLine[] {
  if (partsCount < 2) partsCount = 2;

  try {
    let turfPoly: any;
    if (geometryOrCoords.type === 'Feature') {
      turfPoly = geometryOrCoords;
    } else if (geometryOrCoords.type === 'Polygon' || geometryOrCoords.type === 'MultiPolygon') {
      turfPoly = turf.feature(geometryOrCoords);
    } else if (Array.isArray(geometryOrCoords)) {
      const ring = geometryOrCoords.map((c: any) => [c[1], c[0]]);
      if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) {
        ring.push([...ring[0]]);
      }
      turfPoly = turf.polygon([ring]);
    } else {
      return [];
    }

    const bbox = turf.bbox(turfPoly); // [minLng, minLat, maxLng, maxLat]
    const width = bbox[2] - bbox[0];
    const height = bbox[3] - bbox[1];

    let splitAlongX = direction === 'vertical' ? true : direction === 'horizontal' ? false : width >= height;

    const lines: GuidanceLine[] = [];
    const splitsNum = partsCount - 1;

    for (let i = 1; i <= splitsNum; i++) {
      let p1: [number, number];
      let p2: [number, number];

      if (splitAlongX) {
        // Vertical dividing lines (North-South)
        const step = width / partsCount;
        const x = bbox[0] + i * step;
        p1 = [bbox[1], x]; // [lat, lng]
        p2 = [bbox[3], x];
      } else {
        // Horizontal dividing lines (East-West)
        const step = height / partsCount;
        const y = bbox[1] + i * step;
        p1 = [y, bbox[0]];
        p2 = [y, bbox[2]];
      }

      // Convert to turf line
      const rawLine = turf.lineString([[p1[1], p1[0]], [p2[1], p2[0]]]);
      const polyLine = turf.polygonToLine(turfPoly);

      let finalStart: [number, number] = [p1[0], p1[1]];
      let finalEnd: [number, number] = [p2[0], p2[1]];

      if (polyLine) {
        const intersects = turf.lineIntersect(rawLine, polyLine);
        if (intersects.features.length >= 2) {
          const coords = intersects.features.map(f => [f.geometry.coordinates[1], f.geometry.coordinates[0]] as [number, number]);
          // Sort along direction
          if (splitAlongX) {
            coords.sort((a, b) => a[0] - b[0]);
          } else {
            coords.sort((a, b) => a[1] - b[1]);
          }
          finalStart = coords[0];
          finalEnd = coords[coords.length - 1];
        }
      }

      const dist = calculateDistanceMeters(finalStart, finalEnd);
      const bearing = calculateBearingDegrees(finalStart, finalEnd);

      lines.push({
        id: `guide_split_${i}_${Date.now()}`,
        name: `Bölme & Dümenleme Hattı ${i} (A-B)`,
        points: [finalStart, finalEnd],
        bearingDegrees: bearing,
        lengthMeters: Math.round(dist),
        info: `${partsCount} parçalı bölme hattı (${Math.round(dist)} m, ${bearing}°)`
      });
    }

    return lines;
  } catch (err) {
    console.error("calculateGuidanceSplitLines error:", err);
    return [];
  }
}

