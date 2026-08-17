import React, { useEffect, useRef, useState } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, deleteDoc, addDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { getLocalDeviceId } from '../lib/device';
import { toast } from 'sonner';
import { Button } from './ui/button';
import { MonitorPlay, X } from 'lucide-react';

export function ScreenShareHost() {
  const currentDeviceId = getLocalDeviceId();
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [incomingCall, setIncomingCall] = useState<any>(null);

  useEffect(() => {
    if (!currentDeviceId || !db) return;

    // Listen for incoming calls
    const q = query(collection(db, 'calls'), where('targetDeviceId', '==', currentDeviceId), where('status', '==', 'calling'));
    
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      let callFound = false;
      for (const change of snapshot.docChanges()) {
        if (change.type === 'added') {
          const callData = change.doc.data();
          const callId = change.doc.id;
          
          setIncomingCall({ id: callId, ...callData });
          callFound = true;
          toast.info("Gelen uzak bağlantı isteği var!", { duration: 5000 });
        }
      }
      
      // If a call is cancelled/ended before we answer
      snapshot.forEach(docSnap => {
        if (docSnap.data().status !== 'calling') {
           if (incomingCall && incomingCall.id === docSnap.id) {
             setIncomingCall(null);
           }
        }
      });
    });

    return () => unsubscribe();
  }, [currentDeviceId, incomingCall]);

  const handleAcceptCall = async () => {
    if (!incomingCall) return;
    const callId = incomingCall.id;
    const callData = incomingCall;
    setIncomingCall(null);
    
    try {
      // Start screen share - initiated by THIS user click!
      if (!streamRef.current) {
         if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
             try {
                streamRef.current = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
             } catch (e: any) {
                if (e.name === 'NotSupportedError' || String(e).includes('not supported')) {
                   toast.warning("Cihazınızda ekran paylaşımı desteklenmiyor. Sistem kamerası deneniyor...");
                   streamRef.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
                } else {
                   throw e;
                }
             }
         } else {
             toast.warning("Tarayıcınızda ekran paylaşımı desteklenmiyor. Sistem kamerası deneniyor...");
             streamRef.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
         }
      }

      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      });
      pcRef.current = pc;

      // Add local stream tracks to PC
      streamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, streamRef.current!);
      });

      // Send ICE candidates
      pc.onicecandidate = async (event) => {
        if (event.candidate) {
          try {
             if (pc.signalingState !== ('closed' as any)) {
               await addDoc(collection(db, 'calls', callId, 'answerCandidates'), event.candidate.toJSON());
             }
          } catch(e) { console.error("ice send err", e); }
        }
      };

      // Set remote offer
      try {
        if (pc.signalingState !== ('closed' as any)) {
          const offer = new RTCSessionDescription(callData.offer);
          await pc.setRemoteDescription(offer).catch(e => console.error("setRemoteDescription host err:", e));

          if (pc.signalingState !== ('closed' as any)) {
             // Create answer
             const answer = await pc.createAnswer();
             if (pc.signalingState !== ('closed' as any)) {
               await pc.setLocalDescription(answer);

               // Update call document with answer
               await updateDoc(doc(db, 'calls', callId), {
                 answer: { type: answer.type, sdp: answer.sdp },
                 status: 'answered'
               });
             }
          }
        }
      } catch (err) {
        console.error("WebRTC Error:", err);
      }

      // Listen for remote ICE candidates
      const candidatesUnsub = onSnapshot(collection(db, 'calls', callId, 'offerCandidates'), (candSnap) => {
        candSnap.docChanges().forEach((candChange) => {
          if (candChange.type === 'added') {
            try {
              if (pc.signalingState !== ('closed' as any)) {
                const candidate = new RTCIceCandidate(candChange.doc.data());
                pc.addIceCandidate(candidate).catch(e => console.error("Async ice err:", e));
              }
            } catch(e) {
              console.error("Error adding ice cand:", e);
            }
          }
        });
      });

      // Clean up when stream stops
      streamRef.current.getVideoTracks()[0].onended = async () => {
        await updateDoc(doc(db, 'calls', callId), { status: 'ended' });
        pc.close();
        pcRef.current = null;
        streamRef.current = null;
        candidatesUnsub();
      };

      // Stop if caller ends
      const callDocUnsub = onSnapshot(doc(db, 'calls', callId), (docSnap) => {
          const data = docSnap.data();
          if (!data || data.status === 'ended' || data.status === 'failed') {
              if (streamRef.current) {
                  streamRef.current.getTracks().forEach(t => t.stop());
                  streamRef.current = null;
              }
              if (pcRef.current) {
                  pcRef.current.close();
                  pcRef.current = null;
              }
              candidatesUnsub();
              callDocUnsub();
          }
      });

      toast.success("Ekran paylaşılıyor.");
    } catch (err) {
      console.error("Screen share failed:", err);
      await updateDoc(doc(db, 'calls', callId), { status: 'failed' });
      toast.error(`Bağlantı başarısız: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleRejectCall = async () => {
    if (incomingCall) {
       await updateDoc(doc(db, 'calls', incomingCall.id), { status: 'failed' });
       setIncomingCall(null);
    }
  };

  if (!incomingCall) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] bg-white rounded-xl shadow-2xl border border-indigo-200 p-4 max-w-sm w-[90vw] animate-in slide-in-from-top-4">
       <div className="flex items-start gap-4">
         <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
           <MonitorPlay className="w-5 h-5 text-indigo-600 animate-pulse" />
         </div>
         <div className="flex-1">
            <h3 className="font-bold text-zinc-900 text-sm mb-1">Ekrana Bağlanma İsteği</h3>
            <p className="text-xs text-zinc-600 mb-3">
              Yönetici cihazınızın ekranını izlemek istiyor. Ekranı paylaşmak istiyor musunuz?
            </p>
            <div className="flex gap-2">
              <Button onClick={handleRejectCall} variant="outline" size="sm" className="flex-1 h-8 text-xs border-red-200 text-red-600 hover:bg-red-50">Reddet</Button>
              <Button onClick={handleAcceptCall} size="sm" className="flex-1 h-8 text-xs bg-indigo-600 hover:bg-indigo-700 text-white border-none">İzin Ver</Button>
            </div>
         </div>
       </div>
    </div>
  );
}
