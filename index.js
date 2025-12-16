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

// Limpeza da chave (Mantenha isso, é importante!)
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

app.get('/', (req, res) => res.json({ status: 'FloraGenesis Brain Online 🧠 (MODELO 2.5 FLASH)' }));

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

    console.log(`🌱 Analisando com GEMINI 2.5 FLASH... Contexto: ${locationContext}`);

    // --- AQUI ESTÁ A CORREÇÃO FINAL ---
    // Usando o modelo que apareceu no TOPO da sua lista!
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const imagePart = fileToGenerativePart(file.buffer, file.mimetype);

    const prompt = `
      Você é o FloraGenesis, um botânico especialista e fitopatologista.
      Analise esta imagem cuidadosamente.
      
      CONTEXTO DO USUÁRIO: ${locationContext}.
      (Use este contexto para avaliar se o espaço/recipiente é adequado).

      Sua tarefa:
      1. Identificar a planta (Nome popular e científico).
      2. Diagnosticar a saúde (Saudável, Doente, Crítico).
      3. Se houver problema, identificar a causa (Praga, Fungo, Manejo, Vaso Pequeno, etc).
      4. Criar um protocolo de tratamento resumido.

      Retorne APENAS um JSON válido, sem marcação markdown (sem \`\`\`json), estritamente neste formato:
      {
        "plant_identity": {
          "scientific_name": "String",
          "common_name": "String",
          "confidence": 0.0-1.0
        },
        "diagnosis": {
          "health_status": "Healthy" ou "Sick" ou "Critical",
          "primary_issue": "String curta (Ex: Cochonilhas, Vaso Pequeno)",
          "description": "Explicação de 1 ou 2 frases sobre o diagnóstico visual e o contexto."
        },
        "treatment_protocol": {
          "required": Boolean,
          "title": "Título do Tratamento",
          "duration_days": Integer
        },
        "context_analysis": "Seu comentário específico sobre o contexto (Vaso/Solo) informado."
      }
    `;

    const result = await model.generateContent([prompt, imagePart]);
    const response = await result.response;
    const text = response.text();

    console.log("🤖 Resposta Bruta Gemini:", text);

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
    console.error("Erro ao salvar:", error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Servidor FloraGenesis rodando na porta ${port}`);
});
