// Configuração do Firebase (Substitua pelos seus dados do console)
const firebaseConfig = {
  apiKey: "AIzaSyCf9dOhNw-uB_5vp1z8U0MVfLbtjCV1N54",
  authDomain: "carlog-5be41.firebaseapp.com",
  projectId: "carlog-5be41",
  storageBucket: "carlog-5be41.firebasestorage.app",
  messagingSenderId: "349944380532",
  appId: "1:349944380532:web:a726794cf6125c16e52521",
  measurementId: "G-2GBYV5CSX2"
};



// Inicializa Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Estado da Aplicação
let veiculos = JSON.parse(localStorage.getItem('veiculos')) || [];
let entradas = JSON.parse(localStorage.getItem('entradas')) || [];
let editandoId = null;
let filtrosAtivos = ['abastecimento', 'manutencao', 'despesa'];
let usuarioAtual = null;

// Inicialização
/**
 * Ponto de entrada da aplicação. Configura os listeners dos formulários 
 * e decide qual seção exibir com base na existência de veículos.
 */
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('form-novo-veiculo').onsubmit = addVeiculo;
  document.getElementById('form-entrada').onsubmit = addEntrada;

  // Inicializa o tema salvo no localStorage
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'dark') {
    document.body.classList.add('dark-mode');
    document.getElementById('btn-theme-toggle').textContent = '☀️';
  }

  // Listener de Autenticação
  auth.onAuthStateChanged(user => {
    usuarioAtual = user;
    gerenciarUIAuntenticacao(user);
    if (user) {
      sincronizarComNuvem();
    }
  });

  if (veiculos.length > 0) {
    inicializarDatasFiltro();
    showSection('section-registro');
  } else {
    showSection('section-veiculos');
  }
});

// Funções de Autenticação
/**
 * Inicia o fluxo de login com o Google.
 */
function loginGoogle() {
  const provider = new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(provider);
}

/**
 * Faz o logout do usuário.
 */
function logout() {
  if (confirm('Tem certeza que deseja sair da sua conta?')) {
    auth.signOut();
    location.reload(); // Recarrega para limpar estado e voltar ao local
  }
}

/**
 * Atualiza os elementos de UI baseados no login.
 */
function gerenciarUIAuntenticacao(user) {
  const btnLogin = document.getElementById('btn-login');
  const userInfo = document.getElementById('user-info');
  const userPhoto = document.getElementById('user-photo');

  if (user) {
    btnLogin.style.display = 'none';
    userInfo.style.display = 'flex';
    userPhoto.src = user.photoURL;
  } else {
    btnLogin.style.display = 'block';
    userInfo.style.display = 'none';
  }
}

/**
 * Baixa os dados da nuvem e realiza uma mesclagem (merge) com os dados locais
 * para evitar perda de informações criadas offline ou em outros dispositivos.
 * @param {boolean} manual - Indica se a sincronização foi disparada manualmente pelo usuário.
 */
async function sincronizarComNuvem(manual = false) {
  if (!usuarioAtual) return;
  if (manual) document.getElementById('btn-sync').textContent = 'Sincronizando...';

  try {
    const doc = await db.collection('carlog').doc(usuarioAtual.uid).get();
    if (doc.exists) {
      const data = doc.data();

      // Mescla os arrays comparando IDs para não sobrescrever dados novos de outros dispositivos
      // nem perder o que foi criado localmente enquanto estava offline.
      veiculos = mesclarArraysPorId(veiculos, data.veiculos || []);
      entradas = mesclarArraysPorId(entradas, data.entradas || []);

      salvarESincronizar(); // Atualiza localmente e envia a versão mesclada para a nuvem
    } else if (veiculos.length > 0 || entradas.length > 0) {
      // Caso o usuário tenha dados locais mas nenhum na nuvem (ex: primeiro login após uso offline)
      salvarESincronizar();
    }
  } catch (error) {
    console.error("Erro ao sincronizar com nuvem:", error);
  }

  if (manual) {
    document.getElementById('btn-sync').textContent = 'Sincronizar';
    alert('Dados sincronizados com a nuvem!');
  }
}

/**
 * Auxiliar para mesclar dois arrays de objetos usando o 'id' como chave única.
 * Prioriza os dados remotos para itens com mesmo ID, mas mantém itens exclusivos de ambos.
 * @param {Array} local - Dados atuais na memória do dispositivo.
 * @param {Array} remoto - Dados vindos do Firestore.
 * @returns {Array} Array mesclado.
 */
