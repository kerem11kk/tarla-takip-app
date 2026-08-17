import React, { useState, useEffect } from 'react';
import { useMap } from 'react-leaflet';
import { Compass, Navigation } from 'lucide-react';
import { toast } from 'sonner';

interface CompassWidgetProps {
  onResetNorth?: () => void;
}

export function CompassWidget({ onResetNorth }: CompassWidgetProps) {
  const map = useMap();
  const [heading, setHeading] = useState<number>(0);
  const [isSensorActive, setIsSensorActive] = useState<boolean>(false);

  useEffect(() => {
    let handleOrientation: (e: DeviceOrientationEvent) => void;

    if (isSensorActive && typeof window !== 'undefined' && 'DeviceOrientationEvent' in window) {
      handleOrientation = (e: DeviceOrientationEvent) => {
        let compassHeading: number | null = null;

        // iOS Safari webkitCompassHeading
        if ((e as any).webkitCompassHeading !== undefined) {
          compassHeading = (e as any).webkitCompassHeading;
        } else if (e.alpha !== null) {
          // Android Chrome / Standard
          compassHeading = 360 - e.alpha;
        }

        if (compassHeading !== null && !isNaN(compassHeading)) {
          setHeading(Math.round(compassHeading));
        }
      };

      window.addEventListener('deviceorientation', handleOrientation, true);
    }

    return () => {
      if (handleOrientation) {
        window.removeEventListener('deviceorientation', handleOrientation);
      }
    };
  }, [isSensorActive]);

  const toggleSensorOrReset = async (e: React.MouseEvent) => {
    e.stopPropagation();

    // Check iOS permission request if needed
    if (
      typeof (DeviceOrientationEvent as any) !== 'undefined' &&
      typeof (DeviceOrientationEvent as any).requestPermission === 'function'
    ) {
      try {
        const permission = await (DeviceOrientationEvent as any).requestPermission();
        if (permission === 'granted') {
          setIsSensorActive(!isSensorActive);
          toast.success(!isSensorActive ? 'Dijital Pusula sensörü aktif!' : 'Pusula sensörü kapatıldı.');
        } else {
          toast.error('Pusula sensör izni verilmedi.');
        }
      } catch (err) {
        console.error(err);
      }
    } else {
      setIsSensorActive(!isSensorActive);
      toast.success(!isSensorActive ? 'Dijital Pusula aktif!' : 'Pusula kapatıldı.');
    }

    if (onResetNorth) {
      onResetNorth();
    }
  };

  // Cardinal direction text
  const getCardinal = (deg: number) => {
    if (deg >= 337.5 || deg < 22.5) return 'K'; // Kuzey / North
    if (deg >= 22.5 && deg < 67.5) return 'KD';
    if (deg >= 67.5 && deg < 112.5) return 'D'; // Doğu / East
    if (deg >= 112.5 && deg < 157.5) return 'GD';
    if (deg >= 157.5 && deg < 202.5) return 'G'; // Güney / South
    if (deg >= 202.5 && deg < 247.5) return 'GB';
    if (deg >= 247.5 && deg < 292.5) return 'B'; // Batı / West
    return 'KB';
  };

  return (
    <div
      className="absolute top-20 right-4 z-[1000] pointer-events-auto"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        onClick={toggleSensorOrReset}
        title="Pusula & Kuzeye Hizala (Aç/Kapat)"
        className="group relative flex flex-col items-center justify-center w-12 h-12 rounded-2xl bg-zinc-950/90 backdrop-blur-md border border-zinc-800/90 shadow-2xl text-white hover:border-cyan-500/50 transition-all duration-300 active:scale-95"
      >
        {/* Compass Outer Ring with Marks */}
        <div
          className="relative w-8 h-8 rounded-full flex items-center justify-center transition-transform duration-300"
          style={{ transform: `rotate(${-heading}deg)` }}
        >
          {/* North Red Needle */}
          <div className="absolute top-0 w-1 h-3.5 bg-red-500 rounded-t-full shadow-[0_0_6px_#ef4444]"></div>
          {/* South White Needle */}
          <div className="absolute bottom-0 w-1 h-3.5 bg-zinc-300 rounded-b-full"></div>
          {/* Center Pin */}
          <div className="w-1.5 h-1.5 rounded-full bg-white shadow-sm z-10"></div>
          {/* North Indicator letter */}
          <span className="absolute -top-1 text-[8px] font-black text-red-400 font-mono">N</span>
        </div>

        {/* Degree & Cardinal Badge */}
        <div className="text-[9px] font-mono font-bold text-zinc-300 leading-none mt-0.5">
          {heading}° <span className="text-cyan-400 text-[8px]">{getCardinal(heading)}</span>
        </div>
      </button>
    </div>
  );
}
