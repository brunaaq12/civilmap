/* ===== CVILMAP — app.js ===== */
const API = "https://cvilmap-api.cvilmap-cloud-bruna.workers.dev";

// ── State ──
let authToken = localStorage.getItem("cvilmap_token");
let currentUser = JSON.parse(localStorage.getItem("cvilmap_user") || "null");
let map, obras = [], stats = { andamento:0, concluida:0, paralisada:0, cotacao:0 };
let markers = {};
let cadastros = [];
let filter = "all", searchQuery = "";

// ── Status Config ──
const STATUS_CFG = {
  andamento:  { color:"#eab308", emoji:"🟡", label:"Em Andamento" },
  concluida:  { color:"#22c55e", emoji:"🟢", label:"Concluída" },
  paralisada: { color:"#cc0000", emoji:"🔴", label:"Paralisada" },
  cotacao:    { color:"#3b82f6", emoji:"🔵", label:"Obra em Cotação" },
};

// ── Pin Colors for Cadastros ──
const PIN_COLORS = [
  { nome:"Azul", hex:"#3b82f6" },
  { nome:"Laranja", hex:"#f97316" },
  { nome:"Roxo/Violeta", hex:"#7c3aed" },
  { nome:"Branco", hex:"#ffffff" },
  { nome:"Preto", hex:"#171717" },
  { nome:"Cinza", hex:"#737373" },
  { nome:"Marrom", hex:"#92400e" },
  { nome:"Bege", hex:"#d4b896" },
  { nome:"Rosa", hex:"#ec4899" },
  { nome:"Ciano", hex:"#06b6d4" },
  { nome:"Magenta", hex:"#d946ef" },
  { nome:"Turquesa", hex:"#14b8a6" },
  { nome:"Lilás", hex:"#a78bfa" },
  { nome:"Dourado", hex:"#ca8a04" },
  { nome:"Prata", hex:"#a8a29e" },
];

// ── API Helper ──
async function api(method, path, body) {
  const opts = { method, headers: { "Content-Type":"application/json" }, cache:"no-store" };
  if (authToken) opts.headers["Authorization"] = "Bearer " + authToken;
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(API + path, opts);
  const data = await res.json();
  if (!res.ok && res.status === 401) { logout(); throw new Error("Sessão expirada"); }
  return { ok: res.ok, status: res.status, data };
}

// ── Auth ──
function logout() {
  authToken = null; currentUser = null;
  localStorage.removeItem("cvilmap_token");
  localStorage.removeItem("cvilmap_user");
  document.getElementById("app").style.display = "none";
  document.getElementById("auth-screen").style.display = "flex";
  renderAuth();
}

