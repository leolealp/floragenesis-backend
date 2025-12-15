const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Configuração de Upload e Supabase
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
app.use(cors());
app.use(express.json());

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "SEM_CHAVE");

// Função Utilitária para o Gemini (converte Buffer para o formato que a IA entende)
function fileToGenerativePart(buffer, mimeType) {
  return {
    inlineData: {
      data: buffer.toString("base64"),
      mimeType
    },
  };
}

// --------------------------------------------------------------------------
// 1. ROTA EXPLORADOR: APENAS DIAGNÓSTICO (NADA É SALVO)
// --------------------------------------------------------------------------
app.post('/plants/analyze', upload.single('image'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'Envie uma imagem.' });

    // Lógica da IA (conforme a etapa anterior)
    const prompt = `
      Você é o FloraGenesis... [PROMPT COMPLETO AQUI]
      Retorne APENAS um JSON válido seguindo estritamente o formato:
      {
        "plant_identity": { "scientific_name": "...", "common_name": "..." },
        "diagnosis": { "health_status": "...", "primary_issue": "..." },
        "treatment_protocol": { "required": Boolean, "title": "...", "duration_days": Integer }
      }
    `;
    
    const imagePart = fileToGenerativePart(file.buffer, file.mimetype);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent([prompt, imagePart]);
    
    // Processamento e limpeza da resposta (JSON.parse)
    const cleanText = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
    const jsonResult = JSON.parse(cleanText);

    // O App recebe a análise COMPLETA, mas o servidor não salvou nada
    res.json(jsonResult); 

  } catch (error) {
    console.error("Erro na IA/Análise:", error);
    res.status(500).json({ error: 'Erro ao consultar o Oráculo Digital.', details: error.message });
  }
});


// --------------------------------------------------------------------------
// 2. ROTA JARDINEIRO: SALVAR A PLANTA NO BANCO
// --------------------------------------------------------------------------
app.post('/plants/save', upload.single('image'), async (req, res) => {
  try {
    // ⚠️ ATENÇÃO: Em produção, esta rota precisa verificar se o usuário está logado!
    const userId = 'uuid-do-usuario-logado'; // Mock para desenvolvimento
    const gardenId = req.body.gardenId; 
    const aiData = JSON.parse(req.body.ai_diagnosis); // O App envia o JSON que a IA devolveu

    // 1. UPLOAD DA IMAGEM para o Supabase Storage (S3-like)
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'Nenhuma foto para salvar.' });

    const photoName = `${userId}/${Date.now()}-${file.originalname}`;
    
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('plant-photos') // Este bucket precisa ser criado no Supabase
      .upload(photoName, file.buffer, {
        contentType: file.mimetype,
        upsert: true
      });
      
    if (uploadError) throw new Error(uploadError.message);
    
    // Obtém o link público da foto
    const publicUrl = supabase.storage.from('plant-photos').getPublicUrl(photoName).data.publicUrl;


    // 2. SALVAR DADOS DA PLANTA no banco (Tabela 'plants')
    const plantData = {
      garden_id: gardenId,
      user_id: userId,
      nickname: req.body.nickname || aiData.plant_identity.common_name,
      scientific_name: aiData.plant_identity.scientific_name,
      health_status: aiData.diagnosis.health_status,
      image_url: publicUrl, // Salva o link da foto
      botanical_specs: aiData.treatment_protocol // Salva a "receita"
    };

    const { data: newPlant, error: dbError } = await supabase
      .from('plants')
      .insert([plantData])
      .select();

    if (dbError) throw new Error(dbError.message);


    // 3. RETORNO SUCESSO
    res.status(201).json({ 
      message: 'Planta salva com sucesso!', 
      plant: newPlant[0] 
    });

  } catch (error) {
    console.error("Erro ao salvar a planta:", error);
    res.status(500).json({ error: 'Falha ao salvar a planta no jardim.', details: error.message });
  }
});


// --- ROTAS DE INFRA ---
app.get('/test-db', async (req, res) => {
  const { data, error } = await supabase.from('badge_definitions').select('*');
  if (error) return res.status(500).json({ error: error.message });
  res.json({ badges: data });
});

app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});
