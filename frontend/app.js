// ══════════════════════════════════════════════════════════════════
//  CVILMAP — app.js  (Versão Atualizada com Cadastros, Edição/Exclusão, Pins Bicolores, Relatórios)
// ══════════════════════════════════════════════════════════════════

const API_BASE = "https://cvilmap-api.cvilmap-cloud-bruna.workers.dev";

let authToken   = localStorage.getItem('cvilmap_token') || null;
let currentUser = JSON.parse(localStorage.getItem('cvilmap_user') || 'null');
let markers     = {};
let editingId   = null;
let editingObra = null;
let pendingLat  = null;
let pendingLng  = null;
let activeFilter = 'all';
let allObras     = [];
let relObras     = [];
let map;

// ══════════════════════════════════════════════════════════════════
//  CADASTROS (localStorage por usuário)
// ══════════════════════════════════════════════════════════════════
const PIN_COLORS = [
  { nome: 'Azul',          hex: '#3b82f6' },
  { nome: 'Laranja',       hex: '#f97316' },
  { nome: 'Roxo/Violeta',  hex: '#7c3aed' },
  { nome: 'Branco',        hex: '#ffffff' },
  { nome: 'Preto',         hex: '#171717' },
  { nome: 'Cinza',         hex: '#737373' },
  { nome: 'Marrom',        hex: '#92400e' },
  { nome: 'Bege',          hex: '#d4b896' },
  { nome: 'Rosa',          hex: '#ec4899' },
  { nome: 'Ciano',         hex: '#06b6d4' },
  { nome: 'Magenta',       hex: '#d946ef' },
  { nome: 'Turquesa',      hex: '#14b8a6' },
  { nome: 'Lilás',         hex: '#a78bfa' },
  { nome: 'Dourado',       hex: '#ca8a04' },
  { nome: 'Prata',         hex: '#a8a29e' },
];

function getCadastroKey() {
  return 'cvilmap_cadastros_' + (currentUser?.id || currentUser?.username || 'anon');
}
function getCadastros() {
  try { return JSON.parse(localStorage.getItem(getCadastroKey()) || '[]'); } catch { return []; }
}
function saveCadastros(list) {
  localStorage.setItem(getCadastroKey(), JSON.stringify(list));
}
function findCadastroByNome(nome) {
  return getCadastros().find(c => c.nome.toLowerCase() === nome.toLowerCase());
}

// ══════════════════════════════════════════════════════════════════
//  API HELPER
// ══════════════════════════════════════════════════════════════════
async function api(method, path, body = null) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
  };
  if (authToken) opts.headers['Authorization'] = `Bearer ${authToken}`;
  if (body) opts.body = JSON.stringify(body);

  const res  = await fetch(API_BASE + path, opts);
  const data = await res.json();

  if (!res.ok && res.status === 401) {
    authToken = null; currentUser = null;
    localStorage.removeItem('cvilmap_token');
    localStorage.removeItem('cvilmap_user');
    showLogin();
    throw new Error('Sessão expirada. Faça login novamente.');
  }
  return { ok: res.ok, status: res.status, data };
}

// ══════════════════════════════════════════════════════════════════
//  BOOT
// ══════════════════════════════════════════════════════════════════
(async () => {
  const loading = document.getElementById('app-loading');
  try {
    document.getElementById('app-loading-msg').textContent = 'Conectando ao banco de dados na nuvem...';
    await fetch(API_BASE + '/api/stats', {
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      cache: 'no-store'
    });
    loading.style.transition = 'opacity 0.4s';
    loading.style.opacity = '0';
    setTimeout(() => {
      loading.style.display = 'none';
      if (authToken && currentUser) {
        initApp();
      } else {
        showLogin();
      }
    }, 400);
  } catch (e) {
    document.getElementById('app-loading-msg').innerHTML =
      '❌ Erro de conexão com o servidor.<br><small style="color:#777">Verifique sua internet ou a URL no app.js</small>';
  }
})();

