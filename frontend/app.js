// ══════════════════════════════════════════════════════════════════
//  CVILMAP — app.js  (Versão Nuvem Corrigida)
//  Toda persistência via Cloudflare D1 através da API REST do Worker
// ══════════════════════════════════════════════════════════════════

const API_BASE = "https://cvilmap-api.cvilmap-cloud-bruna.workers.dev";

let authToken   = localStorage.getItem('cvilmap_token') || null;
let currentUser = JSON.parse(localStorage.getItem('cvilmap_user') || 'null');
let markers     = {};
let editingId   = null;
let pendingLat  = null;
let pendingLng  = null;
let activeFilter = 'all';
let relObras     = [];  
let map;

// ══════════════════════════════════════════════════════════════════
//  API HELPER (Com correção de Cache para Sincronização)
// ══════════════════════════════════════════════════════════════════
async function api(method, path, body = null) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store', // <--- Força busca na nuvem, ignorando cache do celular/PC
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
    document.getElementById('app-loading-msg').textContent = 'Conectando ao banco de dados na nuvem...';
    
    // Verifica conexão inicial
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
  document.getElementById('app').
    style.display = 'none';
  const l = document.getElementById('screen-login');
  l.classList.remove('gone');
  setTimeout(() => l.classList.remove('hide'), 10);
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
    if (!ok) { 
        errEl.textContent = "Usuário ou senha inválidos.";
        errEl.style.display = 'block'; 
        return; 
    }

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

// Event Listeners de Auth
document.getElementById('btn-login').addEventListener('click', doLogin);
['l-user','l-pass'].forEach(id => 
  document.getElementById(id).addEventListener('keydown', e => { if(e.key==='Enter') doLogin(); })
);

// ══════════════════════════════════════════════════════════════════
//  INIT APP (Sincronização completa)
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

  // Limpa tudo antes de carregar dados novos da nuvem
  Object.values(markers).forEach(m => map.removeLayer(m));
  markers = {};

  await loadObras('all');
  await loadStats();
}

// ══════════════════════════════════════════════════════════════════
//  CARREGAR OBRAS (Cloud Sync)
// ══════════════════════════════════════════════════════════════════
async function loadObras(filter = 'all', search = '') {
  const list = document.getElementById('sidebar-list');
  list.innerHTML = '<div class="sidebar-empty"><div class="sidebar-spinner"></div><p>Sincronizando nuvem...</p></div>';

  try {
    const params = new URLSearchParams();
    if (filter && filter !== 'all') params.set('status', filter);
    
    const { ok, data } = await api('GET', '/api/obras?' + params.toString());
    if (!ok) throw new Error(data.error);

    // Limpa marcadores existentes
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
      <button class="popup-edit" onclick="openEdit('${o.id}')">✏️ Editar</button>
    `);
  markers[o.id] = m;
}

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

function renderSidebar(obras) {
  const list = document.getElementById('sidebar-list');
  if (!obras.length) {
    list.innerHTML = `<div class="sidebar-empty"><p>Nenhuma obra.</p></div>`;
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
