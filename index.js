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

app.get('/', (req, res) => res.json({ status: 'FloraGenesis Brain Online 🧠 (V 2.0 - Lookup Master DB)' }));

// --- ROTA DE BUSCA PRIMÁRIA NO BANCO DE DADOS MASTER ---
// Recebe o nome científico e verifica se já foi identificado
app.get('/plants/lookup', async (req, res) => {
  const { scientific_name } = req.query;
  const transactionId = `LOOKUP-${Date.now()}`;
  
  if (!scientific_name) {
    console.log(`[LOOKUP FAIL] ${transactionId}: Nome científico ausente.`);
    return res.status(400).json({ error: 'É necessário um nome científico para a busca.' });
  }

  try {
    const { data, error } = await supabase
      .from('plants_master')
      .select('*')
      .eq('scientific_name', scientific_name)
      .limit(1);

    if (error) {
      console.error(`[LOOKUP FAIL] ${transactionId} [DB ERROR]: ${error.message}`);
      return res.status(500).json({ error: 'Erro ao consultar o banco de dados master.' });
    }

    if (data && data.length > 0) {
      console.log(`[LOOKUP SUCCESS] ${transactionId}: Planta encontrada em cache: ${scientific_name}.`);
      return res.json({ found: true, data: data[0] });
    } else {
      console.log(`[LOOKUP NOT FOUND] ${transactionId}: Planta não encontrada em cache. Acionando IA.`);
      return res.json({ found: false });
    }

  } catch (e) {
    console.error(`[LOOKUP CRITICAL FAIL] ${transactionId}: ${e.message}`);
    return res.status(500).json({ error: 'Falha técnica na busca.' });
  }
});


