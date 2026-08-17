import { v4 as uuidv4 } from 'uuid';
import { doc, getDoc, setDoc, onSnapshot, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from './firebase';

export interface DeviceRecord {
  id: string; // the device UUID
  groupId: string; // the active sync code
  name: string; // some identifiable user agent text
  status: 'active' | 'banned';
  lastSeen: any;
  isRoot?: boolean;
  latitude?: number;
  longitude?: number;
  speed?: number;
  progress?: number;
  currentTask?: string;
}

export const updateDeviceLocation = async (deviceId: string, lat: number, lng: number, speed?: number, progress?: number, currentTask?: string) => {
  if (!db) return;
  const deviceRef = doc(db, 'devices', deviceId);
  try {
    const updateData: any = {
      latitude: lat,
      longitude: lng,
      lastSeen: serverTimestamp()
    };
    if (speed !== undefined) updateData.speed = speed;
    if (progress !== undefined) updateData.progress = progress;
    if (currentTask !== undefined) updateData.currentTask = currentTask;

    await setDoc(deviceRef, updateData, { merge: true });
  } catch (err) {
    console.error(err);
  }
};

export const getLocalDeviceId = (): string => {
  let id = localStorage.getItem('tarlatakip_device_id');
  if (!id) {
    id = uuidv4();
    localStorage.setItem('tarlatakip_device_id', id);
  }
  return id;
};

function getDeviceName() {
  const ua = navigator.userAgent;
  let browser = 'Bilinmeyen Tarayıcı';
  if (ua.includes('Firefox')) browser = 'Firefox';
  else if (ua.includes('SamsungBrowser')) browser = 'Samsung Internet';
  else if (ua.includes('Opera') || ua.includes('OPR')) browser = 'Opera';
  else if (ua.includes('Trident')) browser = 'Internet Explorer';
  else if (ua.includes('Edge')) browser = 'Edge';
  else if (ua.includes('Chrome')) browser = 'Chrome';
  else if (ua.includes('Safari')) browser = 'Safari';

  let os = 'Tablet/Telefon'; // Fallback
  if (ua.includes('Win')) os = 'Windows';
  else if (ua.includes('Mac')) os = 'MacOS';
  else if (ua.includes('X11')) os = 'UNIX';
  else if (ua.includes('Linux')) os = 'Linux';
  if (ua.includes('Android')) os = 'Android';
  if (ua.includes('like Mac')) os = 'iOS';

  return `${browser} - ${os}`;
}

export const registerDevice = async (groupId: string, isRoot: boolean = false): Promise<void> => {
  if (!groupId || groupId === 'guest_user' || !db) return;
  
  const deviceId = getLocalDeviceId();
  const deviceRef = doc(db, 'devices', deviceId);

  try {
    const snap = await getDoc(deviceRef);
    if (!snap.exists()) {
      // Create new device record
      await setDoc(deviceRef, {
        id: deviceId,
        groupId,
        name: getDeviceName(),
        status: 'active',
        isRoot,
        lastSeen: serverTimestamp()
      });
    } else {
      // Update last seen and maybe group if it changed
      await updateDoc(deviceRef, {
        groupId,
        isRoot,
        lastSeen: serverTimestamp()
      });
    }
  } catch (err) {
    console.error("Error registering device:", err);
  }
};

export const updateDeviceName = async (deviceId: string, newName: string) => {
  if (!newName.trim() || !db) return;
  const deviceRef = doc(db, 'devices', deviceId);
  try {
    await updateDoc(deviceRef, { name: newName });
  } catch (err) {
    console.error(err);
  }
};

export const listenToDeviceStatus = (deviceId: string, currentGroupId: string, onBanned: () => void) => {
  if (!db) return () => {};
  const deviceRef = doc(db, 'devices', deviceId);
  let hasExisted = false;
  return onSnapshot(deviceRef, (doc) => {
    if (doc.exists()) {
      const data = doc.data() as DeviceRecord;
      if (data.groupId === currentGroupId) {
        hasExisted = true;
        if (data.status === 'banned') {
          onBanned();
        }
      }
    } else {
      if (hasExisted) {
        // Document was deleted while we were listening
        onBanned();
      }
    }
  });
};
