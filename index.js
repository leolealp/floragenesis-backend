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

// Limpeza da chave
const rawApiKey = process.env.GEMINI_API_KEY || "";
const cleanApiKey = rawApiKey.trim();
const genAI = new GoogleGenerativeAI(cleanApiKey);

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

app.get('/', (req, res) => res.json({ status: 'FloraGenesis Brain Online 🧠 (V JSON FIX)' }));

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

    // Correção MIME TYPE
    let finalMimeType = file.mimetype;
    if (finalMimeType === 'application/octet-stream') {
        finalMimeType = 'image/jpeg';
    }

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const imagePart = fileToGenerativePart(file.buffer, finalMimeType);

    const prompt = `
      Você é o FloraGenesis, um botânico especialista e fitopatologista.
      Analise esta imagem cuidadosamente.
      
      CONTEXTO DO USUÁRIO: ${locationContext}.

      Retorne APENAS um JSON válido, estritamente neste formato:
      {
        "plant_identity": { "scientific_name": "String", "common_name": "String", "confidence": 0.0-1.0 },
        "diagnosis": { "health_status": "Healthy" ou "Sick" ou "Critical", "primary_issue": "String curta", "description": "Explicação de 1 ou 2 frases." },
        "treatment_protocol": { "required": Boolean, "title": "Título do Tratamento", "duration_days": Integer },
        "context_analysis": "Seu comentário específico sobre o contexto (Vaso/Solo) informado."
      }
    `;

    const result = await model.generateContent([prompt, imagePart]);
    const response = await result.response;
    const text = response.text();
    
    // Tentativa de limpeza robusta do JSON
    const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const jsonResult = JSON.parse(cleanText);

    res.json(jsonResult);

  } catch (error) {
    console.error("Erro CRÍTICO na Análise:", error);
    res.status(500).json({ 
      error: 'Erro ao processar inteligência artificial.',
      details: error.message 
    });
  }
});

// --- ROTA DE SALVAR (COM CHECAGEM DE ERRO DETALHADA) ---
app.post('/plants/save', upload.single('image'), async (req, res) => {
  let aiData;
  try {
    const userId = 'user_teste_v1'; 
    const gardenId = req.body.gardenId;
    const file = req.file;

    if (!file) return res.status(400).json({ error: 'Sem foto.' });

    // 1. ANÁLISE DO JSON DA IA
    if (!req.body.ai_diagnosis) {
        throw new Error("Dados de diagnóstico da IA estão ausentes.");
    }
    // Tenta fazer o parse do JSON
    try {
        aiData = JSON.parse(req.body.ai_diagnosis);
    } catch (e) {
        throw new Error("Dados de diagnóstico da IA não são um JSON válido.");
    }
    
    // 2. UPLOAD DA FOTO
    const photoName = `${userId}/${Date.now()}_planta.jpg`;
    const { error: uploadError } = await supabase.storage
      .from('plant-photos')
      .upload(photoName, file.buffer, { contentType: file.mimetype, upsert: true });

    if (uploadError) throw new Error(`Erro no Upload: ${uploadError.message}`);

    const publicUrl = supabase.storage.from('plant-photos').getPublicUrl(photoName).data.publicUrl;

    // 3. INSERÇÃO NO BANCO DE DADOS
    const { data, error: dbError } = await supabase
      .from('plants')
      .insert([{
        garden_id: gardenId, 
        user_id: userId,
        nickname: aiData.plant_identity?.common_name || 'Planta Não Nomeada',
        scientific_name: aiData.plant_identity?.scientific_name,
        health_status: aiData.diagnosis?.health_status,
        image_url: publicUrl,
        botanical_specs: aiData // Grava o JSON completo
      }])
      .select();

    if (dbError) throw new Error(`Erro no Banco de Dados: ${dbError.message}`);
    
    res.status(201).json({ message: 'Planta salva!', plant: data[0] });

  } catch (error) {
    // Retorna o erro exato do Supabase ou do JSON para o cliente Flutter
    console.error("Erro ao salvar:", error.message);
    res.status(500).json({ 
      error: 'Falha ao salvar a planta', 
      details: error.message,
      json_data_received: aiData // Isso é útil para debug
    });
  }
});

app.listen(port, () => {
  console.log(`Servidor FloraGenesis rodando na porta ${port}`);
});
