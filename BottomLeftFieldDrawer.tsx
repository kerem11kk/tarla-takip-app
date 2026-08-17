import React, { useState, useMemo } from 'react';
import { FieldRecord } from '../types';
import { User } from 'firebase/auth';
import { 
  MapPin, Edit2, Trash2, Navigation, Sparkles, ChevronUp, ChevronDown, 
  Layers, Search, X, Plus, ExternalLink, Wheat, Droplets, Check, Split, Crosshair
} from 'lucide-react';
import { Button } from './ui/button';
import { calculateFieldAreaSqMeters, formatAreaDomum } from '../lib/area';
import { toast } from 'sonner';
import { deleteDoc, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { deleteLocalField } from '../lib/localFields';
import { WeatherWidget } from './WeatherWidget';

interface BottomLeftFieldDrawerProps {
  fields: FieldRecord[];
  selectedFieldId: string | null;
  onSelectField: (id: string | null) => void;
  onEditField: (field: FieldRecord) => void;
  onAddNew: () => void;
  onOpenAiCopilot: () => void;
  onOpenDjiMeasureForField?: (field: FieldRecord) => void;
  user: User;
  isRoot: boolean;
}

export function BottomLeftFieldDrawer({
  fields,
  selectedFieldId,
  onSelectField,
  onEditField,
  onAddNew,
  onOpenAiCopilot,
  onOpenDjiMeasureForField,
  user,
  isRoot
}: BottomLeftFieldDrawerProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState<'selected' | 'list'>('selected');
  const [searchQuery, setSearchQuery] = useState('');
  const [fieldToDelete, setFieldToDelete] = useState<FieldRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const selectedField = useMemo(() => {
    return fields.find((f) => f.id === selectedFieldId) || null;
  }, [fields, selectedFieldId]);

  // If a field is newly selected, ensure we view 'selected' tab
  React.useEffect(() => {
    if (selectedFieldId) {
      setActiveTab('selected');
      setIsExpanded(true);
      setFieldToDelete(null);
    }
  }, [selectedFieldId]);

  const filteredFields = useMemo(() => {
    if (!searchQuery.trim()) return fields;
    const q = searchQuery.toLowerCase();
    return fields.filter(
      (f) =>
        (f.name && f.name.toLowerCase().includes(q)) ||
        (f.ada && f.ada.includes(q)) ||
        (f.parsel && f.parsel.includes(q)) ||
        (f.neighborhood && f.neighborhood.toLowerCase().includes(q)) ||
        (f.district && f.district.toLowerCase().includes(q))
    );
  }, [fields, searchQuery]);

  const getCropLabel = (type: string) => {
    switch (type) {
      case 'corn': return 'Mısır';
      case 'wheat': return 'Buğday';
      case 'sunflower': return 'Ayçiçeği';
      case 'cotton': return 'Pamuk';
      case 'sugar_beet': return 'Şeker Pancarı';
      case 'crop_area': return 'Ekin Alanı';
      case 'solar_panel': return 'Güneş Paneli';
      default: return 'Diğer';
    }
  };

  const handleConfirmDelete = async () => {
    if (!fieldToDelete) return;
    const target = fieldToDelete;
    setIsDeleting(true);
    try {
      // 1. Always delete from local fields storage
      deleteLocalField(target.id);

      // 2. Delete from Firestore if authenticated and db exists
      if (user && user.uid !== 'guest_user' && db) {
        try {
          await deleteDoc(doc(db, 'fields', target.id));
        } catch (dbErr: any) {
          console.warn("Firestore delete warning:", dbErr);
        }
      }

      toast.success(`'${target.name || `${target.ada}/${target.parsel}`}' tarlası silindi.`);
      
      if (selectedFieldId === target.id) {
        onSelectField(null);
      }
      
      window.dispatchEvent(new CustomEvent('field-deleted', { detail: target.id }));
      window.dispatchEvent(new CustomEvent('local-fields-changed'));
      setFieldToDelete(null);
    } catch (e: any) {
      toast.error('Tarla silinirken hata oluştu: ' + (e?.message || 'Bilinmeyen hata'));
    } finally {
      setIsDeleting(false);
    }
  };

  const handleNavigateToField = (field: FieldRecord) => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${field.latitude},${field.longitude}`;
    window.open(url, '_blank');
  };

  return (
    <div
      className="absolute bottom-4 left-4 z-[1000] pointer-events-auto max-w-[94vw] sm:max-w-md w-[360px] sm:w-[390px] font-sans"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="bg-zinc-950/95 backdrop-blur-xl border border-zinc-800/90 rounded-3xl shadow-[0_10px_40px_rgba(0,0,0,0.8)] text-zinc-100 overflow-hidden flex flex-col transition-all duration-300">
        
        {/* Header Bar */}
        <div className="p-3 bg-zinc-900/80 border-b border-zinc-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('selected')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                activeTab === 'selected'
                  ? 'bg-cyan-600 text-white shadow-[0_0_10px_rgba(6,182,212,0.4)]'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
              }`}
            >
              <MapPin className="w-3.5 h-3.5" />
              <span>{selectedField ? 'Seçili Tarla' : 'Tarla Bilgisi'}</span>
            </button>

            <button
              onClick={() => setActiveTab('list')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                activeTab === 'list'
                  ? 'bg-zinc-800 text-white border border-zinc-700'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Tarlalar ({fields.length})</span>
            </button>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition"
              title={isExpanded ? 'Küçült' : 'Genişlet'}
            >
              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Expandable Body */}
        {isExpanded && (
          <div className="p-3.5 max-h-[50vh] sm:max-h-[58vh] overflow-y-auto space-y-3 no-scrollbar">
            
            {/* TAB 1: SELECTED FIELD QUICK INSPECTOR */}
            {activeTab === 'selected' && (
              <>
                {selectedField ? (
                  <div className="space-y-3 animate-in fade-in duration-200">
                    {/* Title & Badge */}
                    <div className="flex items-start justify-between gap-2 border-b border-zinc-800 pb-2.5">
                      <div>
                        <h2 className="text-base sm:text-lg font-black text-white leading-tight">
                          {selectedField.name || `Ada ${selectedField.ada} / Parsel ${selectedField.parsel}`}
                        </h2>
                        <div className="flex items-center gap-1.5 text-xs text-zinc-400 mt-1">
                          <MapPin className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                          <span className="line-clamp-1">
                            {selectedField.province || 'İl'}, {selectedField.district || 'İlçe'}{' '}
                            {selectedField.neighborhood && `- ${selectedField.neighborhood}`}
                          </span>
                        </div>
                      </div>

                      <span className="px-2.5 py-1 rounded-xl text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shrink-0">
                        {getCropLabel(selectedField.cropType)}
                      </span>
                    </div>

                    {/* Ada / Parsel / Area Stats Grid */}
                    <div className="grid grid-cols-2 gap-2 font-mono text-xs">
                      <div className="bg-zinc-900/90 border border-zinc-800/80 rounded-2xl p-2.5 flex flex-col">
                        <span className="text-[10px] text-zinc-400 uppercase font-sans">Ada / Parsel</span>
                        <span className="text-sm font-extrabold text-zinc-100 mt-0.5">
                          {selectedField.ada || '-'}/{selectedField.parsel || '-'}
                        </span>
                      </div>

                      <div className="bg-zinc-900/90 border border-zinc-800/80 rounded-2xl p-2.5 flex flex-col">
                        <span className="text-[10px] text-zinc-400 uppercase font-sans">Hesaplanan Alan</span>
                        <span className="text-sm font-extrabold text-cyan-400 mt-0.5">
                          {selectedField.polygon
                            ? `${formatAreaDomum(calculateFieldAreaSqMeters(selectedField.polygon))} Dönüm`
                            : 'Bilinmiyor'}
                        </span>
                      </div>
                    </div>

                    {/* Weather & Spraying Condition Shortcut */}
                    <div className="bg-zinc-900/60 border border-zinc-800/70 rounded-2xl p-2">
                      <WeatherWidget
                        latitude={selectedField.latitude}
                        longitude={selectedField.longitude}
                      />
                    </div>

                    {/* Notes if available */}
                    {selectedField.notes && (
                      <div className="bg-zinc-900/70 border border-zinc-800/80 rounded-xl p-2 text-xs text-zinc-300 italic">
                        "{selectedField.notes}"
                      </div>
                    )}

                    {/* Delete Confirmation Alert Banner inside Drawer */}
                    {fieldToDelete && fieldToDelete.id === selectedField.id ? (
                      <div className="bg-red-950/80 border border-red-500/60 rounded-2xl p-3 space-y-2 animate-in zoom-in-95 duration-200">
                        <div className="flex items-center gap-2 text-red-300 text-xs font-bold">
                          <Trash2 className="w-4 h-4 text-red-400 shrink-0" />
                          <span>Bu tarlayı silmek istiyor musunuz?</span>
                        </div>
                        <p className="text-[11px] text-zinc-300">
                          <strong>{selectedField.name || `${selectedField.ada}/${selectedField.parsel}`}</strong> tarlası ve sınırları kalıcı olarak silinecektir.
                        </p>
                        <div className="grid grid-cols-2 gap-2 pt-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setFieldToDelete(null)}
                            disabled={isDeleting}
                            className="bg-zinc-900 border-zinc-700 hover:bg-zinc-800 text-zinc-300 text-xs h-8 rounded-xl font-medium"
                          >
                            Vazgeç
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={handleConfirmDelete}
                            disabled={isDeleting}
                            className="bg-red-600 hover:bg-red-700 text-white text-xs h-8 rounded-xl font-bold shadow-md"
                          >
                            {isDeleting ? 'Siliniyor...' : 'Evet, Sil'}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      /* Action Buttons Bar */
                      <div className="grid grid-cols-5 gap-1 pt-1">
                        {/* AI Copilot Split / Plan */}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={onOpenAiCopilot}
                          className="bg-cyan-950/40 border-cyan-500/40 hover:bg-cyan-900/60 text-cyan-300 text-[10px] font-bold h-9 rounded-xl flex flex-col items-center justify-center p-1"
                          title="Gemini AI ile Böl / Planla"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                          <span className="text-[9px]">AI Böl</span>
                        </Button>

                        {/* DJI Boundary Edit */}
                        {onOpenDjiMeasureForField && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onOpenDjiMeasureForField(selectedField)}
                            className="bg-cyan-950/30 border-cyan-600/40 hover:bg-cyan-900/50 text-cyan-200 text-[10px] font-bold h-9 rounded-xl flex flex-col items-center justify-center p-1"
                            title="DJI Agras ile Sınırları Düzenle"
                          >
                            <Crosshair className="w-3.5 h-3.5 text-cyan-400" />
                            <span className="text-[9px]">DJI Sınır</span>
                          </Button>
                        )}

                        {/* Edit */}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onEditField(selectedField)}
                          className="bg-zinc-900 border-zinc-700 hover:bg-zinc-800 text-zinc-200 text-[10px] font-bold h-9 rounded-xl flex flex-col items-center justify-center p-1"
                          title="Tarlayı Düzenle"
                        >
                          <Edit2 className="w-3.5 h-3.5 text-blue-400" />
                          <span className="text-[9px]">Düzenle</span>
                        </Button>

                        {/* Navigation */}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleNavigateToField(selectedField)}
                          className="bg-zinc-900 border-zinc-700 hover:bg-zinc-800 text-zinc-200 text-[10px] font-bold h-9 rounded-xl flex flex-col items-center justify-center p-1"
                          title="Google Haritalar ile Yol Tarifi"
                        >
                          <Navigation className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-[9px]">Yol Tarifi</span>
                        </Button>

                        {/* Delete Button */}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setFieldToDelete(selectedField)}
                          className="bg-zinc-900 border-zinc-700 hover:bg-red-950/50 text-red-400 text-[10px] font-bold h-9 rounded-xl flex flex-col items-center justify-center p-1"
                          title="Tarlayı Sil"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span className="text-[9px]">Sil</span>
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-4 text-center space-y-2.5">
                    <MapPin className="w-8 h-8 text-zinc-600 mx-auto stroke-[1.5]" />
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      Haritadaki bir tarlaya dokunarak veya yandaki <strong>Tarlalar</strong> sekmesinden seçim yaparak detayları anında buradan görüntüleyebilirsiniz.
                    </p>
                    <Button
                      onClick={onAddNew}
                      className="bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold h-9 rounded-xl px-4 shadow-md"
                    >
                      <Plus className="w-4 h-4 mr-1.5 stroke-[3]" />
                      Yeni Tarla Ekle
                    </Button>
                  </div>
                )}
              </>
            )}

            {/* TAB 2: COMPACT FIELD LIST */}
            {activeTab === 'list' && (
              <div className="space-y-2.5 animate-in fade-in duration-200">
                {/* Search Bar */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Ada, parsel veya tarla adı ara..."
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-cyan-500/50"
                  />
                </div>

                {/* List Items */}
                <div className="space-y-1.5 max-h-[35vh] overflow-y-auto no-scrollbar">
                  {filteredFields.length > 0 ? (
                    filteredFields.map((f) => {
                      const isSelected = f.id === selectedFieldId;
                      const area = f.polygon
                        ? `${formatAreaDomum(calculateFieldAreaSqMeters(f.polygon))} Dönüm`
                        : '';

                      return (
                        <div
                          key={f.id}
                          onClick={() => onSelectField(f.id)}
                          className={`p-2.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-2 ${
                            isSelected
                              ? 'bg-cyan-950/40 border-cyan-500/60 shadow-[0_0_12px_rgba(6,182,212,0.3)]'
                              : 'bg-zinc-900/60 border-zinc-800/80 hover:bg-zinc-900 hover:border-zinc-700'
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-xs text-white truncate">
                                {f.name || `${f.ada}/${f.parsel}`}
                              </span>
                              <span className="text-[10px] text-zinc-400 font-mono">
                                ({f.ada}/{f.parsel})
                              </span>
                            </div>
                            <div className="text-[10px] text-zinc-400 truncate mt-0.5">
                              {f.district || f.province || 'Konum belirtilmedi'}
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <span className="text-xs font-bold text-cyan-400 font-mono block">
                              {area}
                            </span>
                            <span className="text-[10px] text-emerald-400">
                              {getCropLabel(f.cropType)}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center py-6 text-xs text-zinc-500">
                      Tarla bulunamadı.
                    </div>
                  )}
                </div>

                {/* Footer Add Button */}
                <Button
                  onClick={onAddNew}
                  className="w-full bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs font-bold h-9 rounded-xl flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-4 h-4 text-cyan-400 stroke-[3]" />
                  <span>Yeni Tarla Ekle</span>
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
