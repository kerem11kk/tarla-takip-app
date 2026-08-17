import { OfflineDownloadModal } from './OfflineDownloadModal';
import { downloadRegionForOffline } from '../lib/offlineMaps';
import React, { useEffect, useState, useRef } from 'react';
import { User } from 'firebase/auth';
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline, LayersControl, GeoJSON, CircleMarker, useMapEvents, Tooltip, Circle } from 'react-leaflet';
import L from 'leaflet';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { FieldRecord } from '../types';
import { Button } from './ui/button';
import { Navigation, ExternalLink, LocateFixed, Edit2, Trash2, MapPin, X, DownloadCloud, Info, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { deleteDoc, doc } from 'firebase/firestore';
import { getLocalFields, deleteLocalField } from '../lib/localFields';
import { WeatherWidget } from './WeatherWidget';
import { calculateFieldAreaSqMeters, formatAreaDomum, getTopRightCoordinate, getCentroidCoordinate } from '../lib/area';

// Fix Leaflet's default icon path issues with webpack/vite
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const greenIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const goldIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-gold.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const blueIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

import { DeviceRecord } from '../lib/device';
import { DjiCrosshairMeasure } from './DjiCrosshairMeasure';
import { GuidanceLine } from '../lib/fieldGeometry';

const createGuidancePointIcon = (label: string, color: string) => {
  return L.divIcon({
    className: 'custom-guidance-point',
    html: `
      <div style="
        display: flex;
        align-items: center;
        justify-content: center;
        width: 22px;
        height: 22px;
        background: ${color};
        border: 2px solid #ffffff;
        border-radius: 50%;
        color: #ffffff;
        font-size: 11px;
        font-weight: 900;
        font-family: monospace;
        box-shadow: 0 0 10px rgba(0,0,0,0.7), 0 0 6px ${color};
      ">
        ${label}
      </div>
    `,
    iconSize: [22, 22],
    iconAnchor: [11, 11]
  });
};

interface MapViewProps {
  user: User;
  selectedFieldId: string | null;
  onSelectField: (id: string | null) => void;
  onEditField: (field: FieldRecord) => void;
  isDjiMeasureActive?: boolean;
  onCloseDjiMeasure?: () => void;
  onSaveDjiField?: (polygon: any, calculatedAreaDonum: number, centerCoord: { lat: number; lng: number }, existingFieldId?: string) => void;
  djiMeasureField?: FieldRecord | null;
  djiMeasurePolygon?: any;
  guidanceLines?: GuidanceLine[];
  onClearGuidanceLines?: () => void;
}

import { RemoteControlModal } from './RemoteControlModal';

export function MapView({ 
  user, 
  selectedFieldId, 
  onSelectField, 
  onEditField,
  isDjiMeasureActive = false,
  onCloseDjiMeasure = () => {},
  onSaveDjiField = () => {},
  djiMeasureField = null,
  djiMeasurePolygon = null,
  guidanceLines = [],
  onClearGuidanceLines = () => {}
}: MapViewProps) {
  const [fields, setFields] = useState<FieldRecord[]>([]);
  const [devices, setDevices] = useState<DeviceRecord[]>([]);
  const [remoteDevice, setRemoteDevice] = useState<DeviceRecord | null>(null);
  const [showOtherFieldsInDji, setShowOtherFieldsInDji] = useState<boolean>(true);
  const isRoot = localStorage.getItem('is_root_user') === 'true';

  useEffect(() => {
    if (user.uid === 'guest_user') {
      const loadLocal = () => {
        const local = getLocalFields();
        const records = local.map(data => {
          let polygon = data.polygon;
          if (typeof polygon === 'string') {
            try {
              polygon = JSON.parse(polygon);
              if (typeof polygon === 'string') polygon = JSON.parse(polygon);
            } catch (e) {}
          }
          return { ...data, polygon };
        });
        setFields(records);
      };
      loadLocal();
      window.addEventListener('local-fields-changed', loadLocal);
      return () => window.removeEventListener('local-fields-changed', loadLocal);
    }

    if (!db) return;

    const q = query(collection(db, 'fields'), where('ownerId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const records: FieldRecord[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        let polygon = data.polygon;
        if (typeof polygon === 'string') {
          try {
            polygon = JSON.parse(polygon);
          } catch (e) {
            console.error("Error parsing polygon:", e);
          }
        }
        records.push({ id: docSnap.id, ...data, polygon } as FieldRecord);
      });
      setFields(records);
    }, (error) => {
      console.error(error);
    });

    const qDevices = query(collection(db, 'devices'), where('groupId', '==', user.uid));
    const unsubDevices = onSnapshot(qDevices, (snapshot) => {
      const records: DeviceRecord[] = [];
      snapshot.forEach((docSnap) => {
        const d = (docSnap.data() || {}) as Partial<DeviceRecord>;
        records.push({
          id: docSnap.id || d.id || '',
          groupId: d.groupId || user.uid,
          name: d.name || 'Cihaz',
          status: d.status === 'banned' ? 'banned' : 'active',
          lastSeen: d.lastSeen || null,
          isRoot: !!d.isRoot,
          latitude: d.latitude,
          longitude: d.longitude,
          speed: d.speed,
          progress: d.progress,
          currentTask: d.currentTask,
        });
      });
      setDevices(records.filter(d => Boolean(d && d.status === 'active' && d.id && d.id !== getLocalDeviceId() && d.latitude && d.longitude)));
    }, (err) => {
      console.error("Cihazlar yüklenirken hata:", err);
    });

    return () => { unsubscribe(); unsubDevices(); };
  }, [user.uid]);

  const selectedField = fields.find(f => f.id === selectedFieldId);

  return (
    <div className="w-full h-full relative z-0">
      <MapContainer attributionControl={false} 
        center={[38.9637, 35.2433]} 
        zoom={6} 
        style={{ width: '100%', height: '100%' }}
        zoomControl={false}
        preferCanvas={true}
      >
        <TileLayer
          attribution="&copy; Google Maps"
          url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"
          maxZoom={20}
        />
        
        {fields
          .filter((field) => {
            if (!isDjiMeasureActive) return true;
            if (showOtherFieldsInDji) return true;
            // If hidden, only show the field currently being measured/edited (if any)
            return djiMeasureField && djiMeasureField.id === field.id;
          })
          .map((field) => (
            <MemoizedFieldEntity 
              key={field.id}
              field={field} 
              isSelected={!isDjiMeasureActive && selectedFieldId === field.id}
              onSelect={onSelectField}
              onEdit={onEditField}
              userId={user.uid}
              isInteractive={!isDjiMeasureActive}
              isDjiBackground={isDjiMeasureActive}
            />
          ))}

        {/* Guidance / Dümenleme / Bölme Hatları */}
        {guidanceLines && guidanceLines.length > 0 && (
          <MemoizedGuidanceLines lines={guidanceLines} />
        )}

        {devices.map((device) => {
          if (!device || !device.id || !device.latitude || !device.longitude) return null;
          return (
              <Marker
                key={device.id}
                position={[device.latitude, device.longitude]}
                icon={blueIcon}
                interactive={!isDjiMeasureActive}
             >
                {!isDjiMeasureActive && (
                  <Popup>
                     <div className="font-bold text-blue-700">{device.name || 'Cihaz'}</div>
                     <div className="text-xs text-zinc-500 mb-2">Cihaz Konumu</div>
                     {isRoot && (
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="w-full h-7 text-[10px] uppercase font-bold text-indigo-600 border-indigo-200 hover:bg-indigo-50"
                          onClick={() => setRemoteDevice(device)}
                        >
                           Ekran Bağlama
                        </Button>
                     )}
                  </Popup>
                )}
             </Marker>
          );
        })}
        
        <MapController 
          selectedField={selectedField} 
          onClearSelect={() => onSelectField(null)} 
          isDjiMeasureActive={isDjiMeasureActive} 
        />
        <UserLocationMarker hasSelected={!!selectedFieldId} />
        <ParcelQueryControl user={user} />
        <GeomanControl user={user} />
        <DjiCrosshairMeasure
          isActive={isDjiMeasureActive}
          onClose={onCloseDjiMeasure}
          onSaveField={onSaveDjiField}
          initialField={djiMeasureField}
          initialPolygon={djiMeasurePolygon}
          showOtherFields={showOtherFieldsInDji}
          onToggleShowOtherFields={() => setShowOtherFieldsInDji((prev) => !prev)}
        />
      </MapContainer>

      {/* Floating Guidance Line Active Controller - Positioned at Bottom Right to prevent menu overlap */}
      {guidanceLines && guidanceLines.length > 0 && (
        <div className="absolute bottom-6 right-4 sm:right-6 z-[1100] bg-zinc-950/95 backdrop-blur-xl border border-cyan-500/60 text-white p-3 rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.8)] flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-4 animate-in slide-in-from-right-4 duration-300 pointer-events-auto max-w-[92vw] sm:max-w-md">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-500"></span>
            </span>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-xs text-cyan-300">A-B Dümenleme Hattı</span>
                <span className="text-[10px] bg-cyan-950 text-cyan-400 border border-cyan-800 px-1.5 py-0.2 rounded-md font-mono">
                  {guidanceLines.length} Hat
                </span>
              </div>
              <p className="text-[10px] text-zinc-400">
                Oto-dümenleme & bölme kılavuz çizgileri aktif
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
            <Button
              size="sm"
              variant="outline"
              onClick={() => window.dispatchEvent(new CustomEvent('open-ai-copilot'))}
              className="h-7 px-2 text-[11px] font-bold bg-indigo-950/60 border-indigo-500/40 text-indigo-300 hover:bg-indigo-900/60 hover:text-white rounded-xl"
              title="AI Düzenleme Menüsünü Aç"
            >
              <Sparkles className="w-3 h-3 mr-1 text-indigo-400" />
              AI Düzenle
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onClearGuidanceLines}
              className="h-7 px-2 text-[11px] font-medium text-zinc-400 hover:text-red-400 hover:bg-red-950/40 rounded-xl"
              title="Kılavuz Hatları Kaldır"
            >
              <X className="w-3.5 h-3.5 mr-0.5" />
              Kaldır
            </Button>
          </div>
        </div>
      )}

      {/* Remote Control View */}
      {remoteDevice && (
        <RemoteControlModal isOpen={!!remoteDevice} onClose={() => setRemoteDevice(null)} device={remoteDevice} />
      )}
    </div>
  );
}

