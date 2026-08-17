import proj4 from 'proj4';
import JSZip from 'jszip';
import DxfParser from 'dxf-parser';
import * as pdfjsLib from 'pdfjs-dist';

// pdfjs worker setup
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

export interface ParsedFieldResult {
  latitude?: number;
  longitude?: number;
  polygon?: any; // GeoJSON Polygon or MultiPolygon
  name?: string;
  province?: string;
  district?: string;
  neighborhood?: string;
  ada?: string;
  parsel?: string;
  cropType?: string;
  notes?: string;
}

/**
 * Safely decodes text buffer, first trying UTF-8 (handling BOM), then windows-1254 (Turkish ANSI)
 */
export function decodeTextBuffer(buffer: ArrayBuffer): string {
  try {
    const utf8Str = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    return utf8Str.replace(/^\uFEFF/, '').trim();
  } catch (e) {
    try {
      const win1254Str = new TextDecoder('windows-1254').decode(buffer);
      return win1254Str.replace(/^\uFEFF/, '').trim();
    } catch (e2) {
      const fallbackStr = new TextDecoder().decode(buffer);
      return fallbackStr.replace(/^\uFEFF/, '').trim();
    }
  }
}

/**
 * Parses WKT (Well-Known Text) geometry strings like POLYGON((...)) or MULTIPOLYGON(((...)))
 */
export function parseWKT(wktStr: string): any {
  if (!wktStr || typeof wktStr !== 'string') return null;
  const clean = wktStr.trim();
  const upper = clean.toUpperCase();

  if (upper.startsWith('POLYGON')) {
    const openParenIdx = clean.indexOf('(');
    const coordSection = openParenIdx !== -1 ? clean.substring(openParenIdx) : clean;
    const ringMatches = coordSection.match(/\(\s*([^\(\)]+)\s*\)/g);
    if (ringMatches) {
      const rings: any[][] = [];
      for (const ringStr of ringMatches) {
        const rawCoords = ringStr.replace(/[\(\)]/g, '').trim().split(/\s*,\s*/);
        const ring: [number, number][] = [];
        for (const c of rawCoords) {
          const parts = c.trim().split(/\s+/);
          if (parts.length >= 2) {
            const x = parseFloat(parts[0]);
            const y = parseFloat(parts[1]);
            if (!isNaN(x) && !isNaN(y)) {
              ring.push([x, y]);
            }
          }
        }
        if (ring.length >= 3) rings.push(ring);
      }
      if (rings.length > 0) {
        return { type: 'Polygon', coordinates: rings };
      }
    }
  } else if (upper.startsWith('MULTIPOLYGON')) {
    const polyMatches = clean.match(/\(\s*\(\s*([^\(\)]+)\s*\)\s*\)/g);
    if (polyMatches) {
      const polys: any[][][] = [];
      for (const polyStr of polyMatches) {
        const ringMatches = polyStr.match(/\(\s*([^\(\)]+)\s*\)/g);
        if (ringMatches) {
          const rings: any[][] = [];
          for (const ringStr of ringMatches) {
            const rawCoords = ringStr.replace(/[\(\)]/g, '').trim().split(/\s*,\s*/);
            const ring: [number, number][] = [];
            for (const c of rawCoords) {
              const parts = c.trim().split(/\s+/);
              if (parts.length >= 2) {
                const x = parseFloat(parts[0]);
                const y = parseFloat(parts[1]);
                if (!isNaN(x) && !isNaN(y)) {
                  ring.push([x, y]);
                }
              }
            }
            if (ring.length >= 3) rings.push(ring);
          }
          if (rings.length > 0) polys.push(rings);
        }
      }
      if (polys.length > 0) {
        return { type: 'MultiPolygon', coordinates: polys };
      }
    }
  } else if (upper.startsWith('POINT')) {
    const match = clean.match(/\(\s*([^\s]+)\s+([^\s\)]+)/);
    if (match) {
      const x = parseFloat(match[1]);
      const y = parseFloat(match[2]);
      if (!isNaN(x) && !isNaN(y)) {
        return { type: 'Point', coordinates: [x, y] };
      }
    }
  }
  return null;
}

