// index.js

import express from 'express';
import { createClient } from '@supabase/supabase-js';
import multer from 'multer';
import sharp from 'sharp';
import 'dotenv/config'; // Importa as variáveis de ambiente

// ----------------------------------------------------
// 1. CONFIGURAÇÃO SUPABASE
// ----------------------------------------------------
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// ----------------------------------------------------
// 2. CONFIGURAÇÃO EXPRESS E MULTER (Upload de Arquivos)
// ----------------------------------------------------
const app = express();
const port = process.env.PORT || 3000;

// Configuração do Multer para lidar com upload de arquivos (a memória é temporária)
const upload = multer({ storage: multer.memoryStorage() });

// Middleware para registrar logs de requisições
app.use((req, res, next) => {
    console.log(`[REQUEST] ${new Date().toISOString()}: ${req.method} ${req.url}`);
    next();
});

// ----------------------------------------------------
// 3. ROTAS BASE (Status, Teste)
// ----------------------------------------------------

app.get('/', (req, res) => {
    res.send('FloraGenesis Backend está ONLINE e pronto para identificar plantas! 🌸');
});


// ----------------------------------------------------
// 4. NOVA ROTA: BUSCA DE JARDINS DO USUÁRIO
// (Usada pelo Flutter para preencher o Dropdown)
// ----------------------------------------------------
app.get('/user/gardens', async (req, res) => {
    // Para simplificação atual, o user_id é hardcoded no Flutter como 'user_teste_v1'
    const { user_id } = req.query; 
    const transactionId = `GARDEN-LOOKUP-${Date.now()}`;
    
    if (!user_id) {
        console.log(`[GARDEN LOOKUP FAIL] ${transactionId}: User ID ausente.`);
        return res.status(400).json({ error: 'User ID é obrigatório.' });
    }

    try {
        const { data, error } = await supabase
            .from('user_gardens_list')
            .select('id, name')
            .eq('user_id', user_id); // Filtra pelo ID do usuário
            
        if (error) {
            console.error(`[GARDEN LOOKUP FAIL] ${transactionId} [DB ERROR]: ${error.message}`);
            return res.status(500).json({ error: 'Erro ao buscar a lista de jardins.' });
        }
        
        console.log(`[GARDEN LOOKUP SUCCESS] ${transactionId}: ${data.length} jardins encontrados para ${user_id}.`);
        res.json(data); // Retorna a lista de {id, name}
        
    } catch (e) {
        console.error(`[GARDEN LOOKUP CRITICAL FAIL] ${transactionId}: ${e.message}`);
        return res.status(500).json({ error: 'Falha técnica na busca de jardins.' });
    }
});


// ----------------------------------------------------
// 5. ROTA: ANÁLISE DE PLANTA (AI e Lookup)
// ----------------------------------------------------
app.post('/plants/analyze', upload.single('image'), async (req, res) => {
    const transactionId = `ANALYSIS-${Date.now()}`;
    
    // Simula a lógica de chamar a IA e retorna um JSON de exemplo.
    // Em uma implementação real, a IA (Gemini) seria chamada aqui.
    const mockGeminiResponse = {
        "plant_identity": {
            "common_name": "Lírio da Paz",
            "scientific_name": "Spathiphyllum wallisii",
            "family": "Araceae"
        },
        "diagnosis": {
            "health_status": "Saudável (Nível de XP: Iniciante)",
            "context_notes": req.body.context,
            "ia_confidence": 0.95
        },
        "care_recommendations": {
            "water": "Mantenha o solo úmido, mas não encharcado. Borrife as folhas.",
            "light": "Luz indireta e brilhante."
        }
    };

    console.log(`[ANALYSIS SUCCESS] ${transactionId}: Mock de diagnóstico concluído. Nome: ${mockGeminiResponse.plant_identity.common_name}`);
    res.json(mockGeminiResponse);
});


// ----------------------------------------------------
// 6. ROTA: LOOKUP NO BANCO MASTER
// (Checa se a planta já existe no cache botânico)
// ----------------------------------------------------
app.get('/plants/lookup', async (req, res) => {
    const { scientific_name } = req.query;
    const transactionId = `LOOKUP-${Date.now()}`;
    
    if (!scientific_name) {
        return res.status(400).json({ error: 'Nome científico é obrigatório para lookup.' });
    }

    // ID de Teste (simula o cache de uma planta já conhecida)
    const knownPlantId = 'master_spatiphyllum';
    const knownScientificName = 'Spathiphyllum wallisii'; 

    if (scientific_name.toLowerCase() === knownScientificName.toLowerCase()) {
        
        // Simulação de dados botânicos que viriam do plants_master
        const mockMasterData = {
            id: knownPlantId,
            scientific_name: knownScientificName,
            botanical_specs: { 
                "plant_identity": {
                    "common_name": "Lírio da Paz",
                    "scientific_name": knownScientificName,
                    "family": "Araceae"
                },
                // Dados adicionais (XP alto) que a IA não gera no primeiro diagnóstico
                "origin": "América Central e do Sul",
                "toxicity": "Tóxica (cálcio oxalato)",
            },
            created_at: new Date().toISOString(),
        };

        console.log(`[LOOKUP SUCCESS] ${transactionId}: Planta ${knownScientificName} encontrada no cache Master.`);
        return res.json({ found: true, data: mockMasterData });
    }

    console.log(`[LOOKUP MISS] ${transactionId}: Planta ${scientific_name} não encontrada no cache Master.`);
    res.json({ found: false }); // Não encontrada
});


