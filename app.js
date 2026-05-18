/* ============================================================
   Trend — Shaun & Jemma's fitness tracker
   Storage: localStorage (v2 with profiles)
   ============================================================ */

const STORAGE_KEY = "trend.v1"; // same key; in-place migrate v1 -> v2
const WEIGHT_UNIT_KEY = "trend.weightUnit.v1";
const WEIGHT_UNIT_PREFS_KEY = "trend.weightUnitByProfile.v1";
const KPIS = ["steps8k", "lowUpf", "exercise", "noBooze"];
const PROFILE_META = {
  shaun: { name: "Shaun", color: "#4ade80" },
  jemma: { name: "Jemma", color: "#f472b6" },
};
const PROFILE_IDS = ["shaun", "jemma"];

// Optional cloud sync (Supabase)
// Fill these and redeploy to enable shared sync across devices.
const CLOUD_CONFIG = {
  url: "https://kfntsfawkyrwblwibytv.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtmbnRzZmF3a3lyd2Jsd2lieXR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwOTE2NDEsImV4cCI6MjA5NDY2NzY0MX0.y0iw2YDCP4_5X0Rb_NbJgEcxpYKCKKDyEcyL0rGFJao",
  appId: "shaun-jemma-tracker",
};

// ---------- date helpers ----------
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => ymd(new Date());
const parseYmd = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const fmtNice = (s) => {
  const d = parseYmd(s);
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
};
const isFutureDate = (s) => s > today();
const clampLogDate = (s) => (!s || isFutureDate(s) ? today() : s);
const KG_PER_LB = 0.45359237;
const LB_PER_ST = 14;

function loadWeightUnitPrefs() {
  const defaults = { shaun: "kg", jemma: "kg" };
  try {
    const raw = localStorage.getItem(WEIGHT_UNIT_PREFS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      PROFILE_IDS.forEach((p) => {
        if (parsed && parsed[p] === "stlb") defaults[p] = "stlb";
      });
      return defaults;
    }

    // Migrate legacy single-unit preference to both profiles.
    const legacy = localStorage.getItem(WEIGHT_UNIT_KEY);
    if (legacy === "stlb") {
      PROFILE_IDS.forEach((p) => { defaults[p] = "stlb"; });
    }
    return defaults;
  } catch {
    return defaults;
  }
}
function saveWeightUnitPrefs(prefs) {
  try {
    localStorage.setItem(WEIGHT_UNIT_PREFS_KEY, JSON.stringify(prefs));
  } catch {}
}
function getProfileWeightUnit(profileId = activeProfile()) {
  return weightUnitPrefs[profileId] === "stlb" ? "stlb" : "kg";
}
function setProfileWeightUnit(profileId, unit) {
  weightUnitPrefs[profileId] = unit === "stlb" ? "stlb" : "kg";
  saveWeightUnitPrefs(weightUnitPrefs);
}
function toKgFromStLb(st, lb) {
  if (!Number.isFinite(st) || !Number.isFinite(lb)) return null;
  if (st < 0 || lb < 0) return null;
  const totalLb = st * LB_PER_ST + lb;
  return Math.round(totalLb * KG_PER_LB * 1000) / 1000;
}
function toStLbFromKg(kg) {
  if (!Number.isFinite(kg) || kg <= 0) return { st: 0, lb: 0 };
  const totalLb = kg / KG_PER_LB;
  let st = Math.floor(totalLb / LB_PER_ST);
  let lb = totalLb - st * LB_PER_ST;
  lb = Math.round(lb * 100) / 100;
  if (lb >= LB_PER_ST) {
    st += 1;
    lb = 0;
  }
  return { st, lb };
}
function formatWeightValue(kg) {
  if (kg == null || !Number.isFinite(kg)) return "—";
  if (getProfileWeightUnit() === "stlb") {
    const parts = toStLbFromKg(kg);
    return `${parts.st} st ${parts.lb.toFixed(2)} lb`;
  }
  return `${kg.toFixed(1)} kg`;
}