/**
 * Converts Turkish UTM / ED50 / ITRF / TM coordinates or swapped lat/lng to WGS84 [lng, lat]
 */
export function convertTurkishCoordsToWGS84(x: number, y: number): [number, number] {
  if (isNaN(x) || isNaN(y)) return [0, 0];

  // 1. If coordinates are already in WGS84 degree range [-180..180, -90..90]
  if (Math.abs(x) <= 180 && Math.abs(y) <= 90) {
    return [x, y];
  }

  // 2. Try EPSG:3857 (Web Mercator) first for large coordinates
  try {
    const [lng, lat] = proj4('EPSG:3857', 'EPSG:4326', [x, y]);
    if (lat >= 35 && lat <= 43 && lng >= 25 && lng <= 45) {
      return [lng, lat];
    }
  } catch (e) {}
  try {
    const [lng, lat] = proj4('EPSG:3857', 'EPSG:4326', [y, x]);
    if (lat >= 35 && lat <= 43 && lng >= 25 && lng <= 45) {
      return [lng, lat];
    }
  } catch (e) {}

  // 3. Large coordinate numbers: UTM / ED50 / ITRF meters in Turkey
  let easting = x;
  let northing = y;
  // If X is Northing (~3800000..4800000) and Y is Easting (~100000..900000)
  if (Math.abs(x) > 1000000 && Math.abs(y) < 1000000) {
    easting = y;
    northing = x;
  }

  // Try 6-degree UTM (Zones 35, 36, 37, 38)
  for (let zone = 35; zone <= 38; zone++) {
    for (const p of [
      `+proj=utm +zone=${zone} +datum=WGS84 +units=m +no_defs`,
      `+proj=utm +zone=${zone} +ellps=intl +towgs84=-87,-98,-121,0,0,0,0 +units=m +no_defs`
    ]) {
      try {
        const [lng, lat] = proj4(p, 'WGS84', [easting, northing]);
        if (lat >= 35 && lat <= 43 && lng >= 25 && lng <= 45) {
          return [lng, lat];
        }
      } catch (e) {}
    }
  }

  // Try 3-degree TM (Central Meridians 27, 30, 33, 36, 39, 42, 45)
  for (const cm of [27, 30, 33, 36, 39, 42, 45]) {
    for (const p of [
      `+proj=tmerc +lat_0=0 +lon_0=${cm} +k=1 +x_0=500000 +y_0=0 +datum=WGS84 +units=m +no_defs`,
      `+proj=tmerc +lat_0=0 +lon_0=${cm} +k=1 +x_0=500000 +y_0=0 +ellps=intl +towgs84=-87,-98,-121,0,0,0,0 +units=m +no_defs`
    ]) {
      try {
        const [lng, lat] = proj4(p, 'WGS84', [easting, northing]);
        if (lat >= 35 && lat <= 43 && lng >= 25 && lng <= 45) {
          return [lng, lat];
        }
      } catch (e) {}
    }
  }

  return [x, y];
}

/**
 * Recursively inspects any input object to extract GeoJSON features or raw coordinate arrays
 */