import { updateDeviceLocation, getLocalDeviceId } from '../lib/device';

function UserLocationMarker({ hasSelected }: { hasSelected: boolean }) {
  const [position, setPosition] = useState<[number, number] | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const map = useMap();

  // Keep references to skip restarting the watchPosition callback during state or map navigation shifts
  const isFollowingRef = React.useRef(isFollowing);
  const mapRef = React.useRef(map);
  const lastPositionRef = React.useRef<[number, number] | null>(null);
  const lastReportTimeRef = React.useRef<number>(0);
  const errorCountRef = React.useRef(0);

  const [useHighAccuracy, setUseHighAccuracy] = useState(() => {
    // Only use high accuracy if battery is okay or if explicitly needed. We default to true but will downgrade on error.
    return true;
  });
  const [isOfflineModalOpen, setIsOfflineModalOpen] = useState(false);
  const [downloadBounds, setDownloadBounds] = useState<any>(null);

  const markerRef = React.useRef<any>(null);
  const accuracyCircleRef = React.useRef<any>(null);

  React.useEffect(() => {
    isFollowingRef.current = isFollowing;
  }, [isFollowing]);

  React.useEffect(() => {
    mapRef.current = map;
  }, [map]);

  useMapEvents({
    dragstart: () => {
      // Disable following mode directly if user interacts with the map canvas
      setIsFollowing(false);
    },
  });

  useEffect(() => {
    if (hasSelected) {
      setIsFollowing(false);
    }
  }, [hasSelected]);

  useEffect(() => {
    if (!navigator.geolocation) return;

    let watchId: number;

    const startWatching = (highAcc: boolean) => {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const newPos: [number, number] = [pos.coords.latitude, pos.coords.longitude];
          
          let dist = 999;
          if (lastPositionRef.current) {
             const lat1 = lastPositionRef.current[0];
             const lon1 = lastPositionRef.current[1];
             const lat2 = newPos[0];
             const lon2 = newPos[1];
             // roughly 111km per degree.
             dist = Math.sqrt(Math.pow(lat1 - lat2, 2) + Math.pow(lon1 - lon2, 2)) * 111000;
          }

          const now = Date.now();
          if (now - lastReportTimeRef.current > 10000) {
              const deviceId = getLocalDeviceId();
              if (deviceId) {
                  updateDeviceLocation(deviceId, pos.coords.latitude, pos.coords.longitude);
              }
              lastReportTimeRef.current = now;
          }

          // Sadece 1.5 metreden fazla değişim varsa component'i render et (Stutter/Lag önlemi)
          if (dist > 1.5 || !lastPositionRef.current) {
            if (!lastPositionRef.current) {
               setPosition(newPos);
               setAccuracy(pos.coords.accuracy);
            } else {
               if (markerRef.current) markerRef.current.setLatLng(newPos);
               if (accuracyCircleRef.current) {
                  accuracyCircleRef.current.setLatLng(newPos);
                  accuracyCircleRef.current.setRadius(pos.coords.accuracy);
               }
            }
            lastPositionRef.current = newPos;
            errorCountRef.current = 0;

            const isLowAccuracy = pos.coords.accuracy > 150;
            if (isLowAccuracy) {
               console.log(`Konum hassasiyeti limitli (${Math.round(pos.coords.accuracy)}m).`);
            } else {
               toast.dismiss('gps-acc');
            }

            if (isFollowingRef.current) {
              mapRef.current.setView(newPos, mapRef.current.getZoom(), { animate: dist > 10 ? false : true, duration: 0.5 });
            }
          }
        },
        (err) => {
          // Elegant info instead of console.warn spams
          console.log(`Konum takibi (${highAcc ? 'Hassas' : 'Standart'} mod): ${err.message}`);
          
          if (err.code === 1) { // PERMISSION_DENIED
            toast.error("Tarayıcı konum izni reddedildi. Lütfen adres çubuğundaki kilit simgesinden izin verin.", { id: 'gps-perm' });
          } else {
            errorCountRef.current += 1;
            // Force self-healing to standard accuracy if high accuracy repeatedly fails or times out
            if (highAcc && errorCountRef.current >= 2) {
              console.log("Hassas GPS uyduları cevap vermedi. Güvenli hücre/Wi-Fi konum moduna geçiliyor...");
              setUseHighAccuracy(false);
            }
          }
        },
        { 
          enableHighAccuracy: highAcc, 
          timeout: highAcc ? 20000 : 30000, 
          maximumAge: 0 // Always fetch fresh location, avoid returning cached Wi-Fi location
        }
      );
    };

    startWatching(useHighAccuracy);

    return () => {
      if (watchId) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [useHighAccuracy]);

  
  useEffect(() => {
    const handleTrigger = () => {
      setDownloadBounds(map.getBounds());
      setIsOfflineModalOpen(true);
    };
    window.addEventListener('trigger-offline-download', handleTrigger);
    return () => window.removeEventListener('trigger-offline-download', handleTrigger);
  }, [map]);

  const handleLocateMe = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    // INSTANT: If background watch position already locked on a coordinate, immediately focus the map!
    if (lastPositionRef.current) {
      const currentPos = lastPositionRef.current;
      setIsFollowing(true);
      map.flyTo(currentPos, 17, { animate: true, duration: 1.2 });
      
      const accuracyText = accuracy ? ` (Doğruluk: ${Math.round(accuracy)}m)` : "";
      toast.success(`Konumunuza anında odaklanıldı${accuracyText}.`, { id: 'gps-locate' });
      return;
    }

    if (navigator.geolocation) {
      const toastId = toast.loading("Doğruluk seviyesi ayarlanarak konum alınıyor...");
      
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          toast.dismiss(toastId);
          const newPos: [number, number] = [pos.coords.latitude, pos.coords.longitude];
          setPosition(newPos);
          setAccuracy(pos.coords.accuracy);
          lastPositionRef.current = newPos;
          setIsFollowing(true); // Enable following mode
          map.flyTo(newPos, 17, { animate: true, duration: 1.5 });
          
          const isLowAccuracy = pos.coords.accuracy > 150;
          if (isLowAccuracy) {
             toast.warning(`Konum alındı ancak hassasiyet düşük (${Math.round(pos.coords.accuracy)}m).`, { id: 'gps-locate' });
          } else {
             toast.success(`Konum alındı (Doğruluk: ${Math.round(pos.coords.accuracy)}m).`, { id: 'gps-locate' });
          }
        },
        (err) => {
          toast.dismiss(toastId);
          console.log("LocateMe high accuracy error:", err.message);
          
          if (err.code === 1) { // PERMISSION_DENIED
            toast.error("Konum izni reddedildi. Lütfen tarayıcı/cihaz ayarlarından konum izni verin.", { id: 'gps-locate' });
          } else {
            // Self-repair fallback: Query with standard precision
            const retryToastId = toast.loading("Hassas GPS alınamadı. Standart hücre/istasyon modunda deneniyor...");
            navigator.geolocation.getCurrentPosition(
              (pos2) => {
                toast.dismiss(retryToastId);
                const newPos: [number, number] = [pos2.coords.latitude, pos2.coords.longitude];
                setPosition(newPos);
                setAccuracy(pos2.coords.accuracy);
                lastPositionRef.current = newPos;
                setIsFollowing(true);
                map.flyTo(newPos, 16, { animate: true, duration: 1.2 });
                toast.warning(`Gereksiz uydular devre dışı bırakılarak standart konum alındı (Hassasiyet: ${Math.round(pos2.coords.accuracy)}m).`, { id: 'gps-locate' });
              },
              (err2) => {
                toast.dismiss(retryToastId);
                toast.error(`Konum cihazınızdan çekilemedi. Lütfen telefon veya tarayıcı konum servisini (GPS) etkinleştirin.`, { id: 'gps-locate' });
              },
              { enableHighAccuracy: false, maximumAge: 0, timeout: 20000 }
            );
          }
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
      );
    } else {
      toast.error("Tarayıcınız konum özelliğini desteklemiyor.");
    }
  };

  return (
    <>
      <OfflineDownloadModal 
        isOpen={isOfflineModalOpen} 
        onClose={() => setIsOfflineModalOpen(false)} 
        bounds={downloadBounds} 
      />
      {position && (
        <>
          {accuracy && accuracy > 0 && !isNaN(accuracy) && (
            <Circle 
              ref={accuracyCircleRef}
              center={position} 
              radius={accuracy} 
              pathOptions={{ color: '#3b82f6', weight: 1, fillColor: '#3b82f6', fillOpacity: 0.15 }} 
            />
          )}
          <CircleMarker 
            ref={markerRef}
            center={position} 
            radius={7} 
            pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#2563eb', fillOpacity: 1 }} 
          >
            <Popup>Şu anki konumunuz (Takip: {isFollowing ? 'Açık' : 'Kapalı'})</Popup>
          </CircleMarker>
        </>
      )}
      <div 
        className={`absolute right-4 z-[1000] transition-all duration-300 ${hasSelected ? 'bottom-[50vh] sm:bottom-4' : 'bottom-4'}`}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        
        

        <Button 
          type="button"
          variant="secondary"
          size="icon"
          className={`rounded-full shadow-lg border h-12 w-12 transition-colors ${
            isFollowing 
              ? 'bg-blue-600 border-blue-700 text-white hover:bg-blue-700' 
              : 'bg-white hover:bg-zinc-100 text-blue-600 border-zinc-200'
          }`} 
          onClick={handleLocateMe}
          title={isFollowing ? "Takip ediliyor (Otomatik odaklama)" : "Konumumu Bul ve Takip Et"}
        >
          <LocateFixed className={`h-6 w-6 ${isFollowing && 'animate-pulse'}`} />
        </Button>
      </div>
    </>
  );
}

