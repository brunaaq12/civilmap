// ══════════════════════════════════════════════════════════════════
//  CVILMAP — app.js  (versão nuvem)
//  Toda persistência via Cloudflare D1 através da API REST do Worker
// ══════════════════════════════════════════════════════════════════

// ── CONFIGURE AQUI a URL do seu Worker após o deploy ─────────────
// Exemplo: 'https://cvilmap-api.SEU-USUARIO.workers.dev'
const API_BASE = 'https://cvilmap-api.bruunah1jb.workers.dev';
// ─────────────────────────────────────────────────────────────────

let authToken   = localStorage.getItem('cvilmap_token') || null;
let currentUser = JSON.parse(localStorage.getItem('cvilmap_user') || 'null');
let markers     = {};
let editingId   = null;
let pendingLat  = null;
let pendingLng  = null;
let activeFilter = 'all';
let relObras     = [];   // cache do relatório
let map;

// ══════════════════════════════════════════════════════════════════
//  API HELPER
// ══════════════════════════════════════════════════════════════════
async function api(method, path, body = null) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (authToken) opts.headers['Authorization'] = `Bearer ${authToken}`;
  if (body)      opts.body = JSON.stringify(body);
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
    // Testa conectividade com a API
    document.getElementById('app-loading-msg').textContent = 'Verificando conexão com o servidor...';
    await fetch(API_BASE + '/api/stats', {
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : {}
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
      '❌ Não foi possível conectar ao servidor.<br><small style="color:#777">Verifique a URL da API em app.js</small>';
  }
})();

// ══════════════════════════════════════════════════════════════════
//  AUTH
// ══════════════════════════════════════════════════════════════════
function showLogin() {
  ['screen-register'].forEach(id => {
    document.getElementById(id).classList.add('hide');
    setTimeout(() => document.getElementById(id).classList.add('gone'), 400);
  });
  document.getElementById('app').style.display = 'none';
  const l = document.getElementById('screen-login');
  l.classList.remove('gone');
  setTimeout(() => l.classList.remove('hide'), 10);
}

function showRegister() {
  document.getElementById('screen-login').classList.add('hide');
  setTimeout(() => {
    document.getElementById('screen-login').classList.add('gone');
    const r = document.getElementById('screen-register');
    r.classList.remove('gone');
    setTimeout(() => r.classList.remove('hide'), 10);
  }, 380);
}

document.getElementById('btn-login').addEventListener('click', doLogin);
['l-user','l-pass'].forEach(id =>
  document.getElementById(id).addEventListener('keydown', e => { if(e.key==='Enter') doLogin(); })
);

async function doLogin() {
  const username = document.getElementById('l-user').value.trim();
  const senha    = document.getElementById('l-pass').value;
  const errEl    = document.getElementById('login-error');
  errEl.style.display = 'none';
  const btn = document.getElementById('btn-login');
  btn.textContent = 'Entrando...'; btn.disabled = true;
  try {
    const { ok, data } = await api('POST', '/api/login', { username, senha });
    if (!ok) { errEl.style.display = 'block'; return; }
    authToken   = data.token;
    currentUser = data.user;
    localStorage.setItem('cvilmap_token', authToken);
    localStorage.setItem('cvilmap_user',  JSON.stringify(currentUser));
    document.getElementById('screen-login').classList.add('hide');
    setTimeout(initApp, 450);
  } catch (e) {
    errEl.textContent = '❌ Erro de conexão. Tente novamente.';
    errEl.style.display = 'block';
  } finally {
    btn.textContent = 'Entrar no Sistema'; btn.disabled = false;
  }
}