// ---------- storage with v1 -> v2 migration ----------
function emptyStore() {
  return {
    version: 2,
    activeProfile: "shaun",
    profiles: {
      shaun: { entries: {} },
      jemma: { entries: {} },
    },
  };
}
function loadStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyStore();
    const obj = JSON.parse(raw);
    // Migrate v1 (flat entries) -> v2 (profiles)
    if (!obj.version || obj.version < 2 || !obj.profiles) {
      const migrated = emptyStore();
      if (obj.entries && typeof obj.entries === "object") {
        migrated.profiles.shaun.entries = obj.entries;
      }
      saveStore(migrated);
      return migrated;
    }
    PROFILE_IDS.forEach((p) => {
      if (!obj.profiles[p]) obj.profiles[p] = { entries: {} };
      if (!obj.profiles[p].entries) obj.profiles[p].entries = {};
    });
    if (!obj.activeProfile) obj.activeProfile = "shaun";
    return obj;
  } catch {
    return emptyStore();
  }
}
function saveStore(s) { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); }

function getEntries(profileId) { return store.profiles[profileId].entries; }
function getEntry(profileId, dateStr) {
  return getEntries(profileId)[dateStr] || {
    weight: null, steps8k: false, lowUpf: false, exercise: false, noBooze: false, note: "",
  };
}
function setEntry(profileId, dateStr, patch) {
  const cur = getEntry(profileId, dateStr);
  const next = { ...cur, ...patch, _updatedAt: new Date().toISOString() };
  const hasData =
    next.weight != null ||
    next.steps8k || next.lowUpf || next.exercise || next.noBooze ||
    (next.note && next.note.trim().length > 0);
  const entries = getEntries(profileId);
  if (hasData) entries[dateStr] = next;
  else delete entries[dateStr];
  saveStore(store);
}

// ---------- app state ----------
let store = loadStore();
let savedHintTimer = null;
let supabaseClient = null;
let currentLogDate = clampLogDate(today());
let weightUnitPrefs = loadWeightUnitPrefs();
const activeProfile = () => store.activeProfile;

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function cloudEnabled() {
  return !!(CLOUD_CONFIG.url && CLOUD_CONFIG.anonKey && window.supabase && window.supabase.createClient);
}
function getSupabase() {
  if (!cloudEnabled()) return null;
  if (!supabaseClient) {
    supabaseClient = window.supabase.createClient(CLOUD_CONFIG.url, CLOUD_CONFIG.anonKey);
  }
  return supabaseClient;
}
function setCloudStatus(msg, cls = "") {
  const el = $("#cloudStatus");
  if (!el) return;
  el.textContent = msg;
  el.className = `cloud-status ${cls}`.trim();
}
function syncStampLabel() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function markCloudSynced() {
  setCloudStatus(`Cloud: synced ${syncStampLabel()}`, "ok");
}

function entryHasData(e) {
  return !!(
    e && (
      e.weight != null ||
      e.steps8k || e.lowUpf || e.exercise || e.noBooze ||
      (e.note && e.note.trim().length > 0)
    )
  );
}

async function pushEntryToCloud(profileId, dateStr) {
  const client = getSupabase();
  if (!client) return;
  const e = getEntry(profileId, dateStr);
  if (!entryHasData(e)) {
    await client
      .from("tracker_entries")
      .delete()
      .eq("app_id", CLOUD_CONFIG.appId)
      .eq("profile", profileId)
      .eq("entry_date", dateStr);
    return;
  }
  const payload = {
    app_id: CLOUD_CONFIG.appId,
    profile: profileId,
    entry_date: dateStr,
    weight: e.weight,
    steps8k: !!e.steps8k,
    low_upf: !!e.lowUpf,
    exercise: !!e.exercise,
    // Reuse the existing int column as a boolean sentinel to avoid a schema migration.
    beers: e.noBooze ? -1 : 0,
    note: e.note || "",
    updated_at: new Date().toISOString(),
  };
  const { error } = await client
    .from("tracker_entries")
    .upsert(payload, { onConflict: "app_id,profile,entry_date" });
  if (error) throw error;
}

