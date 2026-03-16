const URL_API = "http://localhost:3000/api";
let estoque = [];
let historicoUso = [];
let graficoInstancia = null;

window.addEventListener('DOMContentLoaded', carregarDadosDoBanco);

async function carregarDadosDoBanco() {
    try {
        const [resEstoque, resHistorico] = await Promise.all([
            fetch(`${URL_API}/estoque`),
            fetch(`${URL_API}/historico`)
        ]);
        estoque = await resEstoque.json();
        historicoUso = await resHistorico.json();
        desenharPainel();
        desenharHistorico();
    } catch (erro) {
        console.error("Erro ao carregar dados:", erro);
    }
}

// CADASTRO DE PRODUTO
const form = document.getElementById('formulario-produto');
if (form) {
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            const qtdEmbalagens = parseFloat(document.getElementById('quantidade').value); 
            const medidaValor = parseFloat(document.getElementById('medida-unidade').value);
            const unidadeOriginal = document.getElementById('unidade').value; 
            
            let medidaBase;
            let categoria;

            // AJUSTE: Agora 'unidade' também usa o valor digitado (ex: 500 palitos)
            if (unidadeOriginal === 'un') {
                medidaBase = medidaValor; 
                categoria = 'unidade';
            } else {
                medidaBase = (unidadeOriginal === 'kg' || unidadeOriginal === 'l') ? medidaValor * 1000 : medidaValor;
                categoria = (unidadeOriginal === 'g' || unidadeOriginal === 'kg') ? 'peso' : 'volume';
            }

            const novoItem = {
                nome: document.getElementById('nome').value,
                marca: document.getElementById('marca').value,
                medida_unitaria: medidaBase,
                qtd_estoque: qtdEmbalagens * medidaBase, // Ex: 2 caixas * 500 palitos = 1000
                qtdtotal_cadastrada: Math.ceil(qtdEmbalagens),
                tipo: `${categoria} (${unidadeOriginal})`, 
                validade: document.getElementById('validade').value
            };

            const resposta = await fetch(`${URL_API}/estoque`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(novoItem)
            });

            if (resposta.ok) {
                form.reset();
                await carregarDadosDoBanco();
            }
        } catch (erro) {
            alert("Erro ao salvar.");
        }
    });
}

