import React, { useEffect, useState, useMemo } from 'react';
import { User } from 'firebase/auth';
import { collection, onSnapshot, query, where, deleteDoc, doc, orderBy, setDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { FieldRecord } from '../types';
import { updateLocalField, deleteLocalField } from '../lib/localFields';
import { db } from '../lib/firebase';
import { OperationType, handleFirestoreError } from '../lib/error';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import { Edit2, MapPin, Plus, Trash2, MapPinned, ListTodo, CheckCircle2, Clock, PlayCircle, Sun, Moon, SunDim, UploadCloud, Info, MoreVertical, Tag, CheckSquare, Square, Layers, X, MonitorSmartphone } from 'lucide-react';
import { FieldForm } from './FieldForm';
import { WeatherWidget } from './WeatherWidget';
import { toast } from 'sonner';
import { getLocalFields } from '../lib/localFields';
import { calculateFieldAreaSqMeters, formatAreaDomum, getTotalAreaDonum, getTopRightCoordinate } from '../lib/area';
import { createPortal } from 'react-dom';

interface SidebarProps {
  user: User;
  selectedFieldId: string | null;
  onSelectField: (id: string | null) => void;
  onEditField: (field: FieldRecord) => void;
  onAddNew: () => void;
}

export function Sidebar({ user, selectedFieldId, onSelectField, onEditField, onAddNew }: SidebarProps) {
  const [fields, setFields] = useState<FieldRecord[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'fields' | 'tasks'>('fields');

  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskFieldId, setNewTaskFieldId] = useState('all_single');
  const [newTaskType, setNewTaskType] = useState('general');
  const [fertilizerKg, setFertilizerKg] = useState('');
  const [newTaskNotes, setNewTaskNotes] = useState('');

  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editTaskTitle, setEditTaskTitle] = useState('');
  const [editTaskNotes, setEditTaskNotes] = useState('');
  const [editTaskType, setEditTaskType] = useState('');
  const [editTaskFertilizerKg, setEditTaskFertilizerKg] = useState('');
  const [editTaskAreaDonum, setEditTaskAreaDonum] = useState(0);

  const [editingFieldNoteId, setEditingFieldNoteId] = useState<string | null>(null);
  const [fieldNoteValue, setFieldNoteValue] = useState('');

  const formatTotalKg = (kg: number) => {
    if (kg >= 1000) {
       const tons = Math.floor(kg / 1000);
       const remainingKg = kg % 1000;
       if (remainingKg === 0) return `${tons} Ton`;
       return `${tons} Ton / ${remainingKg.toFixed(1)} kg`;
    }
    return `${kg.toFixed(1)} kg`;
  };

  const [isMergeMode, setIsMergeMode] = useState(false);
  const [mergeSelected, setMergeSelected] = useState<string[]>([]);
  const [activeMenuFieldId, setActiveMenuFieldId] = useState<string | null>(null);
  const [cropModalFields, setCropModalFields] = useState<string[] | null>(null);
  const [modalCropType, setModalCropType] = useState<string>('wheat');

  const handleBatchChangeCrop = async (targetCrop: string) => {
    if (!cropModalFields || cropModalFields.length === 0) return;
    const cropLabel = getCropLabel(targetCrop);

    if (user.uid === 'guest_user') {
      cropModalFields.forEach(id => updateLocalField(id, { cropType: targetCrop as any }));
      toast.success(`${cropModalFields.length} tarlanın ekin türü '${cropLabel}' olarak güncellendi.`);
    } else {
      try {
        const promises = cropModalFields.map(id => updateDoc(doc(db, 'fields', id), { cropType: targetCrop, updatedAt: serverTimestamp() }));
        await Promise.all(promises);
        toast.success(`${cropModalFields.length} tarlanın ekin türü '${cropLabel}' olarak güncellendi.`);
      } catch (err) {
        toast.error("Ekin türü güncellenirken hata oluştu.");
      }
    }
    setCropModalFields(null);
  };

  const handleBatchDelete = async (ids: string[]) => {
    if (ids.length === 0) return;
    if (!window.confirm(`${ids.length} adet tarlayı silmek istediğinize emin misiniz?`)) return;

    if (user.uid === 'guest_user') {
      ids.forEach(id => deleteLocalField(id));
      if (ids.includes(selectedFieldId || '')) onSelectField(null);
      setMergeSelected(prev => prev.filter(id => !ids.includes(id)));
      toast.success(`${ids.length} tarla başarıyla silindi.`);
    } else {
      try {
        const promises = ids.map(id => deleteDoc(doc(db, 'fields', id)));
        await Promise.all(promises);
        if (ids.includes(selectedFieldId || '')) onSelectField(null);
        setMergeSelected(prev => prev.filter(id => !ids.includes(id)));
        toast.success(`${ids.length} tarla başarıyla silindi.`);
      } catch (err) {
        toast.error("Tarlalar silinirken hata oluştu.");
      }
    }
  };
  
  const [theme, setTheme] = useState<'light'|'dark'>(() => {
    return (localStorage.getItem('app_theme') as any) || 'light';
  });
  
  const [brightness, setBrightness] = useState<number>(() => {
    return parseFloat(localStorage.getItem('app_brightness') || '1');
  });

  const [desktopMode, setDesktopMode] = useState<boolean>(() => {
    return localStorage.getItem('app_desktop_mode') === 'true';
  });

  const isRoot = localStorage.getItem('is_root_user') === 'true';

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    if (desktopMode) {
      body.style.zoom = '0.75';
      html.style.overflow = 'hidden';
      body.style.overflow = 'hidden';
      body.classList.add('desktop-ui-mode');
    } else {
      body.style.zoom = '1';
      body.style.removeProperty('zoom');
      html.style.removeProperty('overflow');
      body.style.removeProperty('overflow');
      body.classList.remove('desktop-ui-mode');
    }
    localStorage.setItem('app_desktop_mode', desktopMode.toString());
  }, [desktopMode]);

  useEffect(() => {
    const html = document.documentElement;
    html.classList.remove('theme-light', 'dark');
    if (theme === 'dark') {
      html.classList.add('dark');
    } else {
      html.classList.add('theme-light');
    }
    localStorage.setItem('app_theme', theme);
  }, [theme]);
  
  useEffect(() => {
    localStorage.setItem('app_brightness', brightness.toString());
  }, [brightness]);

  const toggleTheme = () => {
    setTheme(prev => {
      const nextTheme = prev === 'light' ? 'dark' : 'light';
      toast.success(`${nextTheme === 'light' ? 'Gündüz Modu' : 'Gece Modu'} aktif edildi.`);
      return nextTheme;
    });
  };

  const cropStats = useMemo(() => {
    const stats: Record<string, number> = {};
    fields.forEach(f => {
      const area = calculateFieldAreaSqMeters(f.polygon) / 1000; // in decares
      const crop = f.cropType || 'other';
      stats[crop] = (stats[crop] || 0) + area;
    });
    return stats;
  }, [fields]);

  const getCropLabel = (key: string) => {
     if (key === 'corn') return 'Mısır';
     if (key === 'wheat') return 'Buğday';
     if (key === 'sunflower') return 'Ayçiçeği';
     if (key === 'cotton') return 'Pamuk';
     if (key === 'sugar_beet') return 'Şeker Pancarı';
     if (key === 'solar_panel') return 'Güneş Paneli';
     if (key === 'empty') return 'Boş';
     return 'Diğer';
  };

  const handleMergeFields = async () => {
    if (mergeSelected.length < 2) {
      toast.error("Birleştirmek için en az 2 tarla seçmelisiniz.");
      return;
    }
    
    const fieldsToMerge = fields.filter(f => mergeSelected.includes(f.id));
    const masterField = fieldsToMerge[0];
    
    let mergedCoordinates: any[] = [];
    
    fieldsToMerge.forEach(f => {
      if (f.polygon) {
        let poly = f.polygon;
        try {
          if (typeof poly === 'string') poly = JSON.parse(poly);
        } catch(e) {
          console.error("Polygon parse error", e);
        }

        // Deal with Feature wrappers
        if (poly && poly.type === 'Feature' && poly.geometry) {
           poly = poly.geometry;
        } else if (poly && poly.type === 'FeatureCollection' && poly.features && poly.features.length > 0) {
           poly = poly.features[0].geometry; // rough extraction
        }
        
        if (poly && poly.type === 'Polygon') {
          mergedCoordinates.push(poly.coordinates);
        } else if (poly && poly.type === 'MultiPolygon') {
          mergedCoordinates.push(...poly.coordinates);
        }
      }
    });

    try {
      if (user.uid === 'guest_user') {
                // Only update polygon if we found geometry
        if (mergedCoordinates.length > 0) {
          const mergedPolygon = {
            type: 'MultiPolygon',
            coordinates: mergedCoordinates
          };
          updateLocalField(masterField.id, { polygon: mergedPolygon });
        }
        for (let i = 1; i < fieldsToMerge.length; i++) {
          deleteLocalField(fieldsToMerge[i].id);
        }
        window.dispatchEvent(new Event('local-fields-changed'));
        toast.success(`${fieldsToMerge.length} tarla başarıyla birleştirildi.`);
      } else {
                        
        const updates: any = { updatedAt: serverTimestamp() };
        if (mergedCoordinates.length > 0) {
           updates.polygon = JSON.stringify({
             type: 'MultiPolygon',
             coordinates: mergedCoordinates
           });
        }
        
        await updateDoc(doc(db, 'fields', masterField.id), updates);
        
        for (let i = 1; i < fieldsToMerge.length; i++) {
          await deleteDoc(doc(db, 'fields', fieldsToMerge[i].id));
        }
        toast.success(`${fieldsToMerge.length} tarla başarıyla birleştirildi.`);
      }
      
      setIsMergeMode(false);
      setMergeSelected([]);
      onSelectField(masterField.id);
    } catch (err) {
      console.error(err);
      toast.error("Birleştirme sırasında hata oluştu.");
    }
  };

  useEffect(() => {
    if (user.uid === 'guest_user') {
      const loadLocal = () => {
        const local = getLocalFields();
        local.sort((a, b) => {
          const timeA = (a.createdAt?.toMillis?.() || (a.createdAt as any)?.seconds * 1000) || 0;
          const timeB = (b.createdAt?.toMillis?.() || (b.createdAt as any)?.seconds * 1000) || 0;
          return timeB - timeA;
        });
        setFields(local);
      };

      loadLocal();
      window.addEventListener('local-fields-changed', loadLocal);
      return () => window.removeEventListener('local-fields-changed', loadLocal);
    }

    if (!db) return;

    const q = query(
      collection(db, 'fields'),
      where('ownerId', '==', user.uid)
      // Note: If we use orderBy, we might need a composite index in Firestore. 
      // For simplicity, we'll sort client-side if needed or just skip orderBy.
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const records: FieldRecord[] = [];
      snapshot.forEach((docSnap) => {
        records.push({ id: docSnap.id, ...docSnap.data() } as FieldRecord);
      });
      // Client-side sort by createdAt descending
      records.sort((a, b) => {
        const timeA = (a.createdAt?.toMillis?.() || (a.createdAt as any)?.seconds * 1000) || 0;
        const timeB = (b.createdAt?.toMillis?.() || (b.createdAt as any)?.seconds * 1000) || 0;
        return timeB - timeA;
      });
      setFields(records);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'fields');
    });

    const qt = query(collection(db, 'tasks'), where('groupId', '==', user.uid), orderBy('createdAt', 'desc'));
    const unsubTasks = onSnapshot(qt, (snapshot) => {
      const records: any[] = [];
      snapshot.forEach(docSnap => records.push({ id: docSnap.id, ...docSnap.data() }));
      setTasks(records);
    });

    return () => { unsubscribe(); unsubTasks(); };
  }, [user.uid]);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    
    if (user.uid === 'guest_user') {
      deleteLocalField(id);
      if (selectedFieldId === id) {
        onSelectField(null);
      }
      
      return;
    }

    try {
      await deleteDoc(doc(db, 'fields', id));
      if (selectedFieldId === id) {
        onSelectField(null);
      }
      
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `fields/${id}`);
    }
  };

  const handleEdit = (e: React.MouseEvent, field: FieldRecord) => {
    e.stopPropagation();
    onEditField(field);
  };

  const handleSaveFieldNote = async (e: React.FormEvent, fieldId: string) => {
    e.preventDefault();
    if (user.uid === 'guest_user') {
            updateLocalField(fieldId, { notes: fieldNoteValue });
      toast.success("Not yerel olarak kaydedildi.");
      setEditingFieldNoteId(null);
      return;
    }
    
    try {
                  await updateDoc(doc(db, 'fields', fieldId), { notes: fieldNoteValue });
      toast.success("Not başarıyla güncellendi.");
      setEditingFieldNoteId(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `fields/${fieldId}`);
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
     e.preventDefault();
     if (!newTaskTitle.trim() && newTaskType === 'general') return;
     if (!newTaskFieldId) {
       toast.error("Lütfen tarla seçimi yapın.");
       return;
     }

     const TASK_TYPES: Record<string, string> = {
        general: '',
        lister: 'Lister Çekme',
        gubreleme: 'Gübreleme',
        evlek: 'Evlek',
        ekim: 'Ekim',
        surum: 'Sürüm',
        kulfetor: 'Kültivatör',
        goplu: 'Goplu'
     };

     const title = newTaskType === 'general' ? newTaskTitle : TASK_TYPES[newTaskType];
     const isMaterialTask = ['lister', 'gubreleme', 'ekim'].includes(newTaskType);

     try {
       if (newTaskFieldId === 'all_separate') {
         await Promise.all(fields.map(async (field) => {
           let finalNotes = newTaskNotes;
           const exactArea = (calculateFieldAreaSqMeters(field.polygon) || 0) / 1000;
           const areaDonum = parseFloat(exactArea.toFixed(2));
           const fKg = Number(fertilizerKg) || 0;

           if (isMaterialTask) {
             const totalKg = areaDonum * fKg;
             const numBags = Math.ceil(totalKg / 50);
             const materialName = newTaskType === 'ekim' ? 'TOHUM/GÜBRE' : 'GÜBRELEME';
             const generatedNote = `[${materialName} HESABI]\nArazi Boyutu: ${areaDonum} Dönüm\nDönüme Atılacak: ${fKg} kg\nToplam: ${formatTotalKg(totalKg)}\nGerekli Çuval (50kg): ${numBags}\n\n`;
             finalNotes = generatedNote + finalNotes;
           }
           const ref = doc(collection(db, 'tasks'));
           await setDoc(ref, {
             title: title,
             groupId: user.uid,
             fieldId: field.id,
             notes: finalNotes,
             rawNotes: newTaskNotes,
             taskType: newTaskType,
             fertilizerKg: fKg,
             areaDonum: areaDonum,
             status: 'pending',
             createdAt: serverTimestamp()
           });
         }));
       } else {
         let finalNotes = newTaskNotes;
         let areaDonum = 0;
         let fKg = Number(fertilizerKg) || 0;

         if (isMaterialTask && newTaskFieldId && newTaskFieldId !== 'all_single') {
             const field = fields.find(f => f.id === newTaskFieldId);
             if (field) {
                 const exactArea = (calculateFieldAreaSqMeters(field.polygon) || 0) / 1000;
                 areaDonum = parseFloat(exactArea.toFixed(2));
                 const totalKg = areaDonum * fKg;
                 const numBags = Math.ceil(totalKg / 50);
                 const materialName = newTaskType === 'ekim' ? 'TOHUM/GÜBRE' : 'GÜBRELEME';
                 const generatedNote = `[${materialName} HESABI]\nArazi Boyutu: ${areaDonum} Dönüm\nDönüme Atılacak: ${fKg} kg\nToplam: ${formatTotalKg(totalKg)}\nGerekli Çuval (50kg): ${numBags}\n\n`;
                 finalNotes = generatedNote + finalNotes;
             }
         }
         const ref = doc(collection(db, 'tasks'));
         await setDoc(ref, {
           title: title,
           groupId: user.uid,
           fieldId: newTaskFieldId === 'all_single' ? '' : newTaskFieldId,
           notes: finalNotes,
           rawNotes: newTaskNotes,
           taskType: newTaskType,
           fertilizerKg: fKg,
           areaDonum: areaDonum,
           status: 'pending',
           createdAt: serverTimestamp()
         });
       }

       toast.success("Görev(ler) başarıyla eklendi");
       setIsCreatingTask(false);
       setNewTaskTitle('');
       setNewTaskFieldId('');
       setNewTaskNotes('');
       setFertilizerKg('');
       setNewTaskType('general');
     } catch(e) {
       console.error(e);
       toast.error("Görev eklenemedi.");
     }
  };

  const handleStartEditTask = (t: any) => {
      setEditingTaskId(t.id);
      setEditTaskTitle(t.title || '');
      setEditTaskNotes(t.rawNotes !== undefined ? t.rawNotes : (t.notes || ''));
      setEditTaskType(t.taskType || '');
      setEditTaskFertilizerKg(t.fertilizerKg || '');
      setEditTaskAreaDonum(t.areaDonum || 0);
  };

  const handleUpdateTask = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!editingTaskId) return;

      let finalNotes = editTaskNotes;
      const fKg = Number(editTaskFertilizerKg) || 0;
      const isMaterialTask = ['lister', 'gubreleme', 'ekim'].includes(editTaskType);
      
      if (isMaterialTask && editTaskAreaDonum > 0) {
          const totalKg = editTaskAreaDonum * fKg;
          const numBags = Math.ceil(totalKg / 50);
          const materialName = editTaskType === 'ekim' ? 'TOHUM/GÜBRE' : 'GÜBRELEME';
          const generatedNote = `[${materialName} HESABI]\nArazi Boyutu: ${editTaskAreaDonum} Dönüm\nDönüme Atılacak: ${fKg} kg\nToplam: ${formatTotalKg(totalKg)}\nGerekli Çuval (50kg): ${numBags}\n\n`;
          finalNotes = generatedNote + editTaskNotes;
      }

      try {
        await setDoc(doc(db, 'tasks', editingTaskId), {
           title: editTaskTitle,
           notes: finalNotes,
           rawNotes: editTaskNotes,
           fertilizerKg: fKg,
           updatedAt: serverTimestamp()
        }, { merge: true });
        toast.success("Görev güncellendi.");
        setEditingTaskId(null);
      } catch(err) {
        console.error(err);
        toast.error("Görev güncellenemedi.");
      }
  };

  const handleUpdateTaskStatus = async (taskId: string, newStatus: string) => {
     try {
       await setDoc(doc(db, 'tasks', taskId), { status: newStatus }, { merge: true });
     } catch(e) {
       console.error(e);
       toast.error("Durum güncellenemedi.");
     }
  };

  const handleDeleteTask = async (taskId: string) => {
     try {
       await deleteDoc(doc(db, 'tasks', taskId));
       toast.success("Görev başarıyla silindi");
     } catch (e: any) {
       console.error(e);
       toast.error("Hata: Görev silinemedi.");
     }
  };

  return (
    <div className="flex flex-col h-full bg-zinc-50/50">
      <div className="flex gap-1 p-2 bg-white border-b shrink-0">
        <button 
          onClick={() => setActiveTab('fields')} 
          className={`flex-1 py-1.5 text-xs font-semibold rounded ${activeTab==='fields' ? 'bg-zinc-100 text-zinc-900 shadow-sm' : 'text-zinc-500 hover:bg-zinc-50'}`}
        >
          <MapPinned className="h-3 w-3 inline-block mr-1" />
          Tarlalar ({fields.length})
        </button>
        <button 
          onClick={() => setActiveTab('tasks')} 
          className={`flex-1 py-1.5 text-xs font-semibold rounded ${activeTab==='tasks' ? 'bg-zinc-100 text-zinc-900 shadow-sm' : 'text-zinc-500 hover:bg-zinc-50'}`}
        >
          <ListTodo className="h-3 w-3 inline-block mr-1" />
          Görevler ({tasks.length})
        </button>
      </div>

      {activeTab === 'fields' && (
      <>
        <div className="p-4 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 shrink-0 flex flex-col gap-2">
        {!isMergeMode ? (
          <>
            {isRoot && (
              <>
                <Button 
                  onClick={onAddNew} 
                  className="w-full bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-zinc-200 text-white dark:text-zinc-900 rounded-xl py-5 shadow-sm font-semibold text-sm"
                >
                  <Plus className="mr-2 h-5 w-5" /> Yeni Tarla Ekle
                </Button>
                <div className="flex gap-2">
                  <Button 
                    variant="outline"
                    onClick={() => {
                      setIsMergeMode(true);
                      setMergeSelected([]);
                    }}
                    className="flex-1 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5"
                  >
                    <CheckSquare className="h-4 w-4 text-blue-600" />
                    Çoklu Seç / İşlemler
                  </Button>
                </div>
              </>
            )}
            <div className="text-xs text-zinc-500 dark:text-zinc-400 text-center font-medium mt-0.5">
              Toplam Kayıtlı Alan: <span className="font-bold text-zinc-800 dark:text-zinc-200">{formatAreaDomum(getTotalAreaDonum(fields) * 1000)} Dönüm</span>
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-2.5 bg-blue-50/70 dark:bg-blue-950/40 p-3 rounded-2xl border border-blue-200/80 dark:border-blue-900/50">
            <div className="flex justify-between items-center text-xs font-bold text-blue-900 dark:text-blue-200">
              <span>Çoklu Seçim ({mergeSelected.length} Tarla)</span>
              <button 
                onClick={() => {
                  if (mergeSelected.length === fields.length) {
                    setMergeSelected([]);
                  } else {
                    setMergeSelected(fields.map(f => f.id));
                  }
                }}
                className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline"
              >
                {mergeSelected.length === fields.length ? "Seçimi Temizle" : "Tümünü Seç"}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button 
                disabled={mergeSelected.length === 0}
                onClick={() => setCropModalFields(mergeSelected)} 
                size="sm"
                variant="outline"
                className="text-xs bg-white dark:bg-zinc-800 border-blue-200 text-blue-700 dark:text-blue-300 hover:bg-blue-100 rounded-xl font-medium flex items-center justify-center gap-1"
              >
                <Tag className="h-3.5 w-3.5" />
                Ekin Türü
              </Button>

              <Button 
                disabled={mergeSelected.length < 2}
                onClick={handleMergeFields} 
                size="sm"
                className="text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium flex items-center justify-center gap-1 shadow-sm"
              >
                <Layers className="h-3.5 w-3.5" />
                Birleştir
              </Button>
            </div>

            <div className="flex gap-2">
              <Button 
                disabled={mergeSelected.length === 0}
                onClick={() => handleBatchDelete(mergeSelected)} 
                size="sm"
                variant="outline"
                className="flex-1 text-xs border-red-200 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-xl font-medium flex items-center justify-center gap-1"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Seçilenleri Sil ({mergeSelected.length})
              </Button>

              <Button 
                variant="ghost"
                size="sm"
                onClick={() => {
                  setIsMergeMode(false);
                  setMergeSelected([]);
                }}
                className="text-xs text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-xl"
              >
                İptal
              </Button>
            </div>
          </div>
        )}
      </div>

      <ScrollArea className="flex-1 min-h-0 overflow-hidden px-4 py-2">
        {fields.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-zinc-400 text-center px-4 space-y-3">
            <MapPinned className="h-10 w-10 text-zinc-200 dark:text-zinc-700" />
            <p className="text-sm">Henüz kaydedilmiş bir tarla yok. Hemen yeni bir tane ekleyin.</p>
          </div>
        ) : (
          <div className="space-y-3 pb-8">
            {fields.map(field => {
              const isFieldMergeSelected = mergeSelected.includes(field.id);
              const isMenuOpen = activeMenuFieldId === field.id;
              
              return (
                <div 
                  key={field.id}
                  onClick={() => {
                    if (isMergeMode) {
                      setMergeSelected(prev => 
                        prev.includes(field.id) ? prev.filter(id => id !== field.id) : [...prev, field.id]
                      );
                    } else {
                      onSelectField(field.id);
                    }
                  }}
                  className={`
                    p-4 rounded-2xl border transition-all cursor-pointer group relative
                    ${isMergeMode 
                      ? (isFieldMergeSelected ? 'border-blue-500 bg-blue-50/70 dark:bg-blue-950/40 shadow-sm' : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-blue-200')
                      : (selectedFieldId === field.id ? 'border-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/30 shadow-md ring-1 ring-emerald-500/20' : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-emerald-300 dark:hover:border-zinc-700 hover:shadow-sm')}
                  `}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2 pr-6">
                      {isMergeMode && (
                        <div className={`w-4 h-4 rounded-md border flex items-center justify-center transition-colors ${isFieldMergeSelected ? 'bg-blue-600 border-blue-600 text-white' : 'border-zinc-300 dark:border-zinc-600'}`}>
                          {isFieldMergeSelected && <CheckCircle2 className="w-3 h-3 stroke-[3]" />}
                        </div>
                      )}
                      <h3 className="font-bold text-zinc-900 dark:text-zinc-100 text-sm line-clamp-1">{field.name || `${field.ada}/${field.parsel}`}</h3>
                    </div>

                    {!isMergeMode && isRoot && (
                      <div className="relative" onClick={(e) => e.stopPropagation()}>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-7 w-7 text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveMenuFieldId(isMenuOpen ? null : field.id);
                          }}
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>

                        {/* 3-Dot Options Dropdown Popover */}
                        {isMenuOpen && (
                          <div className="absolute right-0 top-8 z-50 w-44 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl shadow-xl p-1.5 animate-in fade-in zoom-in-95 duration-150">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveMenuFieldId(null);
                                handleEdit(e, field);
                              }}
                              className="w-full text-left px-3 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-xl flex items-center gap-2"
                            >
                              <Edit2 className="h-3.5 w-3.5 text-blue-500" />
                              Tarlayı Düzenle
                            </button>

                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveMenuFieldId(null);
                                setCropModalFields([field.id]);
                              }}
                              className="w-full text-left px-3 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-xl flex items-center gap-2"
                            >
                              <Tag className="h-3.5 w-3.5 text-emerald-500" />
                              Ekin Türünü Değiştir
                            </button>

                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveMenuFieldId(null);
                                setEditingFieldNoteId(field.id);
                                setFieldNoteValue(field.notes || '');
                              }}
                              className="w-full text-left px-3 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-xl flex items-center gap-2"
                            >
                              <Info className="h-3.5 w-3.5 text-amber-500" />
                              Not Ekle / Düzenle
                            </button>

                            <div className="h-px bg-zinc-100 dark:bg-zinc-700 my-1"></div>

                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveMenuFieldId(null);
                                handleDelete(e, field.id);
                              }}
                              className="w-full text-left px-3 py-2 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 rounded-xl flex items-center gap-2"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Tarlayı Sil
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                <div className="space-y-1.5 text-xs text-zinc-500">
                  <div className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                    <span className="line-clamp-1">{field.province}, {field.district}, {field.neighborhood}</span>
                  </div>
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-zinc-100">
                    <div className="bg-zinc-100 px-2 py-0.5 rounded-md font-mono flex gap-2 items-center">
                      <span>Ada/Parsel: {field.ada}/{field.parsel}</span>
                      <span className="text-zinc-400">|</span>
                      <span className="font-semibold text-zinc-700">{formatAreaDomum(calculateFieldAreaSqMeters(field.polygon))} Dönüm</span>
                    </div>
                    <div className="capitalize px-2 py-0.5 bg-green-100 text-green-700 rounded-md font-medium">
                      {getCropLabel(field.cropType)}
                    </div>
                  </div>
                </div>
                
                {selectedFieldId === field.id && field.latitude && field.longitude && (
                  <div className="mt-4 animate-in fade-in slide-in-from-top-2 duration-300">
                    {(() => {
                       const isYuzellikoku = field.ada === '2412' && field.parsel === '14';
                       const coords = isYuzellikoku 
                          ? getTopRightCoordinate(field.polygon, field.latitude, field.longitude)
                          : { latitude: field.latitude, longitude: field.longitude };
                       
                       return (
                         <WeatherWidget 
                           latitude={coords.latitude} 
                           longitude={coords.longitude} 
                           stationName={isYuzellikoku ? "Yüzellikoku Hava Durumu Santrali" : undefined}
                           isCustomStation={isYuzellikoku}
                         />
                       );
                    })()}

                    {/* Not Alanı */}
                    <div className="mt-4 p-3 bg-yellow-50/80 border border-yellow-200/80 rounded-xl relative shadow-sm">
                      {editingFieldNoteId === field.id ? (
                        <form onSubmit={(e) => handleSaveFieldNote(e, field.id)} className="flex flex-col gap-2">
                           <textarea
                             value={fieldNoteValue}
                             onChange={(e) => setFieldNoteValue(e.target.value)}
                             placeholder="Bu tarla için önemli bir not ekleyin..."
                             className="w-full text-sm p-2 border border-yellow-300 rounded-lg outline-none focus:ring-1 ring-yellow-400 min-h-[80px] bg-white resize-none"
                           />
                           <div className="flex gap-2 justify-end">
                             <Button type="button" variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setEditingFieldNoteId(null); }} className="h-7 text-xs">İptal</Button>
                             <Button type="submit" size="sm" onClick={(e) => e.stopPropagation()} className="h-7 text-xs bg-yellow-600 hover:bg-yellow-700 text-white">Kaydet</Button>
                           </div>
                        </form>
                      ) : (
                        <div>
                          <div className="flex justify-between items-center mb-1.5">
                            <span className="text-xs font-bold text-yellow-800 uppercase tracking-wider flex items-center gap-1.5">
                              <Info className="w-3.5 h-3.5" />
                              Tarla Notu
                            </span>
                            {isRoot && (
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-6 w-6 text-yellow-700 hover:bg-yellow-200/50 rounded-md" 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingFieldNoteId(field.id);
                                  setFieldNoteValue(field.notes || '');
                                }}
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </div>
                          {field.notes ? (
                            <p className="text-sm text-yellow-900 whitespace-pre-wrap leading-relaxed font-medium">{field.notes}</p>
                          ) : (
                            <p className="text-xs text-yellow-700/60 italic">
                              {isRoot ? "Bu tarla için henüz bir not eklenmedi. Eklemek için kalem simgesine tıklayın." : "Bu tarla için özel not bulunmuyor."}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
              );
            })}
            
            {fields.length > 0 && (
               <div className="border border-zinc-200 rounded-xl overflow-hidden mt-4 mb-6">
                 <div className="bg-zinc-100 px-4 py-2 font-semibold text-xs border-b border-zinc-200 text-zinc-700 flex justify-between">
                    <span>Toplam Kayıtlı Alan</span>
                    <span className="text-blue-700">{formatAreaDomum(getTotalAreaDonum(fields) * 1000)} Dönüm</span>
                 </div>
                 <div className="p-3 bg-white space-y-2">
                    {Object.entries(cropStats).map(([key, area]) => (
                       <div key={key} className="flex justify-between items-center text-xs">
                          <span className="text-zinc-600 font-medium">{getCropLabel(key)}</span>
                          <span className="font-bold text-zinc-800">{formatAreaDomum(Number(area) * 1000)} Dönüm</span>
                       </div>
                    ))}
                 </div>
               </div>
            )}
          </div>
        )}
      </ScrollArea>
      </>
      )}

      {activeTab === 'tasks' && (
        <div className="flex flex-col h-full bg-zinc-50 flex-1 min-h-0">
          {isCreatingTask ? (
           <div className="p-4 border-b bg-white shrink-0 flex flex-col gap-3">
              <div className="font-semibold text-sm text-zinc-800 flex justify-between items-center">
                 <span>Yeni Görev Ekle</span>
              </div>
              <form onSubmit={handleCreateTask} className="flex flex-col gap-3">
                <select 
                  className="px-3 py-2 border border-zinc-200 rounded-lg text-sm outline-none bg-white focus:border-zinc-400 transition"
                  value={newTaskType}
                  onChange={e => setNewTaskType(e.target.value)}
                >
                  <option value="general">Genel / Diğer Görev...</option>
                  <option value="gubreleme">Gübreleme (Özel)</option>
                  <option value="lister">Lister Çekme (Karık)</option>
                  <option value="ekim">Ekim (Tohum)</option>
                  <option value="surum">Sürüm (Pulluk vb.)</option>
                  <option value="evlek">Evlek Açma</option>
                  <option value="kulfetor">Kültivatör (Kazayağı)</option>
                  <option value="goplu">Goplu (Diskaro)</option>
                </select>

                {newTaskType === 'general' && (
                  <input 
                    type="text" 
                    autoFocus
                    placeholder="Görev Adı (Örn: Ekin ekme, çapa yapma)"
                    className="px-3 py-2 border border-zinc-200 rounded-lg text-sm outline-none focus:border-zinc-400 transition"
                    value={newTaskTitle}
                    onChange={e => setNewTaskTitle(e.target.value)}
                  />
                )}

                <select 
                  className="px-3 py-2 border border-zinc-200 rounded-lg text-sm outline-none bg-white focus:border-zinc-400 transition"
                  value={newTaskFieldId}
                  onChange={e => setNewTaskFieldId(e.target.value)}
                >
                  <option value="all_separate">Tüm Tarlalar (Ayrı Ayrı Ekle)</option>
                  <option value="all_single">Tarladan Bağımsız Genel Görev</option>
                  <optgroup label="Tarlalar">
                    {fields.map(f => (
                      <option key={f.id} value={f.id}>{f.name || `${f.ada}/${f.parsel}`}</option>
                    ))}
                  </optgroup>
                </select>

                {['lister', 'gubreleme', 'ekim'].includes(newTaskType) && (
                   <input 
                      type="number"
                      placeholder={newTaskType === 'ekim' ? "Dönüme Kaç Kg Tohum / Gübre Atılacak? (Örn: 20)" : "Dönüme Kaç Kg Gübre Atılacak? (Örn: 15)"}
                      className="px-3 py-2 border border-zinc-200 rounded-lg text-sm outline-none focus:border-zinc-400 transition"
                      value={fertilizerKg}
                      onChange={e => setFertilizerKg(e.target.value)}
                   />
                )}

                <textarea
                  placeholder="Notlar / Defter (İsteğe bağlı)"
                  className="px-3 py-2 border border-zinc-200 rounded-lg text-sm outline-none focus:border-zinc-400 transition min-h-[60px]"
                  value={newTaskNotes}
                  onChange={e => setNewTaskNotes(e.target.value)}
                />

                <div className="flex gap-2 pt-1">
                  <Button type="button" variant="outline" className="flex-1 rounded-lg" onClick={() => setIsCreatingTask(false)}>İptal</Button>
                  <Button type="submit" disabled={!newTaskFieldId || (newTaskType === 'general' && !newTaskTitle.trim()) || (['lister', 'gubreleme', 'ekim'].includes(newTaskType) && !fertilizerKg)} variant="default" className="flex-1 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg">Listeye Ekle</Button>
                </div>
              </form>
           </div>
          ) : (
           <div className="p-4 border-b bg-white shrink-0">
              <Button onClick={() => setIsCreatingTask(true)} className="w-full bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg py-5 shadow-sm font-semibold">
                <Plus className="w-5 h-5 mr-2" /> Görev Ekle (Ekme, İlaçlama...)
              </Button>
           </div>
          )}
           <ScrollArea className="flex-1 p-4">
              {tasks.length === 0 ? (
                 <div className="flex flex-col items-center justify-center h-32 text-zinc-400 text-center px-4 mt-6">
                    <ListTodo className="h-10 w-10 text-zinc-200 mb-3" />
                    <p className="text-sm">Henüz bir görev eklemediniz.</p>
                 </div>
              ) : (
                <div className="space-y-3 pb-8">
                  {tasks.map(t => (
                    <MemoizedTaskItem
                      key={t.id}
                      task={t}
                      fields={fields}
                      editingTaskId={editingTaskId}
                      editTaskTitle={editTaskTitle}
                      editTaskType={editTaskType}
                      editTaskAreaDonum={editTaskAreaDonum}
                      editTaskFertilizerKg={editTaskFertilizerKg}
                      editTaskNotes={editTaskNotes}
                      setEditingTaskId={setEditingTaskId}
                      setEditTaskTitle={setEditTaskTitle}
                      setEditTaskFertilizerKg={setEditTaskFertilizerKg}
                      setEditTaskNotes={setEditTaskNotes}
                      handleUpdateTask={handleUpdateTask}
                      handleStartEditTask={handleStartEditTask}
                      handleDeleteTask={handleDeleteTask}
                      handleUpdateTaskStatus={handleUpdateTaskStatus}
                    />
                  ))}
                </div>
              )}
           </ScrollArea>
        </div>
      )}

      {/* Global Footer */}
      <div className="p-3 bg-zinc-900 border-t border-zinc-800 shrink-0 text-white flex items-center justify-between gap-3">
         <Button onClick={toggleTheme} className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-2 h-auto rounded-lg font-medium border border-zinc-700 shadow-sm shrink-0" title={theme === 'light' ? 'Gündüz Modu' : 'Gece Modu'}>
            {theme === 'light' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-blue-400" />}
         </Button>
         <Button onClick={() => { setDesktopMode(!desktopMode); toast.success(desktopMode ? 'Mobil mod aktif' : 'Süper Masaüstü aktif'); }} className={`px-3 py-2 h-auto rounded-lg font-medium border shadow-sm shrink-0 transition-all ${desktopMode ? 'bg-blue-600/20 border-blue-500/50 text-blue-400 hover:bg-blue-600/30' : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-zinc-700'}`} title={desktopMode ? 'Süper Masaüstü (Aktif)' : 'Süper Masaüstü (Kapalı)'}>
            <MonitorSmartphone className="w-4 h-4" />
         </Button>
         <div className="flex-1 flex items-center gap-2 bg-zinc-800 px-3 py-2 rounded-lg border border-zinc-700">
           <SunDim className="w-4 h-4 text-zinc-400 shrink-0" />
           <input 
             type="range" 
             min="0.2" max="1" step="0.05" 
             value={brightness} 
             onChange={(e) => setBrightness(parseFloat(e.target.value))}
             className="w-full accent-zinc-400 h-1 rounded-lg appearance-none bg-zinc-700 outline-none hover:opacity-100 transition-opacity opacity-80 cursor-pointer" 
             style={{ 
               appearance: 'none', 
             }}
             title="Ekran Parlaklığı"
           />
         </div>
      </div>

      {/* Crop Type Selection Modal */}
      {cropModalFields && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[2000] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 max-w-sm w-full shadow-2xl space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center border-b pb-3 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 rounded-xl">
                  <Tag className="h-5 w-5" />
                </div>
                <h3 className="font-bold text-zinc-900 dark:text-zinc-100 text-base">Ekin Türünü Değiştir</h3>
              </div>
              <button onClick={() => setCropModalFields(null)} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1">
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Seçilen <span className="font-bold text-zinc-800 dark:text-zinc-200">{cropModalFields.length}</span> tarla için uygulanacak ekin türünü seçin:
            </p>

            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'wheat', label: '🌾 Buğday' },
                { id: 'corn', label: '🌽 Mısır' },
                { id: 'sunflower', label: '🌻 Ayçiçeği' },
                { id: 'cotton', label: '☁️ Pamuk' },
                { id: 'sugar_beet', label: '🌱 Şeker Pancarı' },
                { id: 'crop_area', label: '🟥 Ekin Alanı' },
                { id: 'solar_panel', label: '🟩 Güneş Paneli' },
                { id: 'empty', label: '⚪ Boş / Nadas' },
                { id: 'other', label: '📦 Diğer' },
              ].map(item => (
                <button
                  key={item.id}
                  onClick={() => setModalCropType(item.id)}
                  className={`p-2.5 text-xs font-semibold rounded-xl border text-left transition-all ${modalCropType === item.id ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-500 text-emerald-700 dark:text-emerald-300 shadow-sm ring-1 ring-emerald-500/30' : 'bg-zinc-50 dark:bg-zinc-800/50 border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="flex gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
              <Button variant="ghost" onClick={() => setCropModalFields(null)} className="flex-1 text-xs rounded-xl">
                İptal
              </Button>
              <Button onClick={() => handleBatchChangeCrop(modalCropType)} className="flex-1 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl shadow-md">
                Uygula
              </Button>
            </div>
          </div>
        </div>
      )}

      {createPortal(
        <div 
          style={{
            pointerEvents: 'none',
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            backgroundColor: 'black',
            opacity: 1 - brightness,
            transition: 'opacity 0.1s ease-out'
          }}
        />,
        document.body
      )}
    </div>
  );
}

const MemoizedTaskItem = React.memo(
  function TaskItem({ 
    task, fields, editingTaskId, editTaskTitle, editTaskType, editTaskAreaDonum,
    editTaskFertilizerKg, editTaskNotes, setEditingTaskId, setEditTaskTitle,
    setEditTaskFertilizerKg, setEditTaskNotes, handleUpdateTask, handleStartEditTask,
    handleDeleteTask, handleUpdateTaskStatus 
  }: any) {
    const field = fields.find((f: any) => f.id === task.fieldId);
    const fieldName = field ? (field.name || `${field.ada}/${field.parsel}`) : 'Tarladan Bağımsız';
    const isEditing = editingTaskId === task.id;

    return (
      <div className={`p-4 rounded-xl border transition-all shadow-sm ${
        task.status === 'completed' ? 'bg-emerald-50/50 border-emerald-200' : 
        task.status === 'in_progress' ? 'bg-blue-50/50 border-blue-200' : 'bg-white border-zinc-200 hover:border-zinc-300'
      }`}>
        {isEditing ? (
           <form onSubmit={handleUpdateTask} className="flex flex-col gap-2 mb-3">
              <input 
                type="text" 
                className="px-3 py-2 border border-zinc-200 rounded-lg text-sm outline-none focus:border-zinc-400"
                value={editTaskTitle}
                onChange={(e: any) => setEditTaskTitle(e.target.value)}
              />
              {['lister', 'gubreleme', 'ekim'].includes(editTaskType) && editTaskAreaDonum > 0 && (
                 <input 
                    type="number"
                    placeholder={editTaskType === 'ekim' ? "Dönüme Kaç Kg Tohum / Gübre Atılacak? (Örn: 20)" : "Dönüme Kaç Kg Gübre Atılacak? (Örn: 15)"}
                    className="px-3 py-2 border border-zinc-200 rounded-lg text-sm outline-none focus:border-zinc-400 transition"
                    value={editTaskFertilizerKg}
                    onChange={(e: any) => setEditTaskFertilizerKg(e.target.value)}
                 />
              )}
              <textarea
                className="px-3 py-2 border border-zinc-200 rounded-lg text-sm outline-none focus:border-zinc-400 min-h-[100px]"
                value={editTaskNotes}
                onChange={(e: any) => setEditTaskNotes(e.target.value)}
                placeholder="Notlar/Defter"
              />
              <div className="flex gap-2 justify-end mt-1">
                 <Button type="button" size="sm" variant="outline" className="h-8 text-xs px-4" onClick={() => setEditingTaskId(null)}>İptal</Button>
                 <Button type="submit" size="sm" className="h-8 text-xs px-4 bg-zinc-900 text-white hover:bg-zinc-800">Kaydet</Button>
              </div>
           </form>
        ) : (
          <>
            <div className="flex justify-between items-start mb-3 border-b border-zinc-100 pb-3">
               <div className="flex-1 pr-2 leading-tight">
                  <div className="flex items-start gap-2">
                    <h3 className={`font-semibold text-[15px] ${task.status === 'completed' ? 'line-through text-emerald-800/60' : 'text-zinc-800'}`}>{task.title}</h3>
                    <button onClick={() => handleStartEditTask(task)} className="text-zinc-400 hover:text-blue-600 transition-colors mt-0.5" title="Görevi Düzenle">
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="text-xs font-medium text-zinc-500 mt-1.5 flex items-center gap-1.5">
                     <MapPin className="w-3.5 h-3.5 shrink-0 opacity-70"/> 
                     <span className="line-clamp-1">{fieldName}</span>
                  </p>
               </div>
               <button onClick={() => handleDeleteTask(task.id)} className="text-zinc-400 hover:text-red-600 transition-colors bg-white hover:bg-red-50 p-2 rounded-lg border border-zinc-100 shadow-sm shrink-0">
                 <Trash2 className="w-3.5 h-3.5"/>
               </button>
            </div>
            
            {task.notes && (
               <div className="text-xs text-zinc-600 bg-black/5 rounded-lg p-3 mb-3 whitespace-pre-wrap relative group">
                  <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => handleStartEditTask(task)} className="text-zinc-400 hover:text-blue-600" title="Notu Düzenle">
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {task.notes}
               </div>
            )}
          </>
        )}
        
        <div className="flex gap-2">
           <button 
             onClick={() => handleUpdateTaskStatus(task.id, 'pending')}
             className={`flex-1 flex gap-1.5 justify-center items-center py-2 rounded-lg text-[10px] font-extrabold uppercase tracking-wide transition-colors border ${task.status === 'pending' ? 'bg-zinc-800 text-white border-zinc-800 shadow-sm' : 'bg-white text-zinc-500 hover:bg-zinc-50 border-zinc-200'}`}
           >
             <Clock className="w-3.5 h-3.5"/> Bekliyor
           </button>
           <button 
             onClick={() => handleUpdateTaskStatus(task.id, 'in_progress')}
             className={`flex-1 flex gap-1.5 justify-center items-center py-2 rounded-lg text-[10px] font-extrabold uppercase tracking-wide transition-colors border ${task.status === 'in_progress' ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-white text-zinc-500 hover:bg-zinc-50 border-zinc-200'}`}
           >
             <PlayCircle className="w-3.5 h-3.5"/> Başladı
           </button>
           <button 
             onClick={() => handleUpdateTaskStatus(task.id, 'completed')}
             className={`flex-1 flex gap-1.5 justify-center items-center py-2 rounded-lg text-[10px] font-extrabold uppercase tracking-wide transition-colors border ${task.status === 'completed' ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm' : 'bg-white text-zinc-500 hover:bg-zinc-50 border-zinc-200'}`}
           >
             <CheckCircle2 className="w-3.5 h-3.5"/> Bitti
           </button>
        </div>
      </div>
    );
  },
  (prev: any, next: any) => {
    if (prev.task.id !== next.task.id) return false;
    if (prev.task.updatedAt?.toMillis?.() !== next.task.updatedAt?.toMillis?.()) return false;
    if (prev.task.status !== next.task.status) return false;
    
    // Check editing state
    const wasEditing = prev.editingTaskId === prev.task.id;
    const isEditingNow = next.editingTaskId === next.task.id;
    if (wasEditing !== isEditingNow) return false;

    if (isEditingNow) {
      if (prev.editTaskTitle !== next.editTaskTitle) return false;
      if (prev.editTaskType !== next.editTaskType) return false;
      if (prev.editTaskAreaDonum !== next.editTaskAreaDonum) return false;
      if (prev.editTaskFertilizerKg !== next.editTaskFertilizerKg) return false;
      if (prev.editTaskNotes !== next.editTaskNotes) return false;
    }

    return true; 
  }
);