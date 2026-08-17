import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Search, ExternalLink, MapPin, Upload, FileText } from 'lucide-react';
import { toast } from 'sonner';

interface ParcelSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenFieldFormWithData?: (data: { province: string; district: string; neighborhood: string; ada: string; parsel: string }) => void;
}

export function ParcelSearchModal({ isOpen, onClose, onOpenFieldFormWithData }: ParcelSearchModalProps) {
  const [province, setProvince] = useState('');
  const [district, setDistrict] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [ada, setAda] = useState('');
  const [parsel, setParsel] = useState('');

  const handleOpenTKGM = () => {
    window.open('https://parselsorgu.tkgm.gov.tr/', '_blank', 'noopener,noreferrer');
    toast.info("TKGM Parsel Sorgu sayfası yeni sekmede açıldı.");
  };

  const handleFillAndAdd = () => {
    if (!province.trim() && !ada.trim() && !parsel.trim()) {
      toast.error("Lütfen en azından Ada ve Parsel veya İl/İlçe bilgisi girin.");
      return;
    }
    if (onOpenFieldFormWithData) {
      onOpenFieldFormWithData({
        province,
        district,
        neighborhood,
        ada,
        parsel
      });
    }
    onClose();
    toast.success("Girilen parsel bilgileri forma aktarıldı.");
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md bg-white dark:bg-zinc-900 dark:text-zinc-100 p-6 rounded-3xl shadow-2xl border border-zinc-200 dark:border-zinc-800">
        <DialogHeader>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="p-2.5 bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded-2xl">
              <Search className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Parsel Sorgulama & TKGM</DialogTitle>
              <DialogDescription className="text-xs text-zinc-500 dark:text-zinc-400">
                Ada, Parsel ve Konum Bilgileri ile Tarlanızı Sorgulayın
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 my-2">
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/40 dark:to-indigo-950/40 p-3.5 rounded-2xl border border-blue-100 dark:border-blue-900/50 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-blue-900 dark:text-blue-300 flex items-center gap-1.5">
                <ExternalLink className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                Resmi TKGM Harita Servisi
              </span>
              <Button 
                onClick={handleOpenTKGM}
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-xl h-8 px-3 shadow-sm"
              >
                parselsorgu.tkgm.gov.tr
              </Button>
            </div>
            <p className="text-[11px] text-blue-700 dark:text-blue-300/80 leading-relaxed">
              TKGM sitesinden indirdiğiniz KML/GeoJSON veya Shape (.zip) dosyasını uygulamaya yükleyerek tarla sınırlarınızı saniyeler içinde haritanıza ekleyebilirsiniz.
            </p>
          </div>

          <div className="space-y-3 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">İl</Label>
                <Input 
                  placeholder="Örn: Konya" 
                  value={province} 
                  onChange={(e) => setProvince(e.target.value)}
                  className="bg-zinc-50 dark:bg-zinc-800/60 dark:border-zinc-700 text-xs h-9 rounded-xl" 
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">İlçe</Label>
                <Input 
                  placeholder="Örn: Karatay" 
                  value={district} 
                  onChange={(e) => setDistrict(e.target.value)}
                  className="bg-zinc-50 dark:bg-zinc-800/60 dark:border-zinc-700 text-xs h-9 rounded-xl" 
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Mahalle / Köy</Label>
              <Input 
                placeholder="Örn: İsmil Mahallesi" 
                value={neighborhood} 
                onChange={(e) => setNeighborhood(e.target.value)}
                className="bg-zinc-50 dark:bg-zinc-800/60 dark:border-zinc-700 text-xs h-9 rounded-xl" 
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Ada No</Label>
                <Input 
                  placeholder="Örn: 234" 
                  value={ada} 
                  onChange={(e) => setAda(e.target.value)}
                  className="bg-zinc-50 dark:bg-zinc-800/60 dark:border-zinc-700 text-xs h-9 rounded-xl font-mono" 
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Parsel No</Label>
                <Input 
                  placeholder="Örn: 12" 
                  value={parsel} 
                  onChange={(e) => setParsel(e.target.value)}
                  className="bg-zinc-50 dark:bg-zinc-800/60 dark:border-zinc-700 text-xs h-9 rounded-xl font-mono" 
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-2 pt-3 border-t border-zinc-100 dark:border-zinc-800">
          <Button 
            variant="ghost" 
            onClick={onClose}
            className="flex-1 rounded-xl text-xs text-zinc-600 dark:text-zinc-400"
          >
            İptal
          </Button>
          <Button 
            onClick={handleFillAndAdd}
            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-md flex items-center justify-center gap-1.5"
          >
            <MapPin className="h-4 w-4" />
            Tarla Olarak Ekle
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