async function pullCloudToLocal() {
  const client = getSupabase();
  if (!client) return;
  const { data, error } = await client
    .from("tracker_entries")
    .select("app_id,profile,entry_date,weight,steps8k,low_upf,exercise,beers,note,updated_at")
    .eq("app_id", CLOUD_CONFIG.appId)
    .in("profile", PROFILE_IDS)
    .order("entry_date", { ascending: true });

  if (error) throw error;
  if (!Array.isArray(data)) return;

  data.forEach((r) => {
    if (!PROFILE_IDS.includes(r.profile)) return;
    const local = getEntries(r.profile)[r.entry_date];
    if (local && local._updatedAt && r.updated_at && local._updatedAt >= r.updated_at) return;
    getEntries(r.profile)[r.entry_date] = {
      weight: r.weight,
      steps8k: !!r.steps8k,
      lowUpf: !!r.low_upf,
      exercise: !!r.exercise,
      noBooze: r.beers === -1,
      note: r.note || "",
      _updatedAt: r.updated_at || new Date().toISOString(),
    };
  });
  saveStore(store);
}

async function syncEntry(profileId, dateStr, { silent = false } = {}) {
  if (!cloudEnabled()) return;
  try {
    if (!silent) setCloudStatus("Cloud: syncing...");
    await pushEntryToCloud(profileId, dateStr);
    markCloudSynced();
    return true;
  } catch (err) {
    setCloudStatus("Cloud: sync failed", "error");
    if (!silent) flashSaved("Saved locally (cloud failed)");
    console.error(err);
    return false;
  }
}

async function syncFromCloud({ silent = false } = {}) {
  if (!cloudEnabled()) return;
  try {
    if (!silent) setCloudStatus("Cloud: syncing...");
    await pullCloudToLocal();
    renderActiveView();
    markCloudSynced();
  } catch (err) {
    setCloudStatus("Cloud: sync failed", "error");
    console.error(err);
  }
}

// ---------- LOG view ----------
function renderLog() {
  const t = currentLogDate;
  const p = activeProfile();
  const e = getEntry(p, t);

  $("#todayDate").textContent = t === today() ? `Today · ${fmtNice(t)}` : `Editing · ${fmtNice(t)}`;
  $("#topTitle").textContent = t === today() ? "Today" : "Backfill";
  $("#logDate").value = t;
  $("#logDate").max = today();
  $("#logDateLabel").textContent = t === today() ? "Live day" : `Backfill for ${fmtNice(t)}`;
  $("#nextDayBtn").disabled = t === today();
  $("#todayBtn").disabled = t === today();
  $("#logWho").textContent = PROFILE_META[p].name;
  updateWeightUnitUI();
  writeWeightInputsFromKg(e.weight);
  $("#note").value = e.note || "";
  $("#submitBtn").textContent = t === today() ? "Save today" : `Save ${fmtNice(t)}`;

  KPIS.forEach((k) => {
    const btn = document.querySelector(`.kpi-btn[data-kpi="${k}"]`);
    if (!btn) return;
    btn.classList.toggle("done", !!e[k]);
    btn.querySelector(".kpi-state").textContent = e[k] ? "Done ✓" : "Tap to mark done";
  });

  setUnsavedState(false);
}

function setLogDate(dateStr) {
  currentLogDate = clampLogDate(dateStr);
  renderLog();
}

