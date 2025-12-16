const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

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

// --- FUNÇÃO DETETIVE: LISTAR MODELOS ---
async function listAvailableModels() {
  console.log("🕵️‍♀️ PERGUNTANDO AO GOOGLE QUAIS MODELOS ESTÃO DISPONÍVEIS...");
  try {
    // Usamos fetch direto para não depender da versão do SDK
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${cleanApiKey}`);
    const data = await response.json();
    
    if (data.models) {
      console.log("✅ LISTA DE MODELOS APROVADOS PARA SUA CHAVE:");
      data.models.forEach(m => {
        // Mostra apenas modelos que aceitam geração de conteúdo
        if (m.supportedGenerationMethods && m.supportedGenerationMethods.includes("generateContent")) {
           console.log(`   -> ${m.name.replace('models/', '')}`); 
        }
      });
      console.log("------------------------------------------------");
    } else {
      console.log("❌ O Google respondeu, mas não listou modelos. Resposta:", data);
    }
  } catch (error) {
    console.log("❌ Erro ao listar modelos:", error.message);
  }
}

function fileToGenerativePart(buffer, mimeType) {
  return { inlineData: { data: buffer.toString("base64"), mimeType } };
}

// ==================================================================
// ROTAS
// ==================================================================

app.get('/', (req, res) => res.json({ status: 'FloraGenesis Detetive Online 🕵️‍♀️' }));

app.post('/plants/analyze', upload.single('image'), async (req, res) => {
  try {
    const file = req.file;
    const locationContext = req.body.context || 'Contexto não informado.';
    if (!file) return res.status(400).json({ error: 'Nenhuma imagem enviada.' });

    // --- TENTATIVA SEGURA ---
    // Enquanto não vemos a lista, vou deixar o 'gemini-1.5-flash' padrão.
    // O objetivo agora é ver o LOG de inicialização.
    const modelName = "gemini-1.5-flash"; 
    
    console.log(`🌱 Tentando analisar com: ${modelName}`);

    const model = genAI.getGenerativeModel({ model: modelName });
    const imagePart = fileToGenerativePart(file.buffer, file.mimetype);

    const prompt = `Analise esta planta. Contexto: ${locationContext}. Retorne JSON { "plant_identity": {...}, "diagnosis": {...}, "treatment_protocol": {...} }`;

    const result = await model.generateContent([prompt, imagePart]);
    const response = await result.response;
    const text = response.text();

    const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
    res.json(JSON.parse(cleanText));

  } catch (error) {
    console.error("Erro CRÍTICO:", error);
    res.status(500).json({ error: 'Erro na IA', details: error.message });
  }
});

// --- INICIALIZAÇÃO ---
app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
  // Roda o detetive assim que o servidor liga
  listAvailableModels();
});