document.getElementById('btn-register').addEventListener('click', doRegister);
async function doRegister() {
  const nome  = document.getElementById('r-nome').value.trim();
  const cargo = document.getElementById('r-cargo').value.trim();
  const user  = document.getElementById('r-user').value.trim();
  const pass  = document.getElementById('r-pass').value;
  const pass2 = document.getElementById('r-pass2').value;
  const errEl = document.getElementById('register-error');
  const sucEl = document.getElementById('register-success');
  errEl.style.display = 'none'; sucEl.style.display = 'none';

  if (!nome || !user || !pass) { errEl.textContent = '⚠️ Preencha todos os campos obrigatórios.'; errEl.style.display = 'block'; return; }
  if (pass.length < 6)         { errEl.textContent = '⚠️ A senha deve ter pelo menos 6 caracteres.'; errEl.style.display = 'block'; return; }
  if (pass !== pass2)          { errEl.textContent = '⚠️ As senhas não coincidem.'; errEl.style.display = 'block'; return; }

  const btn = document.getElementById('btn-register');
  btn.textContent = 'Cadastrando...'; btn.disabled = true;
  try {
    const { ok, data } = await api('POST', '/api/register', { username: user, senha: pass, nome, cargo });
    if (!ok) { errEl.textContent = '⚠️ ' + (data.error || 'Erro ao cadastrar'); errEl.style.display = 'block'; return; }
    sucEl.textContent = '✅ Cadastro realizado! Fazendo login...';
    sucEl.style.display = 'block';
    setTimeout(async () => {
      document.getElementById('l-user').value = user;
      document.getElementById('l-pass').value = pass;
      showLogin();
      setTimeout(doLogin, 300);
    }, 1200);
  } catch (e) {
    errEl.textContent = '❌ Erro de conexão.'; errEl.style.display = 'block';
  } finally {
    btn.textContent = 'Criar Cadastro'; btn.disabled = false;
  }
}

document.getElementById('btn-sair').addEventListener('click', () => {
  authToken = null; currentUser = null;
  localStorage.removeItem('cvilmap_token');
  localStorage.removeItem('cvilmap_user');
  document.getElementById('app').style.display = 'none';
  document.getElementById('l-user').value = '';
  document.getElementById('l-pass').value = '';
  showLogin();
});

// ══════════════════════════════════════════════════════════════════
//  INIT APP
// ══════════════════════════════════════════════════════════════════
async function initApp() {
  document.getElementById('user-name').textContent = currentUser.nome || currentUser.username;
  document.getElementById('app').style.display = 'flex';

  if (!map) {
    map = L.map('map', { center: [-12.9714, -38.5014], zoom: 12 });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; CARTO', maxZoom: 19
    }).addTo(map);
    map.on('click', onMapClick);
    setTimeout(() => document.getElementById('map-hint').classList.add('fade'), 5000);
  } else {
    Object.values(markers).forEach(m => map.removeLayer(m));
    markers = {};
  }

  await loadObras();
  await loadStats();
}