function renderAuth() {
  const card = document.getElementById("auth-card");
  card.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:28px;">
      <div class="logo-icon">🏗️</div>
      <div class="logo">CVIL<span>MAP</span></div>
    </div>
    <div id="auth-form"></div>
    <div id="auth-msg"></div>
    <div id="auth-toggle" style="margin-top:20px;text-align:center;font-size:13px;color:var(--muted);"></div>
  `;
  showLoginForm();
}

function showLoginForm() {
  document.getElementById("auth-form").innerHTML = `
    <h2 style="font-family:'Syne',sans-serif;font-size:22px;font-weight:700;margin-bottom:4px;">Acesso ao Sistema</h2>
    <p style="color:var(--muted);font-size:13px;margin-bottom:28px;">Gestão de Obras Civis — Salvador, Bahia</p>
    <div style="display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:99px;font-size:11px;font-weight:600;background:rgba(59,130,246,.1);border:1px solid rgba(59,130,246,.2);color:var(--blue);margin-bottom:24px;">☁️ Banco de Dados na Nuvem</div>
    <div class="form-group"><label class="form-label">Usuário</label><input class="form-input" id="l-user" placeholder="Digite seu usuário"></div>
    <div class="form-group"><label class="form-label">Senha</label><input class="form-input" id="l-pass" type="password" placeholder="Digite sua senha"></div>
    <button class="btn btn-primary" style="width:100%;padding:14px;font-size:15px;margin-top:4px;" onclick="doLogin()">Entrar no Sistema</button>
  `;
  document.getElementById("auth-toggle").innerHTML = `Não tem conta? <a href="#" onclick="showRegisterForm();return false;" style="color:var(--red3);text-decoration:none;font-weight:500;">Criar cadastro</a>`;
  document.getElementById("auth-msg").innerHTML = "";
  // Enter key
  setTimeout(() => {
    const passEl = document.getElementById("l-pass");
    if (passEl) passEl.addEventListener("keydown", e => { if (e.key === "Enter") doLogin(); });
  }, 50);
}

function showRegisterForm() {
  document.getElementById("auth-form").innerHTML = `
    <h2 style="font-family:'Syne',sans-serif;font-size:22px;font-weight:700;margin-bottom:4px;">Criar Conta</h2>
    <p style="color:var(--muted);font-size:13px;margin-bottom:28px;">Preencha os dados para se cadastrar</p>
    <div class="form-row"><div><label class="form-label">Nome Completo</label><input class="form-input" id="r-nome" placeholder="Seu nome"></div><div><label class="form-label">Cargo</label><input class="form-input" id="r-cargo" placeholder="Ex: Engenheiro"></div></div>
    <div class="form-group"><label class="form-label">Usuário</label><input class="form-input" id="r-user" placeholder="Escolha um nome de usuário"></div>
    <div class="form-row"><div><label class="form-label">Senha</label><input class="form-input" id="r-pass" type="password" placeholder="Mín. 6 caracteres"></div><div><label class="form-label">Confirmar</label><input class="form-input" id="r-pass2" type="password" placeholder="Repita a senha"></div></div>
    <button class="btn btn-primary" style="width:100%;padding:14px;font-size:15px;margin-top:4px;" onclick="doRegister()">Criar Cadastro</button>
  `;
  document.getElementById("auth-toggle").innerHTML = `Já tem conta? <a href="#" onclick="showLoginForm();return false;" style="color:var(--red3);text-decoration:none;font-weight:500;">Fazer login</a>`;
  document.getElementById("auth-msg").innerHTML = "";
}

async function doLogin() {
  const u = document.getElementById("l-user").value.trim();
  const p = document.getElementById("l-pass").value;
  if (!u || !p) { showAuthMsg("Preencha todos os campos.", "error"); return; }
  try {
    const { ok, data } = await api("POST", "/api/login", { username:u, senha:p });
    if (!ok) { showAuthMsg("Usuário ou senha inválidos.", "error"); return; }
    authToken = data.token; currentUser = data.user;
    localStorage.setItem("cvilmap_token", authToken);
    localStorage.setItem("cvilmap_user", JSON.stringify(currentUser));
    initApp();
  } catch { showAuthMsg("Falha na conexão.", "error"); }
}

async function doRegister() {
  const nome = document.getElementById("r-nome").value.trim();
  const cargo = document.getElementById("r-cargo").value.trim();
  const user = document.getElementById("r-user").value.trim();
  const pass = document.getElementById("r-pass").value;
  const pass2 = document.getElementById("r-pass2").value;
  if (!nome || !user || !pass) { showAuthMsg("Preencha os campos obrigatórios.", "error"); return; }
  if (pass.length < 6) { showAuthMsg("Senha mínima: 6 caracteres.", "error"); return; }
  if (pass !== pass2) { showAuthMsg("As senhas não conferem.", "error"); return; }
  try {
    const { ok, data } = await api("POST", "/api/register", { username:user, senha:pass, nome, cargo });
    if (!ok) { showAuthMsg(data.error || "Erro ao criar conta.", "error"); return; }
    showAuthMsg("Conta criada! Faça login.", "success");
    showLoginForm();
  } catch { showAuthMsg("Falha na conexão.", "error"); }
}

function showAuthMsg(msg, type) {
  document.getElementById("auth-msg").innerHTML = `<div class="msg-${type}">${type==="error"?"⚠️":"✅"} ${msg}</div>`;
}

// ── App Init ──
function initApp() {
  document.getElementById("auth-screen").style.display = "none";
  document.getElementById("app").style.display = "flex";
  document.getElementById("app").style.flexDirection = "column";
  document.getElementById("app").style.height = "100vh";
  renderHeader();
  renderSidebar();
  initMap();
  loadCadastros();
  loadData();
}

// ── Header ──
function renderHeader() {
  const h = document.getElementById("header");
  h.innerHTML = `
    <div class="logo"><div class="logo-icon">🏗️</div>CVIL<span>MAP</span></div>
    <div class="divider"></div>
    <div class="cloud-status">☁️ <span id="cloud-lbl" style="color:#4ade80;">Nuvem Conectada</span></div>
    <div class="stat-pills">
      <div class="stat-pill"><div class="stat-dot" style="background:#eab308;"></div><span id="st-and">0</span> Andamento</div>
      <div class="stat-pill"><div class="stat-dot" style="background:#22c55e;"></div><span id="st-con">0</span> Concluídas</div>
      <div class="stat-pill"><div class="stat-dot" style="background:#cc0000;"></div><span id="st-par">0</span> Paralisadas</div>
      <div class="stat-pill"><div class="stat-dot" style="background:#3b82f6;"></div><span id="st-cot">0</span> Cotação</div>
    </div>
    <div class="spacer"></div>
    <button class="btn" onclick="openCadastros()">👥 CADASTROS</button>
    <button class="btn btn-primary" onclick="openReport()">📊 RELATÓRIO</button>
    <button class="btn" onclick="logout()" style="white-space:nowrap;">👤 ${currentUser?.nome || currentUser?.username || ""} · Sair</button>
  `;
}

function updateStats() {
  const el = (id) => document.getElementById(id);
  if (el("st-and")) el("st-and").textContent = stats.andamento || 0;
  if (el("st-con")) el("st-con").textContent = stats.concluida || 0;
  if (el("st-par")) el("st-par").textContent = stats.paralisada || 0;
  if (el("st-cot")) el("st-cot").textContent = stats.cotacao || 0;
}

// ── Sidebar ──
function renderSidebar() {
  const s = document.getElementById("sidebar");
  s.innerHTML = `
    <div class="sidebar-head">
      <div class="sidebar-title">📋 Obras <span>Cadastradas</span></div>
      <input class="search-input" id="search-input" placeholder="🔍  Buscar obra ou responsável..." oninput="onSearch(this.value)">
      <div class="filter-row">
        <button class="filter-btn active-all" data-f="all" onclick="setFilter('all')">Todas</button>
        <button class="filter-btn" data-f="andamento" onclick="setFilter('andamento')">🟡 Andamento</button>
        <button class="filter-btn" data-f="concluida" onclick="setFilter('concluida')">🟢 Concluída</button>
        <button class="filter-btn" data-f="paralisada" onclick="setFilter('paralisada')">🔴 Paralisada</button>
        <button class="filter-btn" data-f="cotacao" onclick="setFilter('cotacao')">🔵 Cotação</button>
      </div>
    </div>
    <div class="obra-list" id="obra-list"></div>
  `;
}

function setFilter(f) {
  filter = f;
  document.querySelectorAll(".filter-btn").forEach(b => {
    b.classList.remove("active","active-all");
    if (b.dataset.f === f) b.classList.add(f === "all" ? "active-all" : "active");
  });
  loadData();
}

let searchTimeout;
function onSearch(v) {
  searchQuery = v;
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => loadData(), 300);
}

function renderObraList() {
  const el = document.getElementById("obra-list");
  if (!el) return;
  let list = obras;
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    list = list.filter(o => o.nome.toLowerCase().includes(q) || o.responsavel.toLowerCase().includes(q));
  }
  if (!list.length) { el.innerHTML = '<div style="text-align:center;padding:32px 0;color:var(--muted);font-size:13px;">Nenhuma obra.</div>'; return; }
  el.innerHTML = list.map(o => {
    const cfg = STATUS_CFG[o.status] || STATUS_CFG.andamento;
    const cad = cadastros.find(c => c.nome === o.responsavel);
    const cadColor = cad ? cad.cor : "#555";
    return `<div class="obra-card" onclick="focusObra('${o.id}')">
      <div class="obra-bar-left" style="background:${cadColor};"></div>
      <div class="obra-bar-right" style="background:${cfg.color};"></div>
      <span class="date">${o.criado_em || ""}</span>
      <div class="title">${o.nome}</div>
      <div class="resp">👤 ${o.responsavel}</div>
      <span class="obra-badge">${cfg.emoji} ${cfg.label}</span>
    </div>`;
  }).join("");
}

// ── Map ──
function initMap() {
  map = L.map("map-container").setView([-12.9714, -38.5014], 12);
  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", { attribution:"&copy; CARTO", maxZoom:19 }).addTo(map);
  map.on("click", e => openObraModal(null, e.latlng.lat, e.latlng.lng));
  // Hint
  const hint = document.createElement("div");
  hint.className = "map-hint";
  hint.textContent = "🖱️ Clique no mapa para adicionar uma obra";
  document.getElementById("map-container").appendChild(hint);
}

function dualPinIcon(statusColor, cadColor, statusKey) {
  const left = cadColor || "#555";
  const right = statusColor;
  return L.divIcon({
    className:"",
    html:`<div style="width:32px;height:32px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid rgba(255,255,255,.3);box-shadow:0 3px 12px rgba(0,0,0,.6);display:flex;overflow:hidden;position:relative;">
      <div style="width:50%;height:100%;background:${left};"></div>
      <div style="width:50%;height:100%;background:${right};"></div>
      <div style="width:10px;height:10px;border-radius:50%;background:white;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) rotate(45deg);opacity:.9;"></div>
    </div>`,
    iconSize:[32,32], iconAnchor:[16,32], popupAnchor:[0,-34]
  });
}

function renderMarkers() {
  Object.values(markers).forEach(m => map.removeLayer(m));
  markers = {};
  obras.forEach(o => {
    const cfg = STATUS_CFG[o.status] || STATUS_CFG.andamento;
    const cad = cadastros.find(c => c.nome === o.responsavel);
    const icon = dualPinIcon(cfg.color, cad?.cor || null, o.status);
    const m = L.marker([o.latitude, o.longitude], { icon }).addTo(map)
      .bindPopup(`<div style="font-family:'Syne',sans-serif;font-weight:700;font-size:14px;margin-bottom:3px;">${o.nome}</div>
        <div style="font-size:12px;color:#777;margin-bottom:7px;">👤 ${o.responsavel}</div>
        <div style="font-size:11px;margin-bottom:7px;">${cfg.emoji} ${cfg.label}</div>
        <button onclick="openEdit('${o.id}')" style="background:#cc0000;border:none;color:white;padding:5px 12px;border-radius:6px;font-size:12px;cursor:pointer;font-weight:600;">✏️ Editar</button>`);
    markers[o.id] = m;
  });
}

function focusObra(id) {
  const o = obras.find(x => x.id === id);
  if (!o) return;
  map.flyTo([o.latitude, o.longitude], 15, { duration:1.2 });
  setTimeout(() => { if (markers[id]) markers[id].openPopup(); }, 1400);
}

function openEdit(id) {
  const o = obras.find(x => x.id === id);
  if (o) openObraModal(o);
}

// ── Data Loading ──
async function loadData() {
  try {
    const params = new URLSearchParams();
    if (filter !== "all") params.set("status", filter);
    const [obrasRes, statsRes] = await Promise.all([
      api("GET", "/api/obras?" + params.toString()),
      api("GET", "/api/stats")
    ]);
    obras = obrasRes.ok ? (obrasRes.data.obras || []) : [];
    if (statsRes.ok) stats = statsRes.data.stats || stats;
    document.getElementById("cloud-lbl").style.color = "#4ade80";
    document.getElementById("cloud-lbl").textContent = "Nuvem Conectada";
  } catch {
    document.getElementById("cloud-lbl").style.color = "#ff6666";
    document.getElementById("cloud-lbl").textContent = "Offline";
  }
  updateStats();
  renderObraList();
  renderMarkers();
}

// ── Cadastros (API) ──
async function loadCadastros() {
  try {
    const res = await api("GET", "/api/cadastros");
    if (res.ok) cadastros = res.data.cadastros || [];
  } catch {}
}

function openCadastros() {
  const ov = document.getElementById("overlay-cad");
  ov.style.display = "flex";
  renderCadModal();
}

function closeCadastros() {
  document.getElementById("overlay-cad").style.display = "none";
  loadCadastros().then(() => { renderObraList(); renderMarkers(); });
}

let cadEditId = null;
function renderCadModal() {
  const ov = document.getElementById("overlay-cad");
  const colorOpts = PIN_COLORS.map(c => `<option value="${c.hex}">${c.nome}</option>`).join("");
  const selectedCor = cadEditId ? (cadastros.find(c=>c.id===cadEditId)?.cor || "#3b82f6") : "#3b82f6";
  ov.innerHTML = `
    <div class="modal" onclick="event.stopPropagation();" style="width:480px;">
      <div class="modal-header"><h3>👥 Cadastros</h3><button class="modal-close" onclick="closeCadastros()">✕</button></div>
      <div class="modal-body">
        <div id="cad-error"></div>
        <div class="form-group"><label class="form-label">Nome</label><input class="form-input" id="cad-nome" placeholder="Nome do responsável" value="${cadEditId ? (cadastros.find(c=>c.id===cadEditId)?.nome||"") : ""}"></div>
        <div class="form-group"><label class="form-label">Cor do Pin</label>
          <div class="color-select-wrapper">
            <select class="cad-color-select" id="cad-cor" onchange="document.getElementById('cad-cor-preview').style.background=this.value;">
              ${colorOpts}
            </select>
            <div class="color-select-indicator">
              <div class="cad-color-preview" id="cad-cor-preview" style="background:${selectedCor};"></div>
              <span style="color:var(--muted);font-size:12px;">▼</span>
            </div>
          </div>
        </div>
        <div style="display:flex;gap:8px;margin-bottom:20px;">
          <button class="btn btn-primary" id="cad-save-btn" onclick="saveCadastro()">${cadEditId ? "✏️ Atualizar" : "➕ Adicionar"}</button>
          ${cadEditId ? '<button class="btn" onclick="cancelCadEdit()">Cancelar</button>' : ""}
        </div>
        <div style="border-top:1px solid var(--border2);padding-top:16px;max-height:300px;overflow-y:auto;" id="cad-list"></div>
      </div>
    </div>
  `;
  ov.onclick = e => { if (e.target === ov) closeCadastros(); };
  if (cadEditId) document.getElementById("cad-cor").value = selectedCor;
  renderCadList();
}

function renderCadList() {
  const el = document.getElementById("cad-list");
  if (!el) return;
  if (!cadastros.length) { el.innerHTML = '<p style="color:var(--muted);text-align:center;padding:16px;font-size:13px;">Nenhum cadastro ainda.</p>'; return; }
  el.innerHTML = cadastros.map(c => `
    <div class="cad-item">
      <div class="dot" style="background:${c.cor};"></div>
      <span class="name">${c.nome}</span>
      <button class="edit-btn" onclick="editCadastro('${c.id}')">✏️</button>
      <button class="del-btn" onclick="deleteCadastro('${c.id}')">🗑️</button>
    </div>
  `).join("");
}

async function saveCadastro() {
  const nome = document.getElementById("cad-nome").value.trim();
  const cor = document.getElementById("cad-cor").value;
  if (!nome) return;
  try {
    if (cadEditId) {
      const res = await api("PUT", `/api/cadastros/${cadEditId}`, { nome, cor });
      if (!res.ok) throw new Error(res.data.error || "Erro");
      cadEditId = null;
    } else {
      const res = await api("POST", "/api/cadastros", { nome, cor });
      if (!res.ok) throw new Error(res.data.error || "Erro");
    }
    await loadCadastros();
    renderCadModal();
  } catch (e) {
    document.getElementById("cad-error").innerHTML = `<div class="msg-error">⚠️ ${e.message}</div>`;
  }
}

function editCadastro(id) {
  cadEditId = id;
  renderCadModal();
}

function cancelCadEdit() {
  cadEditId = null;
  renderCadModal();
}

async function deleteCadastro(id) {
  if (!confirm("Excluir este cadastro?")) return;
  try {
    await api("DELETE", `/api/cadastros/${id}`);
    await loadCadastros();
    renderCadModal();
  } catch (e) {
    document.getElementById("cad-error").innerHTML = `<div class="msg-error">⚠️ ${e.message}</div>`;
  }
}

// ── Obra Modal ──
function checkOwnership(obra) {
  if (!obra || !obra.id) return true;
  return obra.user_id === currentUser?.id || obra.created_by === currentUser?.username || obra.created_by === currentUser?.id;
}

function openObraModal(obra, lat, lng) {
  const ov = document.getElementById("overlay-obra");
  ov.style.display = "flex";
  const isEdit = !!(obra && obra.id);
  const isOwner = checkOwnership(obra);
  const readOnly = isEdit && !isOwner;
  const dis = readOnly ? "disabled" : "";
  const displayLat = lat ?? obra?.latitude;
  const displayLng = lng ?? obra?.longitude;

  ov.innerHTML = `
    <div class="modal" onclick="event.stopPropagation();">
      <div class="modal-header"><h3>🏗️ ${isEdit ? (readOnly ? "Detalhes da Obra" : "Editar Obra") : "Nova Obra"}</h3><button class="modal-close" onclick="closeObraModal()">✕</button></div>
      <div class="modal-body">
        ${displayLat ? `<div style="font-size:12px;color:var(--muted);margin-bottom:16px;">📌 Lat: ${Number(displayLat).toFixed(5)} | Lng: ${Number(displayLng).toFixed(5)}</div>` : ""}
        ${readOnly ? '<div class="msg-warning">🔒 Você não pode editar esta obra (criada por outro usuário).</div>' : ""}
        <div class="form-group"><label class="form-label">Nome da Obra *</label><input class="form-input" id="ob-nome" ${dis} value="${obra?.nome||""}" placeholder="Ex: Revitalização da Av. Paralela"></div>
        <div class="form-row">
          <div><label class="form-label">Responsável *</label><input class="form-input" id="ob-resp" ${dis} value="${obra?.responsavel||""}" placeholder="Nome ou órgão"></div>
          <div><label class="form-label">Status</label><select class="form-input" id="ob-status" ${dis}>
            <option value="andamento" ${obra?.status==="andamento"?"selected":""}>🟡 Em Andamento</option>
            <option value="concluida" ${obra?.status==="concluida"?"selected":""}>🟢 Concluída</option>
            <option value="paralisada" ${obra?.status==="paralisada"?"selected":""}>🔴 Paralisada</option>
            <option value="cotacao" ${obra?.status==="cotacao"?"selected":""}>🔵 Obra em Cotação</option>
          </select></div>
        </div>
        <div class="form-row">
          <div><label class="form-label">Data de Início</label><input class="form-input" id="ob-inicio" type="date" ${dis} value="${obra?.data_inicio||""}"></div>
          <div><label class="form-label">Previsão de Término</label><input class="form-input" id="ob-fim" type="date" ${dis} value="${obra?.data_fim||""}"></div>
        </div>
        <div class="form-group"><label class="form-label">Observações</label><textarea class="form-input" id="ob-obs" ${dis} placeholder="Informações adicionais...">${obra?.observacoes||""}</textarea></div>
        <div id="ob-error"></div>
        ${!readOnly ? `<div style="display:flex;align-items:center;gap:8px;">
          ${isEdit ? `<button class="btn" style="background:rgba(204,0,0,.1);border-color:rgba(204,0,0,.3);color:var(--red3);margin-right:auto;" onclick="deleteObra('${obra.id}')">🗑 Remover</button>` : ""}
          <button class="btn" style="margin-left:auto;" onclick="closeObraModal()">Cancelar</button>
          <button class="btn btn-primary" onclick="saveObra('${obra?.id||""}',${lat||"null"},${lng||"null"})">💾 Salvar Obra</button>
        </div>` : ""}
      </div>
    </div>
  `;
  ov.onclick = e => { if (e.target === ov) closeObraModal(); };
}

function closeObraModal() {
  document.getElementById("overlay-obra").style.display = "none";
}

async function saveObra(id, lat, lng) {
  const nome = document.getElementById("ob-nome").value.trim();
  const resp = document.getElementById("ob-resp").value.trim();
  const status = document.getElementById("ob-status").value;
  const inicio = document.getElementById("ob-inicio").value;
  const fim = document.getElementById("ob-fim").value;
  const obs = document.getElementById("ob-obs").value;
  if (!nome || !resp) { document.getElementById("ob-error").innerHTML = '<div class="msg-error">⚠️ Preencha Nome e Responsável!</div>'; return; }
  try {
    if (id) {
      const res = await api("PUT", `/api/obras/${id}`, { nome, responsavel:resp, status, data_inicio:inicio, data_fim:fim, observacoes:obs });
      if (!res.ok) throw new Error(res.data.error || "Erro");
    } else {
      const res = await api("POST", "/api/obras", { nome, responsavel:resp, status, latitude:lat, longitude:lng, data_inicio:inicio, data_fim:fim, observacoes:obs });
      if (!res.ok) throw new Error(res.data.error || "Erro");
    }
    closeObraModal();
    loadData();
  } catch (e) {
    document.getElementById("ob-error").innerHTML = `<div class="msg-error">⚠️ ${e.message}</div>`;
  }
}

async function deleteObra(id) {
  if (!confirm("Remover esta obra?")) return;
  try {
    await api("DELETE", `/api/obras/${id}`);
    closeObraModal();
    loadData();
  } catch (e) {
    document.getElementById("ob-error").innerHTML = `<div class="msg-error">⚠️ ${e.message}</div>`;
  }
}

// ── Report ──
function openReport() {
  const ov = document.getElementById("overlay-rel");
  ov.style.display = "flex";
  renderReport();
}

function closeReport() {
  document.getElementById("overlay-rel").style.display = "none";
}

function renderReport() {
  const ov = document.getElementById("overlay-rel");
  const uniqueResps = [...new Set(obras.map(o => o.responsavel))];
  const cadNames = cadastros.map(c => c.nome).filter(n => !uniqueResps.includes(n));
  const allResps = [...uniqueResps, ...cadNames];

  ov.innerHTML = `
    <div class="modal modal-wide" onclick="event.stopPropagation();">
      <div class="modal-header"><h3>📊 Relatório de Obras</h3><button class="modal-close" onclick="closeReport()">✕</button></div>
      <div class="modal-body">
        <div class="form-row">
          <div><label class="form-label">Data Inicial</label><input class="form-input" id="rel-inicio" type="date" onchange="updateReport()"></div>
          <div><label class="form-label">Data Final</label><input class="form-input" id="rel-fim" type="date" onchange="updateReport()"></div>
        </div>
        <div class="form-row">
          <div><label class="form-label">Status</label><select class="form-input" id="rel-status" onchange="updateReport()">
            <option value="all">Todos</option>
            <option value="andamento">🟡 Em Andamento</option>
            <option value="concluida">🟢 Concluída</option>
            <option value="paralisada">🔴 Paralisada</option>
            <option value="cotacao">🔵 Obra em Cotação</option>
          </select></div>
          <div><label class="form-label">Responsável</label><select class="form-input" id="rel-resp" onchange="updateReport()">
            <option value="all">Todos (Geral)</option>
            ${allResps.map(r => `<option value="${r}">${r}</option>`).join("")}
          </select></div>
        </div>
        <div style="display:flex;align-items:center;gap:16px;margin-bottom:16px;">
          <div style="font-family:'Syne',sans-serif;font-size:24px;font-weight:800;color:var(--red3);" id="rel-count">0</div>
          <span style="font-size:13px;color:var(--muted);">obras encontradas</span>
        </div>
        <div class="report-table" id="rel-table"></div>
        <div style="display:flex;justify-content:flex-end;margin-top:16px;">
          <button class="btn btn-green" onclick="exportExcel()">📥 Exportar Excel</button>
        </div>
      </div>
    </div>
  `;
  ov.onclick = e => { if (e.target === ov) closeReport(); };
  updateReport();
}

function getFilteredReport() {
  let result = [...obras];
  const st = document.getElementById("rel-status")?.value || "all";
  const rp = document.getElementById("rel-resp")?.value || "all";
  const ini = document.getElementById("rel-inicio")?.value || "";
  const fim = document.getElementById("rel-fim")?.value || "";
  if (st !== "all") result = result.filter(o => o.status === st);
  if (rp !== "all") result = result.filter(o => o.responsavel === rp);
  if (ini) result = result.filter(o => o.data_inicio && o.data_inicio >= ini);
  if (fim) result = result.filter(o => o.data_fim && o.data_fim <= fim);
  return result;
}

const STATUS_LABELS = {
  andamento:"🟡 Em Andamento", concluida:"🟢 Concluída", paralisada:"🔴 Paralisada", cotacao:"🔵 Obra em Cotação"
};

function updateReport() {
  const filtered = getFilteredReport();
  document.getElementById("rel-count").textContent = filtered.length;
  const tb = document.getElementById("rel-table");
  tb.innerHTML = `<div class="thead"><span>Nome</span><span>Responsável</span><span>Status</span><span>Início</span></div>` +
    (filtered.length ? filtered.map(o => `<div class="trow"><span class="truncate">${o.nome}</span><span class="truncate" style="color:var(--muted);">${o.responsavel}</span><span>${(STATUS_LABELS[o.status]||o.status).split(" ")[0]}</span><span style="color:var(--muted);">${o.data_inicio||"—"}</span></div>`).join("") : '<div style="padding:16px;text-align:center;color:var(--muted);">Nenhuma obra encontrada.</div>');
}

function exportExcel() {
  const filtered = getFilteredReport();
  const data = filtered.map(o => ({
    "Nome": o.nome, "Responsável": o.responsavel, "Status": STATUS_LABELS[o.status] || o.status,
    "Início": o.data_inicio || "—", "Previsão Fim": o.data_fim || "—",
    "Observações": o.observacoes || "", "Criado em": o.criado_em || ""
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Relatório");
  XLSX.writeFile(wb, `relatorio_obras_${new Date().toISOString().slice(0,10)}.xlsx`);
}

// ── Boot ──
window.addEventListener("DOMContentLoaded", () => {
  if (authToken && currentUser) initApp();
  else renderAuth();
});