function mesclarArraysPorId(local, remoto) {
  const mapa = new Map();
  const diasLimite = 30;
  const limiteMs = Date.now() - (diasLimite * 24 * 60 * 60 * 1000);

  // 1. Priorizamos os dados que estão na nuvem (remoto)
  remoto.forEach(item => mapa.set(item.id, item));

  // 2. Analisamos os dados locais para complementar
  local.forEach(itemLocal => {
    const itemRemoto = mapa.get(itemLocal.id);

    if (itemRemoto) {
      // Se existe em ambos, vence o que foi atualizado por último
      if ((itemLocal.atualizadoEm || 0) > (itemRemoto.atualizadoEm || 0)) {
        mapa.set(itemLocal.id, itemLocal);
      }
    } else {
      // O item existe localmente mas NÃO existe na nuvem.
      // Decidimos se devemos mantê-lo ou se ele é um "zumbi" que foi purgado:
      const ehExclusaoAntiga = itemLocal.excluido && (itemLocal.atualizadoEm || 0) < limiteMs;

      if (!ehExclusaoAntiga) {
        mapa.set(itemLocal.id, itemLocal);
      }
    }
  });
  return Array.from(mapa.values());
}

/**
 * Alterna entre modo claro e modo escuro e salva a preferência.
 */
function toggleTheme() {
  const isDark = document.body.classList.toggle('dark-mode');
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
  document.getElementById('btn-theme-toggle').textContent = isDark ? '☀️' : '🌙';
}

// Navegação Simples
/**
 * Gerencia a troca de seções (abas) da aplicação.
 * Limpa e prepara o formulário de registro se a seção de cadastro for ativada.
 * @param {string} id - O ID da seção a ser exibida.
 */
function showSection(id) {
  // Garante que a UI (selects, cards) esteja atualizada antes de configurar a seção,
  // pois a lógica de "Novo Registro" depende dos selects já populados.
  atualizarUI();

  if (id === 'section-registro') {
    const statusEl = document.getElementById('registro-status');
    const veiculoSelect = document.getElementById('entrada-veiculo');
    const tipoSelect = document.getElementById('entrada-tipo');
    if (!editandoId) {
      document.getElementById('form-entrada').reset();
      document.querySelector('#form-entrada button[type="submit"]').textContent = 'Salvar';
      const hoje = new Date().toISOString().split('T')[0];
      document.getElementById('entrada-data').value = hoje;
      toggleTipoCampos();
      statusEl.textContent = 'Novo';
      statusEl.className = 'status-badge';
      buscarUltimoKm();
    } else {
      statusEl.textContent = 'Editando';
      statusEl.className = 'status-badge edit';
    }
    veiculoSelect.disabled = editandoId !== null || veiculos.length <= 1;
    tipoSelect.disabled = editandoId !== null;
  }

  document.querySelectorAll('main > section').forEach(s => s.style.display = 'none');
  document.getElementById(id).style.display = 'block';
}

// Função para cancelar a edição e iniciar um novo registro
/**
 * Reseta o estado de edição global e limpa o formulário de entrada,
 * voltando para o modo "Novo Registro".
 */
function cancelEdit() {
  editandoId = null;
  document.getElementById('form-entrada').reset();
  document.querySelector('#form-entrada button[type="submit"]').textContent = 'Salvar';
  const hoje = new Date().toISOString().split('T')[0];
  document.getElementById('entrada-data').value = hoje;
  document.getElementById('entrada-veiculo').disabled = veiculos.length <= 1;
  document.getElementById('entrada-tipo').disabled = false;
  buscarUltimoKm();
  toggleTipoCampos();
  const statusEl = document.getElementById('registro-status');
  statusEl.textContent = 'Novo';
  statusEl.className = 'status-badge';
}

/**
 * Alterna a visibilidade do formulário de cadastro de novo veículo.
 */
function toggleFormVeiculo() {
  const form = document.getElementById('form-novo-veiculo');
  const cards = document.getElementById('lista-veiculos-cards');
  if (form.style.display === 'none') {
    form.style.display = 'flex';
    cards.style.display = 'none';
  } else {
    form.style.display = 'none';
    cards.style.display = 'grid';
  }
}

/**
 * Move um veículo para cima ou para baixo no array de ordem.
 * @param {number} id - ID do veículo.
 * @param {number} direcao - -1 para subir, 1 para descer.
 */
function moverVeiculo(id, direcao) {
  const index = veiculos.findIndex(v => v.id === id);
  if (index === -1) return;

  // Encontra o próximo índice de um veículo não excluído naquela direção
  let novoIndex = index + direcao;
  while (novoIndex >= 0 && novoIndex < veiculos.length && veiculos[novoIndex].excluido) {
    novoIndex += direcao;
  }

  if (novoIndex < 0 || novoIndex >= veiculos.length) return;

  // Troca as posições no array
  const temp = veiculos[index];
  veiculos[index] = veiculos[novoIndex];
  veiculos[novoIndex] = temp;

  // Atualiza o timestamp para que a nova ordem seja refletida no merge entre dispositivos
  const agora = Date.now();
  veiculos[index].atualizadoEm = agora;
  veiculos[novoIndex].atualizadoEm = agora;

  salvarESincronizar();
}