// ══════════════════════════════════════════════════════════════════
//  CARREGAR OBRAS DA API
// ══════════════════════════════════════════════════════════════════
async function loadObras(filter = 'all', search = '') {
  const list = document.getElementById('sidebar-list');
  list.innerHTML = '<div class="sidebar-empty"><div class="sidebar-empty-icon">⏳</div><p>Carregando...</p></div>';

  try {
    const params = new URLSearchParams();
    if (filter && filter !== 'all') params.set('status', filter);
    const { ok, data } = await api('GET', '/api/obras?' + params.toString());
    if (!ok) throw new Error(data.error);

    // Limpa marcadores antigos e recoloca
    Object.values(markers).forEach(m => map.removeLayer(m));
    markers = {};

    let obras = data.obras || [];
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
    list.innerHTML = '<div class="sidebar-empty"><div class="sidebar-empty-icon">❌</div><p>Erro ao carregar obras.</p></div>';
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
  if (el) { el.textContent = online ? 'Online' : 'Offline'; el.style.color = online ? '' : '#ff6666'; }
}

// ══════════════════════════════════════════════════════════════════
//  MAPA
// ══════════════════════════════════════════════════════════════════
function onMapClick(e) {
  editingId  = null;
  pendingLat = e.latlng.lat;
  pendingLng = e.latlng.lng;
  document.getElementById('modal-obra-title').textContent = 'Nova Obra';
  document.getElementById('modal-coords').textContent =
    `📌 Lat: ${pendingLat.toFixed(5)}  |  Lng: ${pendingLng.toFixed(5)}`;
  ['f-nome','f-resp','f-obs','f-inicio','f-fim'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('f-status').value = 'andamento';
  document.getElementById('btn-delete').style.display = 'none';
  openOverlay('overlay-obra');
}

function pinIcon(status) {
  const cfg = {
    andamento: { bg:'#eab308', dot:'white', border:'2.5px solid white' },
    concluida: { bg:'#22c55e', dot:'white', border:'2.5px solid white' },
    paralisada:{ bg:'#cc0000', dot:'white', border:'2.5px solid white' },
    civil:     { bg:'linear-gradient(135deg,#cc0000 50%,#ffffff 50%)', dot:'transparent', border:'2px solid #cc0000' }
  };
  const c = cfg[status] || cfg.andamento;
  return L.divIcon({
    className: '',
    html: `<div style="width:30px;height:30px;background:${c.bg};border-radius:50% 50% 50% 0;
                transform:rotate(-45deg);border:${c.border};
                box-shadow:0 3px 12px rgba(0,0,0,0.6);
                display:flex;align-items:center;justify-content:center;">
             <div style="width:10px;height:10px;border-radius:50%;background:${c.dot};
                         transform:rotate(45deg);
                         ${status==='civil'?'border:1.5px solid #cc0000;':''}"></div>
           </div>`,
    iconSize:[30,30], iconAnchor:[15,30], popupAnchor:[0,-32]
  });
}

function addMarker(o) {
  if (markers[o.id]) map.removeLayer(markers[o.id]);
  const sLabel = { andamento:'🟡 Em Andamento', concluida:'🟢 Concluída', paralisada:'🔴 Paralisada', civil:'⬤ Obra Civil' };
  const m = L.marker([o.latitude, o.longitude], { icon: pinIcon(o.status) })
    .addTo(map)
    .bindPopup(`
      <div class="popup-nome">${o.nome}</div>
      <div class="popup-resp">👤 ${o.responsavel}</div>
      <div style="font-size:11px;margin-bottom:7px;">${sLabel[o.status]||o.status}</div>
      ${o.data_inicio ? `<div style="font-size:10px;color:#777;margin-bottom:2px;">📅 Início: ${fmtDate(o.data_inicio)}</div>` : ''}
      ${o.data_fim    ? `<div style="font-size:10px;color:#777;margin-bottom:7px;">🏁 Prev. Fim: ${fmtDate(o.data_fim)}</div>` : ''}
      <button class="popup-edit" onclick="openEdit('${o.id}')">✏️ Editar</button>
    `);
  markers[o.id] = m;
}

// ══════════════════════════════════════════════════════════════════
//  CRUD
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
  btn.textContent = 'Salvando...'; btn.disabled = true;
  try {
    if (editingId) {
      const { ok, data } = await api('PUT', `/api/obras/${editingId}`, {
        nome, responsavel: resp, status,
        data_inicio: inicio, data_fim: fim, observacoes: obs
      });
      if (!ok) throw new Error(data.error);
      addMarker(data.obra);
      showToast('✏️ Obra atualizada!');
    } else {
      const { ok, data } = await api('POST', '/api/obras', {
        nome, responsavel: resp, status,
        latitude: pendingLat, longitude: pendingLng,
        data_inicio: inicio, data_fim: fim, observacoes: obs
      });
      if (!ok) throw new Error(data.error);
      addMarker(data.obra);
      showToast('📍 Obra cadastrada na nuvem!');
    }
    await loadStats();
    await loadObras(activeFilter, document.getElementById('search-input').value);
    closeOverlay('overlay-obra');
  } catch (e) {
    showToast('❌ Erro: ' + e.message);
  } finally {
    btn.textContent = '💾 Salvar Obra'; btn.disabled = false;
  }
});

