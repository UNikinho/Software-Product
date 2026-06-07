const URL_API = "http://localhost:3000/api";
let estoque = [];
let historicoUso = [];
let graficoInstancia = null;
let usuarioLogado = null;
let modoLogin = false;

window.addEventListener('DOMContentLoaded', () => {
    const btnLimpar = document.getElementById('btn-limpar-historico');
    if (btnLimpar) btnLimpar.addEventListener('click', limparHistoricoCompleto);

    const btnAlternar = document.getElementById('btn-auth-alternar');
    if (btnAlternar) btnAlternar.addEventListener('click', alternarModoAuth);

    const formAuth = document.getElementById('formulario-auth');
    if (formAuth) formAuth.addEventListener('submit', processarAutenticacao);

    const campoMedida = document.getElementById('medida-unidade');
    if (campoMedida) campoMedida.setAttribute('step', 'any');
    
    const editMedida = document.getElementById('edit-medida');
    if (editMedida) editMedida.setAttribute('step', 'any');

    const btnMostrarSenha = document.getElementById('btn-mostrar-senha');
    const campoSenha = document.getElementById('auth-senha');

    if (btnMostrarSenha && campoSenha) {
        btnMostrarSenha.addEventListener('click', () => {
            if (campoSenha.type === 'password') {
                campoSenha.type = 'text';
                btnMostrarSenha.innerText = '🙈';
            } else {
                campoSenha.type = 'password';
                btnMostrarSenha.innerText = '👁️';
            }
        });
    }

    const btnTema = document.getElementById('btn-tema');
    const temaSalvo = localStorage.getItem('tema-escuro');
    if (temaSalvo === 'true') {
        document.body.classList.add('dark-mode');
        if (btnTema) btnTema.innerText = "☀️ Modo Claro";
    }

    if (btnTema) {
        btnTema.addEventListener('click', () => {
            const ativo = document.body.classList.toggle('dark-mode');
            localStorage.setItem('tema-escuro', ativo);
            btnTema.innerText = ativo ? "☀️ Modo Claro" : "🌙 Modo Escuro";
            if (estoque.length > 0) {
                const ativos = estoque.filter(p => parseFloat(p.qtd_estoque) > 0);
                atualizarGrafico(ativos);
            }
        });
    }

    // CORREÇÃO DO ID: Vincula diretamente ao id correto do form no HTML
    const formEditar = document.getElementById('formEditarProduto');
    if (formEditar) {
        formEditar.addEventListener('submit', salvarEdicaoProduto);
    }
});

function alternarModoAuth() {
    modoLogin = !modoLogin;
    const containerNome = document.getElementById('auth-nome-container'); 
    const campoNome = document.getElementById('auth-nome');
    const titulo = document.getElementById('auth-titulo');
    const subtitulo = document.getElementById('auth-subtitulo');
    const btnPrincipal = document.getElementById('btn-auth-principal');
    const btnAlternar = document.getElementById('btn-auth-alternar');

    if (modoLogin) {
        titulo.innerText = "Fazer Login";
        subtitulo.innerText = "Insira suas credenciais para acessar seu armário.";
        if (containerNome) containerNome.style.display = "none";
        if (campoNome) campoNome.removeAttribute("required");
        btnPrincipal.innerText = "Entrar";
        btnAlternar.innerText = "Criar uma conta";
    } else {
        titulo.innerText = "Criar Conta no Smart Armário";
        subtitulo.innerText = "Cadastre-se para começar a gerenciar seu estoque.";
        if (containerNome) containerNome.style.display = "block";
        if (campoNome) containerNome.setAttribute("required", "required");
        btnPrincipal.innerText = "Cadastrar";
        btnAlternar.innerText = "Possui conta?";
    }
}