// Lógica de Veículos
/**
 * Captura os dados do formulário de veículos e salva no LocalStorage.
 * @param {Event} e - Evento de submit do formulário.
 */
function addVeiculo(e) {
  e.preventDefault();
  const agora = Date.now();
  const veiculo = {
    id: agora,
    atualizadoEm: agora,
    nome: document.getElementById('veiculo-nome').value,
    placa: document.getElementById('veiculo-placa').value
  };
  veiculos.push(veiculo);
  salvarESincronizar();
  e.target.reset();
  toggleFormVeiculo();
}

/**
 * Remove um veículo e todas as entradas de gastos associadas a ele.
 * Solicita confirmação antes de realizar a exclusão em cascata.
 * @param {number} id - ID do veículo a ser removido.
 */
function deleteVeiculo(id) {
  if (confirm('Tem certeza que deseja excluir este veículo? Todas as entradas de gastos associadas a ele também serão apagadas permanentemente.')) {
    const agora = Date.now();
    // Marcar como excluído em vez de remover para sincronizar a deleção
    veiculos = veiculos.map(v => v.id === id ? { ...v, excluido: true, atualizadoEm: agora } : v);
    entradas = entradas.map(e => e.veiculoId === id ? { ...e, excluido: true, atualizadoEm: agora } : e);
    salvarESincronizar();
  }
}

/**
 * Atalho para navegar até a tela de registro já selecionando um veículo específico.
 * @param {number} veiculoId - ID do veículo.
 */
function irPararegistros(veiculoId) {
  cancelEdit(); // Garante que o formulário esteja limpo e em modo "Novo"
  showSection('section-registro');
  document.getElementById('entrada-veiculo').value = veiculoId;
}

/**
 * Atalho para navegar até a tela de relatórios já filtrando por um veículo específico.
 * @param {number} veiculoId - ID do veículo.
 */
function irParaRelatorios(veiculoId) {
  showSection('section-lista');
  document.getElementById('filtro-veiculo').value = veiculoId;
  renderizarLista();
}

/**
 * Inicializa os campos de filtro de data com o registro mais antigo e o mais novo.
 */
function inicializarDatasFiltro() {
  const inicioInput = document.getElementById('filtro-data-inicio');
  const fimInput = document.getElementById('filtro-data-fim');

  // Consideramos todos os registros (incluindo excluídos) para definir o limite do calendário.
  // Isso evita que registros na lixeira fiquem "escondidos" fora do intervalo automático.
  if (entradas.length === 0) {
    inicioInput.value = "";
    fimInput.value = "";
    return;
  }

  const datas = entradas.map(e => e.data).sort();
  inicioInput.value = datas[0];
  fimInput.value = datas[datas.length - 1];
}

/**
 * Reseta todos os filtros do histórico para o estado inicial.
 */
function resetarFiltros() {
  if (veiculos.length > 1) {
    document.getElementById('filtro-veiculo').value = "";
  }
  filtrosAtivos = ['abastecimento', 'manutencao', 'despesa'];
  document.querySelectorAll('.filtro-btn').forEach(btn => {
    if (btn.dataset.tipo === 'excluido') {
      btn.classList.remove('active');
    } else {
      btn.classList.add('active');
    }
  });
  inicializarDatasFiltro();
  renderizarLista();
}

/**
 * Busca o último KM registrado para um veículo específico até uma determinada data.
 * É utilizado para sugerir o KM atual no preenchimento de novos registros.
 * Ordena por data (desc) e KM (desc) para encontrar o valor mais coerente.
 */
function buscarUltimoKm() {
  if (editandoId) return;

  const vSelect = document.getElementById('entrada-veiculo');
  const dInput = document.getElementById('entrada-data');
  const kmInput = document.getElementById('entrada-km');
  const hintData = document.getElementById('hint-data');
  const hintKm = document.getElementById('hint-km');
  const tipo = document.getElementById('entrada-tipo').value;

  const veiculoId = parseInt(vSelect.value);
  const dataSelecionada = dInput.value;

  // Limpa os textos informativos
  hintData.textContent = "";
  hintKm.textContent = "";

  if (!veiculoId || !dataSelecionada) return;

  // Busca registros de abastecimento ou manutenção anteriores para as dicas
  const anteriores = entradas.filter(e =>
    !e.excluido &&
    e.veiculoId === veiculoId &&
    e.data <= dataSelecionada &&
    (e.tipo === 'abastecimento' || e.tipo === 'manutencao')
  );

  if (anteriores.length > 0) {
    anteriores.sort((a, b) => a.data !== b.data ? b.data.localeCompare(a.data) : b.km - a.km);
    const ultimo = anteriores[0];

    // Sugestão automática de KM
    kmInput.value = formatar(ultimo.km, 0);

    // Formata a data para o padrão brasileiro DD/MM/AA
    const [ano, mes, dia] = ultimo.data.split('-');
    const dataFormatada = `${dia}/${mes}/${ano.slice(-2)}`;

    // Exibe os textos apenas para tipos relevantes
    if (tipo !== 'despesa') {
      hintData.textContent = `Anterior: ${dataFormatada}`;
      hintKm.textContent = `Anterior: ${formatar(ultimo.km, 0)} km`;
    }
  } else {
    kmInput.value = "";
  }
}

