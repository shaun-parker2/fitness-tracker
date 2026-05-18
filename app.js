/* ============================================================
   Trend — personal fitness tracker
   Storage: localStorage (single user, single device for now)
   ============================================================ */

const STORAGE_KEY = "trend.v1";
const KPIS = ["steps8k", "lowUpf", "exercise"];

// ---------- date helpers ----------
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => ymd(new Date());
const parseYmd = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
const fmtNice = (s) => {
  const d = parseYmd(s);
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
};

// ---------- storage ----------
function loadStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { version: 1, entries: {} };
    const obj = JSON.parse(raw);
    if (!obj.entries) obj.entries = {};
    return obj;
  } catch {
    return { version: 1, entries: {} };
  }
}
function saveStore(store) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}
function getEntry(store, dateStr) {
  return (
    store.entries[dateStr] || {
      weight: null,
      steps8k: false,
      lowUpf: false,
      exercise: false,
      beers: 0,
      note: "",
    }
  );
}
function setEntry(store, dateStr, patch) {
  const cur = getEntry(store, dateStr);
  const next = { ...cur, ...patch };
  // Only persist if there's something meaningful
  const hasData =
    next.weight != null ||
    next.steps8k ||
    next.lowUpf ||
    next.exercise ||
    next.beers > 0 ||
    (next.note && next.note.trim().length > 0);
  if (hasData) {
    store.entries[dateStr] = next;
  } else {
    delete store.entries[dateStr];
  }
  saveStore(store);
}

// ---------- app state ----------
let store = loadStore();
let savedHintTimer = null;

// ---------- DOM ----------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ---------- LOG view ----------
function renderLog() {
  const t = today();
  const e = getEntry(store, t);

  $("#todayDate").textContent = fmtNice(t);
  $("#weight").value = e.weight ?? "";
  $("#beersVal").textContent = e.beers || 0;
  $("#note").value = e.note || "";

  KPIS.forEach((k) => {
    const btn = document.querySelector(`.kpi-btn[data-kpi="${k}"]`);
    if (!btn) return;
    btn.classList.toggle("done", !!e[k]);
    btn.querySelector(".kpi-state").textContent = e[k] ? "Done ✓" : "Tap to mark done";
  });
}

function flashSaved() {
  const el = $("#savedHint");
  el.classList.add("show");
  clearTimeout(savedHintTimer);
  savedHintTimer = setTimeout(() => el.classList.remove("show"), 1200);
}

function bindLog() {
  // Weight (debounced commit on input)
  let weightTimer = null;
  $("#weight").addEventListener("input", (ev) => {
    clearTimeout(weightTimer);
    weightTimer = setTimeout(() => {
      const v = ev.target.value;
      const num = v === "" ? null : Number(v);
      setEntry(store, today(), { weight: Number.isFinite(num) ? num : null });
      flashSaved();
    }, 400);
  });

  // KPI buttons
  $$(".kpi-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const k = btn.dataset.kpi;
      const e = getEntry(store, today());
      setEntry(store, today(), { [k]: !e[k] });
      renderLog();
      flashSaved();
    });
  });

  // Beers stepper
  $$(".step-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const delta = Number(btn.dataset.step);
      const e = getEntry(store, today());
      const next = Math.max(0, (e.beers || 0) + delta);
      setEntry(store, today(), { beers: next });
      $("#beersVal").textContent = next;
      flashSaved();
    });
  });

  // Note
  let noteTimer = null;
  $("#note").addEventListener("input", (ev) => {
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => {
      setEntry(store, today(), { note: ev.target.value });
      flashSaved();
    }, 500);
  });
}