document.getElementById('btn-delete').addEventListener('click', async () => {
  if (!editingId || !confirm('Remover esta obra do banco de dados na nuvem?')) return;
  const btn = document.getElementById('btn-delete');
  btn.textContent = 'Removendo...'; btn.disabled = true;
  try {
    const { ok, data } = await api('DELETE', `/api/obras/${editingId}`);
    if (!ok) throw new Error(data.error);
    if (markers[editingId]) { map.removeLayer(markers[editingId]); delete markers[editingId]; }
    await loadStats();
    await loadObras(activeFilter, document.getElementById('search-input').value);
    closeOverlay('overlay-obra');
    showToast('🗑 Obra removida da nuvem.');
  } catch(e) {
    showToast('❌ Erro: ' + e.message);
  } finally {
    btn.textContent = '🗑 Remover'; btn.disabled = false;
  }
});

window.openEdit = async function(id) {
  const { ok, data } = await api('GET', `/api/obras?status=all`);
  if (!ok) return;
  const o = (data.obras || []).find(x => x.id === id);
  if (!o) return;
  editingId = id;
  document.getElementById('modal-obra-title').textContent = 'Editar Obra';
  document.getElementById('modal-coords').textContent =
    `📌 Lat: ${o.latitude.toFixed(5)}  |  Lng: ${o.longitude.toFixed(5)}`;
  document.getElementById('f-nome').value   = o.nome;
  document.getElementById('f-resp').value   = o.responsavel;
  document.getElementById('f-status').value = o.status;
  document.getElementById('f-obs').value    = o.observacoes || '';
  document.getElementById('f-inicio').value = o.data_inicio || '';
  document.getElementById('f-fim').value    = o.data_fim    || '';
  document.getElementById('btn-delete').style.display = 'inline-flex';
  openOverlay('overlay-obra');
};

// ══════════════════════════════════════════════════════════════════
//  SIDEBAR
// ══════════════════════════════════════════════════════════════════
function renderSidebar(obras) {
  const list = document.getElementById('sidebar-list');
  if (!obras.length) {
    list.innerHTML = `<div class="sidebar-empty">
      <div class="sidebar-empty-icon">🗺️</div>
      <p>Nenhuma obra encontrada.</p></div>`;
    return;
  }
  const sLabel = { andamento:'Em Andamento', concluida:'Concluída', paralisada:'Paralisada', civil:'Obra Civil' };
  const sEmoji = { andamento:'🟡', concluida:'🟢', paralisada:'🔴', civil:'⬤' };
  list.innerHTML = obras.map(o => `
    <div class="obra-card s-${o.status}" onclick="focusObra('${o.id}','${o.latitude}','${o.longitude}')">
      <span class="obra-data">${o.criado_em || ''}</span>
      <div class="obra-nome">${o.nome}</div>
      <div class="obra-resp">👤 ${o.responsavel}</div>
      <span class="badge ${o.status}">${sEmoji[o.status]} ${sLabel[o.status]||o.status}</span>
    </div>
  `).join('');
}

window.focusObra = function(id, lat, lng) {
  map.flyTo([parseFloat(lat), parseFloat(lng)], 15, { duration:1.2 });
  setTimeout(() => { if (markers[id]) markers[id].openPopup(); }, 1300);
};

let searchTimer;
document.getElementById('search-input').addEventListener('input', e => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => loadObras(activeFilter, e.target.value), 350);
});

document.getElementById('filter-row').addEventListener('click', e => {
  const chip = e.target.closest('.filter-chip');
  if (!chip) return;
  document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
  chip.classList.add('active');
  activeFilter = chip.dataset.filter;
  loadObras(activeFilter, document.getElementById('search-input').value);
});