export function extractFeaturesAndProperties(data: any): { features: any[], properties: any } {
  const features: any[] = [];
  const props: any = {};

  if (!data) return { features, properties: props };

  if (typeof data === 'string') {
    const cleanStr = data.replace(/^\uFEFF/, '').trim();
    if (cleanStr.startsWith('{') || cleanStr.startsWith('[')) {
      try {
        data = JSON.parse(cleanStr);
      } catch(e) {
        const wktGeom = parseWKT(cleanStr);
        if (wktGeom) {
          return { features: [{ type: 'Feature', geometry: wktGeom, properties: {} }], properties: {} };
        }
        return { features, properties: props };
      }
    } else {
      const wktGeom = parseWKT(cleanStr);
      if (wktGeom) {
        return { features: [{ type: 'Feature', geometry: wktGeom, properties: {} }], properties: {} };
      }
      return { features, properties: props };
    }
  }

  const collectProps = (p: any) => {
    if (!p || typeof p !== 'object') return;
    for (const key of Object.keys(p)) {
      if (!props[key]) props[key] = p[key];
    }
  };

  const processItem = (item: any) => {
    if (!item) return;

    if (Array.isArray(item)) {
      item.forEach(processItem);
      return;
    }

    if (item.properties) collectProps(item.properties);
    if (item.attributes) collectProps(item.attributes);

    if (Array.isArray(item.features)) {
      item.features.forEach(processItem);
      return;
    }

    if (Array.isArray(item.geometries)) {
      item.geometries.forEach(processItem);
      return;
    }

    if (item.type === 'FeatureCollection' && Array.isArray(item.features)) {
      item.features.forEach(processItem);
      return;
    }

    if (item.type === 'Feature') {
      if (item.geometry) {
        features.push(item);
      } else if (item.wkt || item.WKT || item.geometryWkt) {
        const wktGeom = parseWKT(item.wkt || item.WKT || item.geometryWkt);
        if (wktGeom) features.push({ type: 'Feature', geometry: wktGeom, properties: item.properties || {} });
      }
      return;
    }

    if (item.geometry) {
      if (typeof item.geometry === 'string') {
        const wktGeom = parseWKT(item.geometry);
        if (wktGeom) {
          features.push({ type: 'Feature', geometry: wktGeom, properties: item.properties || {} });
        } else {
          try {
            const parsedG = JSON.parse(item.geometry);
            features.push({ type: 'Feature', geometry: parsedG, properties: item.properties || {} });
          } catch (e) {}
        }
      } else {
        features.push({ type: 'Feature', geometry: item.geometry, properties: item.properties || {} });
      }
      return;
    }

    if (item.wkt || item.WKT || item.geometryWkt || item.geometry_wkt) {
      const wktGeom = parseWKT(item.wkt || item.WKT || item.geometryWkt || item.geometry_wkt);
      if (wktGeom) {
        features.push({ type: 'Feature', geometry: wktGeom, properties: item.properties || item.attributes || {} });
      }
    }

    if (item.type === 'Polygon' || item.type === 'MultiPolygon' || item.type === 'Point' || item.type === 'LineString' || item.type === 'MultiLineString') {
      features.push({ type: 'Feature', geometry: item, properties: item.properties || {} });
      return;
    }

    // TKGM JSON format (which might store geometry directly or in parsel / feature / spatial)
    if (item.parsel || item.feature || item.spatial || item.data) {
      processItem(item.parsel || item.feature || item.spatial || item.data);
      return;
    }

    // Direct coordinates array e.g. [ [lng, lat], [lng, lat] ... ]
    if (item.coordinates && Array.isArray(item.coordinates)) {
      features.push({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [item.coordinates] },
        properties: item.properties || {}
      });
      return;
    }
  };

  processItem(data);
  return { features, properties: props };
}

function processSingleRing(rawRing: any[]): [number, number][] {
  const cleanRing: [number, number][] = [];
  for (const pt of rawRing) {
    if (Array.isArray(pt) && pt.length >= 2) {
      const x = Number(pt[0]);
      const y = Number(pt[1]);
      if (!isNaN(x) && !isNaN(y)) {
        const converted = convertTurkishCoordsToWGS84(x, y);
        cleanRing.push(converted);
      }
    } else if (pt && typeof pt === 'object' && ('x' in pt || 'lng' in pt || 'longitude' in pt)) {
      const x = Number(pt.x ?? pt.lng ?? pt.longitude);
      const y = Number(pt.y ?? pt.lat ?? pt.latitude);
      if (!isNaN(x) && !isNaN(y)) {
        const converted = convertTurkishCoordsToWGS84(x, y);
        cleanRing.push(converted);
      }
    }
  }

  if (cleanRing.length >= 3) {
    const first = cleanRing[0];
    const last = cleanRing[cleanRing.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      cleanRing.push([first[0], first[1]]);
    }
  }

  return cleanRing;
}