/**
 * Gerencia o estado dos filtros de categoria (Abastecimento, Manutenção, Despesa)
 * no histórico, garantindo que pelo menos um filtro permaneça ativo.
 * @param {HTMLElement} btn - O botão de filtro clicado.
 */
function toggleFiltro(btn) {
  const tipo = btn.dataset.tipo;
  if (filtrosAtivos.includes(tipo)) {
    if (filtrosAtivos.length > 1) {
      filtrosAtivos = filtrosAtivos.filter(t => t !== tipo);
      btn.classList.remove('active');
    }
  } else {
    filtrosAtivos.push(tipo);
    btn.classList.add('active');
  }
  renderizarLista();
}

/**
 * Expande ou recolhe a seção de detalhes de um card no histórico de gastos.
 * @param {number} id - ID da entrada de gasto.
 */
function toggleDetalhes(id) {
  const el = document.getElementById(`detalhes-${id}`);
  const isVisible = el.style.display === 'block';
  el.style.display = isVisible ? 'none' : 'block';
}

// Lógica de Entradas
/**
 * Exibe os campos de formulário específicos para o tipo de gasto selecionado 
 * (ex: campos de litros para abastecimento).
 */
function toggleTipoCampos() {
  const tipo = document.getElementById('entrada-tipo').value;
  document.querySelectorAll('.tipo-especifico').forEach(d => d.style.display = 'none');
  document.getElementById(`campos-${tipo}`).style.display = 'flex';
}

// Auxiliares para Máscara e Conversão
/**
 * Converte uma string formatada em moeda brasileira (1.234,56) para float (1234.56).
 * @param {string} str - Valor formatado.
 * @returns {number} Valor numérico pronto para cálculos.
 */
function parseFormattedFloat(str) {
  if (!str) return 0;
  return parseFloat(String(str).replace(/\./g, '').replace(',', '.')) || 0;
}

/**
 * Formata um número para o padrão de string brasileiro com casas decimais fixas.
 * @param {number} valor - O número a ser formatado.
 * @param {number} casas - Número de casas decimais.
 * @returns {string} String formatada (ex: 1.500,00).
 */
function formatar(valor, casas) {
  return valor.toLocaleString('pt-BR', {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas
  });
}

/**
 * Aplica máscara numérica em tempo real no input (ex: 0,00 -> 0,01).
 * @param {HTMLInputElement} el - O elemento input.
 * @param {number} casas - Quantidade de decimais da máscara.
 */
function aplicarMascara(el, casas = 2) {
  let value = el.value.replace(/\D/g, '');
  if (value === '') return;

  let numberValue;
  if (casas === 0) {
    numberValue = parseInt(value);
  } else {
    numberValue = parseFloat(value) / Math.pow(10, casas);
  }
  el.value = formatar(numberValue, casas);
}

// Cálculo Automático de Abastecimento
/**
 * Realiza o cálculo automático entre Litros, Preço por Litro e Total.
 * Se litros e preço são fornecidos, calcula o total.
 * Se total e litros são fornecidos, recalcula o preço unitário.
 * @param {string} origem - Identifica qual campo disparou o cálculo.
 */
function calcAbastecimento(origem) {
  const litros = parseFormattedFloat(document.getElementById('abs-litros').value);
  const precoL = parseFormattedFloat(document.getElementById('abs-preco-litro').value);
  const total = parseFormattedFloat(document.getElementById('abs-total').value);

  if (origem === 'litros' || origem === 'preco') {
    if (litros > 0 && precoL > 0) {
      document.getElementById('abs-total').value = formatar(litros * precoL, 2);
    }
  } else if (origem === 'total') {
    if (total > 0 && litros > 0) {
      document.getElementById('abs-preco-litro').value = formatar(total / litros, 2);
    }
  }
}

/**
 * Carrega os dados de um registro existente no formulário para edição.
 * Desabilita campos que não podem ser alterados (veículo/tipo).
 * @param {number} id - ID da entrada a ser editada.
 */
