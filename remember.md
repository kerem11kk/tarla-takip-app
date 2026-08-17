# Tarla Takip ve Navigasyon - Proje Hatırlatıcı & Yapılandırma (remember.md)

## 📌 Proje Özeti
Bu proje, DJI Smart Farm (DJI Agras kumanda arayüzü) hassasiyetinde parsel haritalama, ekran ortası crosshair (+ artı imleç) ile alan belirleme, Gemini AI ziraat asistanı ile otomatik tarla bölme / ekipman izi planlama, dijital pusula widget'ı ve bulut eşitleme sunan profesyonel bir tarım yönetim platformudur.

## 🛠️ Temel Kurallar ve Kararlar

1. **DJI Smart Farm Ekran Ortası Hassas Ölçüm (DjiCrosshairMeasure)**:
   - Harita merkezine sabitlenen taktiksel crosshair (`+`) imleci ile kullanıcı haritayı kaydırarak köşe noktaları bırakır (`Nokta Bırak`).
   - Gerçek zamanlı köşe sayısı, çevre uzunluğu (m), kapalı poligon alanı (Dönüm / m²), anlık GPS koordinatı ve kılavuz çizgileri hesaplanır.
   - Ölçüm tamamlandığında tek dokunuşla yeni tarla olarak kaydedilir ve `FieldForm` otomatik doldurulur.

2. **Gemini AI Ziraat & Tarla Asistanı (GeminiCopilotModal & fieldGeometry.ts)**:
   - Server-side `/api/ai/copilot` endpoint'i üzerinden Gemini modeli çağrılır; API anahtarı yoksa yerel turf.js algoritması kesintisiz çalışır.
   - Doğal dilde komutları anlar: "A tarlasını ortadan ikiye böl", "180 cm'lik ekipmanım var tarlayı 5'e böl", "İlaçlama dozu tavsiyesi ver", vb.
   - Poligonları matematiksel olarak böler (BBox + Turf split) ve dönüm alanlarını hesaplar; kullanıcı tek tıkla bölünmüş parçaları veritabanına kaydedebilir.

3. **Sol-Alt Kompakt Tarla Çekmecesi (BottomLeftFieldDrawer)**:
   - Ekranı tamamen kapatmayan, harita arka planını daima görünür kılan, yarı saydam siyah (`bg-zinc-950/90`) kompakt drawer (`bottom-4 left-4`).
   - Seçili tarla detayları, hava durumu, ekin türü, dönüm bilgisi, hızlı AI bölme ve silme/düzenleme aksiyonlarını barındırır.
   - Tüm tarlalar listesi ve anlık arama sekmesine sahiptir.

4. **Taktiksel Dijital Pusula (CompassWidget)**:
   - Cihaz oryantasyon sensörü (`deviceorientation`) ile senkronize çalışan, derece açısını gösteren ve Kuzey'e tek tıkla sabitleyen pusula bileşeni.

5. **Dinamik Ada (Dynamic Island)**:
   - Konumu sol ile orta arasında (`top-3 left-3 sm:left-[20%]`), taktiksel koyu temada (`bg-zinc-950/90`).
   - İçerisinde: Bulut Eşitleme, DJI Agras Ölçüm Modu Toggle, Gemini AI Copilot, TKGM Parsel Sorgulama, Çevrimdışı İndir, Cihaz Yönetimi ve Gelişmiş Görevler düğmeleri yer alır.

6. **320 DPI & Yüksek Çözünürlüklü Ekran Uyumluluğu**:
   - DJI kumandaları, arazi tabletleri ve mobil ekranlarda layout shift olmaksızın 320 DPI ölçeklendirmesi ve dokunmatik konforu sağlanmıştır.

7. **Hata & Rejection Temizliği (WebSocket / HMR)**:
   - AI Studio sandboxtaki Vite WebSocket HMR hatalarını engellemek için `vite.config.ts` içinde `server: { hmr: false, watch: null }` ayarlanmıştır.
   - `src/main.tsx` içerisinde WebSocket unhandled rejection ve error olayları sessizce yakalanır ve konsol kirletilmez.

8. **Netlify Dağıtım & Boş Ekran Koruması**:
   - SPA istemci tarafı yönlendirmeleri için `public/_redirects` (`/* /index.html 200`) ve `netlify.toml` oluşturulmuştur.
   - `firebase.ts` başlatma süreci fail-safe yapılıp `try-catch` ile sarmalanmıştır; Firebase ağı veya konfigürasyonu olmasa dahi uygulama asla çökmez.

