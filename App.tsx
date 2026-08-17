import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { auth, loginWithGoogle, logout, loginWithEmail, registerWithEmail } from './lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { MapView } from './components/MapView';
import { Sidebar } from './components/Sidebar';
import { BottomLeftFieldDrawer } from './components/BottomLeftFieldDrawer';
import { GeminiCopilotModal } from './components/GeminiCopilotModal';
import { Toaster } from './components/ui/sonner';
import { Button } from './components/ui/button';
import { 
  LogOut, MapPin, Tractor, AlertTriangle, Check, Copy, HelpCircle, 
  Cloud, CloudOff, Database, Key, RefreshCw, Lock, Smartphone, Shield, X, List, Edit2,
  DownloadCloud, Info, Search, Crosshair, Sparkles, Plus, Layers
} from 'lucide-react';
import { doc, getDocFromServer, collection, setDoc, updateDoc, serverTimestamp, onSnapshot, query, where } from 'firebase/firestore';
import { db } from './lib/firebase';
import { FieldForm } from './components/FieldForm';
import { ParcelSearchModal } from './components/ParcelSearchModal';
import { FieldRecord } from './types';
import { GuidanceLine } from './lib/fieldGeometry';
import { toast } from 'sonner';
import { getLocalFields, saveLocalFields, updateLocalField } from './lib/localFields';
import { registerDevice, listenToDeviceStatus } from './lib/device';
import { GroupDevicesModal } from './components/GroupDevicesModal';
import { ScreenShareHost } from './components/ScreenShareHost';

const formatGroupName = (code: string): string => {
  const clean = code.trim().toLowerCase();
  if (clean === 'sahinler 1' || clean === 'şahinler 1' || clean === 'şahinler1' || clean === 'sahinler1' || clean === 'sahinler' || clean === 'şahinler') {
    return 'ŞAHİNLER 1';
  }
  return clean.toUpperCase();
};

