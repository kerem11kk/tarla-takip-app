import React, { useEffect, useState } from 'react';
import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow, Sun, Wind, Droplets, ThermometerSun, CalendarDays, ChevronRight } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';

interface WeatherWidgetProps {
  latitude: number;
  longitude: number;
  stationName?: string;
  isCustomStation?: boolean;
}

interface WeatherData {
  current: {
    temperature_2m: number;
    weather_code: number;
    wind_speed_10m: number;
  };
  daily: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max: number[];
    wind_speed_10m_max: number[];
  };
}

const weatherCache = new Map<string, { data: WeatherData; timestamp: number }>();
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes cache

export function WeatherWidget({ latitude, longitude, stationName, isCustomStation }: WeatherWidgetProps) {
  const [data, setData] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const latNum = parseFloat(String(latitude));
    const lngNum = parseFloat(String(longitude));

    if (isNaN(latNum) || isNaN(lngNum)) {
      setError("Geçersiz koordinat bilgisi.");
      setLoading(false);
      return;
    }

    const latKey = latNum.toFixed(3);
    const lngKey = lngNum.toFixed(3);
    const cacheKey = `${latKey}_${lngKey}`;
    const cached = weatherCache.get(cacheKey);

    if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
      setData(cached.data);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    const fetchWeather = async () => {
      try {
        const lat = latNum.toFixed(5);
        const lng = lngNum.toFixed(5);
        
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max&timezone=Europe%2FIstanbul`;
        
        const res = await fetch(url);
        
        let json;
        try {
          json = await res.json();
        } catch (e) {
          throw new Error("Sunucudan geçersiz bir yanıt alındı.");
        }

        if (!res.ok) {
          throw new Error(json.reason || 'Hava durumu sunucusuna erişilemedi');
        }
        
        weatherCache.set(cacheKey, { data: json, timestamp: Date.now() });

        if (active) {
          setData(json);
        }
      } catch (err: any) {
        if (active) {
          console.error("Hava durumu hatası:", err);
          setError(err.message || "Bilinmeyen bir hata oluştu.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    fetchWeather();

    return () => {
      active = false;
    };
  }, [latitude, longitude]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-24 animate-pulse bg-blue-50/50 rounded-xl border border-blue-100">
        <div className="text-blue-500 font-medium text-xs">Hava durumu yükleniyor...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex justify-center items-center h-24 bg-red-50/50 rounded-xl border border-red-100 p-3">
        <div className="text-red-600 font-semibold text-[11px] text-center">
          <div>Hava durumu yüklenemedi</div>
          <p className="text-[9px] font-mono text-medium text-red-500 mt-0.5 opacity-90 font-normal">
            Hata: {error || "Gerekli veri bulunamadı"}
          </p>
        </div>
      </div>
    );
  }

  const codeToIconAndText = (code: number) => {
    if (code === 0) return { icon: <Sun className="h-full w-full text-amber-500" />, text: 'Açık' };
    if (code === 1 || code === 2 || code === 3) return { icon: <Cloud className="h-full w-full text-zinc-400" />, text: 'Bulutlu' };
    if (code === 45 || code === 48) return { icon: <CloudFog className="h-full w-full text-zinc-400" />, text: 'Sisli' };
    if (code >= 51 && code <= 57) return { icon: <CloudDrizzle className="h-full w-full text-blue-400" />, text: 'Çisenti' };
    if (code >= 61 && code <= 67) return { icon: <CloudRain className="h-full w-full text-blue-500" />, text: 'Yağmurlu' };
    if (code >= 71 && code <= 77) return { icon: <CloudSnow className="h-full w-full text-indigo-200" />, text: 'Karlı' };
    if (code >= 80 && code <= 82) return { icon: <CloudRain className="h-full w-full text-blue-500" />, text: 'Sağanak' };
    if (code >= 85 && code <= 86) return { icon: <CloudSnow className="h-full w-full text-indigo-300" />, text: 'Kar Sağanağı' };
    if (code >= 95) return { icon: <CloudLightning className="h-full w-full text-purple-500" />, text: 'Fırtına' };
    
    return { icon: <Cloud className="h-full w-full text-zinc-400" />, text: 'Bilinmiyor' };
  };

  const currentStatus = codeToIconAndText(data.current.weather_code);

  return (
    <div className="bg-gradient-to-br from-blue-50 to-indigo-50/30 rounded-lg border border-blue-100 overflow-hidden shadow-sm">
      <div className={`p-2 flex items-center justify-between border-b ${isCustomStation ? 'border-amber-200/60 bg-amber-50/30' : 'border-blue-100/50'}`}>
        <div>
          <div className="flex items-center gap-1 text-[10px] font-medium text-blue-900 mb-0.5">
            <ThermometerSun className="h-3 w-3" /> 
            {stationName ? (
               <span className="text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded flex items-center gap-1 font-semibold border border-amber-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                  {stationName}
               </span>
            ) : (
               'Şu Anki Durum'
            )}
          </div>
          <div className="flex items-end gap-1.5 mt-1.5">
            <span className="text-xl font-bold tracking-tight text-slate-800">
              {Math.round(data.current.temperature_2m)}°C
            </span>
            <span className="text-[10px] font-medium text-slate-600 mb-0.5">{currentStatus.text}</span>
          </div>
        </div>
        <div className="w-6 h-6">
          {currentStatus.icon}
        </div>
      </div>
      
      <div className="bg-white/60 px-2 py-1 flex items-center gap-2 text-[10px] font-medium text-slate-600">
        <div className="flex items-center gap-1">
          <Wind className="h-3 w-3 text-blue-400" />
          Rüzgar: {data.current.wind_speed_10m} km/s
        </div>
      </div>

      <div className="p-1.5 bg-white/40 border-t border-blue-50/50">
        <div className="flex items-center justify-between px-1 mb-1.5">
           <div className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider">3 Günlük Tahmin</div>
           <Dialog>
             <DialogTrigger render={<button className="text-[10px] font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-0.5 transition-colors focus:outline-none" />}>
                 7 Günlük <ChevronRight className="h-3 w-3" />
             </DialogTrigger>
             <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-lg text-slate-800">
                    <CalendarDays className="h-5 w-5 text-blue-500" />
                    7 Günlük Hava Durumu
                  </DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-2 mt-4 max-h-[60vh] overflow-y-auto pr-1">
                  {data.daily.time.map((dateStr, idx) => {
                    const code = data.daily.weather_code[idx];
                    const maxTemp = Math.round(data.daily.temperature_2m_max[idx]);
                    const minTemp = Math.round(data.daily.temperature_2m_min[idx]);
                    const precipProb = data.daily.precipitation_probability_max?.[idx] || 0;
                    const maxWind = data.daily.wind_speed_10m_max?.[idx] || 0;
                    
                    const status = codeToIconAndText(code);
                    const date = new Date(dateStr);
                    const dayName = new Intl.DateTimeFormat('tr-TR', { weekday: 'long' }).format(date);
                    const formattedDate = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short' }).format(date);
                    
                    const isToday = idx === 0;

                    return (
                      <div key={dateStr} className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-xl border gap-3 ${isToday ? 'bg-blue-50/60 border-blue-200' : 'bg-slate-50/50 border-slate-100 hover:bg-slate-50 transition-colors'}`}>
                        <div className="flex items-center gap-4">
                          <div className="flex flex-col min-w-[70px]">
                            <span className="font-bold text-slate-800">{isToday ? 'Bugün' : dayName}</span>
                            <span className="text-xs text-slate-500 font-medium">{formattedDate}</span>
                          </div>
                          <div className="flex items-center gap-3 border-l pl-4 border-slate-200">
                            <div className="h-8 w-8 shrink-0">{status.icon}</div>
                            <span className="text-[13px] font-semibold text-slate-700 w-24 line-clamp-2 leading-tight">{status.text}</span>
                          </div>
                        </div>
                        
                        <div className="flex justify-between sm:flex-col sm:items-end gap-1 sm:pl-0 pl-14">
                           <div className="flex items-center gap-2 font-bold text-base">
                             <span className="text-slate-800">{maxTemp}°</span>
                             <span className="text-slate-400">{minTemp}°</span>
                           </div>
                           <div className="flex items-center gap-3 text-xs text-slate-500 font-medium">
                             <div className="flex items-center gap-1" title="Yağış İhtimali">
                               <Droplets className="h-3.5 w-3.5 text-blue-400" /> %{precipProb}
                             </div>
                             <div className="flex items-center gap-1" title="Maks. Rüzgar hızı">
                               <Wind className="h-3.5 w-3.5 text-slate-400" /> {maxWind}
                             </div>
                           </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
             </DialogContent>
           </Dialog>
        </div>
        <div className="grid grid-cols-3 gap-1">
          {(data?.daily?.time || []).slice(1, 4).map((dateStr, idx) => {
            const code = data.daily?.weather_code?.[idx + 1] ?? 0;
            const maxTemp = Math.round(data.daily?.temperature_2m_max?.[idx + 1] ?? 0);
            const minTemp = Math.round(data.daily?.temperature_2m_min?.[idx + 1] ?? 0);
            const status = codeToIconAndText(code);
            const date = new Date(dateStr);
            const dayName = new Intl.DateTimeFormat('tr-TR', { weekday: 'short' }).format(date);
            
            return (
              <div key={dateStr} className="flex flex-col items-center bg-white rounded flex-1 p-1.5 shadow-sm border border-slate-100">
                <span className="text-[9px] font-semibold text-slate-700 mb-1">{dayName}</span>
                <div className="w-5 h-5 mb-1">{status.icon}</div>
                <div className="text-[10px] font-bold flex gap-1.5">
                  <span className="text-slate-800">{maxTemp}°</span>
                  <span className="text-slate-400">{minTemp}°</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