function bindLogDateControls() {
  $("#logDate").addEventListener("change", (ev) => {
    setLogDate(ev.target.value || today());
  });

  $("#prevDayBtn").addEventListener("click", () => {
    setLogDate(ymd(addDays(parseYmd(currentLogDate), -1)));
  });

  $("#nextDayBtn").addEventListener("click", () => {
    setLogDate(ymd(addDays(parseYmd(currentLogDate), 1)));
  });

  $("#todayBtn").addEventListener("click", () => {
    setLogDate(today());
  });
}

function flashSaved(msg) {
  const el = $("#savedHint");
  if (msg) el.textContent = msg;
  el.classList.add("show");
  clearTimeout(savedHintTimer);
  savedHintTimer = setTimeout(() => {
    el.classList.remove("show");
    el.textContent = "Saved ✓";
  }, 1400);
}

function setUnsavedState(isDirty) {
  const el = $("#unsavedHint");
  if (!el) return;
  el.classList.toggle("show", !!isDirty);
}

function updateWeightUnitUI() {
  const unitEl = $("#weightUnitLabel");
  const btn = $("#unitToggleBtn");
  const kgInput = $("#weightKg");
  const stlbRow = $("#weightStLb");
  if (!unitEl || !btn || !kgInput || !stlbRow) return;

  const isStLb = getProfileWeightUnit() === "stlb";
  unitEl.textContent = isStLb ? "Weight (st/lb)" : "Weight (kg)";
  btn.textContent = isStLb ? "Use kg" : "Use st/lb";
  kgInput.hidden = isStLb;
  stlbRow.hidden = !isStLb;
}

function readWeightKgFromForm() {
  if (getProfileWeightUnit() === "stlb") {
    const stStr = $("#weightSt").value.trim();
    const lbStr = $("#weightLb").value.trim();
    if (stStr === "" && lbStr === "") return null;
    const st = stStr === "" ? 0 : Number(stStr);
    const lb = lbStr === "" ? 0 : Number(lbStr);
    const kg = toKgFromStLb(st, lb);
    return Number.isFinite(kg) ? kg : null;
  }
  const vStr = $("#weightKg").value.trim();
  if (vStr === "") return null;
  const vNum = Number(vStr);
  return Number.isFinite(vNum) ? vNum : null;
}

function writeWeightInputsFromKg(kg) {
  const kgInput = $("#weightKg");
  const stInput = $("#weightSt");
  const lbInput = $("#weightLb");
  if (!kgInput || !stInput || !lbInput) return;

  if (kg == null || !Number.isFinite(kg)) {
    kgInput.value = "";
    stInput.value = "";
    lbInput.value = "";
    return;
  }

  kgInput.value = String(Math.round(kg * 10) / 10);
  const parts = toStLbFromKg(kg);
  stInput.value = String(parts.st);
  lbInput.value = parts.lb.toFixed(2);
}