// ---------- analytics ----------
function lastNDates(n, endDateStr = today()) {
  const end = parseYmd(endDateStr);
  const out = [];
  for (let i = n - 1; i >= 0; i--) out.push(ymd(addDays(end, -i)));
  return out;
}
function entriesInRange(dates) {
  return dates.map((d) => ({ date: d, e: store.entries[d] || null }));
}
function rollingAvg(values, window) {
  // values: array of {x: dateStr, y: number|null}
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
function currentStreak(kpi) {
  let streak = 0;
  let d = new Date();
  // Allow today not yet logged — start from today; if today not done, check yesterday onward
  // Strict definition: count consecutive most-recent days (incl. today) where kpi is true
  for (;;) {
    const key = ymd(d);
    const e = store.entries[key];
    if (e && e[kpi]) {
      streak++;
      d = addDays(d, -1);
    } else {
      // If it's today and not yet done, don't break streak — check yesterday
      if (ymd(d) === today() && streak === 0) {
        d = addDays(d, -1);
        continue;
      }
      break;
    }
  }
  return streak;
}
function pct30(kpi) {
  const dates = lastNDates(30);
  let count = 0;
  dates.forEach((d) => { if (store.entries[d] && store.entries[d][kpi]) count++; });
  return Math.round((count / 30) * 100);
}
function weekRange() {
  // Mon–Sun containing today
  const now = new Date();
  const dow = (now.getDay() + 6) % 7; // 0=Mon
  const monday = addDays(now, -dow);
  const dates = [];
  for (let i = 0; i < 7; i++) dates.push(ymd(addDays(monday, i)));
  return dates;
}
function exerciseThisWeek() {
  return weekRange().filter((d) => store.entries[d] && store.entries[d].exercise).length;
}
function beersLast30() {
  const dates = lastNDates(30);
  return dates.reduce((sum, d) => sum + ((store.entries[d] && store.entries[d].beers) || 0), 0);
}

// ---------- STATS view ----------
let weightChart = null;
let kpiChart = null;

function renderStats() {
  const dates = lastNDates(60);
  const weightSeries = dates.map((d) => ({
    x: d,
    y: store.entries[d] && store.entries[d].weight != null ? store.entries[d].weight : null,
  }));
  const weight7 = rollingAvg(weightSeries, 7);
  const weight30 = rollingAvg(weightSeries, 30);

  // Summary tiles
  const latestAvg = [...weight7].reverse().find((p) => p.y != null);
  const oldAvg = weight30[weight30.length - 1];
  if (latestAvg && latestAvg.y != null) {
    $("#sWeight").textContent = latestAvg.y.toFixed(1) + " kg";
    if (oldAvg && oldAvg.y != null) {
      const diff = latestAvg.y - oldAvg.y;
      const sub = $("#sWeightTrend");
      sub.textContent = (diff > 0 ? "▲ " : diff < 0 ? "▼ " : "• ") + Math.abs(diff).toFixed(2) + " kg vs 30d";
      sub.className = "summary-sub " + (diff > 0 ? "up" : diff < 0 ? "down" : "");
    } else {
      $("#sWeightTrend").textContent = "—";
      $("#sWeightTrend").className = "summary-sub muted";
    }
  } else {
    $("#sWeight").textContent = "—";
    $("#sWeightTrend").textContent = "Log your weight to start";
    $("#sWeightTrend").className = "summary-sub muted";
  }

  $("#sExercise").textContent = `${exerciseThisWeek()} / 5`;

  // KPI %
  $("#pctSteps").textContent = pct30("steps8k") + "%";
  $("#pctUpf").textContent = pct30("lowUpf") + "%";
  $("#pctEx").textContent = pct30("exercise") + "%";

  // Streaks
  $("#stkSteps").textContent = currentStreak("steps8k");
  $("#stkUpf").textContent = currentStreak("lowUpf");
  $("#stkEx").textContent = currentStreak("exercise");

  // Beers
  const total = beersLast30();
  $("#beersTotal").textContent = total;
  $("#beersAvg").textContent = ((total / 30) * 7).toFixed(1) + " / week avg";

  // Charts
  drawWeightChart(weightSeries, weight7);
  drawKpiChart();
}

function drawWeightChart(raw, avg7) {
  const ctx = document.getElementById("weightChart");
  const labels = raw.map((p) => p.x);
  const data = {
    labels,
    datasets: [
      {
        label: "Daily",
        data: raw.map((p) => p.y),
        borderColor: "#8a92a3",
        backgroundColor: "#8a92a3",
        pointRadius: 2,
        showLine: false,
        spanGaps: false,
      },
      {
        label: "7-day avg",
        data: avg7.map((p) => p.y),
        borderColor: "#4ade80",
        backgroundColor: "rgba(74,222,128,0.15)",
        pointRadius: 0,
        tension: 0.3,
        fill: true,
        spanGaps: true,
      },
    ],
  };
  if (weightChart) weightChart.destroy();
  weightChart = new Chart(ctx, {
    type: "line",
    data,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: "#e7e9ee" } } },
      scales: {
        x: {
          ticks: {
            color: "#8a92a3",
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 6,
            callback: function (val) {
              const lbl = this.getLabelForValue(val);
              return lbl ? lbl.slice(5) : ""; // MM-DD
            },
          },
          grid: { color: "#262a34" },
        },
        y: {
          ticks: { color: "#8a92a3" },
          grid: { color: "#262a34" },
        },
      },
    },
  });
}