// ══════════════════════════════════════════════════════════════════
//  RELATÓRIO
// ══════════════════════════════════════════════════════════════════
document.getElementById('btn-rel').addEventListener('click', () => {
  document.getElementById('rel-inicio').value = '';
  document.getElementById('rel-fim').value    = '';
  document.getElementById('rel-status').value = 'all';
  document.getElementById('rel-preview').style.display = 'none';
  relObras = [];
  openOverlay('overlay-rel');
});

window.previewRel = async function() {
  const btn = document.querySelector('[onclick="previewRel()"]');
  btn.textContent = '⏳ Buscando...'; btn.disabled = true;
  const pv = document.getElementById('rel-preview');
  try {
    const params = new URLSearchParams();
    const st = document.getElementById('rel-status').value;
    const di = document.getElementById('rel-inicio').value;
    const df = document.getElementById('rel-fim').value;
    if (st && st !== 'all') params.set('status', st);
    if (di) params.set('dataInicio', di);
    if (df) params.set('dataFim', df);
    const { ok, data } = await api('GET', '/api/obras?' + params.toString());
    if (!ok) throw new Error(data.error);
    relObras = data.obras || [];
    if (!relObras.length) {
      pv.style.display = 'block';
      pv.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:16px;">Nenhuma obra no período.</div>';
      return;
    }
    const sLabel = { andamento:'Em Andamento', concluida:'Concluída', paralisada:'Paralisada', civil:'Obra Civil' };
    const sColor = { andamento:'#fde047', concluida:'#86efac', paralisada:'#ff9999', civil:'#ffaaaa' };
    pv.style.display = 'block';
    pv.innerHTML = `
      <div class="rel-count">${relObras.length}</div>
      <div class="rel-info" style="margin-bottom:10px;">obra(s) encontrada(s) na nuvem</div>
      <div class="rel-row rel-header"><span>NOME</span><span>RESPONSÁVEL</span><span>STATUS</span><span>CADASTRO</span></div>
      ${relObras.map(o => `
        <div class="rel-row">
          <span style="font-size:11px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${o.nome}</span>
          <span style="font-size:11px;color:var(--text-muted)">${o.responsavel}</span>
          <span style="font-size:10px;color:${sColor[o.status]||'#ccc'}">${sLabel[o.status]||o.status}</span>
          <span style="font-size:10px;color:var(--text-muted)">${o.criado_em||'—'}</span>
        </div>
      `).join('')}
    `;
  } catch(e) {
    pv.style.display = 'block';
    pv.innerHTML = `<div style="color:#ff9999;padding:12px;">❌ Erro: ${e.message}</div>`;
  } finally {
    btn.textContent = '🔍 Visualizar Registros'; btn.disabled = false;
  }
};

document.getElementById('btn-export').addEventListener('click', exportExcel);
function exportExcel() {
  if (!relObras.length) { showToast('⚠️ Clique em "Visualizar" primeiro.'); return; }
  const sLabel = { andamento:'Em Andamento', concluida:'Concluída', paralisada:'Paralisada', civil:'Obra Civil' };
  const di = document.getElementById('rel-inicio').value || 'inicio';
  const df = document.getElementById('rel-fim').value    || 'fim';
  const rows = [
    ['CVILMAP — Relatório de Obras Civis — Salvador, Bahia'],
    [`Período: ${di} a ${df}`],
    [`Gerado em: ${new Date().toLocaleString('pt-BR')}`],
    [`Fonte: Cloudflare D1 — Banco de Dados na Nuvem`],
    [],
    ['Nº','Nome da Obra','Responsável','Status','Data Início','Prev. Término','Cadastro','Cadastrado por','Latitude','Longitude','Observações']
  ];
  relObras.forEach((o,i) => rows.push([
    i+1, o.nome, o.responsavel, sLabel[o.status]||o.status,
    o.data_inicio ? fmtDate(o.data_inicio) : '—',
    o.data_fim    ? fmtDate(o.data_fim)    : '—',
    o.criado_em   ? fmtDate(o.criado_em)   : '—',
    o.criado_por  || '—',
    o.latitude, o.longitude, o.observacoes || ''
  ]));
  const wb  = XLSX.utils.book_new();
  const ws  = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{wch:4},{wch:40},{wch:25},{wch:16},{wch:14},{wch:14},{wch:14},{wch:18},{wch:12},{wch:12},{wch:40}];
  ws['!merges'] = [{s:{r:0,c:0},e:{r:0,c:10}},{s:{r:1,c:0},e:{r:1,c:10}},{s:{r:2,c:0},e:{r:2,c:10}},{s:{r:3,c:0},e:{r:3,c:10}}];
  XLSX.utils.book_append_sheet(wb, ws, 'Obras');
  XLSX.writeFile(wb, `CVILMAP_Relatorio_${di}_${df}.xlsx`);
  showToast('📥 Excel exportado!');
}

