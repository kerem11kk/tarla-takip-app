import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { User } from 'firebase/auth';
import { doc, setDoc, updateDoc, serverTimestamp, collection } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { OperationType, handleFirestoreError } from '../lib/error';
import { FieldRecord } from '../types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { toast } from 'sonner';
import { Upload, XIcon, MapPinned, Edit2, Crosshair } from 'lucide-react';
import { addLocalField, updateLocalField } from '../lib/localFields';
import { parseAnyFieldFile } from '../lib/fileParser';
import { getCentroidCoordinate } from '../lib/area';

const fieldSchema = z.object({
  name: z.string().max(100).optional(),
  province: z.string().max(100).min(1, "İl zorunludur"),
  district: z.string().max(100).min(1, "İlçe zorunludur"),
  neighborhood: z.string().max(100).min(1, "Mahalle/Köy zorunludur"),
  ada: z.string().max(20).optional(),
  parsel: z.string().max(20).optional(),
  latitude: z.any().transform(v => Number(v)).refine(v => !isNaN(v) && v >= -90 && v <= 90, { message: "Geçersiz" }),
  longitude: z.any().transform(v => Number(v)).refine(v => !isNaN(v) && v >= -180 && v <= 180, { message: "Geçersiz" }),
  cropType: z.enum(["corn", "wheat", "sunflower", "cotton", "sugar_beet", "crop_area", "solar_panel", "other"]),
  polygon: z.any().optional(),
});

type FieldFormValues = z.infer<typeof fieldSchema>;

interface FieldFormProps {
  isOpen: boolean;
  onClose: () => void;
  user: User;
  existingField: FieldRecord | null;
}