function drawKpiChart() {
  const dates = lastNDates(30);
  const series = (kpi) => dates.map((d) => (store.entries[d] && store.entries[d][kpi] ? 1 : 0));
  const ctx = document.getElementById("kpiChart");
  if (kpiChart) kpiChart.destroy();
  kpiChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: dates,
      datasets: [
        { label: "Steps", data: series("steps8k"), backgroundColor: "#4ade80", stack: "s" },
        { label: "UPF", data: series("lowUpf"), backgroundColor: "#22d3ee", stack: "u" },
        { label: "Exercise", data: series("exercise"), backgroundColor: "#f472b6", stack: "e" },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: "#e7e9ee" } } },
      scales: {
        x: {
          ticks: {
            color: "#8a92a3",
            autoSkip: true,
            maxTicksLimit: 6,
            callback: function (val) {
              const lbl = this.getLabelForValue(val);
              return lbl ? lbl.slice(5) : "";
            },
          },
          grid: { display: false },
          stacked: false,
        },
        y: {
          ticks: { color: "#8a92a3", stepSize: 1 },
          grid: { color: "#262a34" },
          max: 1,
          min: 0,
        },
      },
    },
  });
}

// ---------- HISTORY view ----------
function renderHistory() {
  const list = $("#historyList");
  const keys = Object.keys(store.entries).sort().reverse();
  if (!keys.length) {
    list.innerHTML = `<div class="history-empty">No entries yet — log today on the Log tab.</div>`;
    return;
  }
  list.innerHTML = keys
    .map((k) => {
      const e = store.entries[k];
      const flags =
        (e.steps8k ? "🟢" : "⚪") +
        (e.lowUpf ? "🟢" : "⚪") +
        (e.exercise ? "🟢" : "⚪");
      const w = e.weight != null ? e.weight.toFixed(1) + " kg" : "—";
      const beers = e.beers ? ` · 🍺×${e.beers}` : "";
      return `<div class="history-row">
        <div>
          <div class="history-date">${fmtNice(k)}</div>
          <div class="history-w">${w}</div>
        </div>
        <div class="muted" style="font-size:12px">${e.note ? escapeHtml(e.note) : ""}${beers}</div>
        <div class="history-kpis">${flags}</div>
      </div>`;
    })
    .join("");
}
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// Export / Import / Wipe
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
      if (!obj.entries || typeof obj.entries !== "object") throw new Error("Invalid file");
      // Merge: imported entries win for any overlapping date
      store.entries = { ...store.entries, ...obj.entries };
      saveStore(store);
      renderAll();
      alert("Import complete.");
    } catch (e) {
      alert("Import failed: " + e.message);
    } finally {
      ev.target.value = "";
    }
  });

  $("#wipeBtn").addEventListener("click", () => {
    if (!confirm("Delete all data? This cannot be undone.")) return;
    if (!confirm("Really? All weights, KPIs and notes will be removed.")) return;
    localStorage.removeItem(STORAGE_KEY);
    store = loadStore();
    renderAll();
  });
}

// ---------- nav ----------
function bindTabs() {
  $$(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const view = tab.dataset.view;
      $$(".tab").forEach((t) => t.classList.toggle("active", t === tab));
      $$(".view").forEach((v) => v.classList.add("hidden"));
      $(`#view-${view}`).classList.remove("hidden");
      const titles = { log: "Today", stats: "Stats", history: "History" };
      $("#topTitle").textContent = titles[view];
      if (view === "stats") renderStats();
      if (view === "history") renderHistory();
      if (view === "log") renderLog();
    });
  });
}

function renderAll() {
  renderLog();
  renderStats();
  renderHistory();
}

// ---------- init ----------
bindLog();
bindTabs();
bindData();
renderLog();

// Re-render on visibility change (date may have rolled over)
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    store = loadStore();
    renderLog();
  }
});

// Register service worker (PWA)
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