function processPolygonRings(polygonRings: any): any[][] {
  if (!Array.isArray(polygonRings)) return [];
  const cleanRings: any[][] = [];

  if (polygonRings.length > 0 && Array.isArray(polygonRings[0]) && typeof polygonRings[0][0] === 'number') {
    const ring = processSingleRing(polygonRings);
    if (ring.length >= 3) cleanRings.push(ring);
    return cleanRings;
  }

  for (const rawRing of polygonRings) {
    if (!Array.isArray(rawRing)) continue;
    const ring = processSingleRing(rawRing);
    if (ring.length >= 3) {
      cleanRings.push(ring);
    }
  }
  return cleanRings;
}

/**
 * Takes any GeoJSON object/data, normalizes rings, reprojects coordinates, and returns standard ParsedFieldResult
 */
export function processGeoJSONData(data: any): ParsedFieldResult {
  const { features, properties } = extractFeaturesAndProperties(data);
  const normalizedPolygons: any[][][] = [];
  const points: [number, number][] = [];

  for (const feature of features) {
    const geom = feature.geometry;
    if (!geom) continue;

    if (geom.type === 'Polygon' && Array.isArray(geom.coordinates)) {
      const cleanPoly = processPolygonRings(geom.coordinates);
      if (cleanPoly.length > 0) normalizedPolygons.push(cleanPoly);
    } else if (geom.type === 'MultiPolygon' && Array.isArray(geom.coordinates)) {
      geom.coordinates.forEach((polyCoords: any) => {
        const cleanPoly = processPolygonRings(polyCoords);
        if (cleanPoly.length > 0) normalizedPolygons.push(cleanPoly);
      });
    } else if (geom.type === 'LineString' && Array.isArray(geom.coordinates)) {
      const ring = processSingleRing(geom.coordinates);
      if (ring.length >= 3) normalizedPolygons.push([ring]);
    } else if (geom.type === 'MultiLineString' && Array.isArray(geom.coordinates)) {
      geom.coordinates.forEach((line: any) => {
        const ring = processSingleRing(line);
        if (ring.length >= 3) normalizedPolygons.push([ring]);
      });
    } else if (geom.type === 'Point' && Array.isArray(geom.coordinates) && geom.coordinates.length >= 2) {
      const pt = convertTurkishCoordsToWGS84(Number(geom.coordinates[0]), Number(geom.coordinates[1]));
      points.push(pt);
    }
  }

  let finalLatitude: number | undefined = undefined;
  let finalLongitude: number | undefined = undefined;
  let finalPolygon: any = null;

  if (normalizedPolygons.length > 0) {
    finalLongitude = normalizedPolygons[0][0][0][0];
    finalLatitude = normalizedPolygons[0][0][0][1];

    if (normalizedPolygons.length === 1) {
      finalPolygon = { type: 'Polygon', coordinates: normalizedPolygons[0] };
    } else {
      finalPolygon = { type: 'MultiPolygon', coordinates: normalizedPolygons };
    }
  } else if (points.length > 0) {
    finalLongitude = points[0][0];
    finalLatitude = points[0][1];
  }

  const result: ParsedFieldResult = {
    latitude: finalLatitude,
    longitude: finalLongitude,
    polygon: finalPolygon
  };

  if (properties) {
    const ada = properties.adaNo || properties.ada || properties.ADA || properties.Ada || properties.ada_no;
    const parsel = properties.parselNo || properties.parsel || properties.PARSEL || properties.Parsel || properties.parsel_no;
    const province = properties.ilAd || properties.il || properties.IL || properties.Il || properties.province;
    const district = properties.ilceAd || properties.ilce || properties.ILCE || properties.Ilce || properties.district;
    const neighborhood = properties.mahalleAd || properties.mahalle || properties.MAHALLE || properties.Mahalle || properties.neighborhood;
    const name = properties.name || properties.Name || properties.NAME || properties.Aciklama || properties.aciklama || properties.title;

    if (ada) result.ada = String(ada);
    if (parsel) result.parsel = String(parsel);
    if (province) result.province = String(province);
    if (district) result.district = String(district);
    if (neighborhood) result.neighborhood = String(neighborhood);
    if (name) result.name = String(name);
  }

  return result;
}