export function FieldForm({ isOpen, onClose, user, existingField }: FieldFormProps) {
  const { register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting } } = useForm<FieldFormValues>({
    resolver: zodResolver(fieldSchema),
    defaultValues: {
      name: '',
      province: 'Kahramanmaraş',
      district: 'Elbistan',
      neighborhood: '',
      ada: '',
      parsel: '',
      latitude: undefined,
      longitude: undefined,
      cropType: 'wheat'
    }
  });

  
  useEffect(() => {
    const handleFillParcel = (e: any) => {
      const { polygon, properties } = e.detail;
      if (polygon) {
        setValue('polygon', polygon);
      }
      if (properties) {
        if (properties.adaNo) setValue('ada', properties.adaNo.toString());
        if (properties.parselNo) setValue('parsel', properties.parselNo.toString());
        if (properties.mahalleAd) setValue('neighborhood', properties.mahalleAd);
        if (properties.ilceAd) setValue('district', properties.ilceAd);
        if (properties.ilAd) setValue('province', properties.ilAd);
      }
      
    };
    window.addEventListener('fill-tkgm-parcel', handleFillParcel);
    return () => window.removeEventListener('fill-tkgm-parcel', handleFillParcel);
  }, [setValue]);

  useEffect(() => {
    if (isOpen) {
      if (existingField) {
        let polygonToReset = existingField.polygon || null;
        if (typeof polygonToReset === 'string') {
          try {
            polygonToReset = JSON.parse(polygonToReset);
          } catch (e) {
            console.error("Polygon parse error:", e);
          }
        }

        reset({
          name: existingField.name || '',
          province: existingField.province || '',
          district: existingField.district || '',
          neighborhood: existingField.neighborhood || '',
          ada: existingField.ada || '',
          parsel: existingField.parsel || '',
          latitude: existingField.latitude,
          longitude: existingField.longitude,
          cropType: (existingField.cropType as any) || 'wheat',
          polygon: polygonToReset,
        });
      } else {
        reset({
          name: '',
          province: 'Kahramanmaraş',
          district: 'Elbistan',
          neighborhood: '',
          ada: '',
          parsel: '',
          latitude: undefined,
          longitude: undefined,
          cropType: 'wheat',
          polygon: null,
        });
      }
    }
  }, [existingField, isOpen, reset]);

  const isExisting = Boolean(existingField && existingField.id && existingField.id.trim() !== '');

  const onSubmit = async (data: FieldFormValues) => {
    try {
      // Calculate latitude and longitude from polygon if they are missing or default
      if (data.polygon && (!data.latitude || !data.longitude || (data.latitude === 38.9637 && data.longitude === 35.2433))) {
        const centroid = getCentroidCoordinate(data.polygon);
        if (centroid) {
          data.latitude = centroid.latitude;
          data.longitude = centroid.longitude;
        }
      }

      if (isExisting && existingField) {
        if (user.uid === 'guest_user') {
          updateLocalField(existingField.id, {
            ...data,
            name: data.name || '',
            ada: data.ada || '',
            parsel: data.parsel || '',
            polygon: data.polygon ? (typeof data.polygon === 'string' ? JSON.parse(data.polygon) : data.polygon) : null
          });
        } else {
          // Update
          const ref = doc(db, 'fields', existingField.id);
          const updateData: any = {
            ...data,
            name: data.name || '',
            ada: data.ada || '',
            parsel: data.parsel || '',
            ownerId: user.uid,
            updatedAt: serverTimestamp(),
          };
          // Ensure polygon gets updated or cleared properly
          // Firestore doesn't support nested arrays, so we stringify GeoJSON coordinates/polygon
          if (data.polygon) {
            updateData.polygon = typeof data.polygon === 'string' ? data.polygon : JSON.stringify(data.polygon);
          } else {
            updateData.polygon = null;
          }
          
          await updateDoc(ref, updateData);
        }
      } else {
        if (user.uid === 'guest_user') {
          addLocalField({
            ...data,
            name: data.name || '',
            ada: data.ada || '',
            parsel: data.parsel || '',
            ownerId: user.uid,
            polygon: data.polygon ? (typeof data.polygon === 'string' ? JSON.parse(data.polygon) : data.polygon) : null
          } as any);
        } else {
          // Create
          const ref = doc(collection(db, 'fields'));
          const newData = {
            ...data,
            name: data.name || '',
            ada: data.ada || '',
            parsel: data.parsel || '',
            ownerId: user.uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            polygon: data.polygon ? (typeof data.polygon === 'string' ? data.polygon : JSON.stringify(data.polygon)) : null
          };
          await setDoc(ref, newData);
        }
      }
      toast.success(isExisting ? 'Tarla başarıyla güncellendi' : 'Tarla başarıyla kaydedildi');
      onClose();
    } catch (error) {
      handleFirestoreError(
        error, 
        isExisting ? OperationType.UPDATE : OperationType.CREATE, 
        isExisting && existingField?.id ? `fields/${existingField.id}` : 'fields'
      );
    }
  };

  const getUserLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Tarayıcınız konum servisini desteklemiyor.');
      return;
    }
    
    const toastId = toast.loading("Yüksek doğruluklu mevcut konum alınıyor...");
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        toast.dismiss(toastId);
        setValue('latitude', position.coords.latitude, { shouldValidate: true });
        setValue('longitude', position.coords.longitude, { shouldValidate: true });
        
        const accuracyInMeters = position.coords.accuracy ? Math.round(position.coords.accuracy) : null;
        if (accuracyInMeters !== null) {
          if (accuracyInMeters > 150) {
            toast.warning(`Konum alındı ancak hassasiyet düşük (${accuracyInMeters}m). Açık alanda tekrar deneyebilirsiniz.`, { duration: 5000 });
          } else {
            toast.success(`Konumunuz yüksek doğrulukla alındı (Hassasiyet: ${accuracyInMeters}m).`, { duration: 4000 });
          }
        } else {
          toast.success('Konumunuz başarıyla alındı.');
        }
      },
      (error) => {
        toast.dismiss(toastId);
        console.error("FieldForm geolocation error:", error);
        
        if (error.code === 1) { // PERMISSION_DENIED
          toast.error('Konum izni reddedildi. Lütfen tarayıcı ayarlarından konum izni verin.');
        } else {
          // Fallback to standard accuracy
          const retryToastId = toast.loading("Yüksek doğruluklu konum alınamadı. Standart doğrulukla deneniyor...");
          navigator.geolocation.getCurrentPosition(
            (pos2) => {
              toast.dismiss(retryToastId);
              setValue('latitude', pos2.coords.latitude, { shouldValidate: true });
              setValue('longitude', pos2.coords.longitude, { shouldValidate: true });
              const acc = pos2.coords.accuracy ? Math.round(pos2.coords.accuracy) : 0;
              toast.warning(`Konum alındı (Hassasiyet: ${acc}m).`);
            },
            (error2) => {
              toast.dismiss(retryToastId);
              toast.error('Konum alınamadı. Lütfen cihazınızın konum (GPS) servislerinin açık olduğundan emin olun.');
            },
            { enableHighAccuracy: false, maximumAge: 10000, timeout: 15000 }
          );
        }
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
    );
  };

  const [mergePolygons, setMergePolygons] = React.useState(true);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const loadingToast = toast.loading(`${file.name} ayrıştırılıyor...`);

    try {
      const result = await parseAnyFieldFile(file);
      toast.dismiss(loadingToast);

      if (!result.latitude || !result.longitude) {
        toast.error('Dosyada geçerli bir koordinat veya parsel sınırı bulunamadı.');
        return;
      }

      setValue('latitude', result.latitude, { shouldValidate: true });
      setValue('longitude', result.longitude, { shouldValidate: true });

      if (result.ada) setValue('ada', result.ada, { shouldValidate: true });
      if (result.parsel) setValue('parsel', result.parsel, { shouldValidate: true });
      if (result.province) setValue('province', result.province, { shouldValidate: true });
      if (result.district) setValue('district', result.district, { shouldValidate: true });
      if (result.neighborhood) setValue('neighborhood', result.neighborhood, { shouldValidate: true });
      if (result.name && !watch('name')) setValue('name', result.name, { shouldValidate: true });

      if (result.polygon) {
        if (mergePolygons) {
          const currentPolygon = watch('polygon');
          if (currentPolygon) {
            const currentCoords = currentPolygon.type === 'Polygon' ? [currentPolygon.coordinates] : currentPolygon.coordinates;
            const newCoords = result.polygon.type === 'Polygon' ? [result.polygon.coordinates] : result.polygon.coordinates;
            const mergedCoordinates = [...currentCoords, ...newCoords];
            setValue('polygon', { type: 'MultiPolygon', coordinates: mergedCoordinates });
          } else {
            setValue('polygon', result.polygon);
          }
        } else {
          setValue('polygon', result.polygon);
        }
      }

      toast.success(`${file.name} dosyasından konum ve sınırlar başarıyla aktarıldı!`);
    } catch (error: any) {
      toast.dismiss(loadingToast);
      console.error("Dosya yükleme hatası:", error);
      const msg = error?.message || String(error);
      toast.error(msg !== '[object Object]' ? msg : 'Dosya okunamadı veya format desteklenmiyor.');
    } finally {
      if (e.target) e.target.value = '';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      // Sadece açık olduğunda değilken çağrılır, ancak Base UI file picker 
      // açıldığında dialog'u kapatabiliyor.
      // Kapatmayı zorlaştırmak için burada onClose() yapmıyoruz.
      // DialogPrimitive.Close ve Cancel butonu kendisi onClose tetikliyor.
      if (!open) {
        // file picker dialog bug'ını atlatmak için, onOpenChange üzerinden değil 
        // manuel olarak X (DialogClose) veya İptal tuşuna basıldığında kapanmasını sağlayalım.
      }
    }}>
      <DialogContent showCloseButton={false} className="w-[95vw] sm:w-full max-w-lg shrink-0 bg-white dark:bg-zinc-900 dark:text-zinc-100 p-6 max-h-[88vh] overflow-y-auto rounded-3xl shadow-2xl border border-zinc-200 dark:border-zinc-800 relative">
        <Button 
          type="button"
          variant="ghost" 
          className="absolute top-3 right-3 h-8 w-8 rounded-full text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 p-0"
          onClick={(e) => { e.preventDefault(); onClose(); }}
        >
          <XIcon className="h-4 w-4" />
          <span className="sr-only">Kapat</span>
        </Button>
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{isExisting ? "Tarlayı Düzenle" : "Yeni Tarla Ekle"}</DialogTitle>
          <DialogDescription className="text-xs text-zinc-500 dark:text-zinc-400">
            Tarlanızın konumunu ve detaylarını kaydedin, haritada görüntüleyin.
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-3">
          <div className="space-y-1.5">
            <Label htmlFor="name" className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Tarla Adı <span className="text-zinc-400 font-normal">(İsteğe bağlı)</span></Label>
            <Input id="name" placeholder="Örn: Arka Bahçe, Dere Yanı" {...register('name')} className="bg-zinc-50 dark:bg-zinc-800/70 dark:border-zinc-700 text-xs h-9 rounded-xl" />
            {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="province" className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">İl *</Label>
              <Input id="province" placeholder="Örn: Konya" {...register('province')} className="bg-zinc-50 dark:bg-zinc-800/70 dark:border-zinc-700 text-xs h-9 rounded-xl" />
              {errors.province && <p className="text-xs text-red-500">{errors.province.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="district" className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">İlçe *</Label>
              <Input id="district" placeholder="Örn: Karatay" {...register('district')} className="bg-zinc-50 dark:bg-zinc-800/70 dark:border-zinc-700 text-xs h-9 rounded-xl" />
              {errors.district && <p className="text-xs text-red-500">{errors.district.message}</p>}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="neighborhood" className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Mahalle/Köy *</Label>
            <Input id="neighborhood" placeholder="Örn: İsmil Mahallesi" {...register('neighborhood')} className="bg-zinc-50 dark:bg-zinc-800/70 dark:border-zinc-700 text-xs h-9 rounded-xl" />
            {errors.neighborhood && <p className="text-xs text-red-500">{errors.neighborhood.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ada" className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Ada</Label>
              <Input id="ada" placeholder="Örn: 234" {...register('ada')} className="bg-zinc-50 dark:bg-zinc-800/70 dark:border-zinc-700 text-xs h-9 rounded-xl font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="parsel" className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Parsel</Label>
              <Input id="parsel" placeholder="Örn: 12" {...register('parsel')} className="bg-zinc-50 dark:bg-zinc-800/70 dark:border-zinc-700 text-xs h-9 rounded-xl font-mono" />
            </div>
          </div>

          <div className="bg-zinc-50 dark:bg-zinc-800/40 p-4 rounded-2xl border border-zinc-200/80 dark:border-zinc-800 space-y-3">
            <div className="bg-blue-50/80 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900/50 rounded-xl p-3.5 space-y-2">
               <div className="flex flex-col gap-1">
                  <h4 className="font-bold text-blue-900 dark:text-blue-300 text-xs">Dosyadan Aktar (Shape / KML / GeoJSON)</h4>
                  <p className="text-[11px] text-blue-700 dark:text-blue-300/80 leading-relaxed">Parsel Sorgu veya GIS yazılımlarından aldığınız Shape (.zip), KML veya GeoJSON dosyasını yükleyin.</p>
               </div>
               <div className="relative mt-1">
                  <input type="file" accept=".zip,.kmz,.kml,.json,.geojson,.shp,.dxf,.pdf,.txt,.csv,.ncz,.wkt,*/*" onChange={handleFileUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                  <Button type="button" variant="outline" className="w-full bg-white dark:bg-zinc-800 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-zinc-700 text-xs h-9 rounded-xl pointer-events-none">
                    <Upload className="w-4 h-4 mr-2" />
                    Dosya Yükle (.zip, .kmz, .kml, .geojson)
                  </Button>
               </div>
               <div className="flex items-center gap-2 mt-1">
                 <input 
                   type="checkbox" 
                   id="mergePolygons" 
                   checked={mergePolygons} 
                   onChange={(e) => setMergePolygons(e.target.checked)} 
                   className="rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
                 />
                 <Label htmlFor="mergePolygons" className="text-[11px] text-blue-800 dark:text-blue-300 font-medium">Yeni yüklenen parselleri eskileriyle birleştir</Label>
               </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-1.5 mt-2">
              <Label className="font-bold text-xs text-zinc-700 dark:text-zinc-300">Konum & Sınır Bilgisi *</Label>
              <div className="flex flex-wrap gap-1.5">
                <Button type="button" variant="outline" size="sm" onClick={getUserLocation} className="text-xs h-8 bg-white dark:bg-zinc-800 dark:border-zinc-700 rounded-xl shrink-0">
                  Şu Anki Konum
                </Button>
                {watch('polygon') && (
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm" 
                    onClick={() => {
                      const currentPolygon = watch('polygon');
                      const fieldData = existingField 
                        ? { ...existingField, ...watch(), polygon: currentPolygon }
                        : { id: '', ...watch(), polygon: currentPolygon };
                      
                      window.dispatchEvent(new CustomEvent('open-dji-measure-with-field', {
                        detail: {
                          field: fieldData,
                          polygon: currentPolygon
                        }
                      }));
                      onClose();
                    }} 
                    className="text-xs h-8 bg-cyan-50 dark:bg-cyan-950/50 text-cyan-700 dark:text-cyan-300 border-cyan-300 dark:border-cyan-700 hover:bg-cyan-100 rounded-xl shrink-0 font-semibold"
                    title="DJI Agras nişangah ve köşe noktalarıyla sınırları düzenle"
                  >
                    <Crosshair className="w-3.5 h-3.5 mr-1 text-cyan-600 dark:text-cyan-400" />
                    DJI Agras ile Düzenle
                  </Button>
                )}
                {existingField?.id && watch('polygon') && (
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm" 
                    onClick={() => {
                      window.dispatchEvent(new CustomEvent('enable-polygon-edit'));
                      onClose();
                    }} 
                    className="text-xs h-8 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800 hover:bg-amber-100 rounded-xl shrink-0"
                    title="Haritada serbest poligon düzenleme"
                  >
                    <Edit2 className="w-3 h-3 mr-1" />
                    Haritada Düzenle
                  </Button>
                )}
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="latitude" className="text-[11px] text-zinc-500 dark:text-zinc-400">Enlem</Label>
                <Input id="latitude" type="number" step="any" placeholder="37.8..." {...register('latitude')} className="bg-white dark:bg-zinc-800 dark:border-zinc-700 text-xs h-8 rounded-lg font-mono" />
                {errors.latitude && <p className="text-xs text-red-500">{errors.latitude.message}</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="longitude" className="text-[11px] text-zinc-500 dark:text-zinc-400">Boylam</Label>
                <Input id="longitude" type="number" step="any" placeholder="32.5..." {...register('longitude')} className="bg-white dark:bg-zinc-800 dark:border-zinc-700 text-xs h-8 rounded-lg font-mono" />
                {errors.longitude && <p className="text-xs text-red-500">{errors.longitude.message}</p>}
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
             <Label htmlFor="cropType" className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Ürün Türü *</Label>
             <Select 
               onValueChange={(val) => setValue('cropType', val as any, { shouldValidate: true })} 
               value={watch('cropType') || 'wheat'}
             >
               <SelectTrigger className="bg-zinc-50 dark:bg-zinc-800/70 dark:border-zinc-700 text-xs h-9 rounded-xl">
                 <SelectValue placeholder="Ürün seçin" />
               </SelectTrigger>
               <SelectContent className="dark:bg-zinc-800 dark:border-zinc-700 text-xs">
                 <SelectItem value="wheat">🌾 Buğday</SelectItem>
                 <SelectItem value="corn">🌽 Mısır</SelectItem>
                 <SelectItem value="sunflower">🌻 Ayçiçeği</SelectItem>
                 <SelectItem value="cotton">☁️ Pamuk</SelectItem>
                 <SelectItem value="sugar_beet">🌱 Şeker Pancarı</SelectItem>
                 <SelectItem value="crop_area">🟥 Ekin Yapılan Alan</SelectItem>
                 <SelectItem value="solar_panel">🟩 Güneş Paneli Alanı</SelectItem>
                 <SelectItem value="other">📦 Diğer</SelectItem>
               </SelectContent>
             </Select>
             {errors.cropType && <p className="text-xs text-red-500">{errors.cropType.message}</p>}
          </div>

          <div className="pt-2 flex gap-2">
            <Button type="button" variant="ghost" className="flex-1 rounded-xl text-xs text-zinc-600 dark:text-zinc-400" onClick={onClose}>İptal</Button>
            <Button type="submit" disabled={isSubmitting} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl shadow-md">
              {existingField ? "Güncelle" : "Kaydet"}
            </Button>
          </div>

        </form>
      </DialogContent>
    </Dialog>
  );
}