async function processarAutenticacao(e) {
    e.preventDefault();
    const nome = document.getElementById('auth-nome').value;
    const email = document.getElementById('auth-email').value;
    const senha = document.getElementById('auth-senha').value;

    const rota = modoLogin ? '/auth/login' : '/auth/cadastro';
    const corpo = modoLogin ? { email, senha } : { nome, email, senha };

    try {
        const resposta = await fetch(`${URL_API}${rota}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(corpo)
        });

        const dados = await resposta.json();

        if (!resposta.ok) {
            alert(dados.mensagem || "Erro na operação.");
            return;
        }

        if (modoLogin) {
            usuarioLogado = dados;
            document.getElementById('tela-autenticacao').style.display = 'none';
            document.getElementById('tela-sistema').style.display = 'block';
            document.getElementById('usuario-logado').innerText = `Olá, ${usuarioLogado.nome}!`;
            carregarDadosDoBanco();
        } else {
            alert("Cadastro realizado! Agora faça o seu login.");
            alternarModoAuth();
        }
    } catch (erro) {
        alert("Erro ao conectar com o servidor.");
    }
}

async function carregarDadosDoBanco() {
    if (!usuarioLogado) return;
    try {
        const [resEstoque, resHistorico] = await Promise.all([
            fetch(`${URL_API}/estoque?usuario_id=${usuarioLogado.id}`),
            fetch(`${URL_API}/historico?usuario_id=${usuarioLogado.id}`)
        ]);
        estoque = await resEstoque.json();
        historicoUso = await resHistorico.json();
        desenharPainel();
        desenharHistorico();
    } catch (erro) {
        console.error("Erro ao carregar dados:", erro);
    }
}

async function limparHistoricoCompleto() {
    if (historicoUso.length === 0) {
        alert("Não existe nenhum registro no histórico.");
        return;
    }
    if (confirm("Deseja realmente limpar todo o histórico?")) {
        try {
            const resposta = await fetch(`${URL_API}/historico/limpar?usuario_id=${usuarioLogado.id}`, { method: 'DELETE' });
            if (resposta.ok) await carregarDadosDoBanco();
        } catch (erro) { console.error(erro); }
    }
}

const form = document.getElementById('formulario-produto');
if (form) {
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            const dataValidadeInput = document.getElementById('validade').value;
            const dataValidade = new Date(dataValidadeInput + 'T00:00:00');
            const dataAtual = new Date();
            dataAtual.setHours(0, 0, 0, 0);

            if (dataValidade < dataAtual) {
                const confirmarCadastro = confirm("⚠️ O produto está vencido! Deseja adicionar mesmo assim?");
                if (!confirmarCadastro) return; 
            }

            const qtdEmbalagens = parseFloat(document.getElementById('quantidade').value.toString().replace(',', '.')); 
            const medidaValor = parseFloat(document.getElementById('medida-unidade').value.toString().replace(',', '.'));
            let unidadOriginal = document.getElementById('unidade').value.toLowerCase().trim(); 

            if (isNaN(qtdEmbalagens) || isNaN(medidaValor)) {
                alert("Por favor, insira valores numéricos válidos.");
                return;
            }

            if (unidadOriginal.includes('(')) {
                const match = unidadOriginal.match(/\(([^)]+)\)/);
                unidadOriginal = match ? match[1] : 'un';
            }
            
            let medidaBase = (unidadOriginal === 'un') ? medidaValor : ((unidadOriginal === 'kg' || unidadOriginal === 'l') ? medidaValor * 1000 : medidaValor);
            let category = (unidadOriginal === 'un') ? 'unidade' : ((unidadOriginal === 'g' || unidadOriginal === 'kg') ? 'peso' : 'volume');

            const novoItem = {
                usuario_id: usuarioLogado.id, 
                nome: document.getElementById('nome').value,
                marca: document.getElementById('marca').value,
                medida_unitaria: medidaBase,
                qtd_estoque: parseFloat((qtdEmbalagens * medidaBase).toFixed(4)),
                qtdtotal_cadastrada: qtdEmbalagens, 
                tipo: `${category} (${unidadOriginal})`, 
                validade: dataValidadeInput
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
        } catch (erro) { alert("Erro ao salvar."); }
    });
}

function abrirModalEditar(id) {
    const produto = estoque.find(p => p.id === id);
    if (!produto) return;

    const totalOriginalTeorico = parseFloat(produto.qtdtotal_cadastrada) * parseFloat(produto.medida_unitaria);
    const estoqueAtualEmVolume = parseFloat(produto.qtd_estoque);

    if (estoqueAtualEmVolume < (totalOriginalTeorico - 0.01)) {
        alert("Aviso: Este produto já possui movimentações de consumo registradas e não pode mais ser alterado para manter a consistência do histórico.");
        return;
    }

    const matchUnidade = produto.tipo.match(/\(([^)]+)\)/);
    const unidadeOriginal = matchUnidade ? matchUnidade[1].toLowerCase() : 'un';

    let medidaExibicao = parseFloat(produto.medida_unitaria);
    if (unidadeOriginal === 'kg' || unidadeOriginal === 'l') {
        medidaExibicao = medidaExibicao / 1000;
    }

    document.getElementById('edit-id').value = produto.id;
    document.getElementById('edit-nome').value = produto.nome;
    document.getElementById('edit-marca').value = produto.marca;
    document.getElementById('edit-qtd-embalagens').value = produto.qtdtotal_cadastrada;
    document.getElementById('edit-medida').value = medidaExibicao;
    
    const selectTipo = document.getElementById('edit-tipo');
    if (selectTipo) {
        selectTipo.value = unidadeOriginal;
    }
    
    const dataIso = new Date(produto.validade).toISOString().split('T')[0];
    document.getElementById('edit-validade').value = dataIso;

    document.getElementById('modalEditar').style.display = 'flex';
}

function fecharModalEditar() {
    document.getElementById('modalEditar').style.display = 'none';
}

async function salvarEdicaoProduto(event) {
    event.preventDefault();
    const id = document.getElementById('edit-id').value;

    const qtdEmbalagens = parseFloat(document.getElementById('edit-qtd-embalagens').value.toString().replace(',', '.'));
    const medidaValor = parseFloat(document.getElementById('edit-medida').value.toString().replace(',', '.'));
    let unidadeOriginal = document.getElementById('edit-tipo').value.toLowerCase().trim();

    if (isNaN(qtdEmbalagens) || isNaN(medidaValor)) {
        alert("Por favor, insira valores numéricos válidos.");
        return;
    }

    if (unidadeOriginal.includes('(')) {
        const match = unidadeOriginal.match(/\(([^)]+)\)/);
        unidadeOriginal = match ? match[1] : 'un';
    }

    let medidaBase = (unidadeOriginal === 'un') ? medidaValor : ((unidadeOriginal === 'kg' || unidadeOriginal === 'l') ? medidaValor * 1000 : medidaValor);
    let category = (unidadeOriginal === 'un') ? 'unidade' : ((unidadeOriginal === 'g' || unidadeOriginal === 'kg') ? 'peso' : 'volume');

    const dadosAtualizados = {
        nome: document.getElementById('edit-nome').value,
        marca: document.getElementById('edit-marca').value,
        medida_unitaria: medidaBase,
        qtd_estoque: parseFloat((qtdEmbalagens * medidaBase).toFixed(4)),
        qtdtotal_cadastrada: qtdEmbalagens,
        tipo: `${category} (${unidadeOriginal})`,
        validade: document.getElementById('edit-validade').value
    };

    try {
        const resposta = await fetch(`${URL_API}/estoque/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dadosAtualizados)
        });

        const resultado = await resposta.json();

        if (resposta.ok) {
            fecharModalEditar();
            await carregarDadosDoBanco();
        } else {
            alert(resultado.mensagem || "Erro ao salvar alterações.");
        }
    } catch (erro) {
        console.error(erro);
        alert("Erro de conexão com o servidor ao editar.");
    }
}

