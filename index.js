const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Configuração
app.use(cors());
app.use(express.json());

// Conexão com Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Rota de Teste (Health Check)
app.get('/', (req, res) => {
  res.json({ 
    status: 'FloraGenesis Online 🌿', 
    mode: 'Architect & Botanist',
    message: 'Sistema pronto para receber conexões.' 
  });
});

// Rota de Teste do Banco de Dados
app.get('/test-db', async (req, res) => {
  const { data, error } = await supabase.from('badge_definitions').select('*');
  if (error) return res.status(500).json({ error: error.message });
  res.json({ badges: data });
});

app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});