function bindLog() {
  function readLogDraft() {
    const draft = {
      weight: readWeightKgFromForm(),
      note: $("#note").value,
    };

    KPIS.forEach((k) => {
      const btn = document.querySelector(`.kpi-btn[data-kpi="${k}"]`);
      draft[k] = !!(btn && btn.classList.contains("done"));
    });

    return draft;
  }

  function updateUnsavedState() {
    const profileId = activeProfile();
    const dateStr = currentLogDate;
    const saved = getEntry(profileId, dateStr);
    const draft = readLogDraft();

    const isDirty =
      (saved.weight ?? null) !== draft.weight ||
      (saved.note || "") !== draft.note ||
      KPIS.some((k) => !!saved[k] !== !!draft[k]);

    setUnsavedState(isDirty);
  }

  $("#weightKg").addEventListener("input", updateUnsavedState);
  $("#weightSt").addEventListener("input", updateUnsavedState);
  $("#weightLb").addEventListener("input", updateUnsavedState);
  $("#note").addEventListener("input", updateUnsavedState);

  $("#unitToggleBtn").addEventListener("click", () => {
    const kgDraft = readWeightKgFromForm();
    const nextUnit = getProfileWeightUnit() === "kg" ? "stlb" : "kg";
    setProfileWeightUnit(activeProfile(), nextUnit);
    updateWeightUnitUI();
    writeWeightInputsFromKg(kgDraft);
    updateUnsavedState();
  });

  $$(".kpi-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const k = btn.dataset.kpi;
      if (!k) return;
      const isDone = !btn.classList.contains("done");
      btn.classList.toggle("done", isDone);
      const state = btn.querySelector(".kpi-state");
      if (state) state.textContent = isDone ? "Done ✓" : "Tap to mark done";
      updateUnsavedState();
    });
  });

  $("#submitBtn").addEventListener("click", async () => {
    const draft = readLogDraft();
    const profileId = activeProfile();
    const dateStr = currentLogDate;
    setEntry(profileId, dateStr, draft);
    const synced = await syncEntry(profileId, dateStr);
    if (synced === false) {
      flashSaved("Saved locally (cloud failed)");
    } else {
      flashSaved(`Saved for ${PROFILE_META[profileId].name} ✓`);
    }
    setUnsavedState(false);
  });

  $("#syncNowBtn").addEventListener("click", async () => {
    if (!cloudEnabled()) {
      setCloudStatus("Cloud: local only (configure Supabase)");
      return;
    }
    await syncFromCloud();
  });
}

// ---------- profile switcher ----------
function bindProfileSwitch() {
  $$(".profile-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const p = btn.dataset.profile;
      if (p === activeProfile()) return;
      store.activeProfile = p;
      saveStore(store);
      $$(".profile-btn").forEach((b) => b.classList.toggle("active", b === btn));
      renderActiveView();
    });
  });
}

// ---------- analytics ----------
function lastNDates(n, endDateStr = today()) {
  const end = parseYmd(endDateStr);
  const out = [];
  for (let i = n - 1; i >= 0; i--) out.push(ymd(addDays(end, -i)));
  return out;
}
function rollingAvg(values, window) {
  const out = [];
  for (let i = 0; i < values.length; i++) {
    let sum = 0, count = 0;
    for (let j = Math.max(0, i - window + 1); j <= i; j++) {
      const v = values[j].y;
      if (v != null && Number.isFinite(v)) { sum += v; count++; }
    }
    out.push({ x: values[i].x, y: count ? sum / count : null });
  }
  return out;
}
function currentStreak(profileId, kpi) {
  const entries = getEntries(profileId);
  let streak = 0;
  let d = new Date();
  for (;;) {
    const key = ymd(d);
    const e = entries[key];
    if (e && e[kpi]) {
      streak++;
      d = addDays(d, -1);
    } else {
      // Don't penalise today not yet logged
      if (key === today() && streak === 0) {
        d = addDays(d, -1);
        continue;
      }
      break;
    }
  }
  return streak;
}
function pct30(profileId, kpi) {
  const entries = getEntries(profileId);
  const dates = lastNDates(30);
  let count = 0;
  dates.forEach((d) => { if (entries[d] && entries[d][kpi]) count++; });
  return Math.round((count / 30) * 100);
}
function weekRange() {
  const now = new Date();
  const dow = (now.getDay() + 6) % 7;
  const monday = addDays(now, -dow);
  const dates = [];
  for (let i = 0; i < 7; i++) dates.push(ymd(addDays(monday, i)));
  return dates;
}
function exerciseThisWeek(profileId) {
  const entries = getEntries(profileId);
  return weekRange().filter((d) => entries[d] && entries[d].exercise).length;
}
// ---------- STATS view ----------
let weightChart = null;

