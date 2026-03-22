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
