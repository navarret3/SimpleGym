/* ============================================================
   MOTOR GENÉRICO DE LA APP — una sola implementación compartida
   por todas las rutinas registradas en PROFILES.
   ============================================================ */
function initProfileApp(profile, initialData) {
  var days = profile.days;
  var header = profile.header;
  var weightColumnLabel = profile.weightColumnLabel || "PESO";

  function round025(n) { return Math.round(n * 4) / 4; }
  function fmtWeight(w, bw) { return w > 0 ? round(w) + " kg" : (bw ? "Corporal" : "Elige peso"); }
  function parseNum(v) { return parseFloat(String(v).replace(",", ".")); }

  function buildDefaultProgress() {
    var exercises = {};
    days.forEach(function (day) {
      day.exercises.forEach(function (ex) {
        if (ex.trackable) exercises[ex.id] = { top: ex.baseTop, history: [] };
      });
    });
    return { exercises: exercises, overrides: {}, removed: {}, custom: {}, schemes: {}, order: {}, schedule: {}, dayNames: {}, customDays: [], removedDays: {}, session: { date: todayISO(), checked: {} } };
  }

  /* Versiones anteriores congelaban la pirámide como texto al editar un
     ejercicio (y dejaba de progresar). Aquí se convierten a un esquema
     vivo: reps por serie + pesos relativos al peso base ("top"). */
  function migrateFrozenOverrides(p) {
    Object.keys(p.overrides).forEach(function (key) {
      var ov = p.overrides[key];
      if (!ov || !ov.sets) return;
      var ex = findExercise(key);
      if (ex && !ex.trackable) return; // ejercicios de peso corporal: se quedan como texto
      var reps = ov.sets.map(function (s) { var n = parseInt(s.reps, 10); return isNaN(n) || n < 1 ? 10 : n; });
      var ws = ov.sets.map(function (s) { var n = parseNum(s.weight); return isNaN(n) ? 0 : n; });
      var lastW = ws[ws.length - 1];
      p.schemes[key] = { repsPattern: reps, offsets: ws.map(function (w) { return round(w - lastW); }) };
      var prev = p.exercises[key];
      p.exercises[key] = { top: lastW, history: prev && prev.history ? prev.history : [] };
      delete ov.sets;
    });
  }

  function normalize(raw) {
    var def = buildDefaultProgress();
    var parsed = raw || {};
    var today = todayISO();
    var p = {
      exercises: Object.assign({}, def.exercises, parsed.exercises || {}),
      overrides: parsed.overrides || {},
      removed: parsed.removed || {},
      custom: parsed.custom || {},
      schemes: parsed.schemes || {},
      order: parsed.order || {},
      schedule: parsed.schedule || {},
      dayNames: parsed.dayNames || {},
      customDays: (parsed.customDays || []).map(function (d) { return Object.assign({ exercises: [] }, d); }),
      removedDays: parsed.removedDays || {},
      session: parsed.session && parsed.session.date === today ? parsed.session : def.session,
      planVersion: parsed.planVersion || 1,
    };
    migrateFrozenOverrides(p);
    upgradePlan(p, parsed);
    return p;
  }

  /* Cuando un perfil cambia de plan (profile.planVersion), los pesos guardados del plan
     anterior se convierten al nuevo rango de reps con la fórmula de Epley: se estima el
     máximo de una repetición con la serie pesada antigua (legacyTopReps) y se calcula el
     peso para repsMin + 1 reps. Así no pierdes tu progreso al cambiar de pirámide a rango. */
  function upgradePlan(p, parsed) {
    var target = profile.planVersion || 1;
    if (p.planVersion >= target) return;
    var hadData = parsed.exercises && Object.keys(parsed.exercises).length;
    if (hadData) {
      days.forEach(function (day) {
        day.exercises.forEach(function (ex) {
          if (!ex.trackable || !ex.legacyTopReps) return;
          var frozen = p.schemes[ex.id];
          var cur = frozen ? p.exercises[ex.id] : parsed.exercises[ex.id];
          if (!cur || !(cur.top > 0)) return;
          var oldReps = frozen ? frozen.repsPattern[frozen.repsPattern.length - 1] : ex.legacyTopReps;
          var est1rm = cur.top * (1 + oldReps / 30);
          var top = Math.round(est1rm / (1 + (ex.repsPattern[0] + 1) / 30) / ex.step) * ex.step;
          p.exercises[ex.id] = { top: round(top), history: cur.history || [], deloadAt: cur.deloadAt };
        });
      });
    }
    // los esquemas y el orden del plan anterior ya no corresponden a los ejercicios nuevos
    days.forEach(function (day) { day.exercises.forEach(function (ex) { delete p.schemes[ex.id]; }); });
    p.order = {};
    p.planVersion = target;
  }

  function saveProgress(p) {
    progress = p;
    SimpleGymStore.save(profile.id, p);
  }

  function findExercise(exId) {
    for (var d = 0; d < days.length; d++) {
      for (var e = 0; e < days[d].exercises.length; e++) {
        if (days[d].exercises[e].id === exId) return days[d].exercises[e];
      }
    }
    return null;
  }

  /* Esquema de un ejercicio con peso: { repsPattern, offsets, step, baseTop }.
     null para los ejercicios de peso corporal definidos como texto fijo. */
  function getScheme(key, prog) {
    var ex = findExercise(key);
    var s = prog.schemes[key];
    if (s) return { repsPattern: s.repsPattern, offsets: s.offsets, repMax: s.repMax || 0, bw: !!(ex && ex.bw), step: ex && ex.step ? ex.step : 2.5, baseTop: ex && ex.baseTop ? ex.baseTop : 0 };
    if (ex && ex.trackable) return ex;
    return null;
  }

  function topFor(key, prog, scheme) {
    var e = prog.exercises[key];
    return e ? e.top : (scheme.baseTop || 0);
  }

  /* Series tal cual están en la rutina: sin fases ni progresión automática,
     los pesos y reps solo cambian a mano desde "Editar rutina". */
  function getPyramid(key, prog) {
    var scheme = getScheme(key, prog);
    if (!scheme) return findExercise(key).staticPyramid;
    var top = topFor(key, prog, scheme);
    return scheme.repsPattern.map(function (reps, i) {
      return {
        set: i + 1,
        reps: scheme.repMax ? reps + "–" + scheme.repMax : reps,
        weight: fmtWeight(Math.max(0, round025(top + scheme.offsets[i])), scheme.bw),
      };
    });
  }

  /* ---------------- STATE ---------------- */
  var activeDay = null;
  var expanded = {};
  var progress = normalize(initialData);
  activeDay = trainingDayForToday(dayMap()) || nextTrainingDay(dayMap(), new Date().getDay());
  var editingId = null;
  var toastMsg = "";
  var toastTimeout = null;
  var confirmReset = false;
  var confirmResetTimeout = null;
  var editMode = false;
  var statsKey = null;

  /* Días de entreno activos: los del perfil que no se hayan quitado, más los
     añadidos desde "Editar rutina" (progress.customDays). */
  function activeDays() {
    return days.filter(function (d) { return !progress.removedDays[d.id]; }).concat(progress.customDays);
  }
  function findDay(id) { return activeDays().filter(function (d) { return d.id === id; })[0] || null; }

  /* Día de la semana de cada día de entreno: el del perfil (o el elegido al
     añadirlo), salvo que se haya movido desde "Editar rutina" (progress.schedule). */
  function dayMap() {
    var wdOf = {};
    Object.keys(profile.dayIdsByWeekday).forEach(function (wd) {
      var id = profile.dayIdsByWeekday[wd];
      if (!progress.removedDays[id]) wdOf[id] = parseInt(wd, 10);
    });
    progress.customDays.forEach(function (d) { wdOf[d.id] = d.weekday; });
    Object.keys(progress.schedule).forEach(function (id) { if (wdOf[id] !== undefined) wdOf[id] = progress.schedule[id]; });
    var map = {};
    Object.keys(wdOf).forEach(function (id) { map[wdOf[id]] = id; });
    return map;
  }

  var NEW_DAY_ACCENTS = ["#C8FF00", "#38BDF8", "#FF6B35", "#E879F9", "#FBBF24", "#34D399", "#A78BFA"];

  function app_addDay(wd) {
    wd = parseInt(wd, 10);
    if (dayMap()[wd]) return;
    var id = "dia-" + Date.now();
    progress.customDays.push({
      id: id, weekday: wd, label: WEEKDAY_SHORT[wd].toUpperCase(), fullName: WEEKDAY_NAMES[wd].toUpperCase(),
      type: "ENTRENO", tag: "Extra", subtitle: "", accent: NEW_DAY_ACCENTS[wd % NEW_DAY_ACCENTS.length], bg: "#0a0a0a", exercises: [],
    });
    saveProgress(progress);
    activeDay = id;
    expanded = {};
    render();
  }

  function app_removeDay(dayId) {
    if (activeDays().length <= 1) { showToast("Debe quedar al menos 1 día de entreno."); return; }
    var day = findDay(dayId);
    if (!day || !window.confirm("¿Quitar " + dayLabel(day).fullName + " de tus días de entreno?")) return;
    var isCustom = progress.customDays.some(function (d) { return d.id === dayId; });
    if (isCustom) {
      progress.customDays = progress.customDays.filter(function (d) { return d.id !== dayId; });
      (progress.custom[dayId] || []).forEach(function (k) { delete progress.overrides[k]; delete progress.schemes[k]; });
      delete progress.custom[dayId];
    } else {
      progress.removedDays[dayId] = true;
    }
    delete progress.schedule[dayId];
    delete progress.order[dayId];
    delete progress.dayNames[dayId];
    saveProgress(progress);
    var map = dayMap();
    activeDay = trainingDayForToday(map) || nextTrainingDay(map, new Date().getDay());
    expanded = {};
    render();
  }

  function buildWeekDays() {
    var map = dayMap();
    return [1, 2, 3, 4, 5, 6, 0].map(function (wd) {
      return map[wd] ? { label: WEEKDAY_LETTER[wd], id: map[wd], active: true } : { label: WEEKDAY_LETTER[wd], active: false };
    });
  }

  /* Nombre y tipo del día, con lo que se haya cambiado en "Editar rutina". */
  function dayLabel(day) {
    var n = progress.dayNames[day.id] || {};
    return { fullName: n.fullName || day.fullName, type: n.type || day.type };
  }

  function app_updateDayName(dayId, field, value) {
    var v = String(value || "").trim();
    var n = progress.dayNames[dayId] || (progress.dayNames[dayId] = {});
    if (v) n[field] = v; else delete n[field];
    if (!Object.keys(n).length) delete progress.dayNames[dayId];
    saveProgress(progress);
    render();
  }

  function currentOverviewRows() {
    var untouched = !Object.keys(progress.schedule).length && !Object.keys(progress.dayNames).length &&
      !Object.keys(progress.removedDays).length && !progress.customDays.length;
    if (untouched) return profile.overviewRows;
    var map = dayMap();
    return [1, 2, 3, 4, 5, 6, 0].map(function (wd) {
      var d = map[wd] && findDay(map[wd]);
      return d ? { day: WEEKDAY_NAMES[wd], type: dayLabel(d).type, tag: d.tag, accent: d.accent }
               : { day: WEEKDAY_NAMES[wd], type: "Descanso", tag: wd === 0 ? "Recuperación" : "Cardio opcional", accent: "#222" };
    });
  }

  function app_setDayWeekday(dayId, wd) {
    wd = parseInt(wd, 10);
    var map = dayMap();
    var cur = null;
    Object.keys(map).forEach(function (k) { if (map[k] === dayId) cur = parseInt(k, 10); });
    if (cur === null || cur === wd) return;
    var other = map[wd];
    progress.schedule[dayId] = wd;
    if (other) progress.schedule[other] = cur;
    saveProgress(progress);
    render();
  }

  /* Series por semana de cada músculo (con los esquemas base, sin ajustes de fase). */
  function weeklySets() {
    var totals = {};
    activeDays().forEach(function (day) {
      effectiveExercises(day, progress).forEach(function (item) {
        var data = getDisplayData(item, progress);
        var scheme = getScheme(item.key, progress);
        var n = scheme ? scheme.repsPattern.length : data.pyramid.length;
        var fam = muscleFamily(data.muscle);
        totals[fam] = (totals[fam] || 0) + n;
      });
    });
    return Object.keys(totals).map(function (m) { return { muscle: m, sets: totals[m] }; })
      .sort(function (a, b) { return b.sets - a.sets; });
  }

  function weekdaySelect(day) {
    var map = dayMap();
    var html = '<select class="muscle-select" onchange="app_setDayWeekday(\'' + day.id + '\', this.value)">';
    [1, 2, 3, 4, 5, 6, 0].forEach(function (wd) {
      var occ = map[wd] && map[wd] !== day.id ? findDay(map[wd]) : null;
      html += '<option value="' + wd + '"' + (map[wd] === day.id ? " selected" : "") + ">" + WEEKDAY_NAMES[wd] + (occ ? " ⇄ " + esc(dayLabel(occ).type) : "") + "</option>";
    });
    return html + "</select>";
  }

  function currentDay() { return findDay(activeDay) || activeDays()[0]; }

  /* Los checks del día viven en progress.session (se guardan en local y en
     la nube) y caducan solos al cambiar de fecha. */
  function sessionChecked() {
    var t = todayISO();
    if (!progress.session || progress.session.date !== t) progress.session = { date: t, checked: {} };
    return progress.session.checked;
  }

  /* ---------------- EDICIÓN DE RUTINA ---------------- */
  function effectiveExercises(day, prog) {
    var list = [];
    day.exercises.forEach(function (ex) {
      if (prog.removed[ex.id]) return;
      list.push({ key: ex.id, base: ex, custom: false });
    });
    (prog.custom[day.id] || []).forEach(function (key) {
      list.push({ key: key, base: null, custom: true });
    });
    var ord = prog.order[day.id];
    if (ord && ord.length) {
      var pos = {};
      ord.forEach(function (k, i) { pos[k] = i; });
      list = list.map(function (it, i) { return { it: it, i: i }; }).sort(function (a, b) {
        var pa = pos[a.it.key] == null ? 1e6 + a.i : pos[a.it.key];
        var pb = pos[b.it.key] == null ? 1e6 + b.i : pos[b.it.key];
        return pa - pb;
      }).map(function (x) { return x.it; });
    }
    return list;
  }

  function getDisplayData(item, prog) {
    var ov = prog.overrides[item.key];
    var ex = item.base;
    var scheme = getScheme(item.key, prog);
    var pyramid;
    if (ov && ov.sets) {
      pyramid = ov.sets.map(function (s, i) { return { set: i + 1, reps: s.reps, weight: s.weight }; });
    } else {
      pyramid = getPyramid(item.key, prog);
    }
    return {
      name: ov && ov.name != null ? ov.name : ex.name,
      muscle: (ov && ov.muscle) || (ex && ex.muscle) || "Core",
      pyramid: pyramid,
      progressive: !!scheme,
      ranged: !!(scheme && scheme.repMax),
      targetReps: scheme && scheme.repMax ? scheme.repMax : parseInt(pyramid[pyramid.length - 1].reps, 10),
    };
  }

  /* Filas del modo edición: para ejercicios con peso, reps y kg de cada
     serie; para los de texto fijo, el texto. */
  function getEditRows(item, data) {
    var scheme = getScheme(item.key, progress);
    if (!scheme || (progress.overrides[item.key] && progress.overrides[item.key].sets)) return data.pyramid;
    var top = topFor(item.key, progress, scheme);
    return scheme.repsPattern.map(function (reps, i) {
      return { set: i + 1, reps: scheme.repMax ? reps + "–" + scheme.repMax : reps, weight: round(top + scheme.offsets[i]) };
    });
  }

  function ensureOverride(key) {
    if (!progress.overrides[key]) {
      var ex = findExercise(key);
      if (ex) {
        var ov = { name: ex.name, muscle: ex.muscle };
        if (!getScheme(key, progress)) {
          ov.sets = (ex.staticPyramid || []).map(function (p) { return { reps: String(p.reps), weight: String(p.weight) }; });
        }
        progress.overrides[key] = ov;
      } else {
        progress.overrides[key] = { name: "Nuevo ejercicio", muscle: "Core" };
      }
    }
    return progress.overrides[key];
  }

  function ensureScheme(key) {
    if (!progress.schemes[key]) {
      var ex = findExercise(key);
      if (!ex || !ex.trackable) return null;
      progress.schemes[key] = { repsPattern: ex.repsPattern.slice(), offsets: ex.offsets.slice(), repMax: ex.repMax || 0 };
      if (!progress.exercises[key]) progress.exercises[key] = { top: ex.baseTop, history: [] };
    }
    return progress.schemes[key];
  }

  /* Deja la última serie como referencia (offset 0) para que el peso base
     siga siendo el de la serie de trabajo tras quitar series. */
  function renormalizeScheme(key) {
    var s = progress.schemes[key];
    var d = s.offsets[s.offsets.length - 1];
    if (!d) return;
    var e = progress.exercises[key] || (progress.exercises[key] = { top: 0, history: [] });
    e.top = round(e.top + d);
    s.offsets = s.offsets.map(function (o) { return round(o - d); });
  }

  function app_toggleEditMode() { editMode = !editMode; render(); }

  function app_updateExerciseName(key, value) {
    ensureOverride(key).name = value;
    saveProgress(progress);
    render();
  }

  function app_updateExerciseMuscle(key, value) {
    var ov = ensureOverride(key);
    ov.muscle = value;
    saveProgress(progress);
    render();
  }

  function app_updateSetField(key, idx, field, value) {
    var scheme = ensureScheme(key);
    if (!scheme) {
      ensureOverride(key).sets[idx][field] = value;
    } else if (field === "reps") {
      var m = /^\s*(\d+)\s*[-–]\s*(\d+)\s*$/.exec(String(value));
      if (m) {
        var lo = parseInt(m[1], 10), hi = parseInt(m[2], 10);
        if (lo < 1 || hi < lo) { showToast("Revisa el rango de reps (ej. 8-12)."); return; }
        scheme.repsPattern = scheme.repsPattern.map(function () { return lo; });
        scheme.repMax = hi;
      } else {
        var n = parseInt(value, 10);
        if (isNaN(n) || n < 1) { showToast("Revisa las repeticiones."); return; }
        scheme.repsPattern[idx] = n;
        if (scheme.repMax && n > scheme.repMax) scheme.repMax = n;
      }
    } else {
      var w = parseNum(value);
      if (isNaN(w) || w < 0) { showToast("Revisa el peso."); return; }
      var entry = progress.exercises[key] || (progress.exercises[key] = { top: 0, history: [] });
      if (idx === scheme.offsets.length - 1) {
        var delta = w - entry.top;
        entry.top = round(w);
        scheme.offsets = scheme.offsets.map(function (o, i) { return i === idx ? 0 : round(o - delta); });
      } else {
        scheme.offsets[idx] = round(w - entry.top);
      }
      recordPlanWeight(key, scheme, entry);
    }
    saveProgress(progress);
    render();
  }

  /* Historial del peso de la rutina (la serie más pesada), para ver en las
     estadísticas cómo has ido subiendo aunque no registres cada sesión. */
  function recordPlanWeight(key, scheme, entry) {
    var maxW = Math.max.apply(null, scheme.offsets.map(function (o) { return round(entry.top + o); }));
    var today = todayISO();
    entry.planLog = (entry.planLog || []).filter(function (h) { return h.date !== today; })
      .concat([{ date: today, weight: maxW }]).slice(-60);
  }

  function app_addSet(key) {
    var scheme = ensureScheme(key);
    if (!scheme) {
      var ov = ensureOverride(key);
      var last = ov.sets[ov.sets.length - 1] || { reps: "10", weight: "Corporal" };
      ov.sets.push({ reps: last.reps, weight: last.weight });
    } else {
      scheme.repsPattern.push(scheme.repsPattern[scheme.repsPattern.length - 1]);
      scheme.offsets.push(0);
    }
    saveProgress(progress);
    render();
  }

  function app_removeSet(key, idx) {
    var scheme = ensureScheme(key);
    var count = scheme ? scheme.repsPattern.length : ensureOverride(key).sets.length;
    if (count <= 1) { showToast("Debe quedar al menos 1 serie."); return; }
    if (!scheme) {
      ensureOverride(key).sets.splice(idx, 1);
    } else {
      scheme.repsPattern.splice(idx, 1);
      scheme.offsets.splice(idx, 1);
      renormalizeScheme(key);
    }
    saveProgress(progress);
    render();
  }

  function app_addExercise(dayId) {
    var id = "custom-" + dayId + "-" + Date.now();
    progress.overrides[id] = { name: "Nuevo ejercicio", muscle: "Core" };
    progress.schemes[id] = { repsPattern: [10, 10, 10], offsets: [0, 0, 0] };
    progress.exercises[id] = { top: 0, history: [] };
    if (!progress.custom[dayId]) progress.custom[dayId] = [];
    progress.custom[dayId].push(id);
    saveProgress(progress);
    expanded[dayId + "-" + id] = true;
    render();
  }

  function app_removeExercise(key) {
    var ex = findExercise(key);
    if (ex) {
      progress.removed[key] = true;
    } else {
      progress.custom[activeDay] = (progress.custom[activeDay] || []).filter(function (k) { return k !== key; });
      delete progress.schemes[key];
    }
    delete progress.overrides[key];
    saveProgress(progress);
    render();
  }

  function app_restoreRemoved(dayId) {
    var day = days.filter(function (d) { return d.id === dayId; })[0];
    if (!day) return;
    day.exercises.forEach(function (ex) { delete progress.removed[ex.id]; });
    saveProgress(progress);
    render();
  }

  function app_moveExercise(key, dir) {
    var day = currentDay();
    var keys = effectiveExercises(day, progress).map(function (it) { return it.key; });
    var i = keys.indexOf(key);
    var j = i + dir;
    if (i < 0 || j < 0 || j >= keys.length) return;
    var tmp = keys[i]; keys[i] = keys[j]; keys[j] = tmp;
    progress.order[day.id] = keys;
    saveProgress(progress);
    render();
  }

  /* ---------------- ACTIONS ---------------- */
  function app_setActiveDay(id) { activeDay = id; expanded = {}; editingId = null; render(); }
  function app_toggleCheck(i) {
    var sc = sessionChecked();
    var k = activeDay + "-" + i;
    sc[k] = !sc[k];
    saveProgress(progress);
    if (sc[k]) RestTimer.start(restSecondsFor(i));
    render();
  }
  function app_toggleExpand(i) { var k = activeDay + "-" + i; expanded[k] = !expanded[k]; render(); }
  function app_openLogger(exId) { editingId = exId; render(); }
  function app_cancelLogger() { editingId = null; render(); }
  function app_openStats(key) { statsKey = key; render(); }
  function app_closeStats() { statsKey = null; render(); }

  /* Gráfica de líneas con ejes para la ventana de estadísticas. Cada serie es
     { pts: [{ date, v }], color, dashed }; el eje X es el tiempo real. */
  function statsChart(series, unit) {
    var all = [];
    series.forEach(function (s) { s.pts.forEach(function (p) { all.push(p); }); });
    if (!all.length) return "";
    var tOf = function (d) { return new Date(d + "T00:00:00").getTime(); };
    var ts = all.map(function (p) { return tOf(p.date); });
    var t0 = Math.min.apply(null, ts), t1 = Math.max.apply(null, ts);
    var vs = all.map(function (p) { return p.v; });
    var vmin = Math.min.apply(null, vs), vmax = Math.max.apply(null, vs);
    var pad = (vmax - vmin) * 0.15 || Math.max(1, vmax * 0.1);
    vmin = Math.max(0, vmin - pad); vmax = vmax + pad;
    var W = 320, H = 180, L = 38, R = 12, T = 12, B = 26;
    var x = function (t) { return t1 === t0 ? L + (W - L - R) / 2 : L + ((t - t0) / (t1 - t0)) * (W - L - R); };
    var y = function (v) { return T + ((vmax - v) / (vmax - vmin)) * (H - T - B); };
    var svg = '<svg viewBox="0 0 ' + W + " " + H + '" class="stats-svg">';
    [0, 0.5, 1].forEach(function (f) {
      var v = vmin + (vmax - vmin) * f, yy = y(v).toFixed(1);
      svg += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + yy + '" y2="' + yy + '" stroke="rgba(255,255,255,0.08)"/>' +
        '<text x="' + (L - 6) + '" y="' + yy + '" text-anchor="end" dominant-baseline="middle" class="stats-axis">' + Math.round(v) + "</text>";
    });
    svg += '<text x="' + L + '" y="' + (H - 6) + '" class="stats-axis">' + formatDateEs(all.reduce(function (a, p) { return tOf(p.date) === t0 ? p.date : a; }, "")) + "</text>";
    if (t1 !== t0) svg += '<text x="' + (W - R) + '" y="' + (H - 6) + '" text-anchor="end" class="stats-axis">' + formatDateEs(all.reduce(function (a, p) { return tOf(p.date) === t1 ? p.date : a; }, "")) + "</text>";
    series.forEach(function (s) {
      if (!s.pts.length) return;
      var pts = s.pts.slice().sort(function (a, b) { return tOf(a.date) - tOf(b.date); });
      var line = pts.map(function (p) { return x(tOf(p.date)).toFixed(1) + "," + y(p.v).toFixed(1); }).join(" ");
      svg += '<polyline fill="none" stroke="' + s.color + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"' + (s.dashed ? ' stroke-dasharray="5 4"' : "") + ' points="' + line + '"/>';
      if (!s.dashed) pts.forEach(function (p) { svg += '<circle cx="' + x(tOf(p.date)).toFixed(1) + '" cy="' + y(p.v).toFixed(1) + '" r="3" fill="' + s.color + '"/>'; });
    });
    return svg + '<text x="' + (L - 6) + '" y="' + (H - 6) + '" text-anchor="end" class="stats-axis">' + unit + "</text></svg>";
  }

  function statsHtml(key, accent) {
    var data = getDisplayData({ key: key, base: findExercise(key) }, progress);
    var e = progress.exercises[key] || {};
    var logs = (e.history || []).slice();
    var plan = (e.planLog || []).slice();
    var useWeight = logs.some(function (h) { return h.weight > 0; }) || (!logs.length && plan.length);
    var unit = useWeight ? "kg" : "reps";
    var logPts = logs.map(function (h) { return { date: h.date, v: useWeight ? h.weight : h.reps }; });
    var planPts = useWeight ? plan.map(function (h) { return { date: h.date, v: h.weight }; }) : [];
    var html = '<div class="statsmodal" onclick="if (event.target === this) app_closeStats()"><div class="statscard">' +
      '<div class="statshead"><div><div class="stats-eyebrow">ESTADÍSTICAS</div><div class="stats-title">' + esc(data.name) + "</div></div>" +
      '<div class="stats-close" onclick="app_closeStats()">✕</div></div>';
    if (!logPts.length && !planPts.length) {
      return html + '<div class="stats-empty">Aún no hay registros de este ejercicio.</div></div></div>';
    }
    var src = logPts.length ? logPts : planPts;
    var first = src[0].v, last = src[src.length - 1].v;
    var best = Math.max.apply(null, src.map(function (p) { return p.v; }));
    var diff = round(last - first);
    var pct = first > 0 ? Math.round((diff / first) * 100) : 0;
    html += '<div class="statsgrid">' +
      '<div><div class="stats-k">INICIO</div><div class="stats-v">' + first + " " + unit + "</div></div>" +
      '<div><div class="stats-k">ACTUAL</div><div class="stats-v">' + last + " " + unit + "</div></div>" +
      '<div><div class="stats-k">MÁXIMO</div><div class="stats-v">' + best + " " + unit + "</div></div>" +
      '<div><div class="stats-k">CAMBIO</div><div class="stats-v" style="color:' + (diff > 0 ? accent : diff < 0 ? "#ff6b6b" : "#fff") + '">' + (diff > 0 ? "+" : "") + diff + " " + unit + (first > 0 ? " · " + (pct > 0 ? "+" : "") + pct + " %" : "") + "</div></div>" +
      "</div>";
    html += statsChart([
      { pts: planPts, color: "rgba(255,255,255,0.35)", dashed: true },
      { pts: logPts, color: accent, dashed: false },
    ], unit);
    if (planPts.length && logPts.length) {
      html += '<div class="stats-legend"><span><i style="background:' + accent + '"></i>Registrado</span><span><i class="dashed"></i>Peso en la rutina</span></div>';
    }
    if (logs.length) {
      html += '<div class="stats-list">' + logs.slice(-8).reverse().map(function (h) {
        return '<div class="stats-row"><span>' + formatDateEs(h.date) + "</span><span>" + (h.weight > 0 ? h.weight + " kg × " : "") + h.reps + " reps</span></div>";
      }).join("") + "</div>";
    }
    return html + "</div></div>";
  }

  function showToast(msg) {
    toastMsg = msg;
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(function () { toastMsg = ""; render(); }, 3000);
    render();
  }

  /* Registrar lo hecho hoy guarda el historial (gráfica y "Últ:"); no cambia
     los pesos de la rutina, que solo se editan a mano. */
  function app_saveLog(key) {
    var scheme = getScheme(key, progress);
    var wRaw = String(document.getElementById("inp-weight").value).trim();
    var w = wRaw === "" ? 0 : parseNum(wRaw);
    var r = parseInt(document.getElementById("inp-reps").value, 10);
    if (isNaN(w) || w < 0 || isNaN(r)) { showToast("Revisa los números introducidos."); return; }
    var prev = progress.exercises[key] || { top: scheme ? (scheme.baseTop || 0) : 0, history: [] };
    var today = todayISO();
    var newHistory = (prev.history || []).filter(function (h) { return h.date !== today; })
      .concat([{ date: today, weight: w, reps: r }]).slice(-40);
    progress.exercises[key] = { top: prev.top, history: newHistory, planLog: prev.planLog };
    sessionChecked()[activeDay + "-" + key] = true;
    saveProgress(progress);
    editingId = null;
    RestTimer.start(restSecondsFor(key));
    showToast("Guardado ✓");
  }

  /* Descanso sugerido: más largo en básicos pesados (≤ 8 reps), más corto en aislamiento. */
  function restSecondsFor(key) {
    var scheme = getScheme(key, progress);
    if (!scheme) return 60;
    return scheme.repsPattern[0] <= 8 ? 120 : 75;
  }

  /* Gráfica sencilla de la evolución del ejercicio (peso, o reps si no lleva peso). */
  function sparkline(history, accent) {
    var withWeight = history.some(function (h) { return h.weight > 0; });
    var pts = history.map(function (h) { return withWeight ? h.weight : h.reps; });
    if (pts.length < 2) return "";
    var min = Math.min.apply(null, pts), max = Math.max.apply(null, pts);
    var span = max - min || 1;
    var W = 220, H = 44, pad = 6;
    var coords = pts.map(function (v, i) {
      return [pad + (i / (pts.length - 1)) * (W - pad * 2), H - pad - ((v - min) / span) * (H - pad * 2)];
    });
    var line = coords.map(function (c) { return c[0].toFixed(1) + "," + c[1].toFixed(1); }).join(" ");
    var last = coords[coords.length - 1];
    var unit = withWeight ? " kg" : " reps";
    return '<div class="spark"><div class="spark-label">EVOLUCIÓN · ' + pts.length + ' SESIONES</div>' +
      '<svg viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none" class="spark-svg">' +
      '<polyline fill="none" stroke="' + accent + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" points="' + line + '"/>' +
      '<circle cx="' + last[0].toFixed(1) + '" cy="' + last[1].toFixed(1) + '" r="3" fill="' + accent + '"/></svg>' +
      '<div class="spark-range"><span>' + pts[0] + unit + "</span><span>" + pts[pts.length - 1] + unit + "</span></div></div>";
  }

  /* Copia de seguridad: descarga el progreso de este perfil como JSON y permite restaurarlo. */
  function app_exportData() {
    var payload = { app: "simplegym", version: "1.0.0", profile: profile.id, exportedAt: new Date().toISOString(), data: progress };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "simplegym-" + profile.id + "-" + todayISO() + ".json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  function app_importData() {
    var input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.onchange = function () {
      var f = input.files && input.files[0];
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var payload = JSON.parse(reader.result);
          if (!payload || payload.app !== "simplegym" || !payload.data || !payload.data.exercises) throw new Error("formato");
          if (payload.profile !== profile.id) { showToast("Ese archivo es del perfil «" + payload.profile + "», no de este."); return; }
          if (!window.confirm("Esto reemplaza tu progreso actual por el del archivo. ¿Continuar?")) return;
          SimpleGymStore.save(profile.id, payload.data);
          initProfileApp(profile, payload.data);
        } catch (e) { showToast("No se pudo leer el archivo."); }
      };
      reader.readAsText(f);
    };
    input.click();
  }

  function app_handleReset() {
    if (!confirmReset) {
      confirmReset = true;
      clearTimeout(confirmResetTimeout);
      confirmResetTimeout = setTimeout(function () { confirmReset = false; render(); }, 4000);
      render();
      return;
    }
    saveProgress(buildDefaultProgress());
    confirmReset = false;
    showToast("Progreso reiniciado.");
  }

  /* ---------------- RENDER ---------------- */
  function render() {
    var app = document.getElementById("app");
    var today = todayISO();
    var day = currentDay();
    activeDay = day.id;
    var label = dayLabel(day);
    var effList = effectiveExercises(day, progress);
    var sc = sessionChecked();
    var done = effList.filter(function (item) { return sc[activeDay + "-" + item.key]; }).length;
    var total = effList.length;
    var pct = total ? Math.round((done / total) * 100) : 0;

    document.body.style.background = day.bg;

    var html = "";

    if (toastMsg) html += '<div class="toast">' + toastMsg + "</div>";

    html += '<div class="wrap">';

    /* header */
    html += '<div class="header">' +
      '<div class="glow" style="background:' + day.accent + '"></div>' +
      '<div class="title">' + header.titleHtml(day.accent) + "</div>";

    html += '<div class="weekpills">';
    buildWeekDays().forEach(function (w, i) {
      var wd = [1, 2, 3, 4, 5, 6, 0][i];
      if (!w.active && editMode) {
        html += '<div class="daybtn daybtn-add" title="Añadir día de entreno" onclick="app_addDay(' + wd + ')">' + w.label + '<span class="daybtn-plus">+</span></div>';
        return;
      }
      var isActive = w.id === activeDay;
      var bg = isActive ? day.accent : (w.active ? "rgba(255,255,255,0.07)" : "transparent");
      var color = isActive ? "#000" : (w.active ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.15)");
      var border = isActive ? "none" : (w.active ? "1px solid rgba(255,255,255,0.1)" : "none");
      var cursor = w.active ? "pointer" : "default";
      var click = (w.active && w.id) ? ' onclick="app_setActiveDay(\'' + w.id + '\')"' : "";
      html += '<div class="daybtn" style="background:' + bg + ";color:" + color + ";border:" + border + ";cursor:" + cursor + '"' + click + ">" + w.label + "</div>";
    });
    html += "</div></div>";

    /* day card */
    html += '<div class="daycard-wrap"><div class="daycard" style="border:1px solid ' + day.accent + '30">' +
      '<div class="daycard-top"><div>' +
        '<div class="typebadge" style="background:' + day.accent + "20;border:1px solid " + day.accent + '40">' +
          '<span class="t1" style="color:' + day.accent + '">' + esc(label.type) + "</span>" +
          '<span class="sep" style="background:' + day.accent + '"></span>' +
          '<span class="t2" style="color:' + day.accent + '">' + day.tag.toUpperCase() + "</span>" +
        "</div>" +
        (editMode
          ? '<input class="dayname-input" value="' + esc(label.fullName) + '" placeholder="Nombre del día" onchange="app_updateDayName(\'' + day.id + '\', \'fullName\', this.value)">' +
            '<input class="daytype-input" value="' + esc(label.type) + '" placeholder="Tipo (ej. TORSO A)" onchange="app_updateDayName(\'' + day.id + '\', \'type\', this.value)">'
          : '<div class="dayname">' + esc(label.fullName) + "</div>") +
        '<div class="daysub">' + day.subtitle + "</div>" +
      "</div>" +
      '<div class="pctbox">' +
        '<div class="pctnum" style="color:' + ((done === total && done > 0) ? day.accent : "rgba(255,255,255,0.2)") + '">' + pct + "%</div>" +
        '<div class="pctlabel">' + done + "/" + total + " HECHOS</div>" +
      "</div></div>" +
      '<div class="barbg"><div class="barfill" style="width:' + pct + "%;background:linear-gradient(90deg, " + day.accent + "aa, " + day.accent + ')"></div></div>' +
      '<div class="editbar">' +
        (editMode ? '<div class="daydelbtn" onclick="app_removeDay(\'' + day.id + '\')">🗑 Quitar día</div>' + weekdaySelect(day) : "") +
        '<div class="editbtn" style="background:' + (editMode ? day.accent : "rgba(255,255,255,0.06)") + ";color:" + (editMode ? "#000" : "rgba(255,255,255,0.5)") + '" onclick="app_toggleEditMode()">' + (editMode ? "✓ Listo" : "✎ Editar rutina") + "</div></div>" +
    "</div></div>";

    /* exercises */
    html += '<div class="exlist">';
    if (editMode) {
      html += '<div class="addexbtn" style="margin:0 0 10px" onclick="app_addExercise(\'' + day.id + '\')">+ Añadir ejercicio</div>';
      var anyRemoved = day.exercises.some(function (ex) { return progress.removed[ex.id]; });
      if (anyRemoved) {
        html += '<div class="restorebtn" style="margin:0 0 10px" onclick="app_restoreRemoved(\'' + day.id + '\')">↺ Restaurar ejercicios eliminados de este día</div>';
      }
    }
    effList.forEach(function (item) {
      var key = item.key;
      var data = getDisplayData(item, progress);
      var stateKey = activeDay + "-" + key;
      var isDone = !editMode && sc[stateKey];
      var isOpen = editMode || expanded[stateKey];
      var mc = muscleColors[data.muscle] || "#888";
      var pyramid = data.pyramid;
      var entry = progress.exercises[key] || null;
      var lastLog = entry && entry.history && entry.history.length ? entry.history[entry.history.length - 1] : null;
      var isEditingLog = editingId === key;
      var lastRow = pyramid[pyramid.length - 1];
      var logWeightDefault = lastLog && !data.progressive ? lastLog.weight : (isNaN(parseFloat(lastRow.weight)) ? 0 : parseFloat(lastRow.weight));
      var logRepsDefault = isNaN(data.targetReps) ? (lastLog ? lastLog.reps : "") : data.targetReps;

      html += '<div class="excard" style="background:' + (isDone ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.05)") +
        ";border:1px solid " + (isDone ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.09)") + ";opacity:" + (isDone ? 0.45 : 1) + '">' +
        '<div class="exhead">' +
          (editMode ? "" : '<div class="chk" style="border:2px solid ' + (isDone ? day.accent : "rgba(255,255,255,0.15)") + ";background:" + (isDone ? day.accent : "transparent") + '" onclick="app_toggleCheck(\'' + key + '\')">' + (isDone ? CHECK_SVG : "") + "</div>") +
          '<div class="exinfo"' + (editMode ? "" : ' onclick="app_toggleExpand(\'' + key + '\')"') + '>' +
            (editMode ?
              '<div class="exname-row">' +
                '<input class="exname-input" value="' + esc(data.name) + '" onchange="app_updateExerciseName(\'' + key + '\', this.value)">' +
              "</div>" +
              '<div class="exname-row" style="margin-top:6px">' +
                '<select class="muscle-select" onchange="app_updateExerciseMuscle(\'' + key + '\', this.value)">' + muscleOptions(data.muscle) + "</select>" +
                '<span class="muscletag" style="background:' + mc + "20;color:" + mc + '">' + esc(data.muscle).toUpperCase() + "</span>" +
              "</div>"
              :
              '<div class="exname-row">' +
                '<span class="exname" style="color:' + (isDone ? "rgba(255,255,255,0.3)" : "#fff") + ";text-decoration:" + (isDone ? "line-through" : "none") + '">' + esc(data.name) + "</span>" +
                '<span class="muscletag" style="background:' + mc + "20;color:" + mc + '">' + esc(data.muscle).toUpperCase() + "</span>" +
              "</div>"
            ) +
            '<div class="exmeta">' + pyramid.length + " series · " + (data.ranged ? esc(pyramid[0].reps) : esc(pyramid[0].reps) + "→" + esc(pyramid[pyramid.length - 1].reps)) + " reps" +
              (lastLog ? " · Últ: " + lastLog.weight + " kg×" + lastLog.reps + " (" + formatDateEs(lastLog.date) + ")" : "") +
            "</div>" +
          "</div>" +
          (editMode
            ? '<div class="movebtns"><div class="movebtn" onclick="app_moveExercise(\'' + key + '\', -1)">▲</div><div class="movebtn" onclick="app_moveExercise(\'' + key + '\', 1)">▼</div></div>'
            : '<div class="statbtn" title="Estadísticas" onclick="app_openStats(\'' + key + '\')">' + STATS_SVG + "</div>" +
              '<div class="expbtn" style="transform:' + (isOpen ? "rotate(180deg)" : "rotate(0deg)") + '" onclick="app_toggleExpand(\'' + key + '\')">' + CHEVRON_SVG + "</div>") +
        "</div>";

      if (isOpen) {
        html += '<div class="pyramid">';
        if (editMode) {
          html += '<div class="pyhead-edit"><span>SER</span><span>REPS</span><span>' + weightColumnLabel + "</span><span></span></div>";
          getEditRows(item, data).forEach(function (p, pi) {
            html += '<div class="pyrow-edit">' +
              '<span class="pyset" style="color:' + day.accent + '">' + p.set + "</span>" +
              '<input class="pysmallin" value="' + esc(p.reps) + '" onchange="app_updateSetField(\'' + key + '\', ' + pi + ', \'reps\', this.value)">' +
              '<input class="pysmallin" value="' + esc(p.weight) + '" onchange="app_updateSetField(\'' + key + '\', ' + pi + ', \'weight\', this.value)">' +
              '<div class="setdel" onclick="app_removeSet(\'' + key + '\', ' + pi + ')">×</div>' +
            "</div>";
          });
          html += '<div class="addsetbtn" onclick="app_addSet(\'' + key + '\')">+ Añadir serie</div>';
        } else {
          html += '<div class="pyhead"><span>SER</span><span>REPS</span><span>' + weightColumnLabel + '</span><span style="text-align:right">INT.</span></div>';
          pyramid.forEach(function (p, pi) {
            var intensity = Math.round(((pi + 1) / pyramid.length) * 100);
            var denom = (pyramid.length - 1) || 1;
            var opSet = 0.5 + (pi / denom) * 0.5;
            var opInt = 0.4 + (pi / denom) * 0.6;
            html += '<div class="pyrow">' +
              '<span class="pyset" style="color:' + day.accent + ";opacity:" + opSet + '">' + p.set + "</span>" +
              '<span class="pyreps">' + esc(p.reps) + "</span>" +
              '<span class="pyweight">' + esc(p.weight) + "</span>" +
              '<div class="pyint"><span style="color:' + day.accent + ";opacity:" + opInt + '">' + (data.progressive && !data.ranged ? intensity + "%" : "—") + "</span></div>" +
            "</div>";
          });
        }
        if (!editMode && entry && entry.history && entry.history.length > 1) {
          html += sparkline(entry.history, day.accent);
        }
        if (editMode) {
          html += '<div class="exdelbtn" onclick="app_removeExercise(\'' + key + '\')">🗑 Eliminar este ejercicio</div>';
        } else {
          html += '<div class="logwrap">';
          if (!isEditingLog) {
            html += '<div class="logbtn" style="background:' + day.accent + "15;border:1px solid " + day.accent + "35;color:" + day.accent + '" onclick="app_openLogger(\'' + key + '\')">' + (lastLog && lastLog.date === today ? "✓ Registrado hoy · editar" : "✎ Registrar lo que hiciste hoy") + "</div>";
          } else {
            html += '<div class="logform-row">' +
              '<div class="logform-col"><div class="logform-label">' + (data.progressive ? "PESO (KG)" : "LASTRE (KG, 0 = SIN)") + '</div>' +
                '<input id="inp-weight" class="numin" type="number" inputmode="decimal" step="0.5" value="' + logWeightDefault + '"></div>' +
              '<div class="logform-col"><div class="logform-label">REPS EN LA ÚLTIMA SERIE</div>' +
                '<input id="inp-reps" class="numin" type="number" inputmode="numeric" step="1" value="' + logRepsDefault + '"></div>' +
            "</div>" +
            '<div class="logform-actions">' +
              '<div class="logform-btn" style="background:' + day.accent + ';color:#000" onclick="app_saveLog(\'' + key + '\')">Guardar</div>' +
              '<div class="logform-btn" style="background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.6)" onclick="app_cancelLogger()">Cancelar</div>' +
            "</div>";
          }
          html += "</div>";
        }
        html += "</div>";
      }
      html += "</div>";
    });
    html += "</div>";

    /* weekly overview */
    html += '<div class="overview"><div class="overview-title">VISIÓN SEMANAL</div>';
    currentOverviewRows().forEach(function (row) {
      var dim = row.accent === "#333" || row.accent === "#222";
      html += '<div class="overow"><div class="overleft"><span class="overdot" style="background:' + row.accent + '"></span>' +
        '<span class="overday" style="color:' + (dim ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.8)") + '">' + row.day + "</span></div>" +
        '<div><span class="overtype" style="color:' + (dim ? "rgba(255,255,255,0.3)" : row.accent) + '">' + row.type + "</span>" +
        '<span class="overtag">' + row.tag + "</span></div></div>";
    });
    html += "</div>";

    /* series semanales por músculo */
    html += '<div class="overview"><div class="overview-title">SERIES SEMANALES POR MÚSCULO</div>';
    weeklySets().forEach(function (m) {
      var neutral = m.muscle === "Core" || m.muscle === "Antebrazo" || m.muscle === "Trapecio";
      var color = neutral ? "#94A3B8" : (m.sets < 10 ? "#FF6B35" : (m.sets <= 20 ? "#C8FF00" : "#FBBF24"));
      html += '<div class="setrow"><span class="setname">' + esc(m.muscle) + '</span>' +
        '<div class="setbar"><div class="setfill" style="width:' + Math.min(100, Math.round(m.sets / 24 * 100)) + "%;background:" + color + '"></div></div>' +
        '<span class="setnum" style="color:' + color + '">' + m.sets + "</span></div>";
    });
    html += "</div>";

    /* footer */
    html += '<div class="footer"><div class="resetlink" style="color:' + (confirmReset ? "#FF6B35" : "rgba(255,255,255,0.2)") + '" onclick="app_handleReset()">' +
      (confirmReset ? "¿Seguro? Toca de nuevo para reiniciar" : "Reiniciar progreso guardado") +
    '</div>' +
      '<div class="resetlink" onclick="app_exportData()">Exportar datos</div>' +
      '<div class="resetlink" onclick="app_importData()">Importar datos</div>' +
      '<div class="resetlink" onclick="switchUser()">Cambiar de usuario</div>' +
      '<div class="sync" id="sync-status">' + esc(SimpleGymStore.statusText()) + '</div></div>';

    html += "</div>";

    if (statsKey && !editMode) html += statsHtml(statsKey, day.accent);

    app.innerHTML = html;
  }

  window.app_setActiveDay = app_setActiveDay;
  window.app_toggleCheck = app_toggleCheck;
  window.app_toggleExpand = app_toggleExpand;
  window.app_toggleEditMode = app_toggleEditMode;
  window.app_updateExerciseName = app_updateExerciseName;
  window.app_updateExerciseMuscle = app_updateExerciseMuscle;
  window.app_updateSetField = app_updateSetField;
  window.app_removeSet = app_removeSet;
  window.app_addSet = app_addSet;
  window.app_removeExercise = app_removeExercise;
  window.app_addExercise = app_addExercise;
  window.app_restoreRemoved = app_restoreRemoved;
  window.app_moveExercise = app_moveExercise;
  window.app_updateDayName = app_updateDayName;
  window.app_addDay = app_addDay;
  window.app_removeDay = app_removeDay;
  window.app_exportData = app_exportData;
  window.app_importData = app_importData;
  window.app_setDayWeekday = app_setDayWeekday;
  window.app_openLogger = app_openLogger;
  window.app_saveLog = app_saveLog;
  window.app_cancelLogger = app_cancelLogger;
  window.app_openStats = app_openStats;
  window.app_closeStats = app_closeStats;
  window.app_handleReset = app_handleReset;
  render();
}