// Separate component to control map from outside (like changing center)


function ParcelQueryControl({ user }: { user: User }) {
  const isRoot = localStorage.getItem('is_root_user') === 'true';
  if (!isRoot && user.uid !== 'guest_user') return null;
  const [isQueryMode, setIsQueryMode] = useState(false);
  const map = useMapEvents({
    click: async (e) => {
      if (!isQueryMode) return;
      const { lat, lng } = e.latlng;
      try {
        toast.info("Parsel sorgulanıyor...");
        const res = await fetch(`/api/parsel/${lat}/${lng}`);
        if (res.status === 404) {
          toast.error("Bu noktada parsel verisi bulunamadı.");
          return;
        }
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          console.warn("TKGM API Error:", res.status, text);
          if (res.status === 403) {
            toast.error("TKGM günlük parsel sorgulama limitini aştınız. Lütfen daha sonra tekrar deneyin.");
          } else {
            toast.error(`Parsel sorgulama hatası: ${res.status}`);
          }
          return;
        }
        const data = await res.json();
        
        if (data && data.geometry && data.properties) {
          toast.success(`Parsel bulundu: ${data.properties.mahalleAd} Ada:${data.properties.adaNo} Parsel:${data.properties.parselNo}`);
          
          // Open FieldForm automatically with this data
          // We can dispatch an event to App.tsx to handle adding a new field
          window.dispatchEvent(new CustomEvent('tkgm-parcel-found', {
            detail: {
              polygon: data.geometry,
              properties: data.properties
            }
          }));
          setIsQueryMode(false); // disable after finding
        } else {
          toast.error("Bu noktada parsel verisi bulunamadı.");
        }
      } catch (err: any) {
        console.error(err);
        if (err.name === 'TypeError' && err.message === 'Failed to fetch') {
          // TKGM API drops CORS headers on 404 responses, so browser throws TypeError
          toast.error("Bu noktada parsel bulunamadı (veya ağ hatası).");
        } else {
          toast.error("Parsel sorgulama başarısız oldu.");
        }
      }
    }
  });

  return (
    <div 
      className="absolute right-4 top-32 z-[1000]"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <Button 
        type="button"
        variant={isQueryMode ? "default" : "secondary"}
        size="icon"
        className={`rounded-md shadow-md border h-8 w-8 transition-colors ${isQueryMode ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-white text-zinc-700 hover:bg-zinc-100'}`}
        onClick={(e) => {
          e.stopPropagation();
          setIsQueryMode(!isQueryMode);
          if (!isQueryMode) {
            toast.info("Parsel sorgulama modu aktif. Haritada bir noktaya tıklayın.");
          }
        }}
        title="Parsel Sorgula (Tıklayarak Tarlayı Bul)"
      >
        <Info className="h-5 w-5" />
      </Button>
    </div>
  );
}