export default function App() {
  const [user, setUser] = useState<User | null>(() => {
    let savedSyncCode = localStorage.getItem('active_sync_code');
    const savedGuest = localStorage.getItem('guest_user');
    
    if (savedSyncCode) {
      const cleanCode = savedSyncCode.trim().toLowerCase();
      return {
        uid: `group_${cleanCode}`,
        email: `${cleanCode}@grup.tarlatakip.com`,
        displayName: `${formatGroupName(cleanCode)} Çalışma Grubu`,
        emailVerified: true,
        isAnonymous: true,
        metadata: {},
        providerData: [],
        providerId: 'custom',
        tenantId: null,
        delete: async () => {},
        getIdToken: async () => '',
        getIdTokenResult: async () => ({}) as any,
        reload: async () => {},
        toJSON: () => ({}),
        phoneNumber: null,
        photoURL: null,
      } as unknown as User;
    }
    if (savedGuest) {
      try {
        return JSON.parse(savedGuest);
      } catch (e) {
        return null;
      }
    }
    const defaultGuest = {
      uid: 'guest_user',
      email: 'misafir@tarlatakip.com',
      displayName: 'Misafir Kullanıcı',
      emailVerified: true,
    } as any;
    localStorage.setItem('guest_user', JSON.stringify(defaultGuest));
    return defaultGuest;
  });
  const [loading, setLoading] = useState(false);
  const [fields, setFields] = useState<FieldRecord[]>([]);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const handleSelectField = useCallback((id: string | null) => {
    setSelectedFieldId(id);
  }, []);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [fieldToEdit, setFieldToEdit] = useState<FieldRecord | null>(null);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [isDevicesModalOpen, setIsDevicesModalOpen] = useState(false);
  const [isParcelSearchModalOpen, setIsParcelSearchModalOpen] = useState(false);
  const [isAiCopilotOpen, setIsAiCopilotOpen] = useState(false);
  const [isDjiMeasureActive, setIsDjiMeasureActive] = useState(false);
  const [djiMeasureField, setDjiMeasureField] = useState<FieldRecord | null>(null);
  const [djiMeasurePolygon, setDjiMeasurePolygon] = useState<any>(null);
  const [guidanceLines, setGuidanceLines] = useState<GuidanceLine[]>([]);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [isEditingMode, setIsEditingMode] = useState(false);

  // Sync fields list
  useEffect(() => {
    if (!user) return;
    if (user.uid === 'guest_user') {
      const loadLocal = () => {
        const local = getLocalFields();
        setFields(local);
      };
      loadLocal();
      window.addEventListener('local-fields-changed', loadLocal);
      return () => window.removeEventListener('local-fields-changed', loadLocal);
    }

    if (!db) return;
    const q = query(collection(db, 'fields'), where('ownerId', '==', user.uid));
    const unsub = onSnapshot(q, (snapshot) => {
      const records: FieldRecord[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        let polygon = data.polygon;
        if (typeof polygon === 'string') {
          try {
            polygon = JSON.parse(polygon);
          } catch (e) {}
        }
        records.push({ id: docSnap.id, ...data, polygon } as FieldRecord);
      });
      setFields(records);
    });

    return () => unsub();
  }, [user]);

  useEffect(() => {
    const handleStartDraw = () => {
      setIsDrawingMode(true);
      setIsMobileMenuOpen(false);
      setSelectedFieldId(null);
      setIsFormOpen(false);
    };
    const handleStopDraw = () => {
      setIsDrawingMode(false);
    };
    const handleStartEdit = () => {
      setIsEditingMode(true);
      setIsMobileMenuOpen(false);
      setIsFormOpen(false);
      setSelectedFieldId(null);
      toast.info("Harita üzerindeki sınır noktalarını sürükleyerek düzenleyebilirsiniz.");
    };
    const handleStopEdit = () => {
      setIsEditingMode(false);
    };
    const handleOpenDjiWithField = (e: any) => {
      const { field, polygon } = e.detail || {};
      setDjiMeasureField(field || null);
      setDjiMeasurePolygon(polygon || null);
      setIsDjiMeasureActive(true);
      setIsFormOpen(false);
      setIsMobileMenuOpen(false);
      toast.info("DJI Agras Ölçüm & Sınır Düzenleme Modu Açıldı.");
    };
    
    const handleOpenAiCopilot = () => {
      setIsAiCopilotOpen(true);
    };
    
    window.addEventListener('disable-polygon-draw', handleStopDraw);
    window.addEventListener('enable-polygon-edit', handleStartEdit);
    window.addEventListener('disable-polygon-edit', handleStopEdit);
    window.addEventListener('open-dji-measure-with-field', handleOpenDjiWithField);
    window.addEventListener('open-ai-copilot', handleOpenAiCopilot);
    
    return () => {
      window.removeEventListener('disable-polygon-draw', handleStopDraw);
      window.removeEventListener('enable-polygon-edit', handleStartEdit);
      window.removeEventListener('disable-polygon-edit', handleStopEdit);
      window.removeEventListener('open-dji-measure-with-field', handleOpenDjiWithField);
      window.removeEventListener('open-ai-copilot', handleOpenAiCopilot);
    };
  }, []);

  const [syncCode, setSyncCode] = useState('');
  const [syncPass, setSyncPass] = useState('');
  const [activeSyncCode, setActiveSyncCode] = useState(() => {
    let saved = localStorage.getItem('active_sync_code');
    return saved || '';
  });

  const [isSigningIn, setIsSigningIn] = useState(false);
  const [authError, setAuthError] = useState<{ code?: string; message: string } | null>(null);
  const [copiedDomain, setCopiedDomain] = useState(false);

  const [authMethod, setAuthMethod] = useState<'email' | 'google' | 'guest'>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);

  const handleAddNew = () => {
    setFieldToEdit(null);
    setIsFormOpen(true);
  };

  const handleEditField = (field: FieldRecord) => {
    setFieldToEdit(field);
    setIsFormOpen(true);
  };

  const handleSaveDjiSurveyField = async (
    polygon: any, 
    areaDonum: number, 
    center: { lat: number; lng: number },
    existingFieldId?: string
  ) => {
    const targetField = existingFieldId ? (fields.find(f => f.id === existingFieldId) || djiMeasureField) : djiMeasureField;
    
    if (targetField && targetField.id && targetField.id.trim() !== '') {
      const updatedData = {
        ...targetField,
        polygon,
        latitude: center.lat,
        longitude: center.lng,
        updatedAt: new Date().toISOString()
      };

      if (user?.uid === 'guest_user') {
        updateLocalField(targetField.id, updatedData as any);
      } else if (db) {
        try {
          await updateDoc(doc(db, 'fields', targetField.id), {
            polygon,
            latitude: center.lat,
            longitude: center.lng,
            updatedAt: serverTimestamp()
          });
        } catch (err: any) {
          console.error("Firebase update error:", err);
          updateLocalField(targetField.id, updatedData as any);
        }
      }
      toast.success(`${targetField.name || 'Tarla'} sınırları başarıyla güncellendi!`);
      setDjiMeasureField(null);
      setDjiMeasurePolygon(null);
      setIsDjiMeasureActive(false);
      return;
    }

    setFieldToEdit({
      id: '',
      name: `DJI Agras Parsel (${areaDonum} Dönüm)`,
      ada: '',
      parsel: '',
      province: 'Kahramanmaraş',
      district: 'Elbistan',
      neighborhood: '',
      cropType: 'wheat',
      latitude: center.lat,
      longitude: center.lng,
      polygon,
      ownerId: user?.uid || 'guest_user',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    } as any);
    setDjiMeasureField(null);
    setDjiMeasurePolygon(null);
    setIsDjiMeasureActive(false);
    setIsFormOpen(true);
    toast.success("DJI Agras tarla sınırı oluşturuldu! Lütfen tarla bilgilerini onaylayın.");
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Lütfen e-posta ve şifrenizi girin.");
      return;
    }
    if (password.length < 6) {
      toast.error("Şifre en az 6 karakter olmalıdır.");
      return;
    }
    setIsSigningIn(true);
    setAuthError(null);
    try {
      if (isSignUp) {
        await registerWithEmail(email, password);
        toast.success("Hesabınız oluşturuldu ve giriş yapıldı!");
      } else {
        await loginWithEmail(email, password);
        toast.success("Başarıyla giriş yapıldı!");
      }
    } catch (err: any) {
      console.error("Email auth error details:", err);
      let errMsg = err.message || String(err);
      let errCode = err.code || "";
      if (err.code === 'auth/email-already-in-use') {
        errMsg = "Bu e-posta adresi zaten kullanımda. Giriş yapmayı deneyin.";
      } else if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found') {
        errMsg = "Hatalı e-posta adresi veya şifre.";
      } else if (err.code === 'auth/invalid-email') {
        errMsg = "Geçersiz bir e-posta adresi girdiniz.";
      } else if (err.code === 'auth/weak-password') {
        errMsg = "Şifreniz çok zayıf (en az 6 karakter olmalıdır).";
      }
      setAuthError({ code: errCode, message: errMsg });
      toast.error(errMsg);
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleLogin = async () => {
    setIsSigningIn(true);
    setAuthError(null);
    try {
      await loginWithGoogle();
    } catch (err: any) {
      console.error("Login catch error details:", err);
      let errMsg = err.message || String(err);
      let errCode = err.code || "";
      
      if (err.code === 'auth/unauthorized-domain') {
        errMsg = "Bu alan adı (domain) Firebase projenizde yetkilendirilmemiş. Google Giriş'in çalışması için bu adresi Firebase Console'da izin verilen alan adlarına eklemeniz gerekmektedir.";
      } else if (err.code === 'auth/popup-blocked') {
        errMsg = "Giriş penceresi (popup) tarayıcınız veya bir eklenti tarafınca engellendi. Giriş yapabilmek için pop-up engelleyicinizi devre dışı bırakıp tekrar tıklayın.";
      } else if (err.code === 'auth/cancelled-popup-request') {
        errMsg = "Giriş penceresi kapatıldı veya başka bir işlem nedeniyle iptal edildi.";
      } else if (err.code === 'auth/operation-not-allowed') {
        errMsg = "Firebase Authentication'da Google ile Giriş yöntemi (Sign-in provider) aktif edilmemiş. Lütfen Google yöntemini etkinleştirin.";
      }
      
      setAuthError({ code: errCode, message: errMsg });
      toast.error(errMsg, { duration: 8000 });
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleGuestLogin = () => {
    const guestUser = {
      uid: 'guest_user',
      email: 'misafir@tarlatakip.com',
      displayName: 'Misafir Kullanıcı',
      emailVerified: true,
      isAnonymous: false,
      metadata: {},
      providerData: [],
      providerId: 'custom',
      tenantId: null,
      delete: async () => {},
      getIdToken: async () => '',
      getIdTokenResult: async () => ({}) as any,
      reload: async () => {},
      toJSON: () => ({}),
      phoneNumber: null,
      photoURL: null,
    } as unknown as User;
    
    localStorage.setItem('guest_user', JSON.stringify(guestUser));
    localStorage.removeItem('active_sync_code');
    setActiveSyncCode('');
    setUser(guestUser);
    toast.success("Cihaz Modu: Tarlalarınız tarayıcınızda kaydedilecek.");
  };

  const handleConnectSyncCode = async (code: string, pass: string) => {
    let cleanCode = code.trim().toLowerCase();
    if (!cleanCode) {
      toast.error("Lütfen geçerli bir grup kodu girin.");
      return;
    }
    if (cleanCode.length < 3) {
      toast.error("Grup kodu en az 3 karakter olmalıdır.");
      return;
    }

    if (!pass || pass.trim() === '') {
      toast.error("Grup bağlantısı için şifre girilmesi zorunludur! Şifresiz giriş yapılamaz.");
      return;
    }

    let isRoot = false;
    if (cleanCode === 'şahinler 1' || cleanCode === 'sahinler 1' || cleanCode === 'şahinler1' || cleanCode === 'sahinler1' || cleanCode === 'sahinler' || cleanCode === 'şahinler') {
      cleanCode = 'şahinler 1'; // normalize to şahinler 1 so UID matches correctly
      if (pass === '8') {
        isRoot = true;
      } else if (pass === '6135C' || pass === '6135c') {
        isRoot = false;
      } else {
        toast.error("Hatalı veya eksik grup şifresi! ŞAHİNLER 1 grubuna şifresiz veya yanlış şifreyle girilemez.");
        return;
      }
    } else {
      if (pass === '8') isRoot = true;
    }

    setIsSigningIn(true);
    try {
      const loggedInUser = {
        uid: `group_${cleanCode}`,
        email: `${cleanCode}@grup.tarlatakip.com`,
        displayName: `${formatGroupName(cleanCode)} Çalışma Grubu`,
        emailVerified: true,
        isAnonymous: true,
        metadata: {},
        providerData: [],
        providerId: 'custom',
        tenantId: null,
        delete: async () => {},
        getIdToken: async () => '',
        getIdTokenResult: async () => ({}) as any,
        reload: async () => {},
        toJSON: () => ({}),
        phoneNumber: null,
        photoURL: null,
      } as unknown as User;

      // Sync local fields if any
      const localFields = getLocalFields();
      if (localFields.length > 0) {
        for (const f of localFields) {
          const ref = doc(collection(db, 'fields'));
          const newData = {
            name: f.name || '',
            ada: f.ada || '',
            parsel: f.parsel || '',
            province: f.province || '',
            district: f.district || '',
            neighborhood: f.neighborhood || '',
            cropType: f.cropType || 'other',
            latitude: f.latitude || 39.9334,
            longitude: f.longitude || 32.8597,
            ownerId: loggedInUser.uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            polygon: f.polygon ? (typeof f.polygon === 'string' ? f.polygon : JSON.stringify(f.polygon)) : null
          };
          await setDoc(ref, newData);
        }
        // Clear local
        saveLocalFields([]);
        toast.success(`Mevcut ${localFields.length} tarla başarıyla bulut hesabınıza aktarıldı!`);
      }

      localStorage.removeItem('guest_user');
      localStorage.setItem('active_sync_code', cleanCode);
      if (isRoot) {
        localStorage.setItem('is_root_user', 'true');
      } else {
        localStorage.removeItem('is_root_user');
      }
      setActiveSyncCode(cleanCode);
      setUser(loggedInUser);

      if (cleanCode === 'şahinler 1') {
        if (isRoot) {
          toast.success("🔑 ŞAHİNLER 1 Grubuna YÖNETİCİ (ROOT) olarak başarıyla giriş yaptınız!");
        } else {
          toast.success("👤 ŞAHİNLER 1 Grubuna NORMAL KULLANICI olarak başarıyla giriş yaptınız.");
        }
      } else {
        if (isRoot) {
          toast.success(`🔑 '${cleanCode.toUpperCase()}' Grubuna YÖNETİCİ (ROOT) olarak bağlandınız!`);
        } else {
          toast.success(`👤 '${cleanCode.toUpperCase()}' Grubuna başarıyla bağlandınız!`);
        }
      }
      setIsSyncModalOpen(false);

      // Register device and listen for ban
      registerDevice(loggedInUser.uid, isRoot);
      listenToDeviceStatus(localStorage.getItem('tarlatakip_device_id')!, loggedInUser.uid, () => {
        toast.error("Bu cihaza erişim engellendi. Gruptan çıkarıldınız.");
        handleLogout();
      });
    } catch (err: any) {
      console.error(err);
      toast.error("Grup bağlantısı sırasında bir hata oluştu: " + (err.message || String(err)));
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleLogout = async () => {
    localStorage.removeItem('guest_user');
    localStorage.removeItem('active_sync_code');
    localStorage.removeItem('is_root_user');
    setActiveSyncCode('');
    
    // Auto reset back into offline Guest mode so they're never locked out
    const defaultGuest = {
      uid: 'guest_user',
      email: 'misafir@tarlatakip.com',
      displayName: 'Misafir Kullanıcı',
      emailVerified: true,
    } as any;
    localStorage.setItem('guest_user', JSON.stringify(defaultGuest));
    setUser(defaultGuest);
    
    try {
      await logout();
    } catch (e) {
      console.error(e);
    }
    toast.success("Bulut bağlantısı kapatıldı, yerel (cihaz) moduna dönüldü.");
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedDomain(true);
      toast.success("Alan adı kopyalandı!");
      setTimeout(() => setCopiedDomain(false), 2000);
    } catch (err) {
      toast.error("Alan adı kopyalanamadı.");
    }
  };

  useEffect(() => {
    const handleParcelFound = (e: any) => {
      const { polygon, properties } = e.detail;
      if (polygon && properties) {
        setFieldToEdit(null);
        setIsFormOpen(true);
        // Send to FieldForm via event
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('fill-tkgm-parcel', { detail: { polygon, properties } }));
        }, 300);
      }
    };
    window.addEventListener('tkgm-parcel-found', handleParcelFound);
    return () => window.removeEventListener('tkgm-parcel-found', handleParcelFound);
  }, []);

  useEffect(() => {
    const handleFieldDeleted = (e: any) => {
      if (e.detail === selectedFieldId) {
        setSelectedFieldId(null);
      }
    };
    window.addEventListener('field-deleted', handleFieldDeleted);
    return () => window.removeEventListener('field-deleted', handleFieldDeleted);
  }, [selectedFieldId]);

  useEffect(() => {
    // Validate connection to Firestore
    async function testConnection() {
      if (!db) return;
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    }
    testConnection();

    const savedSyncCode = localStorage.getItem('active_sync_code');
    if (savedSyncCode) {
      const cleanCode = savedSyncCode.trim().toLowerCase();
      const groupUser = {
        uid: `group_${cleanCode}`,
        email: `${cleanCode}@grup.tarlatakip.com`,
        displayName: `${formatGroupName(cleanCode)} Çalışma Grubu`,
        emailVerified: true,
        isAnonymous: true,
        metadata: {},
        providerData: [],
        providerId: 'custom',
        tenantId: null,
        delete: async () => {},
        getIdToken: async () => '',
        getIdTokenResult: async () => ({}) as any,
        reload: async () => {},
        toJSON: () => ({}),
        phoneNumber: null,
        photoURL: null,
      } as unknown as User;
      setUser(groupUser);
      setLoading(false);
      
      // Register device and listen for ban
      const isRoot = localStorage.getItem('is_root_user') === 'true';
      registerDevice(groupUser.uid, isRoot);
      const unsubscribeDevice = listenToDeviceStatus(localStorage.getItem('tarlatakip_device_id')!, groupUser.uid, () => {
        // If banned
        toast.error("Bu cihaza erişim engellendi. Gruptan çıkarıldınız.");
        handleLogout();
      });
      return unsubscribeDevice;
    } else {
      setLoading(false);
    }

    if (auth) {
      const unsubscribe = onAuthStateChanged(auth, (u) => {
        const syncActive = localStorage.getItem('active_sync_code');
        if (u && !syncActive) {
          setUser(u);
        }
      });
      return unsubscribe;
    }
  }, []);

  if (loading || !user) {
    return <div className="flex h-screen items-center justify-center bg-zinc-50 flex-col gap-3">
      <Tractor className="h-10 w-10 text-green-600 animate-bounce" />
      <span className="text-zinc-600 text-sm font-semibold">Tarlalarınız yükleniyor...</span>
    </div>;
  }

  return (
    <>
      <div className="flex h-full w-full overflow-hidden bg-zinc-50 text-zinc-900 font-sans relative">
        
        {/* Map Area - ALWAYS FULL BACKGROUND */}
        <div className="absolute inset-0 z-0">
          <MapView 
            user={user} 
            selectedFieldId={selectedFieldId} 
            onSelectField={handleSelectField} 
            onEditField={handleEditField}
            isDjiMeasureActive={isDjiMeasureActive}
            onCloseDjiMeasure={() => {
              setIsDjiMeasureActive(false);
              setDjiMeasureField(null);
              setDjiMeasurePolygon(null);
            }}
            onSaveDjiField={handleSaveDjiSurveyField}
            djiMeasureField={djiMeasureField}
            djiMeasurePolygon={djiMeasurePolygon}
            guidanceLines={guidanceLines}
            onClearGuidanceLines={() => setGuidanceLines([])}
          />
        </div>

        {/* Floating Dynamic Island Container - Positioned between left and center */}
        <div className={`absolute top-3 left-3 sm:left-[20%] z-20 flex pointer-events-none transition-all duration-500 ${(isDrawingMode || isEditingMode || isDjiMeasureActive) ? 'opacity-0 -translate-y-8 pointer-events-none' : 'opacity-100 translate-y-0'}`}>
          <div className="flex items-center gap-1.5 p-1.5 bg-zinc-950/90 backdrop-blur-xl rounded-2xl shadow-2xl border border-zinc-800 pointer-events-auto">
            {/* Cloud Sync Button */}
            <button 
              onClick={() => setIsSyncModalOpen(true)}
              title={activeSyncCode ? `Eşitleme Aktif: ${formatGroupName(activeSyncCode)}` : "Bulut Eşitleme"}
              className={`flex items-center justify-center h-10 px-3 rounded-xl text-xs font-medium transition-all duration-300 ${activeSyncCode ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30' : 'text-zinc-300 hover:bg-white/10 hover:text-white'}`}
            >
              {activeSyncCode ? (
                <>
                  <Cloud className="h-4 w-4 shrink-0" />
                  <span className="ml-1.5 truncate max-w-[80px] hidden sm:inline">{formatGroupName(activeSyncCode)}</span>
                </>
              ) : (
                <CloudOff className="h-4 w-4 shrink-0" />
              )}
            </button>

            {/* DJI Agras Crosshair Survey Button */}
            <button
              onClick={() => {
                if (isDjiMeasureActive) {
                  setIsDjiMeasureActive(false);
                  setDjiMeasureField(null);
                  setDjiMeasurePolygon(null);
                } else {
                  setDjiMeasureField(null);
                  setDjiMeasurePolygon(null);
                  setIsDjiMeasureActive(true);
                  toast.success("DJI Agras Ölçüm Modu Açıldı! Haritayı hareket ettirip (+) ile nokta ekleyin.");
                }
              }}
              title="DJI Agras Hassas Ölçüm & Haritalama"
              className={`flex items-center justify-center h-10 px-3 rounded-xl text-xs font-bold transition-all duration-300 gap-1.5 ${
                isDjiMeasureActive
                  ? 'bg-cyan-500 text-zinc-950 shadow-[0_0_15px_rgba(6,182,212,0.6)] animate-pulse'
                  : 'bg-cyan-950/50 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-900/60'
              }`}
            >
              <Crosshair className="h-4 w-4 shrink-0" />
              <span className="hidden md:inline">DJI Ölçüm</span>
            </button>

            {/* Gemini AI Farm Copilot Button */}
            <button
              onClick={() => setIsAiCopilotOpen(true)}
              title="Gemini AI Ziraat & Tarla Asistanı (Tarlayı Böl / Ekipman Planla)"
              className="flex items-center justify-center h-10 px-3 rounded-xl text-xs font-bold bg-gradient-to-r from-indigo-950/70 via-purple-950/70 to-pink-950/70 border border-purple-500/40 text-purple-200 hover:text-white hover:border-purple-400 transition-all duration-300 gap-1.5 shadow-[0_0_12px_rgba(168,85,247,0.2)]"
            >
              <Sparkles className="h-4 w-4 text-purple-400 animate-pulse" />
              <span className="hidden sm:inline">AI Copilot</span>
            </button>

            {/* Parsel Sorgulama Button */}
            <button
              onClick={() => setIsParcelSearchModalOpen(true)}
              title="Parsel Sorgulama & TKGM"
              className="flex items-center justify-center h-10 px-3 rounded-xl text-blue-400 hover:bg-blue-500/20 hover:text-blue-300 transition-all duration-300 text-xs font-semibold gap-1.5"
            >
              <Search className="h-4 w-4 shrink-0" />
              <span className="hidden lg:inline">Parsel Sorgula</span>
            </button>

            {/* Download Button */}
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('trigger-offline-download'))}
              title="Haritayı Çevrimdışı İndir"
              className="flex items-center justify-center h-10 w-10 rounded-xl text-indigo-400 hover:bg-white/10 hover:text-indigo-300 transition-all duration-300"
            >
              <DownloadCloud className="h-4 w-4 shrink-0" />
            </button>

            {activeSyncCode && (
              <>
                <button 
                  onClick={() => setIsDevicesModalOpen(true)} 
                  title="Grup Cihazları"
                  className="flex items-center justify-center h-10 w-10 rounded-xl text-zinc-300 hover:bg-white/10 hover:text-white transition-all duration-300"
                >
                  <Smartphone className="h-4 w-4" />
                </button>
                <button 
                  onClick={handleLogout} 
                  title="Bağlantıyı Kes / Yerel Moda Dön"
                  className="flex items-center justify-center h-10 w-10 rounded-xl text-red-400 hover:bg-red-500/20 hover:text-red-300 transition-all duration-300"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </>
            )}

            {/* Advanced Operations / Tasks Toggle */}
            <button 
              className={`flex items-center justify-center h-10 px-2.5 rounded-xl transition-all duration-300 ${isMobileMenuOpen ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:bg-zinc-800/80 hover:text-white'}`}
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              title="Görevler ve Toplu İşlemler Paneli"
            >
              {isMobileMenuOpen ? <X className="h-4 w-4" /> : <Layers className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Compact Floating Bottom-Left Field Drawer */}
        {!isDjiMeasureActive && !isDrawingMode && !isEditingMode && (
          <BottomLeftFieldDrawer
            fields={fields}
            selectedFieldId={selectedFieldId}
            onSelectField={handleSelectField}
            onEditField={handleEditField}
            onAddNew={handleAddNew}
            onOpenAiCopilot={() => setIsAiCopilotOpen(true)}
            onOpenDjiMeasureForField={(f) => {
              setDjiMeasureField(f);
              setDjiMeasurePolygon(f.polygon);
              setIsDjiMeasureActive(true);
            }}
            user={user}
            isRoot={localStorage.getItem('is_root_user') === 'true'}
          />
        )}

        {/* Optional Full Tasks & Batch Operations Drawer */}
        {isMobileMenuOpen && (
          <div className="absolute top-16 left-3 z-30 w-full max-w-sm h-[75vh] flex flex-col pointer-events-none transition-all duration-300">
            <div className="flex-1 bg-zinc-950/95 backdrop-blur-xl rounded-3xl shadow-2xl border border-zinc-800 pointer-events-auto overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
              <div className="p-3 border-b border-zinc-800 flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-300">Görev & İlaçlama Yönetimi</span>
                <button
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 overflow-hidden">
                <Sidebar 
                  user={user} 
                  selectedFieldId={selectedFieldId} 
                  onSelectField={handleSelectField} 
                  onEditField={handleEditField}
                  onAddNew={handleAddNew}
                />
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Drawing Mode UI Overlay */}
      {isDrawingMode && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 pointer-events-auto">
          <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-zinc-200 p-4 flex flex-col items-center gap-3 animate-in slide-in-from-top-4 duration-300">
            <div className="flex items-center gap-2 text-zinc-900 font-semibold">
               <MapPin className="h-5 w-5 text-blue-600 animate-pulse" />
               Çizim Modu Aktif
            </div>
            <p className="text-xs text-zinc-500 text-center max-w-[200px]">
               Haritaya tıklayarak tarla sınırlarınızı çizin. Çizimi bitirmek için son noktaya çift tıklayın veya ilk noktaya geri dönün.
            </p>
            <Button 
               variant="outline" 
               className="w-full text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 font-medium"
               onClick={() => window.dispatchEvent(new CustomEvent('cancel-polygon-draw'))}
            >
               İptal Et
            </Button>
          </div>
        </div>
      )}

      {/* Editing Mode UI Overlay */}
      {isEditingMode && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 pointer-events-auto">
          <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-zinc-200 p-4 flex flex-col items-center gap-3 animate-in slide-in-from-top-4 duration-300">
            <div className="flex items-center gap-2 text-zinc-900 font-semibold">
               <Edit2 className="h-5 w-5 text-amber-600 animate-pulse" />
               Sınır Düzenleme Modu
            </div>
            <p className="text-xs text-zinc-500 text-center max-w-[200px]">
               Harita üzerindeki noktaları sürükleyerek alanı güncelleyebilirsiniz. İşleminiz otomatik kaydedilir.
            </p>
            <Button 
               variant="default" 
               className="w-full bg-amber-600 hover:bg-amber-700 text-white font-medium"
               onClick={() => {
                 window.dispatchEvent(new CustomEvent('finish-polygon-edit'));
                 setIsEditingMode(false);
               }}
            >
               Düzenlemeyi Bitir
            </Button>
          </div>
        </div>
      )}

      {/* Sync Modal Details */}
      {isSyncModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl border border-zinc-100 max-w-sm w-full overflow-hidden animate-in zoom-in-95 duration-200 pointer-events-auto">
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-emerald-50 text-emerald-700 rounded-xl">
                    <Cloud className="h-6 w-6" />
                  </div>
                  <div>
                    <h2 className="font-extrabold text-zinc-900 leading-tight">Yedekleme & Eşitleme</h2>
                    <p className="text-zinc-500 text-[10px] mt-0.5 uppercase tracking-wide font-semibold">Tarlalarınız Güvende</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsSyncModalOpen(false)}
                  className="p-1 px-2 py-1 rounded-lg border border-zinc-100 text-zinc-400 hover:text-zinc-700 transition"
                >
                  <X className="h-4 w-4 text-zinc-500" />
                </button>
              </div>

              {activeSyncCode ? (
                <div className="space-y-4">
                  <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 flex gap-3 text-emerald-800 text-xs leading-relaxed">
                    <Check className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-bold">Eşitleme Aktif!</h4>
                      <p className="mt-1">
                        Şu anda <strong>'{formatGroupName(activeSyncCode)}'</strong> çalışma grubuna bağlısınız. Telefon, tablet veya diğer cihazlarınızdan da bu kodu girerek tarlalarınıza anlık erişebilir, düzenleme ve ekleme yapabilirsiniz.
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button 
                      className="flex-1 bg-zinc-950 hover:bg-zinc-800 text-white rounded-lg p-3 text-xs"
                      onClick={() => setIsSyncModalOpen(false)}
                    >
                      Kapat
                    </Button>
                    <Button 
                      variant="outline"
                      className="border-indigo-200 text-indigo-600 hover:bg-indigo-50 hover:text-indigo-700 rounded-lg text-xs flex-1"
                      onClick={() => {
                        setIsSyncModalOpen(false);
                        setIsDevicesModalOpen(true);
                      }}
                    >
                      Cihazları Yönet
                    </Button>
                    <Button 
                      variant="outline"
                      size="icon"
                      className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 rounded-lg px-3"
                      onClick={handleLogout}
                      title="Bağlantıyı Kes"
                    >
                      <LogOut className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-zinc-50 rounded-xl border border-zinc-200/60 p-3 leading-relaxed text-zinc-600 text-[11px] gap-2 flex items-start">
                    <HelpCircle className="h-4 w-4 text-zinc-400 shrink-0 mt-0.5" />
                    <span>
                      Herhangi bir şifre veya kayıt derdi olmadan telefon, tablet veya bilgisayarınız arasında anında eşitleme sağlayın. Tek yapmanız gereken, kendinize özel bir grup kodu seçip buraya girmek!
                    </span>
                  </div>

                  <form 
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleConnectSyncCode(syncCode, syncPass);
                    }}
                    className="space-y-3.5"
                  >
                    <div>
                      <label className="text-[10px] font-extrabold uppercase text-zinc-400 tracking-wider block mb-1.5 font-mono">Çalışma Grubu Kodunuz</label>
                      <div className="relative mb-3">
                        <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                        <input 
                          type="text"
                          required
                          placeholder="Örn: şahinler 1"
                          value={syncCode}
                          onChange={(e) => setSyncCode(e.target.value)}
                          className="w-full pl-9 pr-4 py-2.5 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium"
                        />
                      </div>
                      <label className="text-[10px] font-extrabold uppercase text-zinc-400 tracking-wider block mb-1.5 font-mono">Grup Şifresi (Varsa)</label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                        <input 
                          type="password"
                          placeholder="Şifre"
                          value={syncPass}
                          onChange={(e) => setSyncPass(e.target.value)}
                          className="w-full pl-9 pr-4 py-2.5 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium"
                        />
                      </div>
                    </div>

                    <div className="text-[10px] text-zinc-400 leading-snug">
                      * İpucu: Sadece sizin tahmin edebileceğiniz güvenli bir kod girin. Örneğin: <code className="font-mono bg-zinc-100 px-1 py-0.5 rounded text-zinc-700">şahinler 1</code>.
                    </div>

                    <Button 
                      type="submit"
                      disabled={isSigningIn}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-300 text-white rounded-xl py-4 text-xs font-semibold shadow-md active:scale-95 transition-all duration-200 flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      {isSigningIn ? (
                        <>
                          <RefreshCw className="h-4 w-4 animate-spin" />
                          Bağlanıyor...
                        </>
                      ) : (
                        <>
                          <Cloud className="w-4 h-4" />
                          Buluta Bağlan ve Eşitle
                        </>
                      )}
                    </Button>
                  </form>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <FieldForm 
        isOpen={isFormOpen} 
        onClose={() => setIsFormOpen(false)} 
        user={user} 
        existingField={fieldToEdit} 
      />
      <ScreenShareHost />
      <GroupDevicesModal 
        isOpen={isDevicesModalOpen} 
        onClose={() => setIsDevicesModalOpen(false)} 
        groupId={user?.uid || ''}
      />
      <ParcelSearchModal 
        isOpen={isParcelSearchModalOpen}
        onClose={() => setIsParcelSearchModalOpen(false)}
        onOpenFieldFormWithData={(data) => {
          setFieldToEdit(data as any);
          setIsFormOpen(true);
        }}
      />
      <GeminiCopilotModal
        isOpen={isAiCopilotOpen}
        onClose={() => setIsAiCopilotOpen(false)}
        fields={fields}
        selectedFieldId={selectedFieldId}
        user={user}
        onSelectField={handleSelectField}
        onApplyGuidanceLines={(lines) => setGuidanceLines(lines)}
      />
      <Toaster position="top-center" duration={1000} />
    </>
  );
}
