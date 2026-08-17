import React, { useState, useEffect } from 'react';
import { FieldRecord } from '../types';
import { Button } from './ui/button';
import { 
  Sparkles, Send, Bot, User as UserIcon, X, Split, Tractor, 
  Droplets, Wheat, Check, ArrowRight, Layers, RefreshCw, HelpCircle, FileText, Navigation, Eye
} from 'lucide-react';
import { toast } from 'sonner';
import { 
  splitPolygonIntoParts, 
  calculateEquipmentPlan, 
  calculateGuidanceSplitLines,
  GuidanceLine 
} from '../lib/fieldGeometry';
import { doc, collection, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { addLocalField } from '../lib/localFields';
import { User } from 'firebase/auth';

interface GeminiCopilotModalProps {
  isOpen: boolean;
  onClose: () => void;
  fields: FieldRecord[];
  selectedFieldId: string | null;
  user: User;
  onSelectField: (id: string | null) => void;
  onApplyGuidanceLines?: (lines: GuidanceLine[]) => void;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  action?: any;
  guidanceLines?: GuidanceLine[];
  splitResults?: Array<{ name: string; polygon: any; areaDonum: number }>;
  equipmentResults?: any;
}

export function GeminiCopilotModal({
  isOpen,
  onClose,
  fields,
  selectedFieldId,
  user,
  onSelectField,
  onApplyGuidanceLines
}: GeminiCopilotModalProps) {
  const [inputPrompt, setInputPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>(() => [
    {
      role: 'assistant',
      content:
        'Merhaba! Ben Gemini 3.7 Flash Ziraat ve Dümenleme Asistanınızım. Tarlanızı ikiye veya istediğiniz parçaya bölebilir, dümenleme A-B hattı çizebilir, 180cm / 24m ekipman ve drone geçiş rotaları planlayabilirim. Size nasıl yardımcı olabilirim?'
    }
  ]);

  const selectedField = fields.find((f) => f.id === selectedFieldId);

  if (!isOpen) return null;

  const handleSendMessage = async (promptText: string) => {
    const text = promptText.trim();
    if (!text || loading) return;

    const userMsg: Message = { role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInputPrompt('');
    setLoading(true);

    try {
      const response = await fetch('/api/ai/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: text,
          fields,
          selectedFieldId,
          equipmentWidth: 1.8
        })
      });

      if (!response.ok) {
        throw new Error(`Sunucu yanıt vermedi: ${response.status}`);
      }

      const data = await response.json();
      const reply = data.reply || 'Talebiniz işlendi.';
      const action = data.action;

      let splitResults: any = null;
      let equipmentResults: any = null;
      let calculatedGuidanceLines: GuidanceLine[] | undefined = undefined;

      // Handle split action -> calculate both split slices and A-B guidance lines
      if (action && (action.type === 'split_field' || action.type === 'draw_guidance_lines')) {
        const targetField = fields.find((f) => f.id === action.targetFieldId) || selectedField || fields[0];
        if (targetField && targetField.polygon) {
          const partsCount = action.partsCount || 2;
          const direction = action.direction || 'auto';
          splitResults = splitPolygonIntoParts(targetField.polygon, partsCount, direction);
          calculatedGuidanceLines = calculateGuidanceSplitLines(targetField.polygon, partsCount, direction);
          
          if (calculatedGuidanceLines && calculatedGuidanceLines.length > 0 && onApplyGuidanceLines) {
            onApplyGuidanceLines(calculatedGuidanceLines);
          }
        }
      }

      // Handle equipment plan action
      if (action && action.type === 'plan_equipment') {
        const targetField = fields.find((f) => f.id === action.targetFieldId) || selectedField || fields[0];
        if (targetField && targetField.polygon) {
          const width = action.equipmentWidthMeters || 1.8;
          equipmentResults = calculateEquipmentPlan(targetField.polygon, width);
        }
      }

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: reply,
          action,
          guidanceLines: calculatedGuidanceLines,
          splitResults,
          equipmentResults
        }
      ]);
    } catch (err: any) {
      console.error(err);
      // Client-side fallback execution
      let fallbackSplit: any = null;
      let fallbackLines: GuidanceLine[] | undefined = undefined;
      let fallbackEq: any = null;
      let fallbackReply = 'Talebiniz yerel akıllı hesaplama motoruyla işlendi.';

      const targetField = selectedField || fields[0];
      if (targetField && targetField.polygon) {
        if (text.includes('böl') || text.includes('parça') || text.includes('ikiye') || text.includes('3 e') || text.includes('5 e')) {
          let count = 2;
          if (text.includes('3') || text.includes('üç')) count = 3;
          if (text.includes('4') || text.includes('dört')) count = 4;
          if (text.includes('5') || text.includes('beş')) count = 5;
          if (text.includes('6') || text.includes('altı')) count = 6;
          
          fallbackSplit = splitPolygonIntoParts(targetField.polygon, count, 'auto');
          fallbackLines = calculateGuidanceSplitLines(targetField.polygon, count, 'auto');
          fallbackReply = `${targetField.name || 'Seçili tarla'} için ${count} eşit parçalı A-B dümenleme ve bölme hattı başarıyla hesaplandı. Haritada hattı görebilirsiniz.`;
          
          if (fallbackLines && onApplyGuidanceLines) {
            onApplyGuidanceLines(fallbackLines);
          }
        } else if (text.includes('ekipman') || text.includes('180') || text.includes('ilaçlama') || text.includes('geçiş')) {
          fallbackEq = calculateEquipmentPlan(targetField.polygon, 1.8);
          fallbackReply = `${targetField.name || 'Seçili tarla'} için 180 cm ekipman genişliğine göre geçiş ve ilaçlama planı hesaplandı.`;
        }
      }

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: fallbackReply,
          guidanceLines: fallbackLines,
          splitResults: fallbackSplit,
          equipmentResults: fallbackEq
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleApplyLinesToMap = (lines: GuidanceLine[]) => {
    if (onApplyGuidanceLines && lines) {
      onApplyGuidanceLines(lines);
      toast.success(`${lines.length} adet A-B dümenleme hattı haritaya uygulandı!`);
      onClose();
    }
  };

  const saveSplitFields = async (
    originalField: FieldRecord,
    parts: Array<{ name: string; polygon: any; areaDonum: number }>
  ) => {
    if (!parts || parts.length === 0) return;

    try {
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const newFieldName = `${originalField.name || 'Tarla'} - ${part.name}`;

        const newFieldData: any = {
          name: newFieldName,
          ada: originalField.ada || '',
          parsel: `${originalField.parsel || ''}/${i + 1}`,
          province: originalField.province || '',
          district: originalField.district || '',
          neighborhood: originalField.neighborhood || '',
          cropType: originalField.cropType || 'other',
          latitude: originalField.latitude,
          longitude: originalField.longitude,
          notes: `Gemini 3.7 AI tarafından '${originalField.name}' tarlasından bölünerek oluşturuldu (${part.areaDonum} Dönüm).`,
          polygon: part.polygon,
          ownerId: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        };

        if (user.uid === 'guest_user') {
          addLocalField({
            ...newFieldData,
            id: `split_${Date.now()}_${i}`,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });
        } else {
          const ref = doc(collection(db, 'fields'));
          await setDoc(ref, newFieldData);
        }
      }

      toast.success(`${parts.length} adet bölünmüş yeni tarla kaydedildi!`);
      onClose();
    } catch (err: any) {
      console.error(err);
      toast.error('Tarlalar kaydedilirken hata oluştu: ' + err.message);
    }
  };

  return (
    <div className="fixed inset-0 z-[2000] bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-zinc-950 border border-zinc-800 rounded-3xl shadow-2xl w-full max-w-xl flex flex-col h-[85vh] max-h-[700px] overflow-hidden text-zinc-100 animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-4 border-b border-zinc-800/80 bg-zinc-900/60 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-tr from-cyan-600 to-indigo-600 rounded-2xl shadow-[0_0_15px_rgba(6,182,212,0.4)] text-white">
              <Sparkles className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-extrabold text-sm sm:text-base text-white tracking-tight">
                  Gemini 3.7 Ziraat & Dümenleme Copilot
                </h2>
                <span className="text-[10px] bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 px-2 py-0.5 rounded-full font-mono font-semibold">
                  v3.7 Flash
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                {selectedField
                  ? `Seçili Tarla: ${selectedField.name || `${selectedField.ada}/${selectedField.parsel}`}`
                  : 'Tüm Tarlalar & Dümenleme Hatları'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Action Chips */}
        <div className="px-4 py-2.5 bg-zinc-900/40 border-b border-zinc-800/60 flex gap-2 overflow-x-auto no-scrollbar">
          <button
            onClick={() =>
              handleSendMessage(
                selectedField
                  ? `${selectedField.name || 'Seçili tarla'} tarlasını bana ortadan tam ikiye böl, dümenleme hattı çiz`
                  : 'Seçili tarlayı ikiye böl ve dümenleme hattı çiz'
              )
            }
            className="shrink-0 bg-zinc-900 hover:bg-cyan-950/60 border border-zinc-800 hover:border-cyan-500/40 text-xs px-3 py-1.5 rounded-xl text-zinc-300 hover:text-cyan-300 flex items-center gap-1.5 transition"
          >
            <Split className="w-3.5 h-3.5 text-cyan-400" />
            <span>Tarlayı İkiye Böl (Hat Çiz)</span>
          </button>

          <button
            onClick={() =>
              handleSendMessage(
                'Arkamda 180 cm lik bir ekipman var, tarlayı ona göre 5 e böl ve geçiş planı çıkar'
              )
            }
            className="shrink-0 bg-zinc-900 hover:bg-emerald-950/60 border border-zinc-800 hover:border-emerald-500/40 text-xs px-3 py-1.5 rounded-xl text-zinc-300 hover:text-emerald-300 flex items-center gap-1.5 transition"
          >
            <Tractor className="w-3.5 h-3.5 text-emerald-400" />
            <span>180cm Ekipman & 5'e Böl</span>
          </button>

          <button
            onClick={() =>
              handleSendMessage(
                'DJI Agras T40/T50 drone ile buğday/mısır tarlasında dönüme kaç litre su ve ilaç atmalıyım?'
              )
            }
            className="shrink-0 bg-zinc-900 hover:bg-indigo-950/60 border border-zinc-800 hover:border-indigo-500/40 text-xs px-3 py-1.5 rounded-xl text-zinc-300 hover:text-indigo-300 flex items-center gap-1.5 transition"
          >
            <Droplets className="w-3.5 h-3.5 text-indigo-400" />
            <span>DJI Agras İlaçlama Hacmi</span>
          </button>

          <button
            onClick={() =>
              handleSendMessage(
                'Şu anki hava koşullarına göre ilaçlama yapmak için rüzgar ve nem uygun mu?'
              )
            }
            className="shrink-0 bg-zinc-900 hover:bg-amber-950/60 border border-zinc-800 hover:border-amber-500/40 text-xs px-3 py-1.5 rounded-xl text-zinc-300 hover:text-amber-300 flex items-center gap-1.5 transition"
          >
            <Wheat className="w-3.5 h-3.5 text-amber-400" />
            <span>İlaçlama Saati & Hava</span>
          </button>
        </div>

        {/* Chat Message List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 font-sans">
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex items-start gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
            >
              <div
                className={`p-2 rounded-xl shrink-0 ${
                  msg.role === 'user'
                    ? 'bg-cyan-600 text-white'
                    : 'bg-zinc-800 text-cyan-400 border border-zinc-700'
                }`}
              >
                {msg.role === 'user' ? <UserIcon className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>

              <div className={`max-w-[85%] space-y-2`}>
                <div
                  className={`p-3.5 rounded-2xl text-xs sm:text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-cyan-600/20 text-cyan-100 border border-cyan-500/30 rounded-tr-none'
                      : 'bg-zinc-900/90 text-zinc-200 border border-zinc-800 rounded-tl-none'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                </div>

                {/* Guidance Lines Result Card (Dümenleme & Bölme Hattı) */}
                {msg.guidanceLines && msg.guidanceLines.length > 0 && (
                  <div className="bg-zinc-900 border border-cyan-500/50 rounded-2xl p-3.5 space-y-3 animate-in fade-in duration-300 shadow-[0_0_20px_rgba(6,182,212,0.15)]">
                    <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                      <div className="flex items-center gap-2">
                        <Navigation className="w-4 h-4 text-cyan-400 animate-pulse" />
                        <span className="font-bold text-xs text-white">
                          A-B Dümenleme & Bölme Hatları ({msg.guidanceLines.length} Hat)
                        </span>
                      </div>
                      <span className="text-[10px] text-cyan-300 font-mono bg-cyan-950/60 border border-cyan-800 px-2 py-0.5 rounded-full">
                        Yeni Tarla Eklenmedi
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      {msg.guidanceLines.map((line, lIdx) => (
                        <div
                          key={lIdx}
                          className="bg-zinc-950/80 p-2.5 rounded-xl border border-zinc-800 flex items-center justify-between text-xs"
                        >
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_#06b6d4]"></span>
                            <span className="font-bold text-zinc-200">{line.name}</span>
                          </div>
                          <div className="flex items-center gap-3 font-mono text-[11px]">
                            <span className="text-emerald-400 font-bold">{line.lengthMeters} m</span>
                            <span className="text-zinc-400">({line.bearingDegrees}°)</span>
                          </div>
                        </div>
                      ))}
                    </div>

                    {msg.splitResults && msg.splitResults.length > 0 && (
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        {msg.splitResults.map((part, pIdx) => (
                          <div key={pIdx} className="bg-zinc-950/60 p-2 rounded-lg border border-zinc-800/80 text-center">
                            <span className="text-[10px] text-zinc-400 block">{part.name}</span>
                            <span className="text-xs font-bold text-cyan-300 font-mono">{part.areaDonum} Dönüm</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <Button
                      onClick={() => handleApplyLinesToMap(msg.guidanceLines!)}
                      className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold h-10 text-xs rounded-xl shadow-lg flex items-center justify-center gap-2"
                    >
                      <Eye className="w-4 h-4" />
                      <span>Harita Üzerinde Gör</span>
                    </Button>
                  </div>
                )}

                {/* Equipment Plan Result Card */}
                {msg.equipmentResults && (
                  <div className="bg-zinc-900 border border-emerald-500/40 rounded-2xl p-3.5 space-y-2.5 animate-in fade-in duration-300">
                    <div className="flex items-center gap-2 border-b border-zinc-800 pb-2">
                      <Tractor className="w-4 h-4 text-emerald-400" />
                      <span className="font-bold text-xs text-white">
                        Ekipman & İlaçlama Rota Planı ({msg.equipmentResults.equipmentWidthMeters} m Genişlik)
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 font-mono text-center">
                      <div className="bg-zinc-950/80 p-2 rounded-xl border border-zinc-800">
                        <span className="text-[9px] text-zinc-400 block">Tahmini Geçiş</span>
                        <span className="text-sm font-bold text-emerald-400">
                          {msg.equipmentResults.estimatedPasses} Hat
                        </span>
                      </div>
                      <div className="bg-zinc-950/80 p-2 rounded-xl border border-zinc-800">
                        <span className="text-[9px] text-zinc-400 block">Toplam Yol</span>
                        <span className="text-sm font-bold text-cyan-400">
                          {(msg.equipmentResults.totalDistanceMeters / 1000).toFixed(2)} km
                        </span>
                      </div>
                      <div className="bg-zinc-950/80 p-2 rounded-xl border border-zinc-800">
                        <span className="text-[9px] text-zinc-400 block">Drone Sıvı</span>
                        <span className="text-sm font-bold text-amber-400">
                          {msg.equipmentResults.droneWaterLiters} L
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-zinc-800 text-cyan-400 border border-zinc-700">
                <Bot className="w-4 h-4 animate-spin" />
              </div>
              <div className="bg-zinc-900 p-3 rounded-2xl border border-zinc-800 text-xs text-zinc-400 flex items-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                <span>Gemini 3.7 tarlanızı inceliyor ve dümenleme hattı hesaplıyor...</span>
              </div>
            </div>
          )}
        </div>

        {/* Input Footer */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage(inputPrompt);
          }}
          className="p-3 sm:p-4 border-t border-zinc-800/80 bg-zinc-900/80 flex items-center gap-2"
        >
          <input
            type="text"
            value={inputPrompt}
            onChange={(e) => setInputPrompt(e.target.value)}
            placeholder="Örn: 'seçili tarlayı ikiye böl' veya '180cm ekipman izi planla'..."
            className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-xs sm:text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/40"
          />
          <Button
            type="submit"
            disabled={!inputPrompt.trim() || loading}
            className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold h-11 px-4 rounded-xl shadow-lg active:scale-95 transition disabled:opacity-40"
          >
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
