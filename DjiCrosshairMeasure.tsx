import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useMap, useMapEvents, Polyline, Polygon, Marker } from 'react-leaflet';
import L from 'leaflet';
import { Button } from './ui/button';
import { 
  Plus, RotateCcw, Check, X, MapPin, Crosshair, Trash2, 
  ArrowUpRight, LocateFixed, Edit3, Move, CheckCircle2,
  Eye, EyeOff
} from 'lucide-react';
import { toast } from 'sonner';
import { 
  calculateDistanceMeters, 
  calculateBearingDegrees, 
  calculatePolygonStats,
  extractLatLngPointsFromGeometry 
} from '../lib/fieldGeometry';
import { FieldRecord } from '../types';

interface DjiCrosshairMeasureProps {
  isActive: boolean;
  onClose: () => void;
  onSaveField: (
    polygon: any, 
    calculatedAreaDonum: number, 
    centerCoord: { lat: number; lng: number },
    existingFieldId?: string
  ) => void;
  initialField?: FieldRecord | null;
  initialPolygon?: any;
  showOtherFields?: boolean;
  onToggleShowOtherFields?: () => void;
}

// Custom numbered icon for survey waypoints (DJI Agras style)
const createNumberedWaypointIcon = (index: number, isSelected: boolean, isLast: boolean) => {
  const bgColor = isSelected ? '#f59e0b' : isLast ? '#22c55e' : '#0284c7';
  const borderColor = isSelected ? '#fef08a' : '#ffffff';
  
  return L.divIcon({
    className: 'custom-dji-waypoint',
    html: `
      <div style="
        display: flex;
        align-items: center;
        justify-content: center;
        width: ${isSelected ? '30px' : '26px'};
        height: ${isSelected ? '30px' : '26px'};
        background: ${bgColor};
        border: 2px solid ${borderColor};
        border-radius: 50%;
        color: #ffffff;
        font-size: ${isSelected ? '12px' : '11px'};
        font-weight: 800;
        font-family: monospace;
        box-shadow: 0 0 12px rgba(0,0,0,0.6), 0 0 ${isSelected ? '10px' : '4px'} ${bgColor};
        cursor: grab;
        transition: transform 0.15s ease;
      ">
        ${index + 1}
      </div>
    `,
    iconSize: [isSelected ? 30 : 26, isSelected ? 30 : 26],
    iconAnchor: [isSelected ? 15 : 13, isSelected ? 15 : 13]
  });
};

