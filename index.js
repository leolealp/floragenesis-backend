const express = require('express');
const cors = require('cors');
const multer = require('multer'); // Biblioteca para ler fotos
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Configuração de Upload (Memória temporária)
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

app.use(cors());
app.use(express.json());

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// --- ROTAS ---

// 1. Health Check
app.get('/', (req, res) => res.json({ status: 'FloraGenesis Brain Online 🧠' }));

// 2. Listar Medalhas (Gamification)
app.get('/test-db', async (req, res) => {
  const { data, error } = await supabase.from('badge_definitions').select('*');
  if (error) return res.status(500).json({ error: error.message });
  res.json({ badges: data });
});

// 3. ROTA NOVA: Identificar Planta (Simulação de IA)
// O App manda a foto, e nós fingimos que analisamos
app.post('/plants/analyze', upload.single('image'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'Nenhuma imagem enviada 🌱' });
    }

    console.log(`Recebi uma imagem de ${file.size} bytes. Iniciando análise...`);

    // AQUI ENTRARIA A CHAMADA REAL PARA O GPT-4 VISION / GEMINI
    // Por enquanto, vamos retornar um DIAGNÓSTICO MOCK (Fictício) para testar o App
    
    // Simula um "tempo de pensar" da IA (2 segundos)
    await new Promise(resolve => setTimeout(resolve, 2000));

    const mockDiagnosis = {
      plant_identity: {
        scientific_name: "Nephrolepis exaltata",
        common_name: "Samambaia Americana",
        confidence: 0.98
      },
      diagnosis: {
        health_status: "Sick", // Doente
        primary_issue: "Falta de Umidade",
        description: "As pontas das folhas estão secas, indicando baixa umidade no ar."
      },
      treatment_protocol: {
        required: true,
        title: "Protocolo de Hidratação Intensa",
        duration_days: 7
      }
    };

    res.json(mockDiagnosis);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro no processamento da imagem' });
  }
});

app.listen(port, () => {
  console.log(`Servidor FloraGenesis rodando na porta ${port}`);
});