/**
 * Parses KML text content
 */
export async function parseKmlContent(text: string): Promise<ParsedFieldResult> {
  const parser = new DOMParser();
  const kmlXml = parser.parseFromString(text, 'text/xml');
  const toGeoJSON = (await import('@mapbox/togeojson')).kml;
  const gjson = toGeoJSON(kmlXml);
  return processGeoJSONData(gjson);
}

/**
 * Parses ZIP or KMZ archive containing Shapefiles, KML, GeoJSON, DXF, or coordinate lists
 */
export async function parseZipBuffer(buffer: ArrayBuffer): Promise<ParsedFieldResult> {
  const extractedFeatures: any[] = [];
  let extractedProps: any = {};

  // 1. First attempt with shpjs for standard shapefile archives
  try {
    const shpModule = await import('shpjs');
    const parseFn = (shpModule.default && typeof shpModule.default === 'function') 
      ? shpModule.default 
      : ((shpModule as any).parseZip ? (shpModule as any).parseZip : shpModule);
    
    if (typeof parseFn === 'function') {
      const zipBuffer = typeof Buffer !== 'undefined' ? Buffer.from(buffer) : buffer;
      const shpResult: any = await parseFn(zipBuffer);
      if (shpResult) {
        let allFeatures: any[] = [];
        if (Array.isArray(shpResult)) {
          allFeatures = shpResult.flatMap(g => g.features || []);
        } else {
          allFeatures = shpResult.features || (shpResult.type === 'Feature' ? [shpResult] : []);
        }
        if (allFeatures.length > 0) {
          const res = processGeoJSONData({ type: 'FeatureCollection', features: allFeatures });
          if (res.latitude && res.longitude) {
            return res;
          }
        }
      }
    }
  } catch (shpErr) {
    console.warn("shpjs parseZip skipped or failed, using JSZip manual inspection:", shpErr);
  }

  // 2. JSZip inspection of all contents in archive
  const zip = await JSZip.loadAsync(buffer);
  const fileNames = Object.keys(zip.files);

  // Check if there are .shp and .dbf files inside zip
  const shpFileNames = fileNames.filter(f => f.toLowerCase().endsWith('.shp'));
  if (shpFileNames.length > 0) {
    try {
      const shpModule = await import('shpjs');
      const parseShp = shpModule.parseShp || (shpModule.default ? (shpModule.default as any).parseShp : null);
      const parseDbf = shpModule.parseDbf || (shpModule.default ? (shpModule.default as any).parseDbf : null);
      const combine = shpModule.combine || (shpModule.default ? (shpModule.default as any).combine : null);

      for (const shpFile of shpFileNames) {
        const shpSafeStr = String(shpFile || '');
        const shpBase = shpSafeStr.substring(0, Math.max(0, shpSafeStr.length - 4));
        const shpBaseName = (shpBase.split('/').pop() || '').toLowerCase();
        const dbfFile = fileNames.find(f => {
          if (!f || !f.toLowerCase().endsWith('.dbf')) return false;
          const fSafeStr = String(f || '');
          const dbfBase = fSafeStr.substring(0, Math.max(0, fSafeStr.length - 4));
          const dbfBaseName = (dbfBase.split('/').pop() || '').toLowerCase();
          return dbfBaseName === shpBaseName;
        });

        const shpBuffer = await zip.files[shpFile].async('arraybuffer');
        const dbfBuffer = dbfFile ? await zip.files[dbfFile].async('arraybuffer') : null;
        const shpNodeBuffer = typeof Buffer !== 'undefined' ? Buffer.from(shpBuffer) : shpBuffer;
        const dbfNodeBuffer = typeof Buffer !== 'undefined' && dbfBuffer ? Buffer.from(dbfBuffer) : dbfBuffer;

        if (parseShp && typeof parseShp === 'function') {
          const geometries = parseShp(shpNodeBuffer);
          const attributes = (dbfNodeBuffer && parseDbf) ? parseDbf(dbfNodeBuffer) : [];
          
          let combinedGeoJSON: any = null;
          if (combine && typeof combine === 'function' && Array.isArray(geometries) && Array.isArray(attributes)) {
            combinedGeoJSON = combine([geometries, attributes]);
          } else {
            combinedGeoJSON = {
              type: 'FeatureCollection',
              features: geometries.map((g: any, idx: number) => ({
                type: 'Feature',
                geometry: g,
                properties: attributes[idx] || {}
              }))
            };
          }

          if (combinedGeoJSON) {
            const { features, properties } = extractFeaturesAndProperties(combinedGeoJSON);
            extractedFeatures.push(...features);
            Object.assign(extractedProps, properties);
          }
        }
      }
    } catch (manualShpErr) {
      console.warn("Manual SHP/DBF extraction failed:", manualShpErr);
    }
  }

  // Also check for KML, GeoJSON, DXF, TXT, CSV in zip
  for (const fileName of fileNames) {
    const entry = zip.files[fileName];
    if (entry.dir) continue;
    const lower = fileName.toLowerCase();

    try {
      if (lower.endsWith('.kml')) {
        const text = decodeTextBuffer(await entry.async('arraybuffer'));
        const kmlRes = await parseKmlContent(text);
        if (kmlRes.polygon || kmlRes.latitude) {
          const { features, properties } = extractFeaturesAndProperties(
            kmlRes.polygon 
              ? { type: 'Feature', geometry: kmlRes.polygon } 
              : { type: 'Feature', geometry: { type: 'Point', coordinates: [kmlRes.longitude, kmlRes.latitude] } }
          );
          extractedFeatures.push(...features);
          Object.assign(extractedProps, properties, kmlRes);
        }
      } else if (lower.endsWith('.geojson') || lower.endsWith('.json')) {
        const text = decodeTextBuffer(await entry.async('arraybuffer'));
        const { features, properties } = extractFeaturesAndProperties(text);
        extractedFeatures.push(...features);
        Object.assign(extractedProps, properties);
      } else if (lower.endsWith('.dxf')) {
        const text = decodeTextBuffer(await entry.async('arraybuffer'));
        const dxfRes = parseDxfContent(text);
        if (dxfRes.polygon || dxfRes.latitude) {
          const { features } = extractFeaturesAndProperties(
            dxfRes.polygon 
              ? { type: 'Feature', geometry: dxfRes.polygon } 
              : { type: 'Feature', geometry: { type: 'Point', coordinates: [dxfRes.longitude, dxfRes.latitude] } }
          );
          extractedFeatures.push(...features);
        }
      } else if (lower.endsWith('.txt') || lower.endsWith('.csv') || lower.endsWith('.ncz') || lower.endsWith('.wkt')) {
        const text = decodeTextBuffer(await entry.async('arraybuffer'));
        const txtRes = parseTxtCsvContent(text);
        if (txtRes.polygon || txtRes.latitude) {
          const { features } = extractFeaturesAndProperties(
            txtRes.polygon 
              ? { type: 'Feature', geometry: txtRes.polygon } 
              : { type: 'Feature', geometry: { type: 'Point', coordinates: [txtRes.longitude, txtRes.latitude] } }
          );
          extractedFeatures.push(...features);
        }
      }
    } catch (entryErr) {
      console.warn(`Error processing zip entry ${fileName}:`, entryErr);
    }
  }

  if (extractedFeatures.length > 0) {
    const res = processGeoJSONData({ type: 'FeatureCollection', features: extractedFeatures });
    if (res.latitude && res.longitude) {
      if (Object.keys(extractedProps).length > 0) {
        Object.assign(res, extractedProps);
      }
      return res;
    }
  }

  throw new Error("Sıkıştırılmış dosyada (.zip / .kmz) geçerli bir tarla sınırı veya koordinat bulunamadı.");
}

