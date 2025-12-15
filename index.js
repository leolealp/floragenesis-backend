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
// Conexão com Supabase
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Conexão com Google Gemini
// Se a chave não existir, ele avisa no log mas não derruba o server imediatamente
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "SEM_CHAVE");

// Função Auxiliar: Prepara arquivo para o Gemini
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

// 1. Health Check (Para ver se o server está vivo)
app.get('/', (req, res) => res.json({ status: 'FloraGenesis Brain Online 🧠 (V 1.0.3)' }));

// 2. Teste de Banco de Dados (Lista medalhas)
app.get('/test-db', async (req, res) => {
  const { data, error } = await supabase.from('badge_definitions').select('*');
  if (error) return res.status(500).json({ error: error.message });
  res.json({ badges: data });
});

// 3. MODO EXPLORADOR: Identificação e Diagnóstico com IA
app.post('/plants/analyze', upload.single('image'), async (req, res) => {
  try {
    const file = req.file;
    // Captura o contexto enviado pelo App (Vaso ou Solo)
    const locationContext = req.body.context || 'O usuário não informou se é vaso ou solo.';

    if (!file) {
      return res.status(400).json({ error: 'Nenhuma imagem enviada.' });
    }

    console.log(`🌱 Analisando imagem... Contexto: ${locationContext}`);

    // --- PREPARAÇÃO PARA IA ---
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

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

    // --- CHAMADA IA ---
    const result = await model.generateContent([prompt, imagePart]);
    const response = await result.response;
    const text = response.text();

    console.log("🤖 Resposta Bruta Gemini:", text);

    // --- LIMPEZA E RESPOSTA ---
    // Remove caracteres markdown caso a IA coloque
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

// 4. MODO JARDINEIRO: Salvar Planta no Banco (Futuro)
app.post('/plants/save', upload.single('image'), async (req, res) => {
  try {
    // Mock de User ID (Em produção usaremos autenticação real)
    const userId = 'user_teste_v1'; 
    const aiData = JSON.parse(req.body.ai_diagnosis || '{}');
    const gardenId = req.body.gardenId;

    const file = req.file;
    if (!file) return res.status(400).json({ error: 'Sem foto.' });

    // 1. Upload Foto Supabase
    const photoName = `${userId}/${Date.now()}_planta.jpg`;
    const { error: uploadError } = await supabase.storage
      .from('plant-photos')
      .upload(photoName, file.buffer, { contentType: file.mimetype, upsert: true });

    if (uploadError) throw uploadError;

    const publicUrl = supabase.storage.from('plant-photos').getPublicUrl(photoName).data.publicUrl;

    // 2. Salvar no Banco
    const { data, error: dbError } = await supabase
      .from('plants')
      .insert([{
        garden_id: gardenId, // Precisa existir um garden com esse ID
        user_id: userId,
        nickname: aiData.plant_identity?.common_name || 'Minha Planta',
        scientific_name: aiData.plant_identity?.scientific_name,
        health_status: aiData.diagnosis?.health_status,