// ══════════════════════════════════════════════════════════════════
//  CEP SEARCH
// ══════════════════════════════════════════════════════════════════
let cepMarker = null, cepData = null;
const cepInput = document.getElementById('cep-input');
const cepBtn   = document.getElementById('cep-btn');
const cepBal   = document.getElementById('cep-balloon');

cepInput.addEventListener('input', () => {
  let v = cepInput.value.replace(/\D/g,'');
  if (v.length > 5) v = v.slice(0,5) + '-' + v.slice(5,8);
  cepInput.value = v;
});
cepInput.addEventListener('keydown', e => { if(e.key==='Enter') buscarCEP(); });
cepBtn.addEventListener('click', buscarCEP);
document.addEventListener('click', e => {
  if (!e.target.closest('#cep-bar') && !e.target.closest('#cep-balloon')) closeBalloon();
});

function closeBalloon() { cepBal.classList.remove('show'); }
function showBalloon(html) { cepBal.innerHTML = html; cepBal.classList.add('show'); }

async function buscarCEP() {
  const raw = cepInput.value.replace(/\D/g,'');
  if (raw.length !== 8) { showBalloon(`<div class="cep-error">⚠️ CEP inválido.</div>`); return; }
  showBalloon(`<div class="cep-loading"><div class="cep-spinner"></div> Buscando ${cepInput.value}...</div>`);
  cepBtn.disabled = true;
  try {
    const res  = await fetch(`https://viacep.com.br/ws/${raw}/json/`);
    const data = await res.json();
    if (data.erro) { showBalloon(`<div class="cep-error">❌ CEP não encontrado.</div>`); return; }
    cepData = data;
    const query   = [data.logradouro, data.bairro, data.localidade, data.uf, 'Brasil'].filter(Boolean).join(', ');
    const geoRes  = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`, { headers:{'Accept-Language':'pt-BR','User-Agent':'CVILMAP/1.0'} });
    const geoData = await geoRes.json();
    let lat = null, lng = null;
    if (geoData?.length) { lat = parseFloat(geoData[0].lat); lng = parseFloat(geoData[0].lon); }
    else {
      const g2 = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(data.localidade+', '+data.uf+', Brasil')}`, { headers:{'Accept-Language':'pt-BR','User-Agent':'CVILMAP/1.0'} });
      const d2 = await g2.json();
      if (d2?.length) { lat = parseFloat(d2[0].lat); lng = parseFloat(d2[0].lon); }
    }
    cepData.lat = lat; cepData.lng = lng;
    const hasCoords = lat !== null;
    showBalloon(`
      <div class="cep-addr-title">📍 ${data.cep}</div>
      <div class="cep-addr-detail">
        ${data.logradouro ? `<strong>Endereço:</strong> ${data.logradouro}<br>` : ''}
        <strong>Bairro:</strong> ${data.bairro||'—'}<br>
        <strong>Cidade:</strong> ${data.localidade} — ${data.uf}<br>
        ${hasCoords ? `<strong>Coords:</strong> ${lat.toFixed(5)}, ${lng.toFixed(5)}` : '<span style="color:#ffaaaa">⚠️ Coordenadas não encontradas</span>'}
      </div>
      <div class="cep-actions">
        ${hasCoords ? `<button class="cep-action-btn cep-action-go" onclick="irParaCEP()">🗺️ Ir para o local</button>` : ''}
        ${hasCoords ? `<button class="cep-action-btn cep-action-add" onclick="adicionarObraNoLocal()">📍 Adicionar Obra Aqui</button>` : ''}
        <button class="cep-action-btn cep-action-close" onclick="closeBalloon()">✕</button>
      </div>
    `);
    if (hasCoords) {
      if (cepMarker) map.removeLayer(cepMarker);
      cepMarker = L.circleMarker([lat,lng], { radius:22, color:'#cc0000', fillColor:'#cc0000', fillOpacity:0.12, weight:2.5, dashArray:'6 4' }).addTo(map);
    }
  } catch(e) {
    showBalloon(`<div class="cep-error">❌ Erro ao buscar CEP.</div>`);
  }
  cepBtn.disabled = false;
}