/**
 * Parses DXF drawing text content
 */
export function parseDxfContent(text: string): ParsedFieldResult {
  const parser = new DxfParser();
  const dxf = parser.parseSync(text);
  const ring: [number, number][] = [];
  const points: [number, number][] = [];

  if (dxf && dxf.entities) {
    for (const entity of dxf.entities) {
      if ((entity.type === 'LWPOLYLINE' || entity.type === 'POLYLINE') && (entity as any).vertices) {
        for (const v of (entity as any).vertices) {
          const pt = convertTurkishCoordsToWGS84(v.x, v.y);
          ring.push(pt);
        }
      } else if (entity.type === 'POINT' && (entity as any).position) {
        const pt = convertTurkishCoordsToWGS84((entity as any).position.x, (entity as any).position.y);
        points.push(pt);
      }
    }
  }

  if (ring.length >= 3) {
    return processGeoJSONData({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [ring] }
    });
  }

  if (points.length > 0) {
    return { latitude: points[0][1], longitude: points[0][0] };
  }

  throw new Error("DXF dosyasında geçerli koordinat veya çizgi bulunamadı.");
}

/**
 * Parses TXT / CSV / NCZ coordinate list text content
 */
export function parseTxtCsvContent(text: string): ParsedFieldResult {
  const lines = text.split(/\r?\n/);
  const ring: [number, number][] = [];

  for (const line of lines) {
    // Check WKT line
    if (line.toUpperCase().includes('POLYGON') || line.toUpperCase().includes('POINT')) {
      const wktGeom = parseWKT(line);
      if (wktGeom) {
        return processGeoJSONData({ type: 'Feature', geometry: wktGeom });
      }
    }

    const matches = line.match(/[-+]?[0-9]*\.?[0-9]+/g);
    if (matches && matches.length >= 2) {
      const num1 = parseFloat(matches[matches.length - 2]);
      const num2 = parseFloat(matches[matches.length - 1]);
      if (!isNaN(num1) && !isNaN(num2)) {
        const pt = convertTurkishCoordsToWGS84(num1, num2);
        if (pt[0] !== 0 || pt[1] !== 0) {
          ring.push(pt);
        }
      }
    }
  }

  if (ring.length >= 3) {
    return processGeoJSONData({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [ring] }
    });
  } else if (ring.length > 0) {
    return { latitude: ring[0][1], longitude: ring[0][0] };
  }

  throw new Error("Metin dosyasında geçerli koordinat satırları bulunamadı.");
}

