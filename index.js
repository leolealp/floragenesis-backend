const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// --- CONFIGURAÇÕES ---
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

app.use(cors());
app.use(express.json());

// --- CONEXÕES ---
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "SEM_CHAVE");

function fileToGenerativePart(buffer, mimeType) {
  return {
    inlineData: {
      data: buffer.toString("base64"),
      mimeType
    },
  };
}

// ==================================================================
// ROTAS
// ==================================================================

app.get('/', (req, res) => res.json({ status: 'FloraGenesis Brain Online 🧠 (V CLASSIC)' }));

app.get('/test-db', async (req, res) => {
  const { data, error } = await supabase.from('badge_definitions').select('*');
  if (error) return res.status(500).json({ error: error.message });
  res.json({ badges: data });
});

// --- ROTA DE ANÁLISE ---
app.post('/plants/analyze', upload.single('image'), async (req, res) => {
  try {
    const file = req.file;
    const locationContext = req.body.context || 'Contexto não informado.';

    if (!file) return res.status(400).json({ error: 'Nenhuma imagem enviada.' });

    console.log(`🌱 Analisando com Gemini PRO VISION... Contexto: ${locationContext}`);

    // --- MUDANÇA: USANDO O MODELO CLÁSSICO DE VISÃO ---
    // Este modelo é o mais compatível para chaves antigas/restritas
    const model = genAI.getGenerativeModel({ model: "gemini-pro-vision" });

    const imagePart = fileToGenerativePart(file.buffer, file.mimetype);

    const prompt = `
      Atue como o FloraGenesis, botânico.
      Analise a imagem. Contexto do usuário: ${locationContext}.
      
      Retorne APENAS um JSON estrito, sem markdown:
      {
        "plant_identity": { "scientific_name": "String", "common_name": "String" },
        "diagnosis": { "health_status": "String", "primary_issue": "String", "description": "String" },
        "treatment_protocol": { "required": Boolean, "title": "String", "duration_days": Integer },
        "context_analysis": "Comentário sobre o contexto."
      }
    `;

    const result = await model.generateContent([prompt, imagePart]);
    const response = await result.response;
    const text = response.text();

    console.log("🤖 Resposta:", text);

    const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const jsonResult = JSON.parse(cleanText);

    res.json(jsonResult);

  } catch (error) {
    console.error("Erro CRÍTICO:", error);
    res.status(500).json({ 
      error: 'Erro na IA', 
      details: error.message,
      model_tried: "gemini-pro-vision"
    });
  }
});

// --- ROTA DE SALVAR ---
app.post('/plants/save', upload.single('image'), async (req, res) => {
  try {
    const userId = 'user_teste_v1'; 
    const aiData = JSON.parse(req.body.ai_diagnosis || '{}');
    const gardenId = req.body.gardenId;
    const file = req.file;

    if (!file) return res.status(400).json({ error: 'Sem foto.' });

    const photoName = `${userId}/${Date.now()}_planta.jpg`;
    const { error: uploadError } = await supabase.storage
      .from('plant-photos')
      .upload(photoName, file.buffer, { contentType: file.mimetype, upsert: true });

    if (uploadError) throw uploadError;

    const publicUrl = supabase.storage.from('plant-photos').getPublicUrl(photoName).data.publicUrl;

    const { data, error: dbError } = await supabase
      .from('plants')
      .insert([{
        garden_id: gardenId, 
        user_id: userId,
        nickname: aiData.plant_identity?.common_name || 'Minha Planta',
        scientific_name: aiData.plant_identity?.scientific_name,
        health_status: aiData.diagnosis?.health_status,
        image_url: publicUrl,
        botanical_specs: aiData
      }])
      .select();

    if (dbError) throw dbError;
    res.status(201).json({ message: 'Planta salva!', plant: data[0] });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});