function GeomanControl({ user }: { user: User }) {
  const map = useMap();
  const isRoot = localStorage.getItem('is_root_user') === 'true';

  useEffect(() => {
    if (!isRoot && user.uid !== 'guest_user') return;
    
    const pmMap = (map as any).pm;
    if (!pmMap) return;

    pmMap.addControls({
      position: 'topleft',
      drawMarker: false,
      drawCircleMarker: false,
      drawPolyline: false,
      drawRectangle: false,
      drawCircle: false,
      drawText: false,
      drawPolygon: true,
      editMode: true,
      dragMode: true,
      cutPolygon: false,
      removalMode: true,
    });

    pmMap.setGlobalOptions({
      allowSelfIntersection: false,
      snappable: true,
      snapDistance: 15,
      hintlineStyle: { color: '#3388ff', dashArray: '5,5' },
      templineStyle: { color: '#3388ff' }
    });

    const handleCreate = (e: any) => {
      const layer = e.layer;
      const geojson = layer.toGeoJSON();
      
      // Dispatch event to open FieldForm
      window.dispatchEvent(new CustomEvent('tkgm-parcel-found', {
        detail: {
          polygon: geojson.geometry,
          properties: {
            mahalleAd: '',
            adaNo: '',
            parselNo: '',
            ilceAd: '',
            ilAd: ''
          }
        }
      }));
      
      // Remove the drawn layer because FieldForm will re-render it if saved
      setTimeout(() => {
        map.removeLayer(layer);
      }, 500);
    };

    map.on('pm:create', handleCreate);

    return () => {
      map.off('pm:create', handleCreate);
      pmMap.removeControls();
    };
  }, [map, user, isRoot]);

  return null;
}

