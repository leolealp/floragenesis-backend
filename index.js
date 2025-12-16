// ----------------------------------------------------
// 7. ROTA: SALVAMENTO NO JARDIM DO USUÁRIO
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
        
        // 1. Lógica do Master DB (Mock)
        if (!currentMasterId) {
            currentMasterId = 'mock_new_master_id'; 
        }

        // 2. Upload da Imagem (Mock)
        let imageUrl = `mock_url_for_plant_${currentMasterId}.jpg`;
        if (file) {
            console.log(`[SAVE] ${transactionId}: Imagem mockada para URL: ${imageUrl}`);
        }

        // --- INÍCIO DA CORREÇÃO DE ERRO 500 ---
        // A. Se estivermos em produção (Render) E tivermos credenciais, tentaremos salvar.
        // O NODE_ENV é setado automaticamente pelo Render para 'production'.
        if (process.env.NODE_ENV === 'production' && process.env.SUPABASE_URL && process.env.SUPABASE_KEY) {
            console.log(`[SAVE] ${transactionId}: Inserindo registro REAL no jardim ${gardenId}...`);

            const { error: userGardenError } = await supabase
                .from('user_gardens') 
                .insert([{
                    user_id: 'user_teste_v1',
                    garden_id: gardenId, 
                    master_plant_id: currentMasterId,
                    // Garante que a string 'true'/'false' se torna um booleano
                    is_in_pot: is_in_pot === 'true', 
                    image_url: imageUrl,
                }]);

            if (userGardenError) {
                // Se houver erro de banco de dados, paramos a execução e vamos para o catch.
                throw new Error(`User Garden DB Error: ${userGardenError.message}`); 
            }
        } else {
            // B. MOCK/DEV - Simula o sucesso. Se o deploy falhar, isso garante que o erro não é aqui.
            console.log(`[SAVE] ${transactionId}: MOCK de inserção concluído (Supabase ignorado no ambiente atual).`);
        }
        // --- FIM DA CORREÇÃO ---

        console.log(`[SAVE SUCCESS] ${transactionId}: Planta salva com sucesso!`);
        res.status(201).json({ message: 'Planta salva com sucesso!' });

    } catch (e) {
        console.error(`[SAVE CRITICAL FAIL] ${transactionId}: ${e.message}`);
        // Retornar o 500 com a mensagem de erro detalhada do Supabase para depuração
        res.status(500).json({ error: `Falha no processo de salvamento: ${e.message}` });
    }
});