async function registrarConsumo(id) {
    const inputUso = document.getElementById(`valor-uso-${id}`);
    const tipoUso = document.getElementById(`tipo-uso-${id}`).value;
    const valorInput = parseFloat(inputUso.value.toString().replace(',', '.')) || 0;
    const produto = estoque.find(p => p.id === id);

    if (!produto || valorInput <= 0) return;
    
    let qtdSubtrairRaw = (tipoUso === 'un') ? valorInput : ((tipoUso === 'kg' || tipoUso === 'l') ? valorInput * 1000 : valorInput);

    const estoqueAtualPreciso = parseFloat(parseFloat(produto.qtd_estoque).toFixed(4));
    const qtdSubtrairPreciso = parseFloat(qtdSubtrairRaw.toFixed(4));

    if (qtdSubtrairPreciso > estoqueAtualPreciso) {
        alert("Quantidade insuficiente!");
        return;
    }

    let calculoNovoVolume = parseFloat((estoqueAtualPreciso - qtdSubtrairPreciso).toFixed(4));
    if (calculoNovoVolume <= 0.001) {
        calculoNovoVolume = 0;
    }

    try {
        const resposta = await fetch(`${URL_API}/consumo`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                usuario_id: usuarioLogado.id,
                produto_id: id,
                nome: produto.nome,
                quantidade_usada: `${valorInput}${tipoUso}`,
                novo_volume: calculoNovoVolume
            })
        });

        if (resposta.ok) {
            await carregarDadosDoBanco();
        } else {
            alert("Erro ao registrar o consumo na API.");
        }
    } catch (erro) {
        console.error("Erro na requisição de consumo:", erro);
    }
}