// ══════════════════════════════════════════════════════════════════
//  AUTH
// ══════════════════════════════════════════════════════════════════
function showLogin() {
  document.getElementById('screen-register').classList.add('gone');
  document.getElementById('app').style.display = 'none';
  const l = document.getElementById('screen-login');
  l.classList.remove('gone');
  setTimeout(() => l.classList.remove('hide'), 10);
}
function showRegister() {
  document.getElementById('screen-login').classList.add('gone');
  const r = document.getElementById('screen-register');
  r.classList.remove('gone');
  setTimeout(() => r.classList.remove('hide'), 10);
}

async function doLogin() {
  const username = document.getElementById('l-user').value.trim();
  const senha    = document.getElementById('l-pass').value;
  const errEl    = document.getElementById('login-error');
  errEl.style.display = 'none';
  const btn = document.getElementById('btn-login');
  btn.textContent = 'Autenticando...'; btn.disabled = true;
  try {
    const { ok, data } = await api('POST', '/api/login', { username, senha });
    if (!ok) { errEl.textContent = "Usuário ou senha inválidos."; errEl.style.display = 'block'; return; }
    authToken   = data.token;
    currentUser = data.user;
    localStorage.setItem('cvilmap_token', authToken);
    localStorage.setItem('cvilmap_user',  JSON.stringify(currentUser));
    document.getElementById('screen-login').classList.add('hide');
    setTimeout(initApp, 450);
  } catch (e) {
    errEl.textContent = '❌ Falha na nuvem. Verifique a internet.';
    errEl.style.display = 'block';
  } finally {
    btn.textContent = 'Entrar no Sistema'; btn.disabled = false;
  }
}

async function doRegister() {
  const nome  = document.getElementById('r-nome').value.trim();
  const cargo = document.getElementById('r-cargo').value.trim();
  const user  = document.getElementById('r-user').value.trim();
  const pass  = document.getElementById('r-pass').value;
  const pass2 = document.getElementById('r-pass2').value;
  const errEl = document.getElementById('register-error');
  const sucEl = document.getElementById('register-success');
  errEl.style.display = 'none'; sucEl.style.display = 'none';
  if (!nome || !user || !pass) { errEl.textContent = 'Preencha os campos obrigatórios.'; errEl.style.display = 'block'; return; }
  if (pass.length < 6) { errEl.textContent = 'Senha mínima: 6 caracteres.'; errEl.style.display = 'block'; return; }
  if (pass !== pass2) { errEl.textContent = 'As senhas não conferem.'; errEl.style.display = 'block'; return; }
  const btn = document.getElementById('btn-register');
  btn.textContent = 'Criando...'; btn.disabled = true;
  try {
    const { ok, data } = await api('POST', '/api/register', { username: user, senha: pass, nome, cargo });
    if (!ok) { errEl.textContent = data.error || 'Erro ao criar conta.'; errEl.style.display = 'block'; return; }
    sucEl.textContent = '✅ Conta criada! Faça login.'; sucEl.style.display = 'block';
    setTimeout(() => showLogin(), 1500);
  } catch (e) {
    errEl.textContent = '❌ Falha na conexão.'; errEl.style.display = 'block';
  } finally {
    btn.textContent = 'Criar Cadastro'; btn.disabled = false;
  }
}

document.getElementById('btn-login').addEventListener('click', doLogin);
document.getElementById('btn-register').addEventListener('click', doRegister);
['l-user','l-pass'].forEach(id =>
  document.getElementById(id).addEventListener('keydown', e => { if(e.key==='Enter') doLogin(); })
);

// ══════════════════════════════════════════════════════════════════
//  INIT APP
// ══════════════════════════════════════════════════════════════════
async function initApp() {
  const userDisplay = currentUser.nome || currentUser.username;
  document.getElementById('user-name').textContent = userDisplay;
  document.getElementById('app').style.display = 'flex';

  if (!map) {
    map = L.map('map', { center: [-12.9714, -38.5014], zoom: 12 });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; CARTO', maxZoom: 19
    }).addTo(map);
    map.on('click', onMapClick);
    setTimeout(() => document.getElementById('map-hint').classList.add('fade'), 5000);
  }

  Object.values(markers).forEach(m => map.removeLayer(m));
  markers = {};

  await loadObras('all');
  await loadStats();
  initCadastrosUI();
}

