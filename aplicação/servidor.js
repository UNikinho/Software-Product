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

// LISTAR ESTOQUE
app.get('/api/estoque', async (req, res) => {
    try {
        const resultado = await pool.query('SELECT * FROM produtos_estoque WHERE excluido = false ORDER BY validade ASC');
        res.json(resultado.rows);
    } catch (erro) {
        console.error(erro);
        res.status(500).send("Erro ao buscar estoque.");
    }
});

// CADASTRAR PRODUTO (Corrigido para garantir a inserção)
app.post('/api/estoque', async (req, res) => {
    const { nome, marca, medida_unitaria, qtd_estoque, tipo, validade, qtdtotal_cadastrada } = req.body;
    try {
        await pool.query(
            `INSERT INTO produtos_estoque 
            (nome, marca, medida_unitaria, qtd_estoque, tipo, validade, qtdtotal_cadastrada, excluido) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, false)`,
            [nome, marca, medida_unitaria, qtd_estoque, tipo, validade, qtdtotal_cadastrada]
        );
        res.status(201).send("OK");
    } catch (erro) {
        console.error("Erro no cadastro:", erro);
        res.status(500).send("Erro ao salvar no banco.");
    }
});

// EXCLUIR PRODUTO
app.delete('/api/estoque/:id', async (req, res) => {
    try {
        await pool.query('UPDATE produtos_estoque SET excluido = true WHERE id = $1', [req.params.id]);
        res.send("OK");
    } catch (erro) {
        res.status(500).send("Erro.");
    }
});

// REGISTRAR CONSUMO
app.post('/api/consumo', async (req, res) => {
    const { produto_id, nome, quantidade_usada, novo_volume } = req.body;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('UPDATE produtos_estoque SET qtd_estoque = $1 WHERE id = $2', [novo_volume, produto_id]);
        await client.query('INSERT INTO historico_consumo (produto_nome, quantidade_usada) VALUES ($1, $2)', [nome, quantidade_usada]);
        await client.query('COMMIT');
        res.status(200).send("OK");
    } catch (erro) {
        await client.query('ROLLBACK');
        res.status(500).send("Erro no consumo.");
    } finally {
        client.release();
    }
});

// HISTÓRICO
app.get('/api/historico', async (req, res) => {
    try {
        const resultado = await pool.query('SELECT * FROM historico_consumo WHERE visivel = true ORDER BY data_uso DESC');
        res.json(resultado.rows);
    } catch (erro) {
        res.status(500).send("Erro.");
    }
});

app.delete('/api/historico/limpar', async (req, res) => {
    try {
        await pool.query('UPDATE historico_consumo SET visivel = false');
        res.send("Limpo");
    } catch (erro) {
        res.status(500).send("Erro");
    }
});

app.delete('/api/historico/:id', async (req, res) => {
    try {
        await pool.query('UPDATE historico_consumo SET visivel = false WHERE id = $1', [req.params.id]);
        res.send("OK");
    } catch (erro) {
        res.status(500).send("Erro.");
    }
});

app.listen(3000, () => console.log("🚀 Servidor ON"));
