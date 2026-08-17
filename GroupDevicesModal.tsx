import React, { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { toast } from 'sonner';
import { db } from '../lib/firebase';
import { DeviceRecord, getLocalDeviceId, updateDeviceName } from '../lib/device';
import { Button } from './ui/button';
import { X, Smartphone, Trash2, Ban, Edit2, Save, MonitorPlay } from 'lucide-react';
import { RemoteControlModal } from './RemoteControlModal';

interface GroupDevicesModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupId: string;
}

export function GroupDevicesModal({ isOpen, onClose, groupId }: GroupDevicesModalProps) {
  const [devices, setDevices] = useState<DeviceRecord[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  
  const [remoteDevice, setRemoteDevice] = useState<DeviceRecord | null>(null);

  const isRoot = localStorage.getItem('is_root_user') === 'true';
  const currentDeviceId = getLocalDeviceId();

  useEffect(() => {
    if (!isOpen || !groupId || groupId === 'guest_user' || !db) return;

    const q = query(collection(db, 'devices'), where('groupId', '==', groupId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const records: DeviceRecord[] = [];
      snapshot.forEach(docSnap => {
        const d = (docSnap.data() || {}) as Partial<DeviceRecord>;
        records.push({
          id: docSnap.id || d.id || '',
          groupId: d.groupId || groupId,
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
      records.sort((a, b) => {
        if (a?.status === 'active' && b?.status !== 'active') return -1;
        if (a?.status !== 'active' && b?.status === 'active') return 1;
        return 0;
      });
      setDevices(records.filter(d => Boolean(d && d.id)));
    }, (err) => {
      console.error("Gruba bağlı cihazlar yüklenirken hata:", err);
    });

    return () => unsubscribe();
  }, [isOpen, groupId]);

  const handleBan = async (deviceId: string) => {
    try {
      await updateDoc(doc(db, 'devices', deviceId), { status: 'banned' });
      toast.success("Cihaz engellendi.");
    } catch (e) {
      console.error(e);
      toast.error("Engelleme başarısız! Yetkiniz olmayabilir.");
    }
  };

  const handleUnban = async (deviceId: string) => {
    try {
      await updateDoc(doc(db, 'devices', deviceId), { status: 'active' });
      toast.success("Engel kaldırıldı.");
    } catch(e) {
      console.error(e);
      toast.error("Kaldırma işlemi başarısız.");
    }
  };

  const handleDelete = async (deviceId: string) => {
     try {
       await deleteDoc(doc(db, 'devices', deviceId));
       toast.success("Cihaz silindi.");
     } catch(e) {
       console.error(e);
       toast.error("Silme başarısız.");
     }
  };

  const handleSaveName = async (deviceId: string) => {
    await updateDeviceName(deviceId, editName);
    setEditingId(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-zinc-100 max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200 pointer-events-auto flex flex-col max-h-[80vh]">
        <div className="p-4 border-b flex justify-between items-center bg-zinc-50 shrink-0">
          <div className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-indigo-600" />
            <div>
              <h2 className="font-bold text-zinc-900 leading-tight">Gruba Bağlı Cihazlar {isRoot && <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full ml-2">Yönetici</span>}</h2>
              {!isRoot && (
                <p className="text-[10px] text-amber-600 font-semibold mt-0.5">Sadece yöneticiler cihaz silebilir/engelleyebilir</p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-200 transition">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto p-4 space-y-3 flex-1 min-h-[300px]">
          {devices.length === 0 ? (
            <p className="text-zinc-500 text-sm text-center">Henüz bu gruba kayıtlı cihaz yok.</p>
          ) : (
            devices.map(device => {
              if (!device || !device.id) return null;
              const deviceIdStr = String(device.id || '');
              const displayId = deviceIdStr.length > 8 ? `${deviceIdStr.substring(0, 8)}...` : deviceIdStr;
              const deviceName = device.name || 'İsimsiz Cihaz';
              const isCurrent = device.id === currentDeviceId;
              const isBanned = device.status === 'banned';

              return (
                <div key={device.id} className={`p-3 rounded-lg border flex flex-col gap-2 ${isBanned ? 'bg-red-50/50 border-red-100' : 'bg-white border-zinc-200'}`}>
                  <div className="flex justify-between items-start">
                    <div className="flex-1 mr-2">
                      {editingId === device.id ? (
                        <div className="flex items-center gap-1.5 mb-1">
                          <input 
                            type="text" 
                            autoFocus
                            value={editName}
                            onChange={e => setEditName(e.target.value)}
                            className="border px-2 py-1 text-sm rounded bg-zinc-50 outline-none w-full"
                            placeholder="Cihaz Adı"
                          />
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-emerald-600 bg-emerald-50 hover:bg-emerald-100 shrink-0" onClick={() => handleSaveName(device.id)}>
                            <Save className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <h3 className="text-sm font-semibold text-zinc-800 flex items-center gap-2">
                          {deviceName}
                          {isCurrent && (
                            <span className="bg-blue-100 text-blue-700 text-[10px] px-1.5 rounded uppercase font-bold tracking-wider">Bu Cihaz</span>
                          )}
                          {device.isRoot && (
                            <span className="bg-purple-100 text-purple-700 text-[10px] px-1.5 rounded uppercase font-bold tracking-wider">Root</span>
                          )}
                        </h3>
                      )}
                      <p className="text-xs text-zinc-500 mt-0.5">ID: {displayId}</p>
                    </div>
                    
                    <div className="flex flex-col items-end gap-1">
                      <div className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase ${isBanned ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                        {isBanned ? 'Engellendi' : 'Aktif'}
                      </div>
                      {(isRoot || isCurrent) && editingId !== device.id && (
                        <button 
                          onClick={() => { setEditingId(device.id); setEditName(deviceName); }}
                          className="text-[10px] text-zinc-500 hover:text-zinc-800 flex items-center gap-1 bg-zinc-100 hover:bg-zinc-200 px-1.5 py-0.5 rounded"
                        >
                          <Edit2 className="h-3 w-3" /> İsim Değiştir
                        </button>
                      )}
                    </div>
                  </div>
                  
                  {!isCurrent && isRoot && (
                    <div className="flex gap-2 justify-end mt-1 pt-2 border-t border-zinc-100">
                      {!isBanned ? (
                        <>
                          <Button variant="outline" size="sm" className="h-7 text-xs border-indigo-200 text-indigo-700 hover:bg-indigo-50" onClick={() => setRemoteDevice(device)}>
                            <MonitorPlay className="w-3 h-3 mr-1" /> Uzaktan Bağlan
                          </Button>
                          <Button variant="outline" size="sm" className="h-7 text-xs border-red-200 text-red-600 hover:bg-red-50" onClick={() => handleBan(device.id)}>
                            <Ban className="w-3 h-3 mr-1" /> Engelle
                          </Button>
                          <Button variant="outline" size="sm" className="h-7 text-xs border-zinc-200 text-zinc-600 hover:bg-zinc-100 hover:text-red-600" onClick={() => handleDelete(device.id)} title="Cihazı Sil">
                              <Trash2 className="w-3 h-3" />
                          </Button>
                        </>
                      ) : (
                        <>
                           <Button variant="outline" size="sm" className="h-7 text-xs border-emerald-200 text-emerald-600 hover:bg-emerald-50" onClick={() => handleUnban(device.id)}>
                              Engeli Kaldır
                           </Button>
                           <Button variant="outline" size="sm" className="h-7 text-xs border-zinc-200 text-zinc-600" onClick={() => handleDelete(device.id)}>
                              <Trash2 className="w-3 h-3" />
                           </Button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {remoteDevice && (
         <RemoteControlModal
            isOpen={!!remoteDevice}
            onClose={() => setRemoteDevice(null)}
            device={remoteDevice}
         />
      )}
    </div>
  );
}