function renderStats() {
  const activeUnit = getProfileWeightUnit();
  PROFILE_IDS.forEach((p) => {
    const dates = lastNDates(60);
    const series = dates.map((d) => ({
      x: d,
      y: getEntries(p)[d] && getEntries(p)[d].weight != null ? getEntries(p)[d].weight : null,
    }));
    const w7 = rollingAvg(series, 7);
    const w30 = rollingAvg(series, 30);
    const latest = [...w7].reverse().find((pt) => pt.y != null);
    const old = w30[w30.length - 1];
    const valEl = p === "shaun" ? $("#sWeightShaun") : $("#sWeightJemma");
    const subEl = p === "shaun" ? $("#sTrendShaun") : $("#sTrendJemma");
    if (latest && latest.y != null) {
      valEl.textContent = formatWeightValue(latest.y);
      if (old && old.y != null) {
        const diff = latest.y - old.y;
        const diffText = activeUnit === "stlb"
          ? Math.abs(diff / KG_PER_LB).toFixed(2) + " lb"
          : Math.abs(diff).toFixed(2) + " kg";
        subEl.textContent = (diff > 0 ? "▲ " : diff < 0 ? "▼ " : "• ") + diffText + " vs 30d";
        subEl.className = "summary-sub " + (diff > 0 ? "up" : diff < 0 ? "down" : "");
      } else {
        subEl.textContent = "—";
        subEl.className = "summary-sub muted";
      }
    } else {
      valEl.textContent = "—";
      subEl.textContent = "Log weight to start";
      subEl.className = "summary-sub muted";
    }
  });

  drawWeightChart();

  $("#exShaun").textContent = `${exerciseThisWeek("shaun")} / 5`;
  $("#exJemma").textContent = `${exerciseThisWeek("jemma")} / 5`;

  drawTrafficLights();

  $("#pctShaunSteps").textContent = pct30("shaun", "steps8k") + "%";
  $("#pctShaunUpf").textContent = pct30("shaun", "lowUpf") + "%";
  $("#pctShaunEx").textContent = pct30("shaun", "exercise") + "%";
  $("#pctShaunNoBooze").textContent = pct30("shaun", "noBooze") + "%";
  $("#pctJemmaSteps").textContent = pct30("jemma", "steps8k") + "%";
  $("#pctJemmaUpf").textContent = pct30("jemma", "lowUpf") + "%";
  $("#pctJemmaEx").textContent = pct30("jemma", "exercise") + "%";
  $("#pctJemmaNoBooze").textContent = pct30("jemma", "noBooze") + "%";

  $("#stkShaunSteps").textContent = currentStreak("shaun", "steps8k");
  $("#stkShaunUpf").textContent = currentStreak("shaun", "lowUpf");
  $("#stkShaunEx").textContent = currentStreak("shaun", "exercise");
  $("#stkShaunNoBooze").textContent = currentStreak("shaun", "noBooze");
  $("#stkJemmaSteps").textContent = currentStreak("jemma", "steps8k");
  $("#stkJemmaUpf").textContent = currentStreak("jemma", "lowUpf");
  $("#stkJemmaEx").textContent = currentStreak("jemma", "exercise");
  $("#stkJemmaNoBooze").textContent = currentStreak("jemma", "noBooze");
}