function formatarExibicao(valor, categoria) {
    const n = parseFloat(valor);
    if (categoria === 'volume') {
        return n >= 1000 ? `${(n / 1000).toFixed(2)}l` : `${n.toFixed(1)}ml`;
    }
    if (categoria === 'peso') {
        return n >= 1000 ? `${(n / 1000).toFixed(2)}kg` : `${n.toFixed(1)}g`;
    }
    return `${Math.ceil(n)} un`;
}

function desenharPainel() {
    const lista = document.getElementById('lista-estoque');
    if (!lista) return;
    lista.innerHTML = '';
    const hoje = new Date().toISOString().split('T')[0];
    
    const ativos = estoque.filter(p => parseFloat(p.qtd_estoque) > 0.001);

    ativos.forEach(p => {
        const vTotal = parseFloat(p.qtd_estoque);
        const mUnitaria = parseFloat(p.medida_unitaria);
        const categoria = p.tipo.split(' ')[0];
        const formatado = formatarExibicao(vTotal, categoria);
        const dataIso = new Date(p.validade).toISOString().split('T')[0];
        const div = document.createElement('div');
        div.className = `item-produto ${dataIso < hoje ? 'status-vencido' : ''}`;
        const qtdEmbalagens = (vTotal / mUnitaria).toFixed(1);

        const matchUnidade = p.tipo.match(/\(([^)]+)\)/);
        const unidadeOriginal = matchUnidade ? matchUnidade[1] : 'un';

        let opcoesMedida = '';
        if (categoria === 'unidade') {
            opcoesMedida = `<option value="un" ${unidadeOriginal === 'un' ? 'selected' : ''}>un</option>`;
        } else if (categoria === 'peso') {
            opcoesMedida = `
                <option value="g" ${unidadeOriginal === 'g' ? 'selected' : ''}>g</option>
                <option value="kg" ${unidadeOriginal === 'kg' ? 'selected' : ''}>kg</option>`;
        } else if (categoria === 'volume') {
            opcoesMedida = `
                <option value="ml" ${unidadeOriginal === 'ml' ? 'selected' : ''}>ml</option>
                <option value="l" ${unidadeOriginal === 'l' ? 'selected' : ''}>l</option>`;
        }

        div.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <strong>${dataIso < hoje ? '⚠️' : ''} ${p.nome} (${p.marca})</strong>
                <div>
                    <button class="btn-editar" style="background:none; border:none; cursor:pointer;" onclick="abrirModalEditar(${p.id})">✏️</button>
                    <button class="btn-deletar" onclick="excluirProduto(${p.id})">×</button>
                </div>
            </div>
            <div style="font-size: 0.8em; margin: 4px 0; opacity: 0.8;">Validade: ${new Date(p.validade).toLocaleDateString('pt-BR', {timeZone: 'UTC'})}</div>
            <div style="background: rgba(128,128,128,0.1); padding: 8px; border-radius: 4px; font-size: 0.85em; margin-top: 6px;">
                Estoque: <strong>${formatado}</strong> | Embalagens: <strong>${qtdEmbalagens}</strong>
            </div>
            <div class="controles-uso">
                <input type="number" id="valor-uso-${p.id}" placeholder="0" step="any">
                <select id="tipo-uso-${p.id}">
                    ${opcoesMedida}
                </select>
                <button class="btn-baixar" onclick="registrarConsumo(${p.id})">BAIXAR</button>
            </div>
        `;
        lista.appendChild(div);
    });
    atualizarGrafico(ativos);
}

async function excluirProduto(id) { if (confirm("Remover?")) { await fetch(`${URL_API}/estoque/${id}`, { method: 'DELETE' }); carregarDadosDoBanco(); } }
async function excluirItemHistorico(id) { if (confirm("Excluir registro?")) { await fetch(`${URL_API}/historico/${id}`, { method: 'DELETE' }); carregarDadosDoBanco(); } }

function desenharHistorico() {
    const lista = document.getElementById('lista-historico');
    if (!lista) return;
    
    lista.innerHTML = historicoUso.map(h => {
        const timestamp = h.data_uso || h.data_cadastro || h.data;
        const dataExibicao = timestamp ? new Date(timestamp).toLocaleString() : "Data indefinida";
        const nomeProduto = h.produto_nome || h.nome;
        
        return `
            <div class="item-historico">
                <div><small>${dataExibicao}</small><br>
                <strong>${h.quantidade_usada}</strong> de ${nomeProduto}</div>
                <button class="btn-deletar" onclick="excluirItemHistorico(${h.id})">🗑️</button>
            </div>
        `;
    }).join('');
}

function gerarPaletaCores(quantidade) {
    const cores = [];
    for (let i = 0; i < quantidade; i++) {
        const hue = (i * (360 / Math.max(quantidade, 1))) % 360;
        cores.push(`hsl(${hue}, 65%, 55%)`);
    }
    return cores;
}

function atualizarGrafico(dados) {
    const canvas = document.getElementById('graficoEstoque');
    const container = document.getElementById('container-grafico');
    if (!canvas || !dados.length) { if(container) container.style.display = 'none'; return; }
    container.style.display = 'block';
    if (graficoInstancia) graficoInstancia.destroy();
    
    const totalEstoque = dados.reduce((acumulador, p) => acumulador + (p.qtd_estoque / p.medida_unitaria), 0);
    const coresDinamicadas = gerarPaletaCores(dados.length);

    graficoInstancia = new Chart(canvas.getContext('2d'), {
        type: 'pie',
        data: {
            labels: dados.map(p => p.nome),
            datasets: [{
                data: dados.map(p => (p.qtd_estoque / p.medida_unitaria).toFixed(2)),
                backgroundColor: coresDinamicadas,
                borderWidth: 1,
                borderColor: document.body.classList.contains('dark-mode') ? '#1e293b' : '#ffffff'
            }]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false, 
            plugins: { 
                legend: { 
                    display: true, 
                    position: 'bottom',
                    labels: {
                        color: document.body.classList.contains('dark-mode') ? '#ffffff' : '#333333',
                        boxWidth: 12,
                        padding: 15
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const valorAtual = parseFloat(context.raw);
                            const porcentagem = totalEstoque > 0 ? ((valorAtual / totalEstoque) * 100).toFixed(1) : 0;
                            return `${label}: ${porcentagem}% (${valorAtual} emb.)`;
                        }
                    }
                }
            } 
        }
    });
}