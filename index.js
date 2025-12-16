// index.js (Revisão para sintaxe de Node.js CLÁSSICA)

const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const multer = require('multer');
const sharp = require('sharp');
require('dotenv').config(); // Usando require para dotenv

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
// ----------------------------------------------------
app.get('/user/gardens', async (req, res) => {
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
            .eq('user_id', user_id); 
            
        if (error) {
            console.error(`[GARDEN LOOKUP FAIL] ${transactionId} [DB ERROR]: ${error.message}`);
            return res.status(500).json({ error: 'Erro ao buscar a lista de jardins.' });
        }
        
        console.log(`[GARDEN LOOKUP SUCCESS] ${transactionId}: ${data.length} jardins encontrados para ${user_id}.`);
        res.json(data); 
        
    } catch (e) {
        console.error(`[GARDEN LOOKUP CRITICAL FAIL] ${transactionId}: ${e.message}`);
        return res.status(500).json({ error: 'Falha técnica na busca de jardins.' });
    }
});


// ----------------------------------------------------
// 5. ROTA: ANÁLISE DE PLANTA (AI e Lookup) - MOCK
// ----------------------------------------------------
app.post('/plants/analyze', upload.single('image'), async (req, res) => {
    const transactionId = `ANALYSIS-${Date.now()}`;
    
    // MOCK (Para não depender de chave Gemini agora)
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
// 6. ROTA: LOOKUP NO BANCO MASTER - MOCK
// ----------------------------------------------------
app.get('/plants/lookup', async (req, res) => {
    const { scientific_name } = req.query;
    const transactionId = `LOOKUP-${Date.now()}`;
    
    if (!scientific_name) {
        return res.status(400).json({ error: 'Nome científico é obrigatório para lookup.' });
    }

    // MOCK (Simula uma planta já conhecida no Master DB)
    const knownScientificName = 'Spathiphyllum wallisii'; 

    if (scientific_name.toLowerCase() === knownScientificName.toLowerCase()) {
        
        const mockMasterData = {
            id: 'master_spatiphyllum_id',
            scientific_name: knownScientificName,
            botanical_specs: { 
                "plant_identity": {
                    "common_name": "Lírio da Paz",
                    "scientific_name": knownScientificName,
                    "family": "Araceae"
                },
                "origin": "América Central e do Sul",
                "toxicity": "Tóxica (cálcio oxalato)",
            },
            created_at: new Date().toISOString(),
        };

        console.log(`[LOOKUP SUCCESS] ${transactionId}: Planta ${knownScientificName} encontrada no cache Master.`);
        return res.json({ found: true, data: mockMasterData });
    }

    console.log(`[LOOKUP MISS] ${transactionId}: Planta ${scientific_name} não encontrada no cache Master.`);
    res.json({ found: false });
});


// ----------------------------------------------------
// 7. ROTA: SALVAMENTO NO JARDIM DO USUÁRIO - MOCK
// ----------------------------------------------------
app.post('/plants/save', upload.single('image'), async (req, res) => {
    const transactionId = `SAVE-${Date.now()}`;
    const { ai_diagnosis, master_plant_id, is_in_pot, gardenId } = req.body;
    const file = req.file;

    // Validação
    if (!gardenId) {
        console.error(`[SAVE FAIL] ${transactionId}: gardenId é obrigatório.`);
        return res.status(400).json({ error: 'ID do Jardim (gardenId) é obrigatório.' });
    }

    try {
        let currentMasterId = master_plant_id;

        // 1. Lógica do Master DB (Mock - Assume que foi inserido)
        if (!currentMasterId) {
            currentMasterId = 'mock_new_master_id';
        }

        // 2. Upload da Imagem (Mock - Assume que funcionou)
        let imageUrl = `mock_url_for_plant_${currentMasterId}.jpg`;
        if (file) {
             // Esta parte exigiria a instalação da biblioteca sharp, que é pesada. 
             // Deixaremos o mock por enquanto, assumindo que a URL foi gerada.
            console.log(`[SAVE] ${transactionId}: Imagem mockada para URL: ${imageUrl}`);
        }

        // 3. Inserção no Jardim Específico do Usuário
        console.log(`[SAVE] ${transactionId}: Inserindo registro no jardim ${gardenId}...`);
        
        const { error: userGardenError } = await supabase
            .from('user_gardens') // Alterado de user_plants_garden para user_gardens (como no SQL)
            .insert([{
                user_id: 'user_teste_v1',
                garden_id: gardenId, 
                master_plant_id: currentMasterId,
                is_in_pot: is_in_pot === 'true', 
                image_url: imageUrl,
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