function drawWeightChart() {
  const ctx = document.getElementById("weightChart");
  const dates = lastNDates(60);
  const useStLb = getProfileWeightUnit() === "stlb";

  const datasets = [];
  PROFILE_IDS.forEach((p) => {
    const meta = PROFILE_META[p];
    const series = dates.map((d) => {
      const e = getEntries(p)[d];
      return e && e.weight != null ? e.weight : null;
    });
    const avg = rollingAvg(dates.map((d, i) => ({ x: d, y: series[i] })), 7).map((pt) => pt.y);

    datasets.push({
      label: `${meta.name} (daily)`,
      data: series,
      borderColor: meta.color,
      backgroundColor: meta.color,
      pointRadius: 2.5,
      showLine: false,
      spanGaps: false,
    });
    datasets.push({
      label: `${meta.name} (7d avg)`,
      data: avg,
      borderColor: meta.color,
      backgroundColor: meta.color + "22",
      pointRadius: 0,
      tension: 0.3,
      borderWidth: 2.5,
      fill: false,
      spanGaps: true,
    });
  });

  if (weightChart) weightChart.destroy();
  weightChart = new Chart(ctx, {
    type: "line",
    data: { labels: dates, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: { labels: { color: "#e7e9ee", boxWidth: 12, font: { size: 11 } } },
        tooltip: {
          mode: "index",
          intersect: false,
          callbacks: {
            label: function (context) {
              const y = context.parsed.y;
              if (y == null || !Number.isFinite(y)) return `${context.dataset.label}: —`;
              return `${context.dataset.label}: ${formatWeightValue(y)}`;
            },
          },
        },
      },
      scales: {
        x: {
          ticks: {
            color: "#8a92a3",
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 6,
            callback: function (val) {
              const lbl = this.getLabelForValue(val);
              return lbl ? lbl.slice(5) : "";
            },
          },
          grid: { color: "#262a34" },
        },
        y: {
          ticks: {
            color: "#8a92a3",
            callback: function (val) {
              const n = Number(val);
              if (!Number.isFinite(n)) return "";
              if (!useStLb) return n.toFixed(1);
              const parts = toStLbFromKg(n);
              return `${parts.st}st ${parts.lb.toFixed(1)}lb`;
            },
          },
          grid: { color: "#262a34" },
          title: {
            display: true,
            text: useStLb ? "Weight (st/lb)" : "Weight (kg)",
            color: "#8a92a3",
          },
        },
      },
    },
  });
}

function drawTrafficLights() {
  const container = $("#tlContainer");
  container.innerHTML = "";
  const N = 21;
  const dates = lastNDates(N);

  PROFILE_IDS.forEach((p) => {
    const meta = PROFILE_META[p];
    const block = document.createElement("div");
    block.className = "tl-block";

    const header = document.createElement("div");
    header.className = "tl-block-header";
    header.innerHTML = `<span class="profile-dot" style="background:${meta.color}"></span>${meta.name}`;
    block.appendChild(header);

    const grid = document.createElement("div");
    grid.className = "tl-grid";

    const kpiLabels = { steps8k: "Steps", lowUpf: "Low UPF", exercise: "Exercise", noBooze: "No booze" };
    KPIS.forEach((k) => {
      const lbl = document.createElement("div");
      lbl.className = "tl-row-label";
      lbl.textContent = kpiLabels[k];
      grid.appendChild(lbl);

      const row = document.createElement("div");
      row.className = "tl-row-cells";
      dates.forEach((d) => {
        const cell = document.createElement("span");
        cell.className = "tl-cell";
        const e = getEntries(p)[d];
        if (!e) cell.classList.add("tl-empty");
        else if (e[k]) cell.classList.add("tl-green");
        else cell.classList.add("tl-red");
        cell.title = `${meta.name} · ${kpiLabels[k]} · ${fmtNice(d)}`;
        row.appendChild(cell);
      });
      grid.appendChild(row);
    });

    block.appendChild(grid);
    container.appendChild(block);
  });
}

