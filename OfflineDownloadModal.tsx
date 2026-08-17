import React, { useState, useEffect, useMemo } from 'react';
import { X, DownloadCloud, AlertCircle } from 'lucide-react';
import { Button } from './ui/button';
import { calculateRegionTiles, downloadRegionForOffline } from '../lib/offlineMaps';

interface OfflineDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  bounds?: any;
}

export function OfflineDownloadModal({ isOpen, onClose }: OfflineDownloadModalProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [totalTiles, setTotalTiles] = useState(0);

  // Elbistan, Çatova, Eldelek bölgesi sabit sınırları
  const targetBounds = useMemo(() => ({
    getSouthWest: () => ({ lat: 38.160, lng: 37.100 }),
    getNorthEast: () => ({ lat: 38.330, lng: 37.300 })
  }), []);

  useEffect(() => {
    if (isOpen) {
      const tiles = calculateRegionTiles(targetBounds, 12, 17);
      setTotalTiles(tiles);
      setProgress(0);
      setIsDownloading(false);
    }
  }, [isOpen, targetBounds]);

  if (!isOpen) return null;

  // Assuming average 25KB per tile
  const estimatedSizeMB = (totalTiles * 25) / 1024;
  let formattedSize = '';
  if (estimatedSizeMB < 1) {
    formattedSize = `${(estimatedSizeMB * 1024).toFixed(0)} KB`;
  } else if (estimatedSizeMB > 1024) {
    formattedSize = `${(estimatedSizeMB / 1024).toFixed(2)} GB`;
  } else {
    formattedSize = `${estimatedSizeMB.toFixed(1)} MB`;
  }

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      await downloadRegionForOffline(targetBounds, 12, 17, (dl, total) => {
        setProgress(Math.round((dl / total) * 100));
      });
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err) {
      console.error(err);
      setIsDownloading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[2000] flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden flex flex-col">
        <div className="flex justify-between items-center p-4 border-b">
          <h2 className="text-lg font-bold text-zinc-800 flex items-center gap-2">
            <DownloadCloud className="h-5 w-5 text-indigo-600" />
            Çevrimdışı Harita İndir
          </h2>
          {!isDownloading && (
            <button onClick={onClose} className="p-1 hover:bg-zinc-100 rounded-full text-zinc-500">
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
        
        <div className="p-4 space-y-4">
          <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3 flex gap-3 text-sm text-indigo-800">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <p>
              Tüm Elbistan, Çatova ve Eldelek bölgeleri çevrimdışı kullanım için cihazınıza indirilecek. İnternet bağlantınız olmadığında da bu bölgeleri görebileceksiniz.
            </p>
          </div>

          <div className="bg-zinc-50 rounded-lg p-4 flex justify-between items-center border">
            <div>
              <p className="text-sm font-semibold text-zinc-700">İndirilecek Veri</p>
              <p className="text-xs text-zinc-500">{totalTiles} harita karesi</p>
            </div>
            <div className="text-right">
              <p className="text-lg font-bold text-indigo-700">~{formattedSize}</p>
            </div>
          </div>

          {isDownloading && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-semibold text-zinc-600">
                <span>İndiriliyor...</span>
                <span>%{progress}</span>
              </div>
              <div className="w-full bg-zinc-200 rounded-full h-2.5 overflow-hidden">
                <div 
                  className="bg-indigo-600 h-2.5 rounded-full transition-all duration-300" 
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t bg-zinc-50 flex justify-end gap-2">
          {!isDownloading && (
            <Button variant="outline" onClick={onClose}>
              İptal
            </Button>
          )}
          <Button 
            variant="default" 
            className="bg-indigo-600 hover:bg-indigo-700" 
            onClick={handleDownload}
            disabled={isDownloading || totalTiles === 0}
          >
            {isDownloading ? (progress === 100 ? 'Tamamlandı' : 'İndiriliyor...') : 'İndirmeyi Başlat'}
          </Button>
        </div>
      </div>
    </div>
  );
}