/**
 * Parses PDF document array buffer
 */
export async function parsePdfBuffer(buffer: ArrayBuffer): Promise<ParsedFieldResult> {
  const pdf = await pdfjsLib.getDocument(buffer).promise;
  let fullText = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    fullText += textContent.items.map(item => 'str' in item ? item.str : '').join(' ') + ' ';
  }

  // Scan text for float numbers or coordinate pairs
  const numMatches = fullText.match(/\b([2-4][0-9]\.[0-9]+)\b/g);
  let foundLat, foundLng;
  if (numMatches) {
    for (const match of numMatches) {
      const num = Number(match);
      if (!foundLat && num >= 35.5 && num <= 42.5) {
        foundLat = num;
      } else if (!foundLng && num >= 25.5 && num <= 45.0 && num !== foundLat) {
        foundLng = num;
      }
    }
  }

  if (foundLat && foundLng) {
    return { latitude: foundLat, longitude: foundLng };
  }

  // Try UTM numbers in PDF
  const utmMatches = fullText.match(/\b([0-9]{6,7}\.?[0-9]*)\b/g);
  if (utmMatches && utmMatches.length >= 2) {
    for (let i = 0; i < utmMatches.length - 1; i++) {
      const n1 = parseFloat(utmMatches[i]);
      const n2 = parseFloat(utmMatches[i + 1]);
      const converted = convertTurkishCoordsToWGS84(n1, n2);
      if (converted[1] >= 35 && converted[1] <= 43 && converted[0] >= 25 && converted[0] <= 45) {
        return { latitude: converted[1], longitude: converted[0] };
      }
    }
  }

  throw new Error("PDF dosyasında geçerli koordinat bulunamadı.");
}