export function DjiCrosshairMeasure({
  isActive,
  onClose,
  onSaveField,
  initialField,
  initialPolygon,
  showOtherFields = true,
  onToggleShowOtherFields
}: DjiCrosshairMeasureProps) {
  const [points, setPoints] = useState<[number, number][]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [centerCoord, setCenterCoord] = useState<[number, number]>([39.9334, 32.8597]);
  const [stats, setStats] = useState({ areaSqMeters: 0, donum: 0, hectare: 0, perimeterMeters: 0 });
  const map = useMap();
  const initializedFieldIdRef = useRef<string | null>(null);

  // Initialize or reset points when activated or field changes
  useEffect(() => {
    if (!isActive) {
      setPoints([]);
      setSelectedIndex(null);
      initializedFieldIdRef.current = null;
      return;
    }

    const polySource = initialPolygon || initialField?.polygon;
    const fieldKey = initialField?.id || (initialPolygon ? 'poly_raw' : 'new_survey');

    if (polySource && initializedFieldIdRef.current !== fieldKey) {
      const extracted = extractLatLngPointsFromGeometry(polySource);
      if (extracted.length > 0) {
        setPoints(extracted);
        initializedFieldIdRef.current = fieldKey;

        // Auto zoom and fit to field points
        if (map) {
          try {
            const bounds = L.latLngBounds(extracted.map(p => L.latLng(p[0], p[1])));
            map.fitBounds(bounds, { padding: [60, 60], animate: true, duration: 0.5 });
          } catch (e) {}
        }
        toast.info(`${initialField?.name || 'Seçili tarla'} sınırları DJI Agras düzenleme modunda açıldı (${extracted.length} köşe noktası).`, {
          duration: 2500
        });
      }
    } else if (!polySource && initializedFieldIdRef.current !== 'empty_new') {
      setPoints([]);
      initializedFieldIdRef.current = 'empty_new';
    }
  }, [isActive, initialField, initialPolygon, map]);

  // Track map center with efficient throttling (60ms throttle during pan, instant on moveend/zoomend)
  const lastMoveTimeRef = useRef<number>(0);
  const rafIdRef = useRef<number | null>(null);

  const updateCenter = useCallback((force = false) => {
    if (!map) return;
    const now = Date.now();
    if (!force && now - lastMoveTimeRef.current < 60) {
      return;
    }
    lastMoveTimeRef.current = now;

    if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    rafIdRef.current = requestAnimationFrame(() => {
      const center = map.getCenter();
      setCenterCoord([center.lat, center.lng]);
    });
  }, [map]);

  useMapEvents({
    move: () => updateCenter(false),
    moveend: () => updateCenter(true),
    zoomend: () => updateCenter(true)
  });

  useEffect(() => {
    if (isActive && map) {
      updateCenter(true);
    }
    return () => {
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    };
  }, [isActive, map, updateCenter]);

  // Recalculate stats whenever points change
  useEffect(() => {
    if (points.length >= 3) {
      const calculated = calculatePolygonStats(points);
      setStats({
        areaSqMeters: calculated.areaSqMeters,
        donum: calculated.donum,
        hectare: calculated.hectare,
        perimeterMeters: calculated.perimeterMeters
      });
    } else {
      setStats({ areaSqMeters: 0, donum: 0, hectare: 0, perimeterMeters: 0 });
    }
  }, [points]);

  if (!isActive) return null;

  const isEditingExisting = Boolean(initialField?.id || initialPolygon);

  const addPointAtCenter = () => {
    try {
      if (navigator.vibrate) navigator.vibrate(35);
    } catch (e) {}

    // Sample current map center directly to ensure sub-millimeter precision
    const currentCenter: [number, number] = map 
      ? [map.getCenter().lat, map.getCenter().lng] 
      : centerCoord;

    let newPoints: [number, number][];
    if (selectedIndex !== null && selectedIndex >= 0 && selectedIndex < points.length) {
      // Insert right after selected index
      newPoints = [
        ...points.slice(0, selectedIndex + 1),
        currentCenter,
        ...points.slice(selectedIndex + 1)
      ];
      setSelectedIndex(selectedIndex + 1);
    } else {
      newPoints = [...points, currentCenter];
    }

    setPoints(newPoints);
    setCenterCoord(currentCenter);
    toast.success(`Nokta ${newPoints.length} eklendi (${currentCenter[0].toFixed(5)}, ${currentCenter[1].toFixed(5)})`, {
      duration: 1200
    });
  };

  const moveSelectedPointToCenter = () => {
    if (selectedIndex === null || selectedIndex < 0 || selectedIndex >= points.length) return;
    try {
      if (navigator.vibrate) navigator.vibrate(30);
    } catch (e) {}

    const currentCenter: [number, number] = map 
      ? [map.getCenter().lat, map.getCenter().lng] 
      : centerCoord;

    const updated = [...points];
    updated[selectedIndex] = currentCenter;
    setPoints(updated);
    setCenterCoord(currentCenter);
    toast.success(`Nokta ${selectedIndex + 1} ekran ortasındaki konuma taşındı.`);
  };

  const deleteSelectedPoint = () => {
    if (selectedIndex === null || selectedIndex < 0 || selectedIndex >= points.length) return;
    try {
      if (navigator.vibrate) navigator.vibrate(20);
    } catch (e) {}

    const updated = points.filter((_, idx) => idx !== selectedIndex);
    setPoints(updated);
    setSelectedIndex(null);
    toast.info(`Nokta ${selectedIndex + 1} silindi.`);
  };

  const addPointAtGps = () => {
    if (!navigator.geolocation) {
      toast.error("GPS desteklenmiyor.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const gpsCoord: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        map.panTo(gpsCoord, { animate: true, duration: 0.5 });
        const newPoints = [...points, gpsCoord];
        setPoints(newPoints);
        try {
          if (navigator.vibrate) navigator.vibrate([30, 40, 30]);
        } catch (e) {}
        toast.success(`GPS Konumu Nokta ${newPoints.length} olarak eklendi!`, { duration: 1500 });
      },
      (err) => {
        toast.error("GPS konumu alınamadı: " + err.message);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const undoLastPoint = () => {
    if (points.length === 0) return;
    try {
      if (navigator.vibrate) navigator.vibrate(20);
    } catch (e) {}
    const newPoints = points.slice(0, -1);
    setPoints(newPoints);
    setSelectedIndex(null);
    toast.info("Son nokta geri alındı.");
  };

  const clearAllPoints = () => {
    if (points.length === 0) return;
    setPoints([]);
    setSelectedIndex(null);
    toast.info("Tüm noktalar temizlendi.");
  };

  const handleFinishAndSave = () => {
    if (points.length < 3) {
      toast.error("Tarla sınırını oluşturmak için en az 3 nokta gereklidir!");
      return;
    }

    const calculated = calculatePolygonStats(points);
    if (!calculated.geojson) {
      toast.error("Geçersiz sınır geometrisi!");
      return;
    }

    try {
      if (navigator.vibrate) navigator.vibrate([50, 50, 50]);
    } catch (e) {}

    // Find center coordinate
    const latSum = points.reduce((acc, p) => acc + p[0], 0);
    const lngSum = points.reduce((acc, p) => acc + p[1], 0);
    const center = { lat: latSum / points.length, lng: lngSum / points.length };

    onSaveField(calculated.geojson, calculated.donum, center, initialField?.id);
    setPoints([]);
    setSelectedIndex(null);
    onClose();
  };

  // Distance from last / selected point to current crosshair center
  const targetPoint = selectedIndex !== null && points[selectedIndex]
    ? points[selectedIndex]
    : points.length > 0 ? points[points.length - 1] : null;

  const distanceToCenter = targetPoint ? calculateDistanceMeters(targetPoint, centerCoord) : null;
  const bearingToCenter = targetPoint ? calculateBearingDegrees(targetPoint, centerCoord) : null;

  // Closed polygon coordinates for rendering
  const closedPoints = points.length >= 3 ? [...points, points[0]] : points;

  return (
    <>
      {/* Visual Lines & Polygon on Map */}
      {points.length >= 2 && (
        <Polyline
          positions={closedPoints}
          pathOptions={{
            color: '#22c55e',
            weight: 3.5,
            dashArray: points.length < 3 ? '6, 6' : undefined,
            lineCap: 'round'
          }}
        />
      )}

      {/* Real-time Dynamic Line from Active Point to Center Crosshair */}
      {targetPoint && (
        <Polyline
          positions={[targetPoint, centerCoord]}
          pathOptions={{
            color: selectedIndex !== null ? '#f59e0b' : '#06b6d4',
            weight: 2,
            dashArray: '4, 4'
          }}
        />
      )}

      {points.length >= 3 && (
        <Polygon
          positions={points}
          pathOptions={{
            color: '#22c55e',
            fillColor: '#16a34a',
            fillOpacity: 0.3,
            weight: 3
          }}
        />
      )}

      {/* Numbered & Draggable Waypoint Markers */}
      {points.map((p, idx) => (
        <Marker
          key={`wpt-${idx}-${p[0]}-${p[1]}`}
          position={p}
          draggable={true}
          icon={createNumberedWaypointIcon(idx, idx === selectedIndex, idx === points.length - 1)}
          eventHandlers={{
            click: (e) => {
              L.DomEvent.stopPropagation(e);
              setSelectedIndex(idx === selectedIndex ? null : idx);
            },
            dragend: (e) => {
              const marker = e.target;
              const newPos = marker.getLatLng();
              const updated = [...points];
              updated[idx] = [newPos.lat, newPos.lng];
              setPoints(updated);
              setSelectedIndex(idx);
              toast.success(`Nokta ${idx + 1} taşındı.`);
            }
          }}
        />
      ))}

      {/* FIXED CENTER OPTICAL CROSSHAIR HUD (DJI Smart Farm / Agras Style) */}
      <div className="absolute inset-0 pointer-events-none z-[1200] flex items-center justify-center">
        <div className="relative flex items-center justify-center">
          {/* Outer Glowing Ring */}
          <div className="w-14 h-14 rounded-full border-2 border-cyan-400/80 shadow-[0_0_15px_rgba(6,182,212,0.6)] animate-pulse flex items-center justify-center">
            <div className="w-6 h-6 rounded-full border border-cyan-300/60"></div>
          </div>
          {/* Crosshair Hairlines */}
          <div className="absolute w-20 h-[1.5px] bg-cyan-400/90 shadow-[0_0_6px_#06b6d4]"></div>
          <div className="absolute h-20 w-[1.5px] bg-cyan-400/90 shadow-[0_0_6px_#06b6d4]"></div>
          {/* Center Pinpoint Red Dot */}
          <div className="absolute w-2.5 h-2.5 rounded-full bg-red-500 border border-white shadow-[0_0_8px_#ef4444]"></div>

          {/* Real-time Distance / Bearing Tag next to crosshair */}
          {distanceToCenter !== null && (
            <div className="absolute left-10 -top-3 bg-zinc-950/90 backdrop-blur-md text-cyan-300 border border-cyan-500/40 text-[11px] font-mono px-2 py-0.5 rounded-md shadow-lg whitespace-nowrap flex items-center gap-1">
              <ArrowUpRight className="w-3 h-3 text-cyan-400" />
              <span>{distanceToCenter.toFixed(1)} m</span>
              <span className="text-zinc-400">({bearingToCenter}°)</span>
            </div>
          )}
        </div>
      </div>

      {/* TOP STATUS & MEASUREMENT HUD */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1300] pointer-events-auto max-w-md w-[92vw] sm:w-auto animate-in slide-in-from-top-4 duration-300">
        <div className="bg-zinc-950/95 backdrop-blur-xl border border-cyan-500/40 rounded-2xl p-3 sm:p-4 shadow-[0_0_30px_rgba(0,0,0,0.8)] text-white">
          <div className="flex items-center justify-between gap-3 border-b border-zinc-800 pb-2 mb-2">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-cyan-500/20 text-cyan-400 rounded-lg border border-cyan-500/30">
                <Crosshair className="w-4 h-4 animate-spin-slow" />
              </div>
              <div>
                <h3 className="font-bold text-xs sm:text-sm text-cyan-300 flex items-center gap-1.5">
                  {isEditingExisting ? `DJI Agras: ${initialField?.name || 'Sınır Düzenleme'}` : 'DJI Agras Ölçüm & Sınırlandırma'}
                </h3>
                <p className="text-[10px] text-zinc-400 font-mono">
                  {selectedIndex !== null 
                    ? `Nokta ${selectedIndex + 1} seçili: Sürükleyin veya merkeze taşıyın`
                    : 'İmleci sınır noktasına getirin ve (+) tuşuna basın'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {onToggleShowOtherFields && (
                <button
                  type="button"
                  onClick={onToggleShowOtherFields}
                  className={`px-2 py-1 text-[11px] font-semibold rounded-xl border flex items-center gap-1.5 transition-all shadow-sm ${
                    showOtherFields
                      ? 'bg-cyan-950/70 border-cyan-500/50 text-cyan-300 hover:bg-cyan-900/80'
                      : 'bg-zinc-900/90 border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                  }`}
                  title={showOtherFields ? "Diğer tarla sınırları görünür (dokunmalar kilitli). Gizlemek için tıklayın." : "Diğer tarla sınırları gizli. Görmek için tıklayın."}
                >
                  {showOtherFields ? (
                    <>
                      <Eye className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      <span className="hidden sm:inline">Diğer Tarlalar</span>
                    </>
                  ) : (
                    <>
                      <EyeOff className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                      <span className="hidden sm:inline">Diğer Tarlalar: Gizli</span>
                      <span className="sm:hidden">Gizli</span>
                    </>
                  )}
                </button>
              )}
              <button
                onClick={onClose}
                className="p-1 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition"
                title="Ölçümden Çık"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Grid Stats */}
          <div className="grid grid-cols-3 gap-2 text-center font-mono">
            <div className="bg-zinc-900/80 rounded-xl p-2 border border-zinc-800/80">
              <span className="text-[10px] text-zinc-400 uppercase block">Köşe</span>
              <span className="text-sm sm:text-base font-extrabold text-cyan-400">{points.length}</span>
            </div>
            <div className="bg-zinc-900/80 rounded-xl p-2 border border-zinc-800/80">
              <span className="text-[10px] text-zinc-400 uppercase block">Alan (Dönüm)</span>
              <span className="text-sm sm:text-base font-extrabold text-emerald-400">
                {stats.donum > 0 ? stats.donum : '0.00'}
              </span>
            </div>
            <div className="bg-zinc-900/80 rounded-xl p-2 border border-zinc-800/80">
              <span className="text-[10px] text-zinc-400 uppercase block">Çevre</span>
              <span className="text-sm sm:text-base font-extrabold text-amber-400">
                {stats.perimeterMeters > 0 ? `${stats.perimeterMeters} m` : '0 m'}
              </span>
            </div>
          </div>

          {/* Selected Point Action Strip */}
          {selectedIndex !== null && (
            <div className="mt-2 pt-2 border-t border-zinc-800 flex items-center justify-between gap-2">
              <span className="text-[11px] text-amber-400 font-bold flex items-center gap-1">
                <Edit3 className="w-3.5 h-3.5" />
                Nokta {selectedIndex + 1}
              </span>
              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={moveSelectedPointToCenter}
                  className="h-7 text-[10px] bg-amber-950/40 border-amber-800 text-amber-300 hover:bg-amber-900/60 rounded-lg px-2"
                >
                  <Move className="w-3 h-3 mr-1" />
                  Merkeze Taşı
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={deleteSelectedPoint}
                  className="h-7 text-[10px] bg-red-950/40 border-red-800 text-red-300 hover:bg-red-900/60 rounded-lg px-2"
                >
                  <Trash2 className="w-3 h-3 mr-1" />
                  Sil
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* BOTTOM CONTROLLER ACTION BUTTONS */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1300] pointer-events-auto flex flex-col items-center gap-2 max-w-md w-[92vw] animate-in slide-in-from-bottom-4 duration-300">
        <div className="bg-zinc-950/95 backdrop-blur-xl border border-zinc-800/90 rounded-2xl p-2 shadow-2xl flex items-center justify-between gap-2 w-full">
          {/* Undo Button */}
          <Button
            type="button"
            variant="outline"
            disabled={points.length === 0}
            onClick={undoLastPoint}
            className="flex-1 bg-zinc-900/90 border-zinc-700 text-zinc-200 hover:bg-zinc-800 h-12 text-xs font-semibold rounded-xl flex items-center justify-center gap-1"
            title="Son Noktayı Geri Al"
          >
            <RotateCcw className="w-4 h-4 text-amber-400" />
            <span className="hidden sm:inline">Geri Al</span>
          </Button>

          {/* MAIN ADD / INSERT POINT BUTTON */}
          <Button
            type="button"
            onClick={addPointAtCenter}
            className="flex-[1.6] bg-cyan-600 hover:bg-cyan-500 text-white font-bold h-12 rounded-xl text-sm shadow-[0_0_15px_rgba(6,182,212,0.4)] flex items-center justify-center gap-1.5 active:scale-95 transition-all"
          >
            <Plus className="w-5 h-5 stroke-[3]" />
            <span>{selectedIndex !== null ? 'Araya Ekle' : 'Nokta Ekle'}</span>
          </Button>

          {/* GPS Pin Button */}
          <Button
            type="button"
            variant="outline"
            onClick={addPointAtGps}
            className="flex-1 bg-zinc-900/90 border-zinc-700 text-blue-400 hover:bg-zinc-800 h-12 text-xs font-semibold rounded-xl flex items-center justify-center gap-1"
            title="GPS Konumunu Nokta Olarak Ekle"
          >
            <LocateFixed className="w-4 h-4" />
            <span className="hidden sm:inline">GPS</span>
          </Button>

          {/* Complete / Save Field Button */}
          <Button
            type="button"
            disabled={points.length < 3}
            onClick={handleFinishAndSave}
            className={`flex-1 h-12 text-xs font-bold rounded-xl flex items-center justify-center gap-1 transition-all ${
              points.length >= 3
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-[0_0_15px_rgba(34,197,94,0.4)] animate-bounce'
                : 'bg-zinc-900 text-zinc-500 border border-zinc-800 cursor-not-allowed'
            }`}
            title={isEditingExisting ? "Sınır Değişikliklerini Kaydet" : "Tarlayı Tamamla ve Kaydet"}
          >
            <Check className="w-4 h-4 stroke-[3]" />
            <span>{isEditingExisting ? 'Güncelle' : 'Kaydet'}</span>
          </Button>
        </div>

        {/* Clear / Reset Footer */}
        {points.length > 0 && (
          <button
            onClick={clearAllPoints}
            className="text-[11px] text-zinc-400 hover:text-red-400 transition flex items-center gap-1 bg-zinc-900/80 px-3 py-1 rounded-full border border-zinc-800"
          >
            <Trash2 className="w-3 h-3" />
            <span>Tüm Çizimi Sıfırla ({points.length} nokta)</span>
          </button>
        )}
      </div>
    </>
  );
}
