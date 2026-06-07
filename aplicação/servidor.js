const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'estqarmario', 
    password: 'admin',
    port: 5432,
});

// Cache para controle de concorrência (Evita duplicações em silêncio)
const travasDeRequisicao = new Set();

// ROUTE: CADASTRO DE USUÁRIO
app.post('/api/auth/cadastro', async (req, res) => {
    const { nome, email, senha } = req.body;
    try {
        const existe = await pool.query('SELECT * FROM usuarios WHERE email = $1', [email]);
        if (existe.rows.length > 0) {
            return res.status(400).json({ mensagem: "Este e-mail já está cadastrado!" });
        }
        const novoUsuario = await pool.query(
            'INSERT INTO usuarios (nome, email, senha) VALUES ($1, $2, $3) RETURNING id, nome',
            [nome, email, senha]
        );
        res.status(201).json(novoUsuario.rows[0]);
    } catch (erro) {
        console.error(erro);
        res.status(500).send("Erro ao cadastrar usuário.");
    }
});

// ROUTE: LOGIN DE USUÁRIO
app.post('/api/auth/login', async (req, res) => {
    const { email, senha } = req.body;
    try {
        const usuario = await pool.query('SELECT * FROM usuarios WHERE email = $1 AND senha = $2', [email, senha]);
        if (usuario.rows.length === 0) {
            return res.status(401).json({ mensagem: "Login incorreto. Se não tiver conta, volte ao Cadastro." });
        }
        res.json({ id: usuario.rows[0].id, nome: usuario.rows[0].nome });
    } catch (erro) {
        console.error(erro);
        res.status(500).send("Erro ao realizar login.");
    }
});

// LISTAR ESTOQUE (Filtrado por Usuário)
app.get('/api/estoque', async (req, res) => {
    const usuario_id = req.query.usuario_id;
    try {
        const resultado = await pool.query(
            'SELECT * FROM produtos_estoque WHERE excluido = false AND usuario_id = $1 ORDER BY validade ASC',
            [usuario_id]
        );
        res.json(resultado.rows);
    } catch (erro) {
        res.status(500).send("Erro ao buscar estoque.");
    }
});

// CADASTRAR PRODUTO
app.post('/api/estoque', async (req, res) => {
    const { usuario_id, nome, marca, medida_unitaria, qtd_estoque, tipo, validade, qtdtotal_cadastrada } = req.body;
    try {
        await pool.query(
            `INSERT INTO produtos_estoque 
            (usuario_id, nome, marca, medida_unitaria, qtd_estoque, tipo, validade, qtdtotal_cadastrada, excluido) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false)`,
            [usuario_id, nome, marca, medida_unitaria, qtd_estoque, tipo, validade, qtdtotal_cadastrada]
        );
        res.status(201).send("OK");
    } catch (erro) {
        res.status(500).send("Erro ao salvar no banco.");
    }
});