// BAIXAR ESTOQUE
async function registrarConsumo(id) {
    const inputUso = document.getElementById(`valor-uso-${id}`);
    const tipoUso = document.getElementById(`tipo-uso-${id}`).value;
    const valorInput = parseFloat(inputUso.value) || 0;
    const produto = estoque.find(p => p.id === id);

    if (!produto || valorInput <= 0) return;
    
    const categoria = produto.tipo.split(' ')[0];
    let qtdSubtrair;

    // Se o usuário baixar "1 un" de uma caixa de 500, ele tira 1 unidade do total de 500.
    if (tipoUso === 'un') {
        qtdSubtrair = valorInput;
    } else {
        qtdSubtrair = (tipoUso === 'kg' || tipoUso === 'l' ? valorInput * 1000 : valorInput);
    }

    if (qtdSubtrair > parseFloat(produto.qtd_estoque)) {
        alert("Quantidade insuficiente!");
        return;
    }

    await fetch(`${URL_API}/consumo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            produto_id: id,
            nome: produto.nome,
            quantidade_usada: `${valorInput}${tipoUso}`,
            novo_volume: parseFloat(produto.qtd_estoque) - qtdSubtrair
        })
    });
    await carregarDadosDoBanco();
}

function formatarExibicao(valor, tipo) {
    if (tipo === 'unidade') return `${valor.toFixed(0)} un`;
    if (valor >= 1000) return `${(valor / 1000).toFixed(2)}${tipo === 'peso' ? 'kg' : 'l'}`;
    return `${valor.toFixed(0)}${tipo === 'peso' ? 'g' : 'ml'}`;
}

function desenharPainel() {
    const lista = document.getElementById('lista-estoque');
    if (!lista) return;
    lista.innerHTML = '';
    const hoje = new Date().toISOString().split('T')[0];
    const ativos = estoque.filter(p => parseFloat(p.qtd_estoque) > 0);

    ativos.forEach(p => {
        const vTotal = parseFloat(p.qtd_estoque);
        const mUnitaria = parseFloat(p.medida_unitaria);
        const categoria = p.tipo.split(' ')[0];
        const formatado = formatarExibicao(vTotal, categoria);
        const dataIso = new Date(p.validade).toISOString().split('T')[0];

        const div = document.createElement('div');
        div.className = `item-produto ${dataIso < hoje ? 'status-vencido' : ''}`;
        
        // Exibimos as "Embalagens" como a divisão do total pelo que vem em uma caixa
        const qtdEmbalagens = (vTotal / mUnitaria).toFixed(1);

        div.innerHTML = `
            <div style="display: flex; justify-content: space-between;">
                <strong>${dataIso < hoje ? '⚠️' : ''} ${p.nome} (${p.marca})</strong>
                <button class="btn-deletar" onclick="excluirProduto(${p.id})">×</button>
            </div>
            <div style="font-size: 0.8em; margin: 4px 0;">Validade: ${new Date(p.validade).toLocaleDateString('pt-BR', {timeZone: 'UTC'})}</div>
            <div style="background: rgba(0,0,0,0.1); padding: 8px; border-radius: 4px; font-size: 0.85em;">
                Estoque: <strong>${formatado}</strong> | Embalagens: <strong>${qtdEmbalagens}</strong>
            </div>
            <div class="controles-uso">
                <input type="number" id="valor-uso-${p.id}" placeholder="0" step="0.1">
                <select id="tipo-uso-${p.id}">
                    <option value="un">un</option>
                    ${categoria === 'peso' ? '<option value="g">g</option><option value="kg">kg</option>' : ''}
                    ${categoria === 'volume' ? '<option value="ml">ml</option><option value="l">l</option>' : ''}
                </select>
                <button class="btn-baixar" onclick="registrarConsumo(${p.id})">BAIXAR</button>
            </div>
        `;
        lista.appendChild(div);
    });
    atualizarGrafico(ativos);
}

// Funções de excluir e histórico permanecem iguais...
async function excluirProduto(id) { if (confirm("Remover?")) { await fetch(`${URL_API}/estoque/${id}`, { method: 'DELETE' }); carregarDadosDoBanco(); } }
async function excluirItemHistorico(id) { if (confirm("Excluir registro?")) { await fetch(`${URL_API}/historico/${id}`, { method: 'DELETE' }); carregarDadosDoBanco(); } }
function desenharHistorico() {
    const lista = document.getElementById('lista-historico');
    if (!lista) return;
    lista.innerHTML = historicoUso.map(h => `
        <div class="item-historico">
            <div><small>${new Date(h.data_uso).toLocaleString()}</small><br>
            <strong>${h.quantidade_usada}</strong> de ${h.produto_nome}</div>
            <button class="btn-deletar" onclick="excluirItemHistorico(${h.id})">🗑️</button>
        </div>
    `).join('');
}
function atualizarGrafico(dados) {
    const canvas = document.getElementById('graficoEstoque');
    const container = document.getElementById('container-grafico');
    if (!canvas || !dados.length) { if(container) container.style.display = 'none'; return; }
    container.style.display = 'block';
    if (graficoInstancia) graficoInstancia.destroy();
    graficoInstancia = new Chart(canvas.getContext('2d'), {
        type: 'pie',
        data: {
            labels: dados.map(p => p.nome),
            datasets: [{
                data: dados.map(p => (p.qtd_estoque / p.medida_unitaria).toFixed(1)),
                backgroundColor: ['#6366f1', '#10b981', '#f43f5e', '#fbbf24', '#8b5cf6'],
                borderWidth: 0
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
}