// --- ROTA DE ANÁLISE PELA IA (SÓ É CHAMADA SE NÃO ESTIVER NO MASTER DB) ---
app.post('/plants/analyze', upload.single('image'), async (req, res) => {
  try {
    const file = req.file;
    const locationContext = req.body.context || 'Contexto não informado.';

    if (!file) return res.status(400).json({ error: 'Nenhuma imagem enviada.' });

    let finalMimeType = file.mimetype;
    if (finalMimeType === 'application/octet-stream') {
        finalMimeType = 'image/jpeg';
    }

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const imagePart = fileToGenerativePart(file.buffer, finalMimeType);

    const prompt = `
      Você é o FloraGenesis, um botânico especialista e fitopatologista.
      Analise esta imagem cuidadosamente. Sua identificação deve ser a mais específica possível, incluindo subespécies e variedades se for o caso (Ex: Ocimum basilicum 'Genovese' para Manjericão Genovês, não apenas Ocimum basilicum).

      CONTEXTO DO USUÁRIO: ${locationContext}.

      Retorne APENAS um JSON válido, estritamente neste formato:
      {
        "plant_identity": { "scientific_name": "String", "common_name": "String", "confidence": 0.0-1.0, "all_names": "Lista de nomes populares separados por vírgula" },
        "diagnosis": { "health_status": "Healthy" ou "Sick" ou "Critical", "primary_issue": "String curta", "description": "Explicação detalhada." },
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

// --- ROTA DE SALVAR (AGORA COM MASTER DB UPDATE E INSERT NO JARDIM) ---
app.post('/plants/save', upload.single('image'), async (req, res) => {
  const transactionId = `SAVE-${Date.now()}`; 
  let aiData;
  console.log(`[SAVE START] ${transactionId}: Iniciando transação de salvamento.`);

  try {
    const userId = 'user_teste_v1'; 
    const gardenId = req.body.gardenId;
    const is_in_pot = req.body.is_in_pot === 'true'; // Converte string para booleano
    const master_plant_id = req.body.master_plant_id; // Recebe o ID do Master se já existir
    const file = req.file;

    if (!file) {
      console.log(`[SAVE FAIL] ${transactionId}: Nenhuma imagem enviada.`);
      return res.status(400).json({ error: 'Sem foto.' });
    }
    
    // 1. ANÁLISE DO JSON DA IA E MASTER DB (SE FOR UM NOVO REGISTRO)
    let final_master_id = master_plant_id;
    
    if (!master_plant_id) {
        // Se não veio um ID do Master, precisa do diagnóstico da IA para criar o registro Master
        if (!req.body.ai_diagnosis) {
            throw new Error("Dados de diagnóstico da IA estão ausentes (Novo registro sem dados).");
        }
        try {
            aiData = JSON.parse(req.body.ai_diagnosis);
        } catch (e) {
            throw new Error("Dados de diagnóstico da IA não são um JSON válido.");
        }
        
        // Insere na tabela MASTER e pega o ID (Finalidade: Alimentar o Banco de Conhecimento)
        const { data: master_data, error: master_error } = await supabase
            .from('plants_master')
            .upsert({
                scientific_name: aiData.plant_identity?.scientific_name,
                common_name: aiData.plant_identity?.common_name,
                all_names: aiData.plant_identity?.all_names,
                botanical_specs: aiData,
                original_contributor_id: userId,
                times_identified: 1
            }, { onConflict: 'scientific_name', ignoreDuplicates: false })
            .select();

        if (master_error) {
            // Este erro é comum se a planta foi identificada no meio tempo por outro usuário
            console.warn(`[SAVE WARNING] ${transactionId} [MASTER DB UPSERT]: Tentativa de UPSERT falhou. Tentando buscar o ID existente...`);
            
            // Busca o registro existente em caso de conflito
            const { data: existing_data } = await supabase
                .from('plants_master')
                .select('id')
                .eq('scientific_name', aiData.plant_identity?.scientific_name)
                .single();

            if (!existing_data) throw new Error(`[CRITICAL] Falha ao criar e ao buscar registro MASTER para ${aiData.plant_identity?.scientific_name}`);
            final_master_id = existing_data.id;
        } else {
            final_master_id = master_data[0].id;
        }
        console.log(`[SAVE STEP 1 OK] ${transactionId}: Registro Master (ID: ${final_master_id}) criado/confirmado.`);
    } else {
        // Se veio um ID, apenas incrementa o contador (Planta já em cache)
        const { error: update_error } = await supabase
            .from('plants_master')
            .update({ times_identified: 'times_identified + 1' })
            .eq('id', master_plant_id);

        if (update_error) console.error(`[SAVE WARNING] ${transactionId} [MASTER UPDATE]: Falha ao incrementar contador.`);
        console.log(`[SAVE STEP 1 OK] ${transactionId}: Planta Master (ID: ${final_master_id}) encontrada e contador incrementado.`);
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

    // 3. INSERÇÃO NO JARDIM DO USUÁRIO
    console.log(`[SAVE STEP 3] ${transactionId}: Tentando inserção no user_gardens...`);

    const { data, error: dbError } = await supabase
      .from('user_gardens')
      .insert([{
        master_plant_id: final_master_id, // Liga ao master
        garden_id: gardenId, 
        user_id: userId,
        nickname: aiData?.plant_identity?.common_name || 'Planta Adotada',
        health_status: aiData?.diagnosis?.health_status || 'Não Analisado',
        is_in_pot: is_in_pot, // O NOVO CAMPO BOLEANO
        image_url: publicUrl,
      }])
      .select();

    if (dbError) {
        console.error(`[SAVE FAIL] ${transactionId} [USER GARDEN DB ERROR]: ${dbError.message}`);
        throw new Error(`Erro no Banco de Dados (User Garden): ${dbError.message}`);
    }
    
    console.log(`[SAVE SUCCESS] ${transactionId}: Transação concluída. Planta salva no jardim ID: ${data[0].id}`);
    res.status(201).json({ message: 'Planta salva!', plant: data[0] });

  } catch (error) {
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