// ROUTE: EDITAR PRODUTO (ATUALIZADO: Monitoramento completo incluindo Data de Validade)
app.put('/api/estoque/:id', async (req, res) => {
    const { id } = req.params;
    const { nome, marca, medida_unitaria, qtd_estoque, tipo, validade, qtdtotal_cadastrada } = req.body;
    
    const chaveRequisicao = `${id}-${qtd_estoque}-${qtdtotal_cadastrada}-${medida_unitaria}-${validade}`;
    
    if (travasDeRequisicao.has(chaveRequisicao)) {
        return res.json({ mensagem: "Produto atualizado com sucesso!" });
    }
    
    travasDeRequisicao.add(chaveRequisicao);
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');

        const buscaProduto = await client.query(
            'SELECT * FROM produtos_estoque WHERE id = $1 AND excluido = false', 
            [id]
        );

        if (buscaProduto.rows.length === 0) {
            await client.query('ROLLBACK');
            travasDeRequisicao.delete(chaveRequisicao);
            return res.status(404).json({ mensagem: "Produto não encontrado." });
        }

        const produtoAtual = buscaProduto.rows[0];

        const totalOriginal = parseFloat(produtoAtual.qtdtotal_cadastrada) * parseFloat(produtoAtual.medida_unitaria);
        const estoqueAtual = parseFloat(produtoAtual.qtd_estoque);

        if (estoqueAtual < (totalOriginal - 0.01)) {
            await client.query('ROLLBACK');
            travasDeRequisicao.delete(chaveRequisicao);
            return res.status(400).json({ 
                mensagem: "Aviso: Este produto já possui movimentações de consumo registradas e não pode mais ser alterado para manter a consistência do histórico." 
            });
        }

        // --- MONTA A MENSAGEM DETALHADA DE ALTERAÇÃO ---
        const matchUnidadeAntiga = produtoAtual.tipo ? produtoAtual.tipo.match(/\(([^)]+)\)/) : null;
        const uniAntiga = matchUnidadeAntiga ? matchUnidadeAntiga[1] : '';

        const matchUnidadeNova = tipo ? tipo.match(/\(([^)]+)\)/) : null;
        const uniNova = matchUnidadeNova ? matchUnidadeNova[1] : '';

        let conteudoAntigoFormatado = parseFloat(produtoAtual.medida_unitaria);
        if (uniAntiga === 'kg' || uniAntiga === 'l') conteudoAntigoFormatado /= 1000;

        let conteudoNovoFormatado = parseFloat(medida_unitaria);
        if (uniNova === 'kg' || uniNova === 'l') conteudoNovoFormatado /= 1000;

        let alteracoes = [];
        if (produtoAtual.nome !== nome) alteracoes.push(`nome de "${produtoAtual.nome}" para "${nome}"`);
        if (produtoAtual.marca !== marca) alteracoes.push(`marca de "${produtoAtual.marca}" para "${marca}"`);
        
        if (Math.floor(parseFloat(produtoAtual.qtdtotal_cadastrada)) !== Math.floor(parseFloat(qtdtotal_cadastrada))) {
            alteracoes.push(`embalagens de ${Math.floor(parseFloat(produtoAtual.qtdtotal_cadastrada))} para ${Math.floor(parseFloat(qtdtotal_cadastrada))}`);
        }
        
        if (parseFloat(conteudoAntigoFormatado) !== parseFloat(conteudoNovoFormatado) || uniAntiga !== uniNova) {
            alteracoes.push(`conteúdo de ${conteudoAntigoFormatado}${uniAntiga} para ${conteudoNovoFormatado}${uniNova}`);
        }

        // --- AJUSTE: TRATAMENTO E COMPARAÇÃO DA DATA DE VALIDADE ---
        if (validade && produtoAtual.validade) {
            // Formata a data antiga vinda do banco (Objeto Date) para DD/MM/AAAA
            const dAntiga = new Date(produtoAtual.validade);
            const dataAntigaFormatada = `${String(dAntiga.getUTCDate()).padStart(2, '0')}/${String(dAntiga.getUTCMonth() + 1).padStart(2, '0')}/${dAntiga.getUTCFullYear()}`;

            // Formata a data nova vinda do formulário (String ISO ou YYYY-MM-DD) para DD/MM/AAAA
            const dNova = new Date(validade);
            const dataNovaFormatada = `${String(dNova.getUTCDate()).padStart(2, '0')}/${String(dNova.getUTCMonth() + 1).padStart(2, '0')}/${dNova.getUTCFullYear()}`;

            if (dataAntigaFormatada !== dataNovaFormatada) {
                alteracoes.push(`validade de ${dataAntigaFormatada} para ${dataNovaFormatada}`);
            }
        }

        const detalheHistorico = alteracoes.length > 0 
            ? `Alterou: ${alteracoes.join(', ')}.` 
            : "Nenhuma mudança de valores realizada.";

        await client.query(
            `UPDATE produtos_estoque 
             SET nome = $1, marca = $2, medida_unitaria = $3, qtd_estoque = $4, tipo = $5, validade = $6, qtdtotal_cadastrada = $7
             WHERE id = $8`,
            [nome, marca, medida_unitaria, qtd_estoque, tipo, validade, qtdtotal_cadastrada, id]
        );

        await client.query(
            `INSERT INTO historico_consumo (usuario_id, produto_id, produto_nome, quantidade_usada, visivel) 
             VALUES ($1, $2, $3, $4, true)`,
            [produtoAtual.usuario_id, id, `[EDIÇÃO] ${nome} (${marca})`, detalheHistorico]
        );

        await client.query('COMMIT');
        res.json({ mensagem: "Produto atualizado com sucesso!" });

    } catch (erro) {
        await client.query('ROLLBACK');
        console.error(erro);
        res.status(500).json({ mensagem: "Erro ao atualizar o produto no servidor." });
    } finally {
        client.release();
        setTimeout(() => { travasDeRequisicao.delete(chaveRequisicao); }, 1000);
    }
});

// ROUTE: REGISTRAR CONSUMO
app.post('/api/consumo', async (req, res) => {
    const { usuario_id, produto_id, nome, quantidade_usada, novo_volume } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('UPDATE produtos_estoque SET qtd_estoque = $1 WHERE id = $2', [novo_volume, produto_id]);
        
        await client.query(
            'INSERT INTO historico_consumo (usuario_id, produto_id, produto_nome, quantidade_usada, visivel) VALUES ($1, $2, $3, $4, true)', 
            [usuario_id, produto_id, nome, quantidade_usada]
        );
        
        await client.query('COMMIT');
        res.status(200).send("OK");
    } catch (erro) {
        await client.query('ROLLBACK');
        console.error("Erro na rota /api/consumo:", erro);
        res.status(500).send("Erro no consumo.");
    } finally {
        client.release();
    }
});

// HISTÓRICO
app.get('/api/historico', async (req, res) => {
    try {
        const resultado = await pool.query('SELECT * FROM historico_consumo WHERE visivel = true AND usuario_id = $1 ORDER BY data_uso DESC', [req.query.usuario_id]);
        res.json(resultado.rows);
    } catch (erro) {
        res.status(500).send("Erro.");
    }
});

app.delete('/api/historico/limpar', async (req, res) => {
    try {
        await pool.query('UPDATE historico_consumo SET visivel = false WHERE usuario_id = $1', [req.query.usuario_id]);
        res.send("Limpo");
    } catch (erro) { res.status(500).send("Erro"); }
});

app.delete('/api/estoque/:id', async (req, res) => {
    try { await pool.query('UPDATE produtos_estoque SET excluido = true WHERE id = $1', [req.params.id]); res.send("OK"); } catch (erro) { res.status(500).send("Erro."); }
});

app.delete('/api/historico/:id', async (req, res) => {
    try { await pool.query('UPDATE historico_consumo SET visivel = false WHERE id = $1', [req.params.id]); res.send("OK"); } catch (erro) { res.status(500).send("Erro."); }
});

app.listen(3000, () => console.log("🚀 Servidor ON"));