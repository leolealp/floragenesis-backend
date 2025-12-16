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

// 1. Health Check
app.get('/', (req, res) => res.json({ status: 'FloraGenesis Brain Online 🧠 (V 1.0.5)' }));

// 2. Teste de Banco de Dados
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

    // --- MUDANÇA IMPORTANTE AQUI ---
    // Usando a versão ESPECÍFICA '001' para evitar o erro 404
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-001" });

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