// ----------------------------------------------------
// 7. ROTA: SALVAMENTO NO JARDIM DO USUÁRIO
// (Cria registro no user_plants_garden e insere no master, se for nova)
// ----------------------------------------------------
app.post('/plants/save', upload.single('image'), async (req, res) => {
    const transactionId = `SAVE-${Date.now()}`;
    const { ai_diagnosis, master_plant_id, is_in_pot, gardenId } = req.body; // <-- gardenId AQUI
    const file = req.file;

    // Validação
    if (!gardenId) {
        console.error(`[SAVE FAIL] ${transactionId}: gardenId é obrigatório.`);
        return res.status(400).json({ error: 'ID do Jardim (gardenId) é obrigatório.' });
    }

    try {
        let currentMasterId = master_plant_id;

        // 1. Lógica do Master DB (se não houver um ID, é uma planta nova)
        if (!currentMasterId) {
            console.log(`[SAVE] ${transactionId}: Inserindo nova planta no plants_master...`);
            
            // Aqui, a planta é nova e deve ser inserida no plants_master.
            const diagnosisJson = JSON.parse(ai_diagnosis);
            
            const { data: newMasterPlant, error: masterError } = await supabase
                .from('plants_master')
                .insert([{
                    scientific_name: diagnosisJson.plant_identity.scientific_name,
                    botanical_specs: diagnosisJson, // JSON completo da IA
                    // user_id: 'IA_SOURCE' (em um cenário real, poderiamos rastrear a fonte)
                }])
                .select()
                .single();

            if (masterError) throw new Error(`Master DB Error: ${masterError.message}`);
            
            currentMasterId = newMasterPlant.id;
            console.log(`[SAVE] ${transactionId}: Nova Master ID criada: ${currentMasterId}`);
        } else {
            console.log(`[SAVE] ${transactionId}: Utilizando Master ID existente: ${currentMasterId}`);
        }

        // 2. Upload da Imagem para o Supabase Storage
        let imageUrl = null;
        if (file) {
            // Cria um nome de arquivo único
            const fileName = `${currentMasterId}-${Date.now()}.jpg`;
            const filePath = `garden_images/${fileName}`;

            // Processa a imagem (Redimensionar e comprimir para economia)
            const compressedImage = await sharp(file.buffer)
                .resize(1024) // Limita o tamanho
                .jpeg({ quality: 80 }) // Comprime
                .toBuffer();

            const { error: storageError } = await supabase.storage
                .from('plant_photos')
                .upload(filePath, compressedImage, {
                    contentType: 'image/jpeg',
                    upsert: false,
                });

            if (storageError) throw new Error(`Storage Error: ${storageError.message}`);

            // Obtém a URL pública da imagem
            const { data: urlData } = supabase.storage
                .from('plant_photos')
                .getPublicUrl(filePath);
            imageUrl = urlData.publicUrl;
        }

        // 3. Inserção no Jardim Específico do Usuário
        console.log(`[SAVE] ${transactionId}: Inserindo registro no jardim ${gardenId}...`);
        
        const { error: userGardenError } = await supabase
            .from('user_plants_garden')
            .insert([{
                user_id: 'user_teste_v1', // Hardcode para teste
                garden_id: gardenId, // <-- ID DO JARDIM SELECIONADO
                master_plant_id: currentMasterId,
                is_in_pot: is_in_pot === 'true', // Converte string para booleano
                photo_url: imageUrl,
                // Aqui podem ir mais metadados (notas do usuário, data de plantio, etc.)
            }]);

        if (userGardenError) throw new Error(`User Garden DB Error: ${userGardenError.message}`);

        console.log(`[SAVE SUCCESS] ${transactionId}: Planta salva no jardim ${gardenId}.`);
        res.status(201).json({ message: 'Planta salva com sucesso!' });

    } catch (e) {
        console.error(`[SAVE CRITICAL FAIL] ${transactionId}: ${e.message}`);
        res.status(500).json({ error: `Falha no processo de salvamento: ${e.message}` });
    }
});


// ----------------------------------------------------
// 8. INICIALIZAÇÃO DO SERVIDOR
// ----------------------------------------------------
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