// ---------- HISTORY view ----------
function renderHistory() {
  const p = activeProfile();
  $("#historyWho").textContent = PROFILE_META[p].name;
  const entries = getEntries(p);
  const list = $("#historyList");
  const keys = Object.keys(entries).sort().reverse();
  if (!keys.length) {
    list.innerHTML = `<div class="history-empty">No entries yet — log today on the Log tab.</div>`;
    return;
  }
  list.innerHTML = keys.map((k) => {
    const e = entries[k];
    const flags =
      (e.steps8k ? "🟢" : "⚪") +
      (e.lowUpf ? "🟢" : "⚪") +
      (e.exercise ? "🟢" : "⚪") +
      (e.noBooze ? "🟢" : "⚪");
    const w = formatWeightValue(e.weight);
    return `<div class="history-row">
      <div>
        <div class="history-date">${fmtNice(k)}</div>
        <div class="history-w">${w}</div>
      </div>
      <div class="muted" style="font-size:12px">${e.note ? escapeHtml(e.note) : ""}</div>
      <div class="history-kpis">${flags}</div>
    </div>`;
  }).join("");
}
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// ---------- Export / Import / Wipe ----------
function bindData() {
  $("#exportBtn").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(store, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `trend-export-${today()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  $("#importInput").addEventListener("change", async (ev) => {
    const file = ev.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const obj = JSON.parse(text);
      if (obj.profiles) {
        PROFILE_IDS.forEach((p) => {
          if (obj.profiles[p] && obj.profiles[p].entries) {
            store.profiles[p].entries = { ...store.profiles[p].entries, ...obj.profiles[p].entries };
          }
        });
      } else if (obj.entries) {
        store.profiles.shaun.entries = { ...store.profiles.shaun.entries, ...obj.entries };
      } else {
        throw new Error("Unrecognised file format");
      }
      saveStore(store);
      renderActiveView();
      alert("Import complete.");
    } catch (e) {
      alert("Import failed: " + e.message);
    } finally {
      ev.target.value = "";
    }
  });

  $("#wipeBtn").addEventListener("click", () => {
    if (!confirm("Delete all data (both profiles)? This cannot be undone.")) return;
    if (!confirm("Really? All weights, KPIs and notes will be removed.")) return;
    localStorage.removeItem(STORAGE_KEY);
    store = loadStore();
    $$(".profile-btn").forEach((b) => b.classList.toggle("active", b.dataset.profile === "shaun"));
    renderActiveView();
  });
}

// ---------- nav ----------
function currentView() {
  const active = document.querySelector(".tab.active");
  return active ? active.dataset.view : "log";
}
function renderActiveView() {
  const v = currentView();
  if (v === "log") renderLog();
  if (v === "stats") renderStats();
  if (v === "history") renderHistory();
}
function bindTabs() {
  $$(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const view = tab.dataset.view;
      $$(".tab").forEach((t) => t.classList.toggle("active", t === tab));
      $$(".view").forEach((v) => v.classList.add("hidden"));
      $(`#view-${view}`).classList.remove("hidden");
      const titles = { log: "Log", stats: "Stats", history: "History" };
      $("#topTitle").textContent = titles[view];
      renderActiveView();
    });
  });
}

// ---------- init ----------
async function initApp() {
  $$(".profile-btn").forEach((b) => b.classList.toggle("active", b.dataset.profile === activeProfile()));
  bindLogDateControls();
  bindLog();
  bindTabs();
  bindProfileSwitch();
  bindData();
  renderLog();

  if (cloudEnabled()) {
    setCloudStatus("Cloud: connecting...");
    try {
      await syncFromCloud();
    } catch (err) {
      setCloudStatus("Cloud: sync failed", "error");
      console.error(err);
    }
  } else {
    setCloudStatus("Cloud: local only (configure Supabase)");
  }

  document.addEventListener("visibilitychange", async () => {
    if (!document.hidden) {
      store = loadStore();
      currentLogDate = clampLogDate(currentLogDate);
      $$(".profile-btn").forEach((b) => b.classList.toggle("active", b.dataset.profile === activeProfile()));
      if (cloudEnabled()) {
        await syncFromCloud({ silent: true });
      }
      renderActiveView();
    }
  });

  if (cloudEnabled()) {
    window.setInterval(() => {
      if (!document.hidden) syncFromCloud({ silent: true });
    }, 60000);
  }

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").then((reg) => {
        if (!reg) return;
        reg.addEventListener("updatefound", () => {
          const next = reg.installing;
          if (!next) return;
          next.addEventListener("statechange", () => {
            if (next.state === "installed" && navigator.serviceWorker.controller) {
              // New build is ready — swap it in on next load.
              window.location.reload();
            }
          });
        });
      }).catch(() => {});
    });
  }
}

initApp();