// ══════════════════════════════════════════════════════════════════
//  CARREGAR OBRAS
// ══════════════════════════════════════════════════════════════════
async function loadObras(filter = 'all', search = '') {
  const list = document.getElementById('sidebar-list');
  list.innerHTML = '<div class="sidebar-empty"><div class="sidebar-spinner"></div><p>Sincronizando nuvem...</p></div>';
  try {
    const params = new URLSearchParams();
    if (filter && filter !== 'all') params.set('status', filter);
    const { ok, data } = await api('GET', '/api/obras?' + params.toString());
    if (!ok) throw new Error(data.error);

    Object.values(markers).forEach(m => map.removeLayer(m));
    markers = {};

    let obras = data.obras || [];
    allObras = obras;
    if (search) {
      const q = search.toLowerCase();
      obras = obras.filter(o =>
        o.nome.toLowerCase().includes(q) || o.responsavel.toLowerCase().includes(q)
      );
    }

    obras.forEach(o => addMarker(o));
    renderSidebar(obras);
    setCloudStatus(true);
  } catch (e) {
    list.innerHTML = '<div class="sidebar-empty">❌ Erro de sincronização.</div>';
    setCloudStatus(false);
  }
}

async function loadStats() {
  try {
    const { ok, data } = await api('GET', '/api/stats');
    if (!ok) return;
    const s = data.stats;
    document.getElementById('s-and').textContent = s.andamento || 0;
    document.getElementById('s-con').textContent = s.concluida || 0;
    document.getElementById('s-par').textContent = s.paralisada || 0;
    document.getElementById('s-civ').textContent = s.civil || 0;
  } catch {}
}

function setCloudStatus(online) {
  const el = document.getElementById('cloud-status');
  if (el) {
    el.textContent = online ? 'Nuvem Conectada' : 'Modo Offline';
    el.style.color = online ? '#4ade80' : '#ff6666';
  }
}

// ══════════════════════════════════════════════════════════════════
//  PIN ICON BICOLOR (esquerda: cor cadastro, direita: cor status)
// ══════════════════════════════════════════════════════════════════
const STATUS_COLORS = {
  andamento:  '#eab308',
  concluida:  '#22c55e',
  paralisada: '#cc0000',
  civil:      '#cc0000'
};

