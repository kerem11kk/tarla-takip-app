import React, { useEffect, useRef, useState } from 'react';
import { X, Wifi, ShieldAlert, MonitorPlay, MousePointer2 } from 'lucide-react';
import { DeviceRecord } from '../lib/device';
import { Button } from './ui/button';
import { db } from '../lib/firebase';
import { collection, addDoc, onSnapshot, doc, updateDoc, setDoc } from 'firebase/firestore';
import { toast } from 'sonner';

interface RemoteControlModalProps {
  isOpen: boolean;
  onClose: () => void;
  device: DeviceRecord | null;
}

export function RemoteControlModal({ isOpen, onClose, device }: RemoteControlModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const callDocRef = useRef<any>(null);
  const [callStatus, setCallStatus] = useState<string>('Bağlanıyor...');

  useEffect(() => {
    if (!isOpen || !device) return;

    let pc: RTCPeerConnection;
    let unsubCall: any;
    let unsubCandidates: any;

    const startCall = async () => {
      pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      });
      pcRef.current = pc;

      // Handle receiving video
      pc.ontrack = (event) => {
        if (videoRef.current) {
          videoRef.current.srcObject = event.streams[0];
          setCallStatus('Yansıtılıyor');
        }
      };

      const callsCollection = collection(db, 'calls');
      const callDoc = await addDoc(callsCollection, {
         targetDeviceId: device.id,
         status: 'calling',
         timestamp: Date.now()
      });
      callDocRef.current = callDoc;

      // Collect ICE candidates
      pc.onicecandidate = async (event) => {
        if (event.candidate) {
          try {
             if (pc.signalingState !== ('closed' as any)) {
               await addDoc(collection(db, 'calls', callDoc.id, 'offerCandidates'), event.candidate.toJSON());
             }
          } catch(e) { console.error("ice send err", e); }
        }
      };

      // Create offer
      try {
        if (pc.signalingState !== ('closed' as any)) {
          // We must add transceivers to receive video
          pc.addTransceiver('video', { direction: 'recvonly' });
          const offer = await pc.createOffer();
          
          if (pc.signalingState !== ('closed' as any)) {
             await pc.setLocalDescription(offer);

             await updateDoc(callDoc, {
               offer: { type: offer.type, sdp: offer.sdp }
             });
          }
        }
      } catch (err) {
        console.error("WebRTC Offer Error:", err);
      }

      // Listen for answer
      unsubCall = onSnapshot(callDoc, (snapshot) => {
        const data = snapshot.data();
        if (!data) return;

        if (data.status === 'failed') {
          setCallStatus('Bağlantı Reddedildi veya Başarısız');
        }

        try {
          if (pc.signalingState === ('closed' as any)) return;
          if (pc.currentRemoteDescription || !data.answer) return;
          const answerDescription = new RTCSessionDescription(data.answer);
          pc.setRemoteDescription(answerDescription).catch(e => console.error("setRemoteDescription async err:", e));
        } catch (err) {
          console.error("Remote description set error:", err);
        }
      });

      // Listen for remote ICE candidates
      unsubCandidates = onSnapshot(collection(db, 'calls', callDoc.id, 'answerCandidates'), (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            try {
              if (pc.signalingState !== ('closed' as any)) {
                const candidate = new RTCIceCandidate(change.doc.data());
                pc.addIceCandidate(candidate).catch(e => console.error("Async ice err:", e));
              }
            } catch (e) {
              console.error("Error adding ice candidate:", e);
            }
          }
        });
      });
    };

    startCall().catch(err => {
      console.error("startCall modal error:", err);
      setCallStatus('Başlatma hatası');
    });

    return () => {
      if (pcRef.current) pcRef.current.close();
      if (callDocRef.current) updateDoc(callDocRef.current, { status: 'ended' });
      if (unsubCall) unsubCall();
      if (unsubCandidates) unsubCandidates();
    };
  }, [isOpen, device]);

  const handleClose = () => {
    if (pcRef.current) pcRef.current.close();
    if (callDocRef.current) updateDoc(callDocRef.current, { status: 'ended' });
    onClose();
  };

  if (!isOpen || !device) return null;

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[60] flex flex-col animate-in fade-in duration-200">
      <div className="flex items-center justify-between p-4 bg-zinc-900 border-b border-zinc-800 shrink-0">
        <div className="flex items-center gap-3">
           <MonitorPlay className="h-5 w-5 text-indigo-400" />
           <div>
             <h2 className="font-bold text-white text-sm">Uzaktan Bağlantı: {device?.name || 'Cihaz'}</h2>
             <p className="text-[10px] text-zinc-400 font-mono tracking-wider">ID: {device?.id || '—'}</p>
           </div>
           <div className="ml-4 px-2 py-1 rounded bg-emerald-500/20 text-emerald-400 flex items-center gap-1.5 text-xs font-semibold">
              <Wifi className="w-3.5 h-3.5" /> {callStatus}
           </div>
        </div>
        <button onClick={handleClose} className="p-2 rounded-lg text-zinc-400 hover:text-white transition bg-zinc-800/50 hover:bg-zinc-800">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden bg-black p-4 md:p-8">
         <div className="flex flex-col md:flex-row gap-4 h-full">
            {/* Stream View */}
            <div className="flex-1 border border-zinc-800 rounded-xl bg-zinc-950 flex flex-col overflow-hidden relative shadow-2xl shadow-indigo-900/20">
               
               <video 
                 ref={videoRef}
                 autoPlay 
                 playsInline
                 className="w-full h-full object-contain bg-black z-0 pointer-events-none"
               />
               
               {callStatus !== 'Yansıtılıyor' && (
                 <div className="absolute inset-0 flex items-center justify-center flex-col gap-4 z-10 bg-zinc-950/80 backdrop-blur-sm">
                    <div className="w-24 h-24 rounded-full border-4 border-dashed border-zinc-700 flex items-center justify-center animate-[spin_4s_linear_infinite]">
                       <MonitorPlay className="w-8 h-8 text-zinc-600" />
                    </div>
                    <p className="text-zinc-400 font-medium text-sm animate-pulse">{callStatus}</p>
                 </div>
               )}
               
               {/* Input Mock Overlay */}
               <div 
                 className="absolute inset-0 cursor-crosshair z-20"
                 onClick={async (e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = (e.clientX - rect.left) / rect.width;
                    const y = (e.clientY - rect.top) / rect.height;
                    try {
                       await addDoc(collection(db, 'remote_touches'), {
                         deviceId: device?.id || '',
                         x, y,
                         timestamp: Date.now()
                       });
                    } catch (err) {
                       console.error('Sinyal başarısız:', err);
                    }
                 }}
               ></div>
            </div>

            {/* Sidebar Telemetry Control */}
            <div className="w-full md:w-80 flex flex-col gap-4 shrink-0">
               <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-white">
                  <h3 className="font-semibold text-sm mb-3 flex items-center gap-2 text-zinc-100">
                    <MousePointer2 className="w-4 h-4 text-indigo-400"/>
                    Kontrol Paneli
                  </h3>
                  
                  <div className="space-y-4">
                     <div>
                       <p className="text-xs text-zinc-500 mb-1 font-mono uppercase tracking-wider">Hız (Dümenleme)</p>
                       <div className="text-2xl font-bold font-mono text-emerald-400">{device?.speed !== undefined ? Number(device.speed).toFixed(1) : '0.0'} <span className="text-xs text-zinc-500">km/h</span></div>
                     </div>
                     <div>
                       <p className="text-xs text-zinc-500 mb-1 font-mono uppercase tracking-wider">Görev İlerlemesi</p>
                       <div className="w-full bg-zinc-800 rounded-full h-3 mb-1 overflow-hidden">
                          <div className="bg-indigo-500 h-full transition-all duration-500" style={{ width: `${device?.progress || 0}%` }}></div>
                       </div>
                       <div className="text-xs font-mono text-right text-zinc-400">%{device?.progress || 0}</div>
                     </div>
                     <div>
                       <p className="text-xs text-zinc-500 mb-1 font-mono uppercase tracking-wider">Mevcut İşlem</p>
                       <div className="text-sm font-medium text-zinc-300 bg-zinc-950 px-3 py-2 rounded-lg border border-zinc-800">
                          {device?.currentTask || 'Boşta / Bekliyor'}
                       </div>
                     </div>
                  </div>
               </div>

               <div className="bg-indigo-950/30 border border-indigo-900/50 rounded-xl p-4">
                  <h4 className="text-indigo-400 font-semibold text-xs flex items-center gap-2 mb-2 uppercase tracking-wide">
                     <ShieldAlert className="w-3.5 h-3.5" /> Root Modu Aktif
                  </h4>
                  <p className="text-zinc-400 text-xs leading-relaxed">
                     Şu an yönetici olarak bu cihazı kontrol ediyorsunuz. Ekrana tıklayarak izine sahip APK'ya dokunma sinyali gönderebilirsiniz. 
                     Cihazda ekranın açılması onay isteyebilir.
                  </p>
               </div>
            </div>
         </div>
      </div>
    </div>
  );
}