window.irParaCEP = function() {
  if (!cepData?.lat) return;
  map.flyTo([cepData.lat, cepData.lng], 16, { duration:1.4 });
  if (cepMarker) {
    map.removeLayer(cepMarker);
    cepMarker = L.circleMarker([cepData.lat,cepData.lng], { radius:22, color:'#cc0000', fillColor:'#cc0000', fillOpacity:0.15, weight:2.5, dashArray:'6 4' })
      .addTo(map).bindPopup(`<b>CEP ${cepData.cep}</b><br>${[cepData.logradouro,cepData.bairro,cepData.localidade].filter(Boolean).join(', ')}`).openPopup();
  }
};

window.adicionarObraNoLocal = function() {
  if (!cepData?.lat) return;
  closeBalloon();
  if (cepMarker) { map.removeLayer(cepMarker); cepMarker = null; }
  const addr = [cepData.logradouro,cepData.bairro,cepData.localidade].filter(Boolean).join(', ');
  editingId = null; pendingLat = cepData.lat; pendingLng = cepData.lng;
  document.getElementById('modal-obra-title').textContent = 'Nova Obra';
  document.getElementById('modal-coords').textContent = `📌 CEP ${cepData.cep} — ${addr}`;
  ['f-nome','f-resp','f-inicio','f-fim'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('f-status').value = 'andamento';
  document.getElementById('f-obs').value = addr ? `Endereço: ${addr}` : '';
  document.getElementById('btn-delete').style.display = 'none';
  map.flyTo([cepData.lat, cepData.lng], 16, { duration:1.0 });
  setTimeout(() => openOverlay('overlay-obra'), 800);
};

// ══════════════════════════════════════════════════════════════════
//  OVERLAYS / UTILS
// ══════════════════════════════════════════════════════════════════
function openOverlay(id)  { document.getElementById(id).classList.add('show'); }
function closeOverlay(id) { document.getElementById(id).classList.remove('show'); }

document.getElementById('obra-close').addEventListener('click',  () => closeOverlay('overlay-obra'));
document.getElementById('obra-cancel').addEventListener('click', () => closeOverlay('overlay-obra'));
document.getElementById('overlay-obra').addEventListener('click', e => { if(e.target.id==='overlay-obra') closeOverlay('overlay-obra'); });
document.getElementById('rel-close').addEventListener('click',  () => closeOverlay('overlay-rel'));
document.getElementById('rel-cancel').addEventListener('click', () => closeOverlay('overlay-rel'));
document.getElementById('overlay-rel').addEventListener('click', e => { if(e.target.id==='overlay-rel') closeOverlay('overlay-rel'); });

function fmtDate(d) {
  if (!d) return '—';
  const [y,m,day] = d.split('-');
  return `${day}/${m}/${y}`;
}

let toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  document.getElementById('toast-msg').textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
}