function editEntrada(id) {
  const entrada = entradas.find(e => e.id === id);
  if (!entrada) return;

  editandoId = id;
  showSection('section-registro');

  document.getElementById('entrada-veiculo').value = entrada.veiculoId;
  document.getElementById('entrada-tipo').value = entrada.tipo;
  document.getElementById('entrada-data').value = entrada.data;
  document.getElementById('entrada-km').value = formatar(entrada.km, 0);
  document.getElementById('entrada-obs').value = entrada.obs;

  toggleTipoCampos();

  if (entrada.tipo === 'abastecimento') {
    document.getElementById('abs-local').value = entrada.detalhes.local;
    document.getElementById('abs-combustivel').value = entrada.detalhes.combustivel;
    document.getElementById('abs-litros').value = formatar(entrada.detalhes.litros, 3);
    document.getElementById('abs-preco-litro').value = formatar(entrada.detalhes.precoL, 2);
    document.getElementById('abs-total').value = formatar(entrada.valorTotal, 2);
  } else if (entrada.tipo === 'manutencao') {
    document.getElementById('man-local').value = entrada.detalhes.local;
    document.getElementById('man-pecas').value = formatar(entrada.detalhes.pecas, 2);
    document.getElementById('man-mao-obra').value = formatar(entrada.detalhes.mo, 2);
  } else if (entrada.tipo === 'despesa') {
    document.getElementById('imp-nome').value = entrada.detalhes.nome;
    document.getElementById('imp-referencia').value = entrada.detalhes.ref;
    document.getElementById('imp-valor').value = formatar(entrada.valorTotal, 2);
  }

  document.querySelector('#form-entrada button[type="submit"]').textContent = 'Atualizar';
}

/**
 * Processa o salvamento (criação ou atualização) de um registro de gasto.
 * Consolida dados gerais e específicos por tipo antes de persistir.
 * @param {Event} e - Evento de submit do formulário.
 */
function addEntrada(e) {
  e.preventDefault();
  const tipo = document.getElementById('entrada-tipo').value;
  let valorFinal = 0;

  // Captura o ID do veículo selecionado antes do reset do formulário
  const currentSelectedVeiculoId = parseInt(document.getElementById('entrada-veiculo').value);
  const currentSelectedTipo = tipo;

  const agora = Date.now();
  const entrada = {
    id: agora,
    atualizadoEm: agora,
    veiculoId: parseInt(document.getElementById('entrada-veiculo').value),
    tipo: tipo,
    data: document.getElementById('entrada-data').value,
    km: parseFormattedFloat(document.getElementById('entrada-km').value),
    obs: document.getElementById('entrada-obs').value
  };

  // Campos específicos e cálculo de valor total por tipo
  if (tipo === 'abastecimento') {
    entrada.detalhes = {
      local: document.getElementById('abs-local').value,
      combustivel: document.getElementById('abs-combustivel').value,
      litros: parseFormattedFloat(document.getElementById('abs-litros').value),
      precoL: parseFormattedFloat(document.getElementById('abs-preco-litro').value)
    };
    valorFinal = parseFormattedFloat(document.getElementById('abs-total').value);
  } else if (tipo === 'manutencao') {
    const pecas = parseFormattedFloat(document.getElementById('man-pecas').value);
    const mo = parseFormattedFloat(document.getElementById('man-mao-obra').value);
    entrada.detalhes = { local: document.getElementById('man-local').value, pecas, mo };
    valorFinal = pecas + mo;
  } else {
    entrada.detalhes = { nome: document.getElementById('imp-nome').value, ref: document.getElementById('imp-referencia').value };
    valorFinal = parseFormattedFloat(document.getElementById('imp-valor').value);
  }

  entrada.valorTotal = valorFinal;

  const isEdit = !!editandoId;
  if (isEdit) {
    const index = entradas.findIndex(e => e.id === editandoId);
    entrada.id = editandoId; // Mantém o ID original
    entradas[index] = entrada;
    editandoId = null;
    document.getElementById('entrada-veiculo').disabled = false;
    document.getElementById('entrada-tipo').disabled = false;
    document.querySelector('#form-entrada button[type="submit"]').textContent = 'Salvar';
    const statusEl = document.getElementById('registro-status');
    statusEl.textContent = 'Novo';
    statusEl.className = 'status-badge';
  } else {
    entradas.push(entrada);
  }

  salvarESincronizar();
  e.target.reset();

  // Re-seleciona o veículo que estava ativo antes do reset
  const veiculoSelect = document.getElementById('entrada-veiculo');
  veiculoSelect.value = currentSelectedVeiculoId;

  // Re-seleciona o tipo de gasto que estava ativo
  document.getElementById('entrada-tipo').value = currentSelectedTipo;

  // Garante que os campos específicos corretos sejam exibidos após o reset do formulário
  toggleTipoCampos();

  // Restaura a data para hoje (o reset a limpa)
  const hoje = new Date().toISOString().split('T')[0];
  document.getElementById('entrada-data').value = hoje;

  buscarUltimoKm(); // Atualiza o KM sugerido para o veículo re-selecionado
  alert(isEdit ? 'Registro atualizado com sucesso!' : 'Entrada salva com sucesso!');
}