function dualPinIcon(status, responsavel) {
  const statusColor = STATUS_COLORS[status] || '#eab308';
  const cadastro = findCadastroByNome(responsavel);
  const cadastroColor = cadastro ? cadastro.cor : '#555555';
  const isCivil = status === 'civil';

  return L.divIcon({
    className: '',
    html: `<div style="width:32px;height:32px;border-radius:50% 50% 50% 0;
                transform:rotate(-45deg);border:2px solid rgba(255,255,255,0.3);
                box-shadow:0 3px 12px rgba(0,0,0,0.6);
                display:flex;overflow:hidden;position:relative;">
             <div style="width:50%;height:100%;background:${cadastroColor};"></div>
             <div style="width:50%;height:100%;background:${isCivil ? 'linear-gradient(135deg,'+statusColor+' 50%,#fff 50%)' : statusColor};"></div>
             <div style="width:10px;height:10px;border-radius:50%;background:white;
                         position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) rotate(45deg);
                         opacity:0.9;"></div>
           </div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -34]
  });
}

function addMarker(o) {
  if (markers[o.id]) map.removeLayer(markers[o.id]);
  const sLabel = { andamento:'🟡 Em Andamento', concluida:'🟢 Concluída', paralisada:'🔴 Paralisada', civil:'⬤ Obra Civil' };

  const isOwner = checkOwnership(o);
  const editBtn = `<button class="popup-edit" onclick="openEdit('${o.id}')">${isOwner ? '✏️ Editar' : '👁️ Ver Detalhes'}</button>`;

  const m = L.marker([o.latitude, o.longitude], { icon: dualPinIcon(o.status, o.responsavel) })
    .addTo(map)
    .bindPopup(`
      <div class="popup-nome">${o.nome}</div>
      <div class="popup-resp">👤 ${o.responsavel}</div>
      <div style="font-size:11px;margin-bottom:7px;">${sLabel[o.status]||o.status}</div>
      ${editBtn}
    `);
  markers[o.id] = m;
}

function checkOwnership(o) {
  if (!currentUser) return false;
  return o.user_id === currentUser.id ||
         o.created_by === currentUser.username ||
         o.created_by === currentUser.id ||
         o.criado_por === currentUser.username ||
         o.criado_por === currentUser.id;
}

// ══════════════════════════════════════════════════════════════════
//  ABRIR EDIÇÃO / NOVA OBRA
// ══════════════════════════════════════════════════════════════════
window.openEdit = function(id) {
  const obra = allObras.find(o => o.id === id);
  if (!obra) return;

  editingId   = id;
  editingObra = obra;
  const isOwner = checkOwnership(obra);

  document.getElementById('modal-obra-title').textContent = isOwner ? 'Editar Obra' : 'Detalhes da Obra';
  document.getElementById('modal-coords').textContent =
    `📌 Lat: ${parseFloat(obra.latitude).toFixed(5)}  |  Lng: ${parseFloat(obra.longitude).toFixed(5)}`;
  document.getElementById('f-nome').value    = obra.nome || '';
  document.getElementById('f-resp').value    = obra.responsavel || '';
  document.getElementById('f-status').value  = obra.status || 'andamento';
  document.getElementById('f-inicio').value  = obra.data_inicio || '';
  document.getElementById('f-fim').value     = obra.data_fim || '';
  document.getElementById('f-obs').value     = obra.observacoes || '';

  // Controles de permissão
  const fields = ['f-nome','f-resp','f-status','f-inicio','f-fim','f-obs'];
  fields.forEach(fid => document.getElementById(fid).disabled = !isOwner);

  document.getElementById('btn-delete').style.display = isOwner ? 'inline-flex' : 'none';
  document.getElementById('btn-save').style.display   = isOwner ? 'inline-flex' : 'none';
  document.getElementById('owner-warning').style.display = isOwner ? 'none' : 'block';

  openOverlay('overlay-obra');
};

function onMapClick(e) {
  editingId   = null;
  editingObra = null;
  pendingLat  = e.latlng.lat;
  pendingLng  = e.latlng.lng;
  document.getElementById('modal-obra-title').textContent = 'Nova Obra';
  document.getElementById('modal-coords').textContent =
    `📌 Lat: ${pendingLat.toFixed(5)}  |  Lng: ${pendingLng.toFixed(5)}`;
  ['f-nome','f-resp','f-obs','f-inicio','f-fim'].forEach(id => {
    const el = document.getElementById(id);
    el.value = '';
    el.disabled = false;
  });
  document.getElementById('f-status').value = 'andamento';
  document.getElementById('f-status').disabled = false;
  document.getElementById('btn-delete').style.display = 'none';
  document.getElementById('btn-save').style.display = 'inline-flex';
  document.getElementById('owner-warning').style.display = 'none';
  openOverlay('overlay-obra');
}

// ══════════════════════════════════════════════════════════════════
//  SALVAR OBRA
// ══════════════════════════════════════════════════════════════════
document.getElementById('btn-save').addEventListener('click', async () => {
  const nome   = document.getElementById('f-nome').value.trim();
  const resp   = document.getElementById('f-resp').value.trim();
  const status = document.getElementById('f-status').value;
  const obs    = document.getElementById('f-obs').value.trim();
  const inicio = document.getElementById('f-inicio').value;
  const fim    = document.getElementById('f-fim').value;
  if (!nome || !resp) { showToast('⚠️ Preencha Nome e Responsável!'); return; }

  const btn = document.getElementById('btn-save');
  btn.textContent = 'Enviando...'; btn.disabled = true;
  try {
    if (editingId) {
      if (editingObra && !checkOwnership(editingObra)) {
        showToast('🔒 Você não tem permissão para editar esta obra.');
        return;
      }
      const { ok, data } = await api('PUT', `/api/obras/${editingId}`, {
        nome, responsavel: resp, status,
        data_inicio: inicio, data_fim: fim, observacoes: obs
      });
      if (!ok) throw new Error(data.error);
      showToast('✏️ Atualizado!');
    } else {
      const { ok, data } = await api('POST', '/api/obras', {
        nome, responsavel: resp, status,
        latitude: pendingLat, longitude: pendingLng,
        data_inicio: inicio, data_fim: fim, observacoes: obs
      });
      if (!ok) throw new Error(data.error);
      showToast('📍 Salvo!');
    }
    await initApp();
    closeOverlay('overlay-obra');
  } catch (e) {
    showToast('❌ Erro: ' + e.message);
  } finally {
    btn.textContent = '💾 Salvar Obra'; btn.disabled = false;
  }
});

// ══════════════════════════════════════════════════════════════════
//  EXCLUIR OBRA
// ══════════════════════════════════════════════════════════════════
document.getElementById('btn-delete').addEventListener('click', async () => {
  if (!editingId) return;
  if (editingObra && !checkOwnership(editingObra)) {
    showToast('🔒 Você não tem permissão para excluir esta obra.');
    return;
  }
  if (!confirm('Tem certeza que deseja remover esta obra?')) return;

  const btn = document.getElementById('btn-delete');
  btn.textContent = 'Removendo...'; btn.disabled = true;
  try {
    const { ok, data } = await api('DELETE', `/api/obras/${editingId}`);
    if (!ok) throw new Error(data.error || 'Erro ao remover');
    showToast('🗑️ Obra removida!');
    await initApp();
    closeOverlay('overlay-obra');
  } catch (e) {
    showToast('❌ Erro: ' + e.message);
  } finally {
    btn.textContent = '🗑 Remover'; btn.disabled = false;
  }
});

// ══════════════════════════════════════════════════════════════════
//  SIDEBAR
// ══════════════════════════════════════════════════════════════════
function renderSidebar(obras) {
  const list = document.getElementById('sidebar-list');
  if (!obras.length) {
    list.innerHTML = '<div class="sidebar-empty"><p>Nenhuma obra.</p></div>';
    return;
  }
  const sLabel = { andamento:'Em Andamento', concluida:'Concluída', paralisada:'Paralisada', civil:'Obra Civil' };
  const sEmoji = { andamento:'🟡', concluida:'🟢', paralisada:'🔴', civil:'⬤' };

  list.innerHTML = obras.map(o => {
    const cadastro = findCadastroByNome(o.responsavel);
    const cadColor = cadastro ? cadastro.cor : '#555';
    const statusColor = STATUS_COLORS[o.status] || '#eab308';
    return `
    <div class="obra-card" onclick="focusObra('${o.id}','${o.latitude}','${o.longitude}')">
      <div class="obra-card-bar-left" style="background:${cadColor}"></div>
      <div class="obra-card-bar-right" style="background:${statusColor}"></div>
      <span class="obra-data">${o.criado_em || ''}</span>
      <div class="obra-nome">${o.nome}</div>
      <div class="obra-resp">👤 ${o.responsavel}</div>
      <span class="badge ${o.status}">${sEmoji[o.status]} ${sLabel[o.status]||o.status}</span>
    </div>
    `;
  }).join('');
}

window.focusObra = function(id, lat, lng) {
  map.flyTo([parseFloat(lat), parseFloat(lng)], 15, { duration:1.2 });
  setTimeout(() => { if (markers[id]) markers[id].openPopup(); }, 1300);
};

// ══════════════════════════════════════════════════════════════════
//  FILTROS E BUSCA
// ══════════════════════════════════════════════════════════════════
document.getElementById('filter-row').addEventListener('click', e => {
  const chip = e.target.closest('.filter-chip');
  if (!chip) return;
  document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
  chip.classList.add('active');
  activeFilter = chip.dataset.filter;
  loadObras(activeFilter, document.getElementById('search-input').value.trim());
});

document.getElementById('search-input').addEventListener('input', e => {
  loadObras(activeFilter, e.target.value.trim());
});

// ══════════════════════════════════════════════════════════════════
//  CADASTROS UI
// ══════════════════════════════════════════════════════════════════
function initCadastrosUI() {
  const palette = document.getElementById('color-palette');
  palette.innerHTML = `
    <select id="cad-cor-select" class="cad-color-select" onchange="selectCadColor(this.value)">
      ${PIN_COLORS.map(c => `<option value="${c.hex}">${c.nome}</option>`).join('')}
    </select>
    <div id="cad-cor-preview" class="cad-color-preview" style="background:#3b82f6"></div>
  `;
  document.getElementById('cad-cor').value = '#3b82f6';
  renderCadastrosList();
}

window.selectCadColor = function(c) {
  document.getElementById('cad-cor').value = c;
  const preview = document.getElementById('cad-cor-preview');
  if (preview) preview.style.background = c;
  const sel = document.getElementById('cad-cor-select');
  if (sel) sel.value = c;
};

document.getElementById('btn-cadastros').addEventListener('click', () => {
  renderCadastrosList();
  openOverlay('overlay-cadastros');
});
document.getElementById('cadastros-close').addEventListener('click', () => closeOverlay('overlay-cadastros'));

document.getElementById('btn-cad-save').addEventListener('click', () => {
  const nome = document.getElementById('cad-nome').value.trim();
  const cor  = document.getElementById('cad-cor').value;
  const editId = document.getElementById('cad-editing-id').value;
  if (!nome) { showToast('⚠️ Digite um nome!'); return; }

  const list = getCadastros();
  if (editId) {
    const idx = list.findIndex(c => c.id === editId);
    if (idx >= 0) { list[idx].nome = nome; list[idx].cor = cor; }
    document.getElementById('cad-editing-id').value = '';
    document.getElementById('btn-cad-save').textContent = '➕ Adicionar';
    document.getElementById('btn-cad-cancel-edit').style.display = 'none';
  } else {
    list.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2,6), nome, cor });
  }
  saveCadastros(list);
  document.getElementById('cad-nome').value = '';
  renderCadastrosList();
  refreshMarkers();
  showToast(editId ? '✏️ Cadastro atualizado!' : '✅ Cadastro adicionado!');
});

document.getElementById('btn-cad-cancel-edit').addEventListener('click', () => {
  document.getElementById('cad-editing-id').value = '';
  document.getElementById('cad-nome').value = '';
  document.getElementById('btn-cad-save').textContent = '➕ Adicionar';
  document.getElementById('btn-cad-cancel-edit').style.display = 'none';
});

window.editCadastro = function(id) {
  const list = getCadastros();
  const c = list.find(x => x.id === id);
  if (!c) return;
  document.getElementById('cad-nome').value = c.nome;
  document.getElementById('cad-cor').value = c.cor;
  document.getElementById('cad-editing-id').value = id;
  document.getElementById('btn-cad-save').textContent = '✏️ Atualizar';
  document.getElementById('btn-cad-cancel-edit').style.display = 'inline-flex';
  selectCadColor(c.cor);
};

window.deleteCadastro = function(id) {
  if (!confirm('Excluir este cadastro?')) return;
  const list = getCadastros().filter(c => c.id !== id);
  saveCadastros(list);
  renderCadastrosList();
  refreshMarkers();
  showToast('🗑️ Cadastro excluído!');
};

function renderCadastrosList() {
  const list = getCadastros();
  const el = document.getElementById('cadastros-list');
  if (!list.length) {
    el.innerHTML = '<div style="text-align:center;color:#777;padding:16px;font-size:13px;">Nenhum cadastro ainda.</div>';
    return;
  }
  el.innerHTML = list.map(c => `
    <div class="cadastro-item">
      <div class="cadastro-color" style="background:${c.cor}"></div>
      <span class="cadastro-nome">${c.nome}</span>
      <button class="cadastro-btn-edit" onclick="editCadastro('${c.id}')">✏️</button>
      <button class="cadastro-btn-delete" onclick="deleteCadastro('${c.id}')">🗑️</button>
    </div>
  `).join('');
}

function refreshMarkers() {
  Object.values(markers).forEach(m => map.removeLayer(m));
  markers = {};
  allObras.forEach(o => addMarker(o));
  renderSidebar(allObras);
}

// ══════════════════════════════════════════════════════════════════
//  RELATÓRIO (com filtro de responsável/cadastro)
// ══════════════════════════════════════════════════════════════════
document.getElementById('btn-rel').addEventListener('click', () => {
  // Popular select de responsáveis
  const sel = document.getElementById('rel-responsavel');
  sel.innerHTML = '<option value="all">Todos (Geral)</option>';
  const resps = [...new Set(allObras.map(o => o.responsavel))];
  const cadastros = getCadastros();
  // Adicionar responsáveis das obras
  resps.forEach(r => {
    const opt = document.createElement('option');
    opt.value = r; opt.textContent = r;
    sel.appendChild(opt);
  });
  // Adicionar cadastros que não estão nas obras
  cadastros.forEach(c => {
    if (!resps.includes(c.nome)) {
      const opt = document.createElement('option');
      opt.value = c.nome; opt.textContent = c.nome;
      sel.appendChild(opt);
    }
  });
  document.getElementById('rel-preview').style.display = 'none';
  openOverlay('overlay-rel');
});

document.getElementById('rel-close').addEventListener('click', () => closeOverlay('overlay-rel'));
document.getElementById('rel-cancel').addEventListener('click', () => closeOverlay('overlay-rel'));

window.previewRel = function() {
  const inicio = document.getElementById('rel-inicio').value;
  const fim    = document.getElementById('rel-fim').value;
  const status = document.getElementById('rel-status').value;
  const resp   = document.getElementById('rel-responsavel').value;

  let filtered = [...allObras];
  if (status !== 'all') filtered = filtered.filter(o => o.status === status);
  if (resp !== 'all')   filtered = filtered.filter(o => o.responsavel === resp);
  if (inicio)           filtered = filtered.filter(o => o.data_inicio && o.data_inicio >= inicio);
  if (fim)              filtered = filtered.filter(o => o.data_fim && o.data_fim <= fim);

  relObras = filtered;
  const sLabel = { andamento:'Em Andamento', concluida:'Concluída', paralisada:'Paralisada', civil:'Obra Civil' };
  const sEmoji = { andamento:'🟡', concluida:'🟢', paralisada:'🔴', civil:'⬤' };

  const preview = document.getElementById('rel-preview');
  if (!filtered.length) {
    preview.innerHTML = '<div style="text-align:center;color:#777;padding:12px;">Nenhuma obra encontrada.</div>';
    preview.style.display = 'block';
    return;
  }

  preview.innerHTML = `
    <div class="rel-count">${filtered.length}</div>
    <div class="rel-info">obras encontradas</div>
    <div class="rel-row rel-header">
      <span>Nome</span><span>Responsável</span><span>Status</span><span>Início</span>
    </div>
    ${filtered.map(o => `
      <div class="rel-row">
        <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${o.nome}</span>
        <span style="color:#777;">${o.responsavel}</span>
        <span>${sEmoji[o.status]||''} ${sLabel[o.status]||o.status}</span>
        <span style="color:#777;">${fmtDate(o.data_inicio)}</span>
      </div>
    `).join('')}
  `;
  preview.style.display = 'block';
};

document.getElementById('btn-export').addEventListener('click', () => {
  if (!relObras.length) { previewRel(); }
  if (!relObras.length) { showToast('⚠️ Nenhum dado para exportar.'); return; }
  const sLabel = { andamento:'Em Andamento', concluida:'Concluída', paralisada:'Paralisada', civil:'Obra Civil' };
  const data = relObras.map(o => ({
    'Nome': o.nome,
    'Responsável': o.responsavel,
    'Status': sLabel[o.status] || o.status,
    'Início': o.data_inicio || '—',
    'Previsão Fim': o.data_fim || '—',
    'Observações': o.observacoes || '',
    'Criado em': o.criado_em || ''
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Relatório');
  XLSX.writeFile(wb, `relatorio_obras_${new Date().toISOString().slice(0,10)}.xlsx`);
  showToast('📥 Excel exportado!');
});

// ══════════════════════════════════════════════════════════════════
//  CEP SEARCH
// ══════════════════════════════════════════════════════════════════
document.getElementById('cep-btn').addEventListener('click', searchCep);
document.getElementById('cep-input').addEventListener('keydown', e => { if(e.key==='Enter') searchCep(); });

async function searchCep() {
  const cep = document.getElementById('cep-input').value.replace(/\D/g, '');
  const balloon = document.getElementById('cep-balloon');
  if (cep.length !== 8) { showToast('⚠️ CEP inválido!'); return; }
  balloon.innerHTML = '<div class="cep-loading"><div class="cep-spinner"></div> Buscando...</div>';
  balloon.classList.add('show');
  try {
    const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    const data = await res.json();
    if (data.erro) throw new Error('CEP não encontrado');
    // Geocode usando Nominatim
    const geoRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(data.logradouro + ' ' + data.bairro + ' ' + data.localidade + ' ' + data.uf)}&limit=1`);
    const geoData = await geoRes.json();
    if (geoData.length > 0) {
      const lat = parseFloat(geoData[0].lat);
      const lon = parseFloat(geoData[0].lon);
      balloon.innerHTML = `
        <div class="cep-addr-title">${data.logradouro || 'Endereço'}</div>
        <div class="cep-addr-detail">${data.bairro || ''} — ${data.localidade}/${data.uf}<br><strong>CEP:</strong> ${data.cep}</div>
        <div class="cep-actions">
          <button class="cep-action-btn cep-action-go" onclick="map.flyTo([${lat},${lon}],16);document.getElementById('cep-balloon').classList.remove('show');">📍 Ir ao Local</button>
          <button class="cep-action-btn cep-action-close" onclick="document.getElementById('cep-balloon').classList.remove('show');">✕</button>
        </div>
      `;
    } else {
      balloon.innerHTML = `<div class="cep-error">📍 Endereço encontrado mas não localizado no mapa.</div>`;
      setTimeout(() => balloon.classList.remove('show'), 3000);
    }
  } catch (e) {
    balloon.innerHTML = `<div class="cep-error">❌ ${e.message || 'Erro ao buscar CEP'}</div>`;
    setTimeout(() => balloon.classList.remove('show'), 3000);
  }
}

// ══════════════════════════════════════════════════════════════════
//  UTILITÁRIOS
// ══════════════════════════════════════════════════════════════════
function openOverlay(id)  { document.getElementById(id).classList.add('show'); }
function closeOverlay(id) { document.getElementById(id).classList.remove('show'); }
function fmtDate(d) { if(!d) return '—'; const [y,m,day] = d.split('-'); return `${day}/${m}/${y}`; }
let toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  document.getElementById('toast-msg').textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
}

document.getElementById('btn-sair').addEventListener('click', () => {
  authToken = null; currentUser = null;
  localStorage.clear();
  location.reload();
});

document.getElementById('obra-close').addEventListener('click', () => closeOverlay('overlay-obra'));
document.getElementById('obra-cancel').addEventListener('click', () => closeOverlay('overlay-obra'));
