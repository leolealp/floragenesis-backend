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

app.get('/', (req, res) => res.json({ status: 'FloraGenesis Brain Online 🧠 (V LOGGING IMPLEMENTADO)' }));

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
    console.error("[ANALYZE ERROR] Erro CRÍTICO na Análise:", error);
    res.status(500).json({ 
      error: 'Erro ao processar inteligência artificial.',
      details: error.message 
    });
  }
});

// --- ROTA DE SALVAR (AGORA COM LOGS DETALHADOS) ---
app.post('/plants/save', upload.single('image'), async (req, res) => {
  const transactionId = `TXN-${Date.now()}`; // ID único para rastreamento
  let aiData;
  console.log(`[SAVE START] ${transactionId}: Iniciando transação de salvamento.`);

  try {
    const userId = 'user_teste_v1'; 
    const gardenId = req.body.gardenId;
    const file = req.file;

    if (!file) {
      console.log(`[SAVE FAIL] ${transactionId}: Nenhuma imagem enviada.`);
      return res.status(400).json({ error: 'Sem foto.' });
    }
    
    // 1. ANÁLISE DO JSON DA IA
    if (!req.body.ai_diagnosis) {
        throw new Error("Dados de diagnóstico da IA estão ausentes.");
    }
    
    try {
        aiData = JSON.parse(req.body.ai_diagnosis);
        console.log(`[SAVE STEP 1] ${transactionId}: JSON da IA lido com sucesso.`);
    } catch (e) {
        throw new Error("Dados de diagnóstico da IA não são um JSON válido.");
    }
    
    // 2. UPLOAD DA FOTO
    const photoName = `${userId}/${Date.now()}_planta.jpg`;
    console.log(`[SAVE STEP 2] ${transactionId}: Tentando upload para ${photoName}...`);
    
    const { error: uploadError } = await supabase.storage
      .from('plant-photos')
      .upload(photoName, file.buffer, { contentType: file.mimetype, upsert: true });

    if (uploadError) {
        console.error(`[SAVE FAIL] ${transactionId} [STORAGE ERROR]: ${uploadError.message}`);
        throw new Error(`Erro no Upload: ${uploadError.message}`);
    }
    console.log(`[SAVE STEP 2 OK] ${transactionId}: Upload da imagem concluído.`);

    const publicUrl = supabase.storage.from('plant-photos').getPublicUrl(photoName).data.publicUrl;
    console.log(`[SAVE INFO] ${transactionId}: URL Pública gerada: ${publicUrl}`);


    // 3. INSERÇÃO NO BANCO DE DADOS
    console.log(`[SAVE STEP 3] ${transactionId}: Tentando inserção no Supabase...`);

    const { data, error: dbError } = await supabase
      .from('plants')
      .insert([{
        garden_id: gardenId, 
        user_id: userId,
        nickname: aiData.plant_identity?.common_name || 'Planta Não Nomeada',
        scientific_name: aiData.plant_identity?.scientific_name,
        health_status: aiData.diagnosis?.health_status,
        image_url: publicUrl,
        botanical_specs: aiData
      }])
      .select();

    if (dbError) {
        console.error(`[SAVE FAIL] ${transactionId} [DB ERROR]: ${dbError.message}`);
        throw new Error(`Erro no Banco de Dados: ${dbError.message}`);
    }
    
    console.log(`[SAVE SUCCESS] ${transactionId}: Transação concluída. ID do registro: ${data[0].id}`);
    res.status(201).json({ message: 'Planta salva!', plant: data[0] });

  } catch (error) {
    // Retorna o erro exato para o cliente Flutter e mantém o log no Render
    console.error(`[SAVE END FAIL] ${transactionId}: Falha final no processo de salvamento.`, error.message);
    res.status(500).json({ 
      error: 'Falha ao salvar a planta', 
      details: error.message,
      transaction_id: transactionId,
      step_failed: error.message.includes("Upload") ? "Upload de Imagem" : (error.message.includes("Banco") ? "Inserção no Banco" : "Parse JSON")
    });
  }
});

app.listen(port, () => {
  console.log(`Servidor FloraGenesis rodando na porta ${port}`);
});