// Persistência e Renderização
/**
 * Salva os estados atuais de veículos e entradas no LocalStorage
 * e dispara a atualização da interface.
 */
function salvarESincronizar() {
  localStorage.setItem('veiculos', JSON.stringify(veiculos));
  localStorage.setItem('entradas', JSON.stringify(entradas));

  // Se logado, envia para o Firestore
  if (usuarioAtual) {
    db.collection('carlog').doc(usuarioAtual.uid).set({
      veiculos, entradas, ultimaSinc: new Date().toISOString()
    }).catch(err => console.error("Erro ao sincronizar nuvem:", err));
  }
  atualizarUI();
}

/**
 * Exporta os registros de um veículo específico no formato JSON.
 * @param {number} veiculoId - ID do veículo.
 */
function exportarDados(veiculoId) {
  const veiculo = veiculos.find(v => v.id === veiculoId);
  if (!veiculo) return;

  const registrosExport = entradas.filter(e => e.veiculoId === veiculoId && !e.excluido);

  if (registrosExport.length === 0) {
    alert('Nenhum registro encontrado para exportar.');
    return;
  }

  const conteudo = JSON.stringify({ veiculo, registros: registrosExport }, null, 2);
  const blob = new Blob([conteudo], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `carlog_${veiculo.nome.replace(/\s+/g, '_').toLowerCase()}.json`;
  link.click();
}

/**
 * Importa um veículo e seus registros a partir de um arquivo JSON.
 * @param {Event} event - Evento de alteração do input de arquivo.
 */
function importarVeiculoJSON(event) {
  const arquivo = event.target.files[0];
  if (!arquivo) return;

  const leitor = new FileReader();
  leitor.onload = function (e) {
    try {
      const dados = JSON.parse(e.target.result);
      if (!dados.veiculo || !dados.registros) throw new Error("Formato inválido");

      const novoVeiculoId = Date.now();
      const agora = Date.now();
      const novoVeiculo = { ...dados.veiculo, id: novoVeiculoId, atualizadoEm: agora, excluido: false };

      const novosRegistros = dados.registros.map(reg => ({
        ...reg,
        id: reg.id + Math.floor(Math.random() * 1000), // Evita duplicidade de ID de registro
        veiculoId: novoVeiculoId,
        atualizadoEm: agora,
        excluido: false
      }));

      veiculos.push(novoVeiculo);
      entradas.push(...novosRegistros);
      salvarESincronizar();
      alert('Veículo e registros importados com sucesso!');
    } catch (err) {
      alert('Erro ao importar arquivo. Certifique-se de que é um JSON válido do CarLog.');
    }
  };
  leitor.readAsText(arquivo);
  event.target.value = ''; // Limpa o input para permitir re-importação
}

/**
 * Sincroniza os elementos globais da UI, como os menus de seleção de veículos,
 * os cartões da aba de veículos e o estado dos filtros.
 */
function atualizarUI() {
  // Atualiza os limites de data para que novos registros ou exclusões sejam refletidos nos filtros automaticamente
  inicializarDatasFiltro();

  // Atualizar selects de veículos
  const vSelect = document.getElementById('entrada-veiculo');
  const fSelect = document.getElementById('filtro-veiculo');

  // Salva os valores atuais para não resetar a seleção do usuário durante a reconstrução
  const currentV = vSelect.value;
  const currentF = fSelect.value;

  const veiculosAtivos = veiculos.filter(v => !v.excluido);

  const options = veiculosAtivos.map(v => `<option value="${v.id}">${v.nome} ${v.placa ? `(${v.placa})` : ''}</option>`).join('');

  vSelect.innerHTML = options;
  fSelect.innerHTML = (veiculos.length > 1 ? '<option value="">Todos os Veículos</option>' : '') + options;

  // Restaura a seleção se ela ainda existir nas novas opções
  if (currentV) vSelect.value = currentV;
  if (currentF) fSelect.value = currentF;

  vSelect.disabled = editandoId !== null || veiculos.length <= 1;
  fSelect.disabled = veiculos.length <= 1;

  // HTML dos cards de ação (Adicionar e Importar)
  const actionCardsHtml = `
    <div class="card-veiculo card-action" onclick="toggleFormVeiculo()">
      <strong>+ Adicionar Novo</strong>
    </div>
    <div class="card-veiculo card-action" onclick="document.getElementById('file-import').click()">
      <strong>📥 Importar (JSON)</strong>
    </div>
  `;

  // Renderizar Cards de Veículos
  const veiculosHtml = veiculosAtivos.map((v, index) => `
        <div class="card-veiculo">
            <div class="card-reorder">
                <button onclick="moverVeiculo(${v.id}, -1)" ${index === 0 ? 'disabled' : ''} aria-label="Mover para cima" title="Mover para cima">▲</button>
                <button onclick="moverVeiculo(${v.id}, 1)" ${index === veiculosAtivos.length - 1 ? 'disabled' : ''} aria-label="Mover para baixo" title="Mover para baixo">▼</button>
            </div>
            <strong>${v.nome}${v.placa ? ` (${v.placa})` : ''}</strong>
            <div class="card-shortcuts">
                <button onclick="irPararegistros(${v.id})">Registros</button>
                <button onclick="irParaRelatorios(${v.id})">Relatórios</button>
            </div>
            <div class="card-shortcuts" style="justify-content: center;">
                <button onclick="exportarDados(${v.id})">Exportar JSON</button>
            </div>
            <button class="btn-del" onclick="deleteVeiculo(${v.id})">Excluir Veículo</button>
        </div>
    `).join('');

  document.getElementById('lista-veiculos-cards').innerHTML = veiculosHtml + actionCardsHtml;

  renderizarLista();
}

/**
 * Renderiza a lista de registros (Histórico) com base nos filtros ativos de 
 * veículo e tipo de gasto. Aplica ordenação por data e KM (decrescente).
 * Constrói o HTML dos cards expansíveis dinamicamente.
 */
function renderizarLista() {
  const fVeiculo = document.getElementById('filtro-veiculo').value;
  const dInicio = document.getElementById('filtro-data-inicio').value;
  const dFim = document.getElementById('filtro-data-fim').value;

  const filtrados = entradas.filter(e => {
    const matchVeiculo = fVeiculo ? e.veiculoId == fVeiculo : true;
    const matchData = (!dInicio || e.data >= dInicio) && (!dFim || e.data <= dFim);

    // Lógica: Se o item está excluído, verifica se o filtro 'excluido' está ativo.
    // Se não está excluído, verifica se o tipo original do item está nos filtros ativos.
    const matchTipoOuExcluido = (e.excluido && filtrosAtivos.includes('excluido')) || (!e.excluido && filtrosAtivos.includes(e.tipo));

    return matchVeiculo && matchData && matchTipoOuExcluido;
  }).sort((a, b) => {
    if (a.data !== b.data) return b.data.localeCompare(a.data);
    if (a.km !== b.km) return b.km - a.km;
    return b.id - a.id;
  });

  const container = document.getElementById('lista-entradas-container');
  const icones = { abastecimento: '⛽', manutencao: '🔧', despesa: '📜' };

  container.innerHTML = filtrados.map(e => {
    const v = veiculos.find(v => v.id == e.veiculoId);
    const [ano, mes, dia] = e.data.split('-');
    const dataStr = `${dia}/${mes}/${ano.slice(-2)}`;

    let detalhesHtml = '';
    let localStr = '';

    if (e.tipo === 'abastecimento') {
      // Cálculo de Eficiência (Rendimento) - Baseado no próximo abastecimento
      let mediaHtml = '';
      if (!e.excluido) {
        // Filtra por abastecimentos subsequentes e não excluídos para o mesmo veículo
        const proximosAbastecimentos = entradas.filter(curr =>
          !curr.excluido &&
          curr.veiculoId === e.veiculoId &&
          curr.tipo === 'abastecimento' &&
          curr.km > e.km
        );

        // Encontra o abastecimento com a menor KM (o próximo mais próximo)
        let proximo = null;
        if (proximosAbastecimentos.length > 0) {
          proximo = proximosAbastecimentos.reduce((minKmEvent, currentEvent) => {
            return (!minKmEvent || currentEvent.km < minKmEvent.km) ? currentEvent : minKmEvent;
          }, null);
        }

        if (proximo && proximo.detalhes.litros > 0) {
          const deltaKm = proximo.km - e.km;
          // Garante que a distância percorrida seja positiva
          if (deltaKm > 0) {
            const rendimento = deltaKm / proximo.detalhes.litros;
            mediaHtml = `<div><strong>Média:</strong> ${formatar(rendimento, 2)} km/L</div>`;
          }
        }
      }

      localStr = e.detalhes.local || 'Posto não informado';
      detalhesHtml = `
        <div class="detalhes-grid">
          <div><strong>Combustível:</strong> ${e.detalhes.combustivel}</div>
          <div><strong>Litros:</strong> ${formatar(e.detalhes.litros, 3)}</div>
          <div><strong>Preço/L:</strong> ${formatar(e.detalhes.precoL, 2)}</div>
          ${mediaHtml}
        </div>
      `;
    } else if (e.tipo === 'manutencao') {
      localStr = e.detalhes.local || 'Oficina não informada';
      detalhesHtml = `
        <div class="detalhes-grid">
          <div><strong>Peças:</strong> R$ ${formatar(e.detalhes.pecas, 2)}</div>
          <div><strong>Mão de Obra:</strong> R$ ${formatar(e.detalhes.mo, 2)}</div>
        </div>
      `;
    } else {
      localStr = e.detalhes.nome || 'Despesa';
      detalhesHtml = `
        <div class="detalhes-grid">
          <div><strong>Referência:</strong> ${e.detalhes.ref}</div>
        </div>
      `;
    }

    return `
      <div class="entrada-card ${e.excluido ? 'excluido' : ''}">
        <div class="entrada-header" onclick="toggleDetalhes(${e.id})">
          <div class="entrada-icon">${icones[e.tipo]}</div>
          <div class="entrada-info-principal">
            <strong>${localStr}${e.excluido ? ' <small>(Excluído)</small>' : ''}</strong>
            <span>${dataStr} • ${formatar(e.km, 0)} km${veiculos.length > 1 ? ` • ${v ? v.nome : 'Excluído'}` : ''}</span>
          </div>
          <div class="entrada-valor-total">R$ ${formatar(e.valorTotal, 2)}</div>
        </div>
        <div id="detalhes-${e.id}" class="entrada-detalhes">
          ${detalhesHtml}
          ${e.obs ? `<p style="font-size: 0.85rem; color: var(--secondary); margin-bottom: 1rem;"><strong>Obs:</strong> ${e.obs}</p>` : ''}
          <div style="display: flex; gap: 0.5rem; justify-content: flex-end;">
            ${e.excluido ?
        `<button onclick="restaurarEntrada(${e.id})">Restaurar Registro</button>` :
        `<button onclick="editEntrada(${e.id})">Editar</button>
               <button class="btn-del" onclick="deleteEntrada(${e.id})">Excluir</button>`
      }
          </div>
        </div>
      </div>
    `;
  }).join('');

  if (filtrados.length === 0) {
    container.innerHTML = '<p style="text-align: center; color: var(--secondary); margin-top: 2rem;">Nenhum registro encontrado.</p>';
  }
}

/**
 * Remove uma entrada de gasto específica do histórico.
 * @param {number} id - ID da entrada.
 */
function deleteEntrada(id) {
  if (confirm('Deseja excluir este registro?')) {
    const agora = Date.now();
    entradas = entradas.map(e => e.id === id ? { ...e, excluido: true, atualizadoEm: agora } : e);
    salvarESincronizar();
  }
}

/**
 * Restaura um registro marcado como excluído.
 * @param {number} id - ID da entrada.
 */
function restaurarEntrada(id) {
  const agora = Date.now();
  entradas = entradas.map(e => e.id === id ? { ...e, excluido: false, atualizadoEm: agora } : e);
  salvarESincronizar();
  alert('Registro restaurado com sucesso!');
}

/**
 * Remove permanentemente do banco de dados os registros que foram marcados 
 * como excluídos há mais de 30 dias.
 */
function purgarRegistrosExcluidos() {
  const diasLimite = 30;
  const limiteMs = Date.now() - (diasLimite * 24 * 60 * 60 * 1000);

  const confirmacao = confirm(
    `ATENÇÃO: Isso removerá PERMANENTEMENTE todos os registros marcados como excluídos há mais de ${diasLimite} dias.\n\n` +
    `IMPORTANTE: Certifique-se de que todos os seus dispositivos foram sincronizados recentemente. Caso contrário, itens deletados em um dispositivo podem reaparecer ao sincronizar outro que ainda não recebeu a ordem de exclusão.\n\n` +
    `Deseja prosseguir com a limpeza definitiva?`
  );

  if (!confirmacao) return;

  const totalVeiculosAntes = veiculos.length;
  const totalEntradasAntes = entradas.length;

  // Filtra mantendo apenas quem NÃO está excluído OU quem foi excluído mas ainda está dentro do prazo de 30 dias
  veiculos = veiculos.filter(v => !v.excluido || (v.atualizadoEm && v.atualizadoEm > limiteMs));
  entradas = entradas.filter(e => !e.excluido || (e.atualizadoEm && e.atualizadoEm > limiteMs));

  const removidos = (totalVeiculosAntes - veiculos.length) + (totalEntradasAntes - entradas.length);

  if (removidos > 0) {
    salvarESincronizar();
    alert(`Limpeza concluída! ${removidos} registro(s) antigo(s) foi(foram) removido(s) permanentemente.`);
  } else {
    alert("Nenhum registro excluído há mais de 30 dias foi encontrado.");
  }
}