function MapController({ selectedField, onClearSelect, isDjiMeasureActive = false }: { selectedField?: FieldRecord, onClearSelect: () => void, isDjiMeasureActive?: boolean }) {
  const map = useMapEvents({
    click() {
      if (!isDjiMeasureActive) {
        onClearSelect();
      }
    }
  });
  
  useEffect(() => {
    if (selectedField) {
      if (selectedField.polygon) {
        try {
          const geoJsonLayer = L.geoJSON(selectedField.polygon);
          map.fitBounds(geoJsonLayer.getBounds(), { padding: [50, 50], animate: true, duration: 0.5 });
        } catch (e) {
          map.setView([selectedField.latitude, selectedField.longitude], 16, { animate: true, duration: 0.5 });
        }
      } else {
        map.setView([selectedField.latitude, selectedField.longitude], 16, {
          animate: true,
          duration: 0.5
        });
      }
    }
  }, [selectedField, map]);
  return null;
}

const MemoizedFieldEntity = React.memo(
  function FieldEntity({ 
    field, 
    isSelected, 
    onSelect, 
    onEdit, 
    userId,
    isInteractive = true,
    isDjiBackground = false
  }: { 
    key?: React.Key, 
    field: FieldRecord, 
    isSelected: boolean, 
    onSelect: (id: string) => void, 
    onEdit: (field: FieldRecord) => void, 
    userId: string,
    isInteractive?: boolean,
    isDjiBackground?: boolean
  }) {
    let lat = Number(field.latitude);
    let lng = Number(field.longitude);

    if (field.polygon && typeof field.polygon === 'object') {
      const centroid = getCentroidCoordinate(field.polygon);
      if (centroid && (isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0) || (lat === 38.9637 && lng === 35.2433))) {
        lat = centroid.latitude;
        lng = centroid.longitude;
      }
    }

    if (isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0)) {
      if (field.polygon && typeof field.polygon === 'object') {
        const centroid = getCentroidCoordinate(field.polygon);
        if (centroid) {
          lat = centroid.latitude;
          lng = centroid.longitude;
        }
      }
    }

    const hasValidPos = !isNaN(lat) && !isNaN(lng) && (lat !== 0 || lng !== 0);

    return (
      <React.Fragment>
        {hasValidPos && (
          <Marker 
            position={[lat, lng]} 
            icon={isSelected ? greenIcon : goldIcon}
            interactive={isInteractive}
            eventHandlers={isInteractive ? {
              click: (e: any) => {
                L.DomEvent.stopPropagation(e);
                onSelect(field.id);
              }
            } : {}}
          >
            {isSelected && isInteractive && (
              <Popup>
                <div className="flex flex-col gap-1 p-0.5 w-40 text-sm m-0">
                  <div className="flex justify-between items-center border-b border-zinc-100 pb-1 mb-1">
                    <span className="font-bold truncate pr-2">{field.name || `${field.ada}/${field.parsel}`}</span>
                    <div className="flex gap-1">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-6 w-6 text-blue-600 hover:bg-blue-50"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEdit(field);
                        }}
                      >
                        <Edit2 className="h-3 w-3" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-6 w-6 text-red-600 hover:bg-red-50"
                        onClick={async (e) => {
                          e.stopPropagation();
                            try {
                              if (userId === 'guest_user') {
                                deleteLocalField(field.id);
                              } else {
                                await deleteDoc(doc(db, 'fields', field.id));
                              }
                              toast.success("Tarla başarıyla silindi");
                              window.dispatchEvent(new CustomEvent('field-deleted', { detail: field.id }));
                            } catch (error) {
                               toast.error("Tarla silinirken hata oluştu");
                            }
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <span className="text-zinc-600 font-medium text-xs">Ekin: {
                    field.cropType === 'corn' ? 'Mısır' : 
                    field.cropType === 'wheat' ? 'Buğday' :
                    field.cropType === 'sunflower' ? 'Ayçiçeği' : 
                    field.cropType === 'cotton' ? 'Pamuk' : 
                    field.cropType === 'sugar_beet' ? 'Şeker Pancarı' : 
                    field.cropType === 'crop_area' ? 'Ekin Alanı' :
                    field.cropType === 'solar_panel' ? 'Güneş Paneli' : 'Diğer'
                  }</span>
                  {field.polygon && typeof field.polygon === 'object' && field.polygon.type && (
                    <span className="text-blue-600 font-semibold text-xs">Alan: {formatAreaDomum(calculateFieldAreaSqMeters(field.polygon))} Dönüm</span>
                  )}
                  <span className="text-zinc-500 text-xs line-clamp-2">{field.province}/{field.district}/{field.neighborhood}</span>
                </div>
              </Popup>
            )}
          </Marker>
        )}
        {field.polygon && typeof field.polygon === 'object' && field.polygon.type && (
          <GeoJSON 
            key={`${field.id}-poly-${isSelected}-${isInteractive}`}
            data={field.polygon} 
            interactive={isInteractive}
            eventHandlers={isInteractive ? {
              click: (e: any) => { 
                L.DomEvent.stopPropagation(e);
                onSelect(field.id); 
              }
            } : {}}
            onEachFeature={isInteractive ? (f, layer: any) => {
               layer.options.fieldId = field.id;
               layer.on('click', (e: any) => {
                 L.DomEvent.stopPropagation(e);
                 onSelect(field.id);
               });
            } : undefined}
            pathOptions={(() => {
              let baseColor = '#ca8a04'; // Default gold
              let fillColor = '#ca8a04';
              
              if (field.cropType === 'cotton') {
                baseColor = '#e2e8f0';
                fillColor = '#f8fafc';
              } else if (field.cropType === 'corn') {
                baseColor = '#eab308';
                fillColor = '#fde047';
              } else if (field.cropType === 'sunflower') {
                baseColor = '#f59e0b';
                fillColor = '#fbbf24';
              } else if (field.cropType === 'sugar_beet') {
                baseColor = '#84cc16';
                fillColor = '#bef264';
              } else if (field.cropType === 'wheat') {
                baseColor = '#d97706';
                fillColor = '#fcd34d';
              } else if (field.cropType === 'crop_area') {
                baseColor = '#ef4444'; // Red
                fillColor = '#f87171';
              } else if (field.cropType === 'solar_panel') {
                baseColor = '#22c55e'; // Green
                fillColor = '#4ade80';
              }
              
              if (isSelected) {
                baseColor = '#f43f5e';
                fillColor = '#fb7185';
              }

              return {
                color: baseColor, 
                fillColor: fillColor, 
                fillOpacity: isDjiBackground ? 0.18 : (isSelected ? 0.5 : 0.35),
                weight: isDjiBackground ? 1.5 : (isSelected ? 4 : 2),
                dashArray: isDjiBackground ? '4, 4' : (isSelected ? '' : '5, 5'),
                interactive: isInteractive
              };
            })()} 
          />
        )}
      </React.Fragment>
    );
  },
  (prevProps, nextProps) => {
    // Robust comparison that handles offline/online differences securely without crashing
    const prevTime = prevProps.field.updatedAt && typeof (prevProps.field.updatedAt as any).toMillis === 'function'
      ? (prevProps.field.updatedAt as any).toMillis() 
      : prevProps.field.updatedAt;
      
    const nextTime = nextProps.field.updatedAt && typeof (nextProps.field.updatedAt as any).toMillis === 'function'
      ? (nextProps.field.updatedAt as any).toMillis() 
      : nextProps.field.updatedAt;

    return (
      prevProps.isSelected === nextProps.isSelected &&
      prevProps.isInteractive === nextProps.isInteractive &&
      prevProps.isDjiBackground === nextProps.isDjiBackground &&
      prevProps.field.id === nextProps.field.id &&
      prevProps.field.name === nextProps.field.name &&
      prevProps.field.cropType === nextProps.field.cropType &&
      prevTime === nextTime
    );
  }
);

const MemoizedGuidanceLines = React.memo(
  function GuidanceLinesLayer({ lines }: { lines: GuidanceLine[] }) {
    if (!lines || lines.length === 0) return null;
    return (
      <React.Fragment>
        {lines.map((line, idx) => (
          <React.Fragment key={line.id || `guidance-${idx}-${line.points.length}`}>
            <Polyline
              positions={line.points}
              pathOptions={{
                color: '#06b6d4',
                weight: 4,
                dashArray: '8, 8',
                lineCap: 'round'
              }}
            />
            {line.points[0] && (
              <Marker position={line.points[0]} icon={createGuidancePointIcon('A', '#22c55e')} />
            )}
            {line.points[1] && (
              <Marker position={line.points[1]} icon={createGuidancePointIcon('B', '#ef4444')} />
            )}
          </React.Fragment>
        ))}
      </React.Fragment>
    );
  }
);