/**
 * Main unified file parser entry point
 */
export async function parseAnyFieldFile(file: File): Promise<ParsedFieldResult> {
  const fileNameLower = (file.name || '').toLowerCase();
  const buffer = await file.arrayBuffer();

  // Check magic bytes for ZIP (PK\x03\x04 or PK\x05\x06)
  const uint8 = new Uint8Array(buffer.slice(0, 4));
  const isZipMagic = uint8[0] === 0x50 && uint8[1] === 0x4b && (
    (uint8[2] === 0x03 && uint8[3] === 0x04) ||
    (uint8[2] === 0x05 && uint8[3] === 0x06) ||
    (uint8[2] === 0x07 && uint8[3] === 0x08)
  );

  if (isZipMagic || fileNameLower.endsWith('.zip') || fileNameLower.endsWith('.kmz')) {
    return await parseZipBuffer(buffer);
  }

  if (fileNameLower.endsWith('.kml')) {
    const text = decodeTextBuffer(buffer);
    return await parseKmlContent(text);
  }

  if (fileNameLower.endsWith('.geojson') || fileNameLower.endsWith('.json')) {
    const text = decodeTextBuffer(buffer);
    const { features, properties } = extractFeaturesAndProperties(text);
    if (features.length > 0) {
      return processGeoJSONData({ type: 'FeatureCollection', features });
    }
  }

  if (fileNameLower.endsWith('.shp')) {
    try {
      const shpModule = await import('shpjs');
      const parseShp = shpModule.parseShp || (shpModule.default ? (shpModule.default as any).parseShp : null) || (typeof shpModule.default === 'function' ? shpModule.default : null);
      if (typeof parseShp === 'function') {
        const geojson = await parseShp(buffer);
        return processGeoJSONData(geojson);
      }
    } catch (e) {
      console.warn("Direct SHP parse error:", e);
    }
  }

  if (fileNameLower.endsWith('.dxf')) {
    const text = decodeTextBuffer(buffer);
    return parseDxfContent(text);
  }

  if (fileNameLower.endsWith('.pdf')) {
    return await parsePdfBuffer(buffer);
  }

  if (fileNameLower.endsWith('.txt') || fileNameLower.endsWith('.csv') || fileNameLower.endsWith('.ncz') || fileNameLower.endsWith('.wkt')) {
    const text = decodeTextBuffer(buffer);
    return parseTxtCsvContent(text);
  }

  // Fallback 1: Try decoding as text and extract JSON / WKT / KML regardless of extension
  const text = decodeTextBuffer(buffer);

  if (text.includes('<kml') || text.includes('<Kml')) {
    return await parseKmlContent(text);
  }

  const { features, properties } = extractFeaturesAndProperties(text);
  if (features.length > 0) {
    const res = processGeoJSONData({ type: 'FeatureCollection', features });
    if (res.latitude && res.longitude) {
      return { ...properties, ...res };
    }
  }

  // Fallback 2: Check if it can be opened as a ZIP archive despite unknown extension
  try {
    return await parseZipBuffer(buffer);
  } catch (e) {}

  throw new Error(`'${file.name}' dosyasında geçerli bir tarla sınırı veya koordinat bulunamadı (Tüm formatlar denendi). Lütfen dosyanızın geçerli bir parsel verisi içerdiğinden emin olun.`);
}
