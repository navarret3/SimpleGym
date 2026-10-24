/* ============================================================
   SELECCIÓN DE USUARIO Y ARRANQUE
   ============================================================ */
function getStoredUser() {
  try { return localStorage.getItem("simplegym_current_user") || ""; } catch (e) { return ""; }
}
function setStoredUser(u) {
  try { localStorage.setItem("simplegym_current_user", u); } catch (e) {}
}
function paramUser() {
  var m = new RegExp("[?&]u=(" + Object.keys(PROFILES).join("|") + ")").exec(location.search);
  return m ? m[1] : "";
}

function serializeCustomProfiles() {
  var list = [];
  Object.keys(PROFILES).forEach(function (id) {
    if (STATIC_PROFILE_IDS[id]) return;
    var p = PROFILES[id];
    list.push({ id: id, label: p.label, sub: p.sub, color: p.color, config: p.config });
  });
  return { list: list };
}

function saveCustomProfiles() {
  SimpleGymStore.save(CUSTOM_PROFILES_ID, serializeCustomProfiles());
}

async function loadCustomProfiles() {
  if (customProfilesLoaded) return;
  customProfilesLoaded = true;
  try {
    var data = await SimpleGymStore.load(CUSTOM_PROFILES_ID);
    var list = (data && data.list) || [];
    list.forEach(function (p) {
      if (p && p.id && !PROFILES[p.id]) {
        PROFILES[p.id] = { label: p.label, sub: p.sub, color: p.color, config: attachHeaderFunctions(p.config) };
      }
    });
  } catch (e) {}
}

function renderUserPicker() {
  var app = document.getElementById("app");
  var html = '<div class="userpick">' +
    '<div class="eyebrow">SIMPLEGYM</div>' +
    '<div class="userpick-title">¿Quién eres?</div>' +
    '<div class="userpick-row">';
  Object.keys(PROFILES).forEach(function (id) {
    var u = PROFILES[id];
    html += '<div class="userpick-btn" style="background:' + u.color + '15;border:1px solid ' + u.color + '55" onclick="chooseUser(\'' + id + '\')">' +
      (id === getStoredUser() ? '<div style="font-size:9px;font-weight:700;letter-spacing:2px;color:rgba(255,255,255,0.4);margin-bottom:6px">ÚLTIMO USADO</div>' : '') +
      '<div style="font-size:18px;font-weight:800;color:' + u.color + '">' + esc(u.label) + '</div>' +
      '<div style="font-size:11px;color:rgba(255,255,255,0.4);margin-top:4px">' + esc(u.sub) + '</div>' +
    '</div>';
  });
  if (!creatingProfile) {
    html += '<div class="userpick-add" onclick="app_showCreateProfile()">+ Añadir rutina</div>';
  }
  html += '</div>';
  if (creatingProfile) {
    html += '<div class="userpick-form">' +
      '<input id="new-profile-name" class="userpick-input" placeholder="Nombre de la persona" maxlength="30">' +
      '<select id="new-profile-template" class="userpick-input">' +
        Object.keys(TEMPLATES).map(function (k) { return '<option value="' + k + '"' + (k === "upperlower4" ? " selected" : "") + ">" + esc(TEMPLATES[k].label) + "</option>"; }).join("") +
      "</select>" +
      '<div class="userpick-note" style="max-width:none;text-align:left">Plantillas con doble progresión (rango de reps), 5 semanas de progreso + 1 de descarga. Torso/Pierna 4 días es la opción recomendada para ganar músculo.</div>' +
      '<div class="userpick-form-actions">' +
        '<div class="userpick-form-btn" style="background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.5)" onclick="app_cancelCreateProfile()">Cancelar</div>' +
        '<div class="userpick-form-btn" style="background:#C8FF00;color:#000" onclick="app_createProfile()">Crear rutina</div>' +
      "</div>" +
    "</div>";
  }
  html += '<div class="userpick-note">Elige tu perfil para entrar. Puedes volver aquí con "Cambiar de usuario" en el pie de la página.</div></div>';
  app.innerHTML = html;
  if (creatingProfile) {
    var inp = document.getElementById("new-profile-name");
    if (inp) {
      inp.focus();
      inp.addEventListener("keydown", function (e) { if (e.key === "Enter") window.app_createProfile(); });
    }
  }
}

window.chooseUser = function (id) {
  setStoredUser(id);
  boot(id);
};
window.switchUser = function () {
  setStoredUser("");
  creatingProfile = false;
  renderUserPicker();
};
window.app_showCreateProfile = function () {
  creatingProfile = true;
  renderUserPicker();
};
window.app_cancelCreateProfile = function () {
  creatingProfile = false;
  renderUserPicker();
};
window.app_createProfile = function () {
  var inp = document.getElementById("new-profile-name");
  var name = inp ? inp.value.trim() : "";
  if (!name) { if (inp) inp.focus(); return; }
  var id = slugifyId(name);
  var color = NEW_PROFILE_COLORS[Object.keys(PROFILES).length % NEW_PROFILE_COLORS.length];
  var tplSel = document.getElementById("new-profile-template");
  var tplKey = tplSel ? tplSel.value : "blank";
  PROFILES[id] = { label: name, sub: (TEMPLATES[tplKey] || TEMPLATES.blank).sub, color: color, config: buildConfig(id, name, color, tplKey) };
  saveCustomProfiles();
  creatingProfile = false;
  window.chooseUser(id);
};

async function boot(forceUser) {
  await loadCustomProfiles();
  // La pantalla de inicio es el selector de perfil; solo se salta con ?u=perfil o al elegir uno.
  var user = forceUser || paramUser();
  if (!user || !PROFILES[user]) { renderUserPicker(); return; }
  setStoredUser(user);
  document.getElementById("app").innerHTML = '<div class="loading">CARGANDO…</div>';
  var data = await SimpleGymStore.load(user);
  initProfileApp(PROFILES[user].config, data);
}

if ("serviceWorker" in navigator && /^https?:/.test(location.protocol)) {
  window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js").catch(function () {}); });
}
boot();
