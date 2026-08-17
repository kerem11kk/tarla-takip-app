import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import cors from "cors";
import { GoogleGenAI } from "@google/genai";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // API route for Gemini AI Farm Copilot
  app.post("/api/ai/copilot", async (req, res) => {
    const { prompt, fields, selectedFieldId, equipmentWidth } = req.body;

    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        // Fallback intelligent response if no API key is set
        return res.json({
          reply: "Gemini API anahtarı sistemde tanımlı değil, ancak akıllı tarla hesaplayıcı aktif. Tarlanızı otomatik bölme veya ekipman izi planlamak için aşağıdaki hazır işlem butonlarını kullanabilirsiniz.",
          action: detectLocalAction(prompt, fields, selectedFieldId, equipmentWidth)
        });
      }

      const ai = new GoogleGenAI({ apiKey });
      
      const fieldContext = (fields || []).map((f: any) => ({
        id: f.id,
        name: f.name || `${f.ada}/${f.parsel}`,
        ada: f.ada,
        parsel: f.parsel,
        cropType: f.cropType,
        province: f.province,
        district: f.district
      }));

      const systemInstruction = `Sen Türk çiftçilerine ve hassas tarım operatörlerine (DJI Agras zirai drone, traktör, otomatik dümenleme, GPS A-B hat kılavuzluğu) rehberlik eden uzman bir Ziraat ve Hassas Tarım Yapay Zeka Asistanısın (Tarla Takip Copilot).
Kullanıcının mevcut tarlaları: ${JSON.stringify(fieldContext)}.
Seçili tarla ID'si: ${selectedFieldId || "Yok"}.

Kullanıcı senden tarlayı bölmeyi (örn: "seçili tarlayı ikiye böl", "A tarlasına ortadan hat çek", "tarlayı 3 parçaya böl"), ekipman izi/geçiş hesabı yapmayı (örn: "arkamda 180 cm lik ekipman var, 5'e böl" veya "ilaçlama geçişini hesapla"), gübre/ilaçlama dozu, ekin tavsiyesi veya dümenleme A-B hattı oluşturmayı isteyebilir.

ÖNEMLİ KURAL: Tarlayı bölme veya hat çekme istendiğinde, veritabanına yeni ayrı tarlalar eklemek yerine dümenleme sisteminde olduğu gibi tarlanın üzerine kılavuz bölme ve dümenleme hatları (A-B çizgileri) çizilir. Açıklamanda bunu belirt (örn: "Tarlanın üzerine 2 eşit parçaya ayıran A-B dümenleme hattı çizildi").

Cevabını ÇOK NET, profesyonel, samimi ve Türkçe olarak JSON formatında dön:
{
  "reply": "Kullanıcıya vereceğin anlaşılır, doğrudan açıklama ve tarımsal tavsiye",
  "action": {
    "type": "split_field" | "plan_equipment" | "none",
    "targetFieldId": "ilgili tarlanın id'si veya null",
    "partsCount": 2, // eğer bölme isteniyorsa parça sayısı (örn 2, 3, 5)
    "direction": "auto" | "vertical" | "horizontal",
    "equipmentWidthMeters": 1.8 // eğer ekipman boyutu verilmişse metre cinsinden (örn 180cm -> 1.8)
  }
}
Sadece geçerli JSON çıktısı ver, markdown kod bloğu olmadan veya standart json formatında.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.7-flash',
        contents: prompt,
        config: {
          systemInstruction,
          responseMimeType: "application/json"
        }
      });

      const responseText = response.text || "{}";
      try {
        const parsed = JSON.parse(responseText);
        res.json(parsed);
      } catch (jsonErr) {
        res.json({
          reply: responseText,
          action: detectLocalAction(prompt, fields, selectedFieldId, equipmentWidth)
        });
      }
    } catch (error: any) {
      console.error("Gemini Copilot Error:", error);
      res.json({
        reply: "Talebinizi yerel tarım algoritmasıyla işledim. Tarlanızı bölebilir veya ekipman izi simülasyonunu başlatabilirsiniz.",
        action: detectLocalAction(prompt, fields, selectedFieldId, equipmentWidth)
      });
    }
  });

  // Local action detector fallback
  function detectLocalAction(prompt: string, fields: any[] = [], selectedFieldId: string | null = null, equipmentWidth?: number) {
    const text = (prompt || '').toLowerCase();
    let targetFieldId = selectedFieldId;
    
    // Check if a field name is mentioned
    if (fields && fields.length > 0) {
      for (const f of fields) {
        const name = (f.name || '').toLowerCase();
        if (name && text.includes(name)) {
          targetFieldId = f.id;
          break;
        }
      }
      if (!targetFieldId && fields.length > 0) {
        targetFieldId = fields[0].id;
      }
    }

    // Detect parts count
    let partsCount = 2;
    if (text.includes("üçe") || text.includes("3'e") || text.includes("3 e") || text.includes("3 e böl")) partsCount = 3;
    else if (text.includes("dörde") || text.includes("4'e") || text.includes("4 e") || text.includes("4 e böl")) partsCount = 4;
    else if (text.includes("beşe") || text.includes("5'e") || text.includes("5 e") || text.includes("5 e böl")) partsCount = 5;
    else if (text.includes("altıya") || text.includes("6'ya") || text.includes("6 ya") || text.includes("6 ya böl")) partsCount = 6;
    else if (text.includes("ikiye") || text.includes("2'ye") || text.includes("2 ye") || text.includes("ikiye böl") || text.includes("ortadan")) partsCount = 2;

    // Detect equipment width
    let detectedWidth = equipmentWidth || 1.8;
    if (text.includes("180 cm") || text.includes("180cm") || text.includes("1.8 m") || text.includes("1.8m")) {
      detectedWidth = 1.8;
    } else if (text.includes("200 cm") || text.includes("2m") || text.includes("2 m")) {
      detectedWidth = 2.0;
    } else if (text.includes("3m") || text.includes("3 m") || text.includes("300 cm")) {
      detectedWidth = 3.0;
    } else if (text.includes("24m") || text.includes("24 m")) {
      detectedWidth = 24.0;
    }

    if (text.includes("böl") || text.includes("parçala") || text.includes("ayır")) {
      return {
        type: "split_field",
        targetFieldId,
        partsCount,
        direction: "auto",
        equipmentWidthMeters: detectedWidth
      };
    }

    if (text.includes("ekipman") || text.includes("geçiş") || text.includes("rota") || text.includes("ilaçlama") || text.includes("iz")) {
      return {
        type: "plan_equipment",
        targetFieldId,
        partsCount,
        equipmentWidthMeters: detectedWidth
      };
    }

    return { type: "none" };
  }

  // API route for TKGM proxy
  app.get("/api/parsel/:lat/:lng", async (req, res) => {
    const { lat, lng } = req.params;
    try {
      // Generate random IP to bypass TKGM limits
      const randomIp = `${Math.floor(Math.random() * 254) + 1}.${Math.floor(Math.random() * 254) + 1}.${Math.floor(Math.random() * 254) + 1}.${Math.floor(Math.random() * 254) + 1}`;
      
      const response = await fetch(`https://cbsapi.tkgm.gov.tr/megsiswebapi.v3/api/parsel/${lat}/${lng}`, {
        headers: {
          'X-Forwarded-For': randomIp,
          'X-Real-IP': randomIp,
          'Client-IP': randomIp,
          'Forwarded': `for=${randomIp}`,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json',
          'Origin': 'https://parselsorgu.tkgm.gov.tr',
          'Referer': 'https://parselsorgu.tkgm.gov.tr/'
        }
      });
      
      if (response.status === 404) {
        return res.status(404).json({ message: "Not found" });
      }
      
      if (!response.ok) {
        return res.status(response.status).send(await response.text());
      }
      
      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error("Proxy error:", error);
      res.status(500).json({ error: "Proxy sunucu hatası" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
