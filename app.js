const STORAGE_KEY = "daily_startup_sessions_v1";
const ACTIVE_ID_KEY = "daily_startup_active_id_v1";
const CLOUD_CONFIG_KEY = "daily_startup_cloud_config_v1";
const GIST_FILE_NAME = "daily_startup_sessions.json";
const BASE_TITLE = "每日启动打卡";
const TIMER_MODES = {
  focus: { label: "专注", seconds: 25 * 60 },
  short_break: { label: "短休", seconds: 5 * 60 },
  long_break: { label: "长休", seconds: 15 * 60 },
};

const $ = (id) => document.getElementById(id);

const els = {
  date: $("date"),
  theme: $("theme"),
  firstStep: $("firstStep"),
  outputDefinition: $("outputDefinition"),
  parkingLot: $("parkingLot"),
  startTime: $("startTime"),
  endTime: $("endTime"),
  duration: $("duration"),
  segmentsLog: $("segmentsLog"),
  result: $("result"),
  done: $("done"),
  notDoneReasonEnabled: $("notDoneReasonEnabled"),
  notDoneReason: $("notDoneReason"),
  historySelect: $("historySelect"),
  loadHistoryBtn: $("loadHistoryBtn"),
  deleteHistoryBtn: $("deleteHistoryBtn"),
  saveStatus: $("saveStatus"),
  cloudToken: $("cloudToken"),
  cloudGistId: $("cloudGistId"),
  cloudEnabled: $("cloudEnabled"),
  cloudAutoSync: $("cloudAutoSync"),
  cloudCreateBtn: $("cloudCreateBtn"),
  cloudPullBtn: $("cloudPullBtn"),
  cloudPushBtn: $("cloudPushBtn"),
  cloudStatus: $("cloudStatus"),

  timerText: $("timerText"),
  timerMeta: $("timerMeta"),
  startTimerBtn: $("startTimerBtn"),
  pauseTimerBtn: $("pauseTimerBtn"),
  resetTimerBtn: $("resetTimerBtn"),
  focusModeBtn: $("focusModeBtn"),
  shortBreakModeBtn: $("shortBreakModeBtn"),
  longBreakModeBtn: $("longBreakModeBtn"),

  whiteNoiseType: $("whiteNoiseType"),
  whiteNoiseVolume: $("whiteNoiseVolume"),
  whiteNoiseVolumeText: $("whiteNoiseVolumeText"),
  bellType: $("bellType"),
  bellVolume: $("bellVolume"),
  bellVolumeText: $("bellVolumeText"),

  newSessionBtn: $("newSessionBtn"),
  exportBtn: $("exportBtn"),
  exportDialog: $("exportDialog"),
  exportText: $("exportText"),
  copyExportBtn: $("copyExportBtn"),
  downloadExportBtn: $("downloadExportBtn"),
};

function nowISO() {
  return new Date().toISOString();
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function fmtHHMM(date) {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function minutesToMMSS(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${pad2(mm)}:${pad2(ss)}`;
}

function durationSecondsFromHHMM(startHHMM, endHHMM) {
  if (!startHHMM || !endHHMM) return 0;
  const [sh, sm] = startHHMM.split(":").map((x) => Number(x));
  const [eh, em] = endHHMM.split(":").map((x) => Number(x));
  if (!Number.isFinite(sh) || !Number.isFinite(sm) || !Number.isFinite(eh) || !Number.isFinite(em)) return 0;
  const start = sh * 60 + sm;
  const end = eh * 60 + em;
  let diff = end - start;
  if (diff < 0) diff += 24 * 60;
  return diff * 60;
}

function formatDurationFromSeconds(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const totalMinutes = Math.floor(s / 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m} 分钟`;
  return `${h} 小时 ${m} 分钟`;
}

function computeTotalDurationSecondsFromSegments(segments) {
  if (!Array.isArray(segments)) return 0;
  let total = 0;
  for (const seg of segments) {
    total += durationSecondsFromHHMM(seg?.startTime, seg?.endTime);
  }
  return total;
}

function buildSegmentsLog(s) {
  const timer = s?.timer || {};
  const segments = Array.isArray(timer.segments) ? timer.segments : [];
  const lines = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i] || {};
    const st = (seg.startTime || "").trim();
    const et = (seg.endTime || "").trim();
    if (!st || !et) continue;
    const d = computeDuration(st, et);
    const dText = d ? `（${d}）` : "";
    lines.push(`${i + 1}. ${st} - ${et}${dText}`);
  }

  // show current in-progress block (optional)
  const curStart = (timer.currentBlockStartHHMM || s?.startTime || "").trim();
  const hasCurrent = timer.running || (timer.remainingSeconds ?? 0) > 0;
  if (hasCurrent && curStart && (!els?.endTime?.value || (s.endTime || "").trim() === "")) {
    lines.push(`${lines.length + 1}. 进行中：${curStart} - （未完成）`);
  }

  return lines.join("\n");
}

function syncTimeUIFromSession(s) {
  if (!s) return;
  const timer = s.timer || {};
  const segments = Array.isArray(timer.segments) ? timer.segments : [];

  // segments-based cumulative duration (preferred)
  const totalSeconds = computeTotalDurationSecondsFromSegments(segments);
  if (totalSeconds > 0) {
    els.duration.value = formatDurationFromSeconds(totalSeconds);
  } else {
    // fallback: only current block has start/end
    const fallback = computeDuration(els.startTime.value, els.endTime.value);
    els.duration.value = fallback || "";
  }

  const log = buildSegmentsLog(s);
  els.segmentsLog.value = log || "";
}

function getTimerMode(mode) {
  return TIMER_MODES[mode] || TIMER_MODES.focus;
}

function isFocusMode(s) {
  const mode = s?.timer?.mode || "focus";
  return mode === "focus";
}

function safeParseJSON(s, fallback) {
  try {
    return JSON.parse(s);
  } catch {
    return fallback;
  }
}

function loadAllSessions() {
  const raw = localStorage.getItem(STORAGE_KEY);
  const data = safeParseJSON(raw || "[]", []);
  return Array.isArray(data) ? data : [];
}

function saveAllSessions(sessions) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
}

function loadCloudConfig() {
  const raw = localStorage.getItem(CLOUD_CONFIG_KEY);
  const cfg = safeParseJSON(raw || "{}", {});
  return {
    enabled: Boolean(cfg.enabled),
    autoSync: Boolean(cfg.autoSync),
    gistId: (cfg.gistId || "").trim(),
    token: (cfg.token || "").trim(),
  };
}

function saveCloudConfig(cfg) {
  localStorage.setItem(CLOUD_CONFIG_KEY, JSON.stringify(cfg));
}

function getActiveId() {
  return localStorage.getItem(ACTIVE_ID_KEY);
}

function setActiveId(id) {
  localStorage.setItem(ACTIVE_ID_KEY, id);
}

function uuid() {
  // good enough for local usage
  return `s_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

function defaultSession() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = pad2(d.getMonth() + 1);
  const dd = pad2(d.getDate());
  return {
    id: uuid(),
    createdAt: nowISO(),
    updatedAt: nowISO(),
    date: `${yyyy}-${mm}-${dd}`,
    theme: "",
    firstStep: "打开 cs50x 作业",
    outputDefinition: "完成作业",
    parkingLot: [
      "week2 作业 到视频",
      "对了记得买 iPad 的那个和电脑支架（如果手机有键盘也是更好了）",
      "week3 作业到视频",
      "49",
      "世界好大",
      "fog 练习题",
      "看下买相机网站",
      "注意 PEI 可以写一点了，下周期末我不想不合格：成就感/正反馈",
      "计算机好像就是把现实编程算法，然后从混沌中找到秩序",
    ]
      .map((x) => `- ${x}`)
      .join("\n"),
    startTime: "",
    endTime: "",
    result: "",
    done: false,
    notDoneReasonEnabled: false,
    notDoneReason: "",

    whiteNoiseType: "off",
    whiteNoiseVolume: 35,
    bellType: "off",
    bellVolume: 60,

    timer: {
      mode: "focus",
      totalSeconds: TIMER_MODES.focus.seconds,
      remainingSeconds: TIMER_MODES.focus.seconds,
      running: false,
      startedAtISO: null,
      lastTickISO: null,
      completedAtISO: null,
      // 每完成一个 25 分钟块，就往这里追加一条 { startTime, endTime }
      currentBlockStartHHMM: "",
      segments: [],
    },
  };
}

function sessionTitle(s) {
  const date = s.date || "未命名日期";
  const theme = (s.theme || "").trim();
  const step = (s.firstStep || "").trim();
  const label = theme || step || "未命名";
  return `${date} · ${label.slice(0, 30)}`;
}

function computeDuration(startHHMM, endHHMM) {
  if (!startHHMM || !endHHMM) return "";
  const [sh, sm] = startHHMM.split(":").map((x) => Number(x));
  const [eh, em] = endHHMM.split(":").map((x) => Number(x));
  if (!Number.isFinite(sh) || !Number.isFinite(sm) || !Number.isFinite(eh) || !Number.isFinite(em)) return "";
  const start = sh * 60 + sm;
  const end = eh * 60 + em;
  let diff = end - start;
  if (diff < 0) diff += 24 * 60; // cross midnight
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  if (h === 0) return `${m} 分钟`;
  return `${h} 小时 ${m} 分钟`;
}

let activeSession = null;
let autosaveTimer = null;
let tickTimer = null;
let cloudSyncTimer = null;

// ===== Audio (WebAudio) =====
let audioCtx = null;
let masterWhiteGain = null;
let masterBellGain = null;
let whiteNoiseController = null;
let noiseBufferCache = null;

function ensureAudioContext() {
  if (audioCtx) return audioCtx;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  audioCtx = new Ctx();

  masterWhiteGain = audioCtx.createGain();
  masterBellGain = audioCtx.createGain();

  // light limiter to avoid harshness
  const limiter = audioCtx.createDynamicsCompressor();
  limiter.threshold.value = -18;
  limiter.knee.value = 25;
  limiter.ratio.value = 8;
  limiter.attack.value = 0.01;
  limiter.release.value = 0.2;

  masterWhiteGain.connect(limiter);
  masterBellGain.connect(limiter);
  limiter.connect(audioCtx.destination);
  return audioCtx;
}

function unlockAudio() {
  const ctx = ensureAudioContext();
  if (!ctx) return null;
  if (ctx.state === "suspended") {
    // resume must be triggered by user gesture; we call it inside click handlers
    ctx.resume().catch(() => {});
  }
  return ctx;
}

function getNoiseBuffer() {
  if (!audioCtx) return null;
  if (noiseBufferCache) return noiseBufferCache;
  const durationSeconds = 1;
  const bufferSize = Math.floor(audioCtx.sampleRate * durationSeconds);
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
  noiseBufferCache = buffer;
  return noiseBufferCache;
}

function stopWhiteNoise() {
  if (whiteNoiseController?.stop) {
    try {
      whiteNoiseController.stop();
    } catch {}
  }
  whiteNoiseController = null;
}

function startWhiteNoise(type, volumePct) {
  const ctx = unlockAudio();
  if (!ctx || !masterWhiteGain) return;
  stopWhiteNoise();

  const vol = Math.max(0, Math.min(100, Number(volumePct ?? 35))) / 100;
  if (!type || type === "off" || vol <= 0) return;

  const noiseBuffer = getNoiseBuffer();
  if (!noiseBuffer) return;

  // baseline gain per setting
  const baseGain = (vol * 0.35) / 1;

  if (type === "library") {
    // background rustle + occasional flip bursts (procedurally synthesized)
    const rustleGain = ctx.createGain();
    rustleGain.gain.value = baseGain * 0.35;

    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;

    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 350;

    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1200;
    bp.Q.value = 0.85;

    src.connect(hp);
    hp.connect(bp);
    bp.connect(rustleGain);
    rustleGain.connect(masterWhiteGain);
    src.start();

    let flipTimeout = null;
    const controller = {
      stop: () => {
        if (flipTimeout) window.clearTimeout(flipTimeout);
        try {
          src.stop();
        } catch {}
      },
    };

    const triggerFlip = () => {
      const flipSrc = ctx.createBufferSource();
      flipSrc.buffer = noiseBuffer;

      const flipHP = ctx.createBiquadFilter();
      flipHP.type = "highpass";
      flipHP.frequency.value = 450;

      const flipBP = ctx.createBiquadFilter();
      flipBP.type = "bandpass";
      flipBP.frequency.value = 800 + Math.random() * 1900;
      flipBP.Q.value = 1.1;

      const flipGain = ctx.createGain();
      const t0 = ctx.currentTime;
      const peak = baseGain * 1.05;
      const dur = 0.28;
      flipGain.gain.setValueAtTime(0.0001, t0);
      flipGain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), t0 + 0.02);
      flipGain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

      flipSrc.connect(flipHP);
      flipHP.connect(flipBP);
      flipBP.connect(flipGain);
      flipGain.connect(masterWhiteGain);

      flipSrc.start(t0);
      flipSrc.stop(t0 + dur);
    };

    const scheduleFlip = () => {
      const delay = 12000 + Math.random() * 13000; // 12-25s
      flipTimeout = window.setTimeout(() => {
        if (!whiteNoiseController) return; // stopped
        triggerFlip();
        scheduleFlip();
      }, delay);
    };
    controller.stop = () => {
      if (flipTimeout) window.clearTimeout(flipTimeout);
      try {
        src.stop();
      } catch {}
    };
    whiteNoiseController = controller;
    scheduleFlip();
    return;
  }

  if (type === "rain") {
    // continuous rain bed + occasional splashes
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;

    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 420;

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 2200;
    lp.Q.value = 0.4;

    const rainGain = ctx.createGain();
    rainGain.gain.value = baseGain * 0.42;

    src.connect(hp);
    hp.connect(lp);
    lp.connect(rainGain);
    rainGain.connect(masterWhiteGain);
    src.start();

    // gentle movement via LFO -> lowpass cutoff
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.12 + Math.random() * 0.12;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 900;
    lfo.connect(lfoGain);
    lfoGain.connect(lp.frequency);
    lfo.start();

    let dripTimeout = null;
    const controller = {
      stop: () => {
        if (dripTimeout) window.clearTimeout(dripTimeout);
        try {
          src.stop();
        } catch {}
        try {
          lfo.stop();
        } catch {}
      },
    };

    const triggerSplash = () => {
      const splashSrc = ctx.createBufferSource();
      splashSrc.buffer = noiseBuffer;

      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 900 + Math.random() * 1800;
      bp.Q.value = 0.9;

      const g = ctx.createGain();
      const t0 = ctx.currentTime;
      const peak = baseGain * 0.65;
      const dur = 0.16 + Math.random() * 0.10;

      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

      splashSrc.connect(bp);
      bp.connect(g);
      g.connect(masterWhiteGain);
      splashSrc.start(t0);
      splashSrc.stop(t0 + dur + 0.02);
    };

    const scheduleDrip = () => {
      const delay = 900 + Math.random() * 1300; // ~1-2.3s
      dripTimeout = window.setTimeout(() => {
        if (!whiteNoiseController) return;
        triggerSplash();
        scheduleDrip();
      }, delay);
    };

    whiteNoiseController = controller;
    scheduleDrip();
    return;
  }

  if (type === "birds") {
    // intermittent chirps (procedurally synthesized, offline)
    const controller = {
      timers: [],
      stop: () => {
        for (const t of controller.timers) window.clearTimeout(t);
        controller.timers = [];
      },
    };

    // optional airy background noise, very low
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;

    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 1200;

    const g = ctx.createGain();
    g.gain.value = baseGain * 0.08;

    src.connect(hp);
    hp.connect(g);
    g.connect(masterWhiteGain);
    src.start();

    controller.stop = () => {
      for (const t of controller.timers) window.clearTimeout(t);
      controller.timers = [];
      try {
        src.stop();
      } catch {}
    };

    const triggerChirp = () => {
      const t0 = ctx.currentTime;
      const dur = 0.22 + Math.random() * 0.05;

      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = 2600 + Math.random() * 1200;
      filter.Q.value = 0.7 + Math.random() * 0.7;

      const out = ctx.createGain();
      out.gain.setValueAtTime(0.0001, t0);
      const peak = baseGain * 0.75;
      out.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), t0 + 0.012);
      out.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      filter.connect(out);
      out.connect(masterWhiteGain);

      const f1 = 2400 + Math.random() * 1400;
      const f2 = 1100 + Math.random() * 900;

      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(f1, t0);
      osc.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
      const oscGain = ctx.createGain();
      oscGain.gain.value = 0.9;
      osc.connect(oscGain);
      oscGain.connect(filter);
      osc.start(t0);
      osc.stop(t0 + dur + 0.01);

      // add a tiny noise tick for "chirp texture"
      const noiseSrc = ctx.createBufferSource();
      noiseSrc.buffer = noiseBuffer;
      const nbp = ctx.createBiquadFilter();
      nbp.type = "bandpass";
      nbp.frequency.value = 3500 + Math.random() * 1500;
      nbp.Q.value = 2.0;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.0001, t0);
      ng.gain.exponentialRampToValueAtTime(peak * 0.18, t0 + 0.01);
      ng.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.06 + Math.random() * 0.04);
      noiseSrc.connect(nbp);
      nbp.connect(ng);
      ng.connect(filter);
      noiseSrc.start(t0);
      noiseSrc.stop(t0 + 0.11 + Math.random() * 0.06);
    };

    const scheduleChirp = () => {
      const delay = 1800 + Math.random() * 3200; // 1.8-5s
      const t = window.setTimeout(() => {
        if (!whiteNoiseController) return;
        triggerChirp();
        scheduleChirp();
      }, delay);
      controller.timers.push(t);
    };

    whiteNoiseController = controller;
    scheduleChirp();
    return;
  }
}

function playBell(bellType, volumePct) {
  const ctx = unlockAudio();
  if (!ctx || !masterBellGain) return;
  if (!bellType || bellType === "off") return;

  const vol = Math.max(0, Math.min(100, Number(volumePct ?? 60))) / 100;
  if (vol <= 0) return;

  const t0 = ctx.currentTime + 0.02;
  const dur = bellType === "clear" ? 2.1 : 1.7;

  const baseFreq = bellType === "clear" ? 880 : 660;

  const out = ctx.createGain();
  out.connect(masterBellGain);

  out.gain.setValueAtTime(0.0001, t0);
  out.gain.exponentialRampToValueAtTime(Math.max(0.0001, vol * 0.95), t0 + 0.01);
  out.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = baseFreq * 1.6;
  filter.Q.value = 1.2;
  filter.connect(out);

  const partials = bellType === "clear" ? [1, 2.02, 2.99, 4.05, 5.02] : [1, 2.0, 3.0, 4.02];
  const amps = bellType === "clear" ? [1, 0.42, 0.28, 0.18, 0.12] : [1, 0.45, 0.25, 0.15];

  for (let i = 0; i < partials.length; i++) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    const ratio = partials[i];
    const amp = amps[i] ?? 0.2;

    osc.frequency.setValueAtTime(baseFreq * ratio * (1 + (Math.random() - 0.5) * 0.002), t0);

    const g = ctx.createGain();
    g.gain.value = amp;

    osc.connect(g);
    g.connect(filter);

    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }
}

function setSaveStatus(text) {
  els.saveStatus.textContent = text;
}

function setCloudStatus(text) {
  if (els.cloudStatus) els.cloudStatus.textContent = text;
}

function hydrateFormFromSession(s) {
  els.date.value = s.date || "";
  els.theme.value = s.theme || "";
  els.firstStep.value = s.firstStep || "";
  els.outputDefinition.value = s.outputDefinition || "";
  els.parkingLot.value = s.parkingLot || "";
  els.startTime.value = s.startTime || "";
  els.endTime.value = s.endTime || "";
  els.result.value = s.result || "";
  els.done.checked = Boolean(s.done);
  els.notDoneReasonEnabled.checked = Boolean(s.notDoneReasonEnabled);
  els.notDoneReason.disabled = !els.notDoneReasonEnabled.checked;
  els.notDoneReason.value = s.notDoneReason || "";

  els.whiteNoiseType.value = s.whiteNoiseType || "off";
  els.whiteNoiseVolume.value = String(s.whiteNoiseVolume ?? 35);
  els.bellType.value = s.bellType || "off";
  els.bellVolume.value = String(s.bellVolume ?? 60);
  els.whiteNoiseVolumeText.textContent = `${Number(els.whiteNoiseVolume.value)}%`;
  els.bellVolumeText.textContent = `${Number(els.bellVolume.value)}%`;

  // make sure segments are always present for older local data
  s.timer = s.timer || {};
  if (!Array.isArray(s.timer.segments)) s.timer.segments = [];
  if (!s.timer.currentBlockStartHHMM) s.timer.currentBlockStartHHMM = s.startTime || "";

  syncTimeUIFromSession(s);

  renderTimerFromSession(s);
}

function readSessionFromForm(prev) {
  const s = { ...prev };
  s.updatedAt = nowISO();
  s.date = els.date.value;
  s.theme = els.theme.value;
  s.firstStep = els.firstStep.value;
  s.outputDefinition = els.outputDefinition.value;
  s.parkingLot = els.parkingLot.value;
  s.startTime = els.startTime.value;
  s.endTime = els.endTime.value;
  s.result = els.result.value;
  s.done = els.done.checked;
  s.notDoneReasonEnabled = els.notDoneReasonEnabled.checked;
  s.notDoneReason = els.notDoneReason.value;

  s.whiteNoiseType = els.whiteNoiseType.value;
  s.whiteNoiseVolume = Number(els.whiteNoiseVolume.value);
  s.bellType = els.bellType.value;
  s.bellVolume = Number(els.bellVolume.value);

  s.timer = { ...prev.timer };
  s.timer.remainingSeconds = Math.max(0, Math.floor(s.timer.remainingSeconds));

  return s;
}

function upsertSession(s) {
  const sessions = loadAllSessions();
  const idx = sessions.findIndex((x) => x.id === s.id);
  if (idx >= 0) sessions[idx] = s;
  else sessions.unshift(s);
  saveAllSessions(sessions);
}

function removeSession(id) {
  const sessions = loadAllSessions().filter((x) => x.id !== id);
  saveAllSessions(sessions);
}

async function githubApiRequest(path, method, token, bodyObj) {
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers,
    body: bodyObj ? JSON.stringify(bodyObj) : undefined,
  });
  if (!res.ok) {
    let detail = "";
    try {
      const j = await res.json();
      detail = j?.message || "";
    } catch {}
    throw new Error(`GitHub API ${res.status}${detail ? `: ${detail}` : ""}`);
  }
  return res.json();
}

function readCloudConfigFromUI() {
  return {
    enabled: Boolean(els.cloudEnabled.checked),
    autoSync: Boolean(els.cloudAutoSync.checked),
    gistId: (els.cloudGistId.value || "").trim(),
    token: (els.cloudToken.value || "").trim(),
  };
}

function hydrateCloudUI() {
  const cfg = loadCloudConfig();
  els.cloudEnabled.checked = cfg.enabled;
  els.cloudAutoSync.checked = cfg.autoSync;
  els.cloudGistId.value = cfg.gistId;
  els.cloudToken.value = cfg.token;
  setCloudStatus(cfg.enabled ? "已启用（待同步）" : "未启用");
}

function saveCloudConfigFromUI() {
  const cfg = readCloudConfigFromUI();
  saveCloudConfig(cfg);
  setCloudStatus(cfg.enabled ? "已保存配置" : "未启用");
}

function buildCloudPayload() {
  const sessions = loadAllSessions();
  const activeId = getActiveId();
  return {
    schemaVersion: 1,
    updatedAt: nowISO(),
    activeId,
    sessions,
  };
}

function applyCloudPayload(payload) {
  const sessions = Array.isArray(payload?.sessions) ? payload.sessions : [];
  saveAllSessions(sessions);

  const activeId = (payload?.activeId || "").trim();
  const selectedId = sessions.find((s) => s.id === activeId)?.id || sessions[0]?.id || "";
  if (selectedId) setActiveId(selectedId);

  activeSession = ensureActiveSession();
  refreshHistorySelect(activeSession.id);
  hydrateFormFromSession(activeSession);
}

async function createCloudGist() {
  const cfg = readCloudConfigFromUI();
  if (!cfg.token) {
    setCloudStatus("请先填 GitHub Token");
    return;
  }
  setCloudStatus("正在创建云端仓库…");
  const payload = buildCloudPayload();
  const gist = await githubApiRequest("/gists", "POST", cfg.token, {
    description: "Daily startup memory sync",
    public: false,
    files: {
      [GIST_FILE_NAME]: {
        content: JSON.stringify(payload, null, 2),
      },
    },
  });
  const id = gist?.id || "";
  if (!id) throw new Error("创建失败：未返回 Gist ID");
  els.cloudGistId.value = id;
  const updated = readCloudConfigFromUI();
  updated.enabled = true;
  els.cloudEnabled.checked = true;
  saveCloudConfig(updated);
  setCloudStatus("云端仓库已创建并启用");
}

async function pushToCloud() {
  const cfg = readCloudConfigFromUI();
  if (!cfg.enabled) {
    setCloudStatus("请先启用记忆模式");
    return;
  }
  if (!cfg.token || !cfg.gistId) {
    setCloudStatus("请填写 Token 和 Gist ID");
    return;
  }
  setCloudStatus("正在上传到云端…");
  const payload = buildCloudPayload();
  await githubApiRequest(`/gists/${encodeURIComponent(cfg.gistId)}`, "PATCH", cfg.token, {
    files: {
      [GIST_FILE_NAME]: {
        content: JSON.stringify(payload, null, 2),
      },
    },
  });
  setCloudStatus(`已上传 · ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`);
}

async function pullFromCloud() {
  const cfg = readCloudConfigFromUI();
  if (!cfg.enabled) {
    setCloudStatus("请先启用记忆模式");
    return;
  }
  if (!cfg.token || !cfg.gistId) {
    setCloudStatus("请填写 Token 和 Gist ID");
    return;
  }
  setCloudStatus("正在从云端下载…");
  const gist = await githubApiRequest(`/gists/${encodeURIComponent(cfg.gistId)}`, "GET", cfg.token);
  const files = gist?.files || {};
  const target = files[GIST_FILE_NAME] || Object.values(files)[0];
  const raw = target?.content || "";
  const payload = safeParseJSON(raw, null);
  if (!payload || !Array.isArray(payload.sessions)) {
    throw new Error("云端数据格式不正确");
  }
  applyCloudPayload(payload);
  setCloudStatus(`已下载 · ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`);
}

function scheduleCloudAutoPush() {
  const cfg = readCloudConfigFromUI();
  if (!cfg.enabled || !cfg.autoSync || !cfg.token || !cfg.gistId) return;
  if (cloudSyncTimer) window.clearTimeout(cloudSyncTimer);
  cloudSyncTimer = window.setTimeout(() => {
    pushToCloud().catch((err) => setCloudStatus(`自动同步失败：${err.message || "未知错误"}`));
  }, 2000);
}

function refreshHistorySelect(activeId) {
  const sessions = loadAllSessions();
  els.historySelect.innerHTML = "";
  if (sessions.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "暂无记录";
    els.historySelect.appendChild(opt);
    els.historySelect.disabled = true;
    els.loadHistoryBtn.disabled = true;
    els.deleteHistoryBtn.disabled = true;
    return;
  }
  els.historySelect.disabled = false;
  els.loadHistoryBtn.disabled = false;
  els.deleteHistoryBtn.disabled = false;
  for (const s of sessions) {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = sessionTitle(s);
    els.historySelect.appendChild(opt);
  }
  els.historySelect.value = activeId || sessions[0].id;
}

function ensureActiveSession() {
  const sessions = loadAllSessions();
  const activeId = getActiveId();
  if (sessions.length === 0) {
    const s = defaultSession();
    saveAllSessions([s]);
    setActiveId(s.id);
    return s;
  }
  const found = sessions.find((x) => x.id === activeId) || sessions[0];
  setActiveId(found.id);
  return found;
}

function scheduleAutosave() {
  if (autosaveTimer) window.clearTimeout(autosaveTimer);
  autosaveTimer = window.setTimeout(() => {
    if (!activeSession) return;
    const updated = readSessionFromForm(activeSession);
    // keep timer state up to date
    updated.timer = { ...activeSession.timer };
    activeSession = updated;
    upsertSession(activeSession);
    refreshHistorySelect(activeSession.id);
    setSaveStatus(`已保存 · ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`);
    scheduleCloudAutoPush();
  }, 450);
}

function bindAutosave() {
  const inputs = [
    els.date,
    els.theme,
    els.firstStep,
    els.outputDefinition,
    els.parkingLot,
    els.startTime,
    els.endTime,
    els.whiteNoiseType,
    els.whiteNoiseVolume,
    els.bellType,
    els.bellVolume,
    els.result,
    els.done,
    els.notDoneReasonEnabled,
    els.notDoneReason,
  ];
  for (const el of inputs) {
    el.addEventListener("input", () => {
      if (el === els.endTime || el === els.startTime) {
        syncTimeUIFromSession(activeSession);
      }
      if (el === els.whiteNoiseVolume) els.whiteNoiseVolumeText.textContent = `${Number(els.whiteNoiseVolume.value)}%`;
      if (el === els.bellVolume) els.bellVolumeText.textContent = `${Number(els.bellVolume.value)}%`;

      if (activeSession?.timer?.running && (el === els.whiteNoiseType || el === els.whiteNoiseVolume)) {
        const type = els.whiteNoiseType.value;
        const vol = Number(els.whiteNoiseVolume.value);
        if (type === "off") stopWhiteNoise();
        else startWhiteNoise(type, vol);
      }

      setSaveStatus("未保存…");
      scheduleAutosave();
    });
    el.addEventListener("change", () => {
      if (el === els.endTime || el === els.startTime) {
        syncTimeUIFromSession(activeSession);
      }
      if (el === els.whiteNoiseVolume) els.whiteNoiseVolumeText.textContent = `${Number(els.whiteNoiseVolume.value)}%`;
      if (el === els.bellVolume) els.bellVolumeText.textContent = `${Number(els.bellVolume.value)}%`;

      if (activeSession?.timer?.running && (el === els.whiteNoiseType || el === els.whiteNoiseVolume)) {
        const type = els.whiteNoiseType.value;
        const vol = Number(els.whiteNoiseVolume.value);
        if (type === "off") stopWhiteNoise();
        else startWhiteNoise(type, vol);
      }

      setSaveStatus("未保存…");
      scheduleAutosave();
    });
  }

  els.notDoneReasonEnabled.addEventListener("change", () => {
    els.notDoneReason.disabled = !els.notDoneReasonEnabled.checked;
    if (!els.notDoneReasonEnabled.checked) els.notDoneReason.value = "";
    setSaveStatus("未保存…");
    scheduleAutosave();
  });
}

// Timer logic
function renderTimerFromSession(s) {
  const t = s.timer || {};
  if (!t.mode) t.mode = "focus";
  if (!Number.isFinite(t.totalSeconds) || t.totalSeconds <= 0) t.totalSeconds = getTimerMode(t.mode).seconds;
  if (!Number.isFinite(t.remainingSeconds) || t.remainingSeconds < 0) t.remainingSeconds = t.totalSeconds;
  const modeCfg = getTimerMode(t.mode);
  els.timerText.textContent = minutesToMMSS(t.remainingSeconds ?? 25 * 60);

  // Sync countdown into browser tab title
  const remaining = t.remainingSeconds ?? 25 * 60;
  if (t.running) {
    document.title = `${modeCfg.label} ${minutesToMMSS(remaining)} · ${BASE_TITLE}`;
  } else if ((t.remainingSeconds ?? 0) <= 0) {
    document.title = `${modeCfg.label} 完成 · ${BASE_TITLE}`;
  } else if (t.startedAtISO) {
    document.title = `${modeCfg.label} 已暂停 · ${minutesToMMSS(remaining)} · ${BASE_TITLE}`;
  } else {
    document.title = BASE_TITLE;
  }

  if (t.running) {
    els.timerMeta.textContent = `${modeCfg.label}进行中`;
  } else if ((t.remainingSeconds ?? 0) <= 0) {
    els.timerMeta.textContent = `${modeCfg.label}已完成`;
  } else if (t.startedAtISO) {
    els.timerMeta.textContent = `${modeCfg.label}已暂停`;
  } else {
    els.timerMeta.textContent = `${modeCfg.label}未开始`;
  }
  els.startTimerBtn.disabled = Boolean(t.running);
  els.pauseTimerBtn.disabled = !Boolean(t.running);
  if (els.focusModeBtn) els.focusModeBtn.classList.toggle("btn--primary", t.mode === "focus");
  if (els.shortBreakModeBtn) els.shortBreakModeBtn.classList.toggle("btn--primary", t.mode === "short_break");
  if (els.longBreakModeBtn) els.longBreakModeBtn.classList.toggle("btn--primary", t.mode === "long_break");
}

function stopTicking() {
  if (tickTimer) window.clearInterval(tickTimer);
  tickTimer = null;
}

function startTicking() {
  stopTicking();
  tickTimer = window.setInterval(() => {
    if (!activeSession?.timer?.running) return;
    const now = Date.now();
    const last = activeSession.timer.lastTickISO ? Date.parse(activeSession.timer.lastTickISO) : now;
    const deltaSec = Math.max(0, Math.round((now - last) / 1000));
    if (deltaSec <= 0) return;
    activeSession.timer.lastTickISO = new Date(now).toISOString();
    activeSession.timer.remainingSeconds = Math.max(0, activeSession.timer.remainingSeconds - deltaSec);
    if (activeSession.timer.remainingSeconds <= 0) {
      activeSession.timer.remainingSeconds = 0;
      activeSession.timer.running = false;
      activeSession.timer.completedAtISO = nowISO();
      stopTicking();

      // timer finished: stop noise + optional bell
      stopWhiteNoise();

      if (isFocusMode(activeSession)) {
        const endHHMM = fmtHHMM(new Date());
        const segStart =
          activeSession.timer.currentBlockStartHHMM || els.startTime.value || fmtHHMM(new Date());
        activeSession.timer.currentBlockStartHHMM = segStart;

        // 当前段：写入结束时间，并追加到分段记录
        els.startTime.value = segStart;
        els.endTime.value = endHHMM;

        if (!Array.isArray(activeSession.timer.segments)) activeSession.timer.segments = [];
        const segs = activeSession.timer.segments;
        const last = segs[segs.length - 1];
        const shouldPush = !last || last.startTime !== segStart || last.endTime !== endHHMM;
        if (shouldPush) segs.push({ startTime: segStart, endTime: endHHMM });

        syncTimeUIFromSession(activeSession);
      }

      playBell(els.bellType?.value, Number(els.bellVolume?.value ?? 60));

      els.timerMeta.textContent = "已完成";
      els.pauseTimerBtn.disabled = true;
      els.startTimerBtn.disabled = false;
      try {
        // gentle notification
        window.navigator.vibrate?.(120);
      } catch {}
    }
    renderTimerFromSession(activeSession);
    setSaveStatus("未保存…");
    scheduleAutosave();
  }, 500);
}

function setStartTimeIfEmpty() {
  if (!els.startTime.value) {
    els.startTime.value = fmtHHMM(new Date());
    if (activeSession?.timer) activeSession.timer.currentBlockStartHHMM = els.startTime.value;
  }
}

function setEndTimeIfEmpty() {
  if (!els.endTime.value) {
    els.endTime.value = fmtHHMM(new Date());
  }
}

function timerStart() {
  if (!activeSession) return;
  if (!activeSession.timer.mode) activeSession.timer.mode = "focus";
  if (!Number.isFinite(activeSession.timer.totalSeconds) || activeSession.timer.totalSeconds <= 0) {
    activeSession.timer.totalSeconds = getTimerMode(activeSession.timer.mode).seconds;
  }
  const now = new Date();
  const isNewBlock = activeSession.timer.remainingSeconds <= 0;
  const focusMode = isFocusMode(activeSession);

  if (isNewBlock) {
    // 上一段 25 分钟已完成：开启下一段，并把“当前段开始/结束”重置成新值
    activeSession.timer.remainingSeconds = activeSession.timer.totalSeconds;
    activeSession.timer.completedAtISO = null;
    if (focusMode) {
      activeSession.timer.currentBlockStartHHMM = fmtHHMM(now);
      els.startTime.value = activeSession.timer.currentBlockStartHHMM;
      els.endTime.value = "";
    }
    activeSession.timer.startedAtISO = nowISO();
    if (focusMode) syncTimeUIFromSession(activeSession);
  } else {
    // 暂停后继续：同一段不追加分段记录，只继续倒计时
    if (focusMode && !activeSession.timer.currentBlockStartHHMM) {
      const st = els.startTime.value || fmtHHMM(now);
      els.startTime.value = st;
      activeSession.timer.currentBlockStartHHMM = st;
    }
    if (!activeSession.timer.startedAtISO) activeSession.timer.startedAtISO = nowISO();
  }

  activeSession.timer.running = true;
  activeSession.timer.lastTickISO = nowISO();
  renderTimerFromSession(activeSession);
  startTicking();

  // start white noise immediately after user click
  const wType = els.whiteNoiseType?.value;
  const wVol = Number(els.whiteNoiseVolume?.value ?? 35);
  const bellType = els.bellType?.value;
  const bellVol = Number(els.bellVolume?.value ?? 60);
  const wantAnySound = (wType && wType !== "off" && wVol > 0) || (bellType && bellType !== "off" && bellVol > 0);
  if (wantAnySound) unlockAudio();
  if (wType && wType !== "off" && wVol > 0) startWhiteNoise(wType, wVol);
  else stopWhiteNoise();

  setSaveStatus("未保存…");
  scheduleAutosave();
}

function timerPause() {
  if (!activeSession) return;
  activeSession.timer.running = false;
  activeSession.timer.lastTickISO = nowISO();
  renderTimerFromSession(activeSession);
  stopTicking();

  // stop noise while paused
  stopWhiteNoise();

  setSaveStatus("未保存…");
  scheduleAutosave();
}

function timerReset() {
  if (!activeSession) return;
  activeSession.timer.running = false;
  activeSession.timer.remainingSeconds = getTimerMode(activeSession.timer.mode || "focus").seconds;
  activeSession.timer.totalSeconds = getTimerMode(activeSession.timer.mode || "focus").seconds;
  activeSession.timer.startedAtISO = null;
  activeSession.timer.lastTickISO = null;
  activeSession.timer.completedAtISO = null;
  if (isFocusMode(activeSession)) {
    activeSession.timer.segments = [];
    activeSession.timer.currentBlockStartHHMM = "";
  }

  // Reset UI "当前段"
  if (isFocusMode(activeSession)) {
    els.startTime.value = "";
    els.endTime.value = "";
    syncTimeUIFromSession(activeSession);
  }

  renderTimerFromSession(activeSession);
  stopTicking();

  // stop all sounds
  stopWhiteNoise();

  setSaveStatus("未保存…");
  scheduleAutosave();
}

function switchTimerMode(nextMode) {
  if (!activeSession) return;
  if (!TIMER_MODES[nextMode]) return;

  if (activeSession.timer?.running) {
    const ok = window.confirm("当前倒计时进行中，切换模式会重置当前计时。继续吗？");
    if (!ok) return;
  }

  stopTicking();
  stopWhiteNoise();

  activeSession.timer.mode = nextMode;
  activeSession.timer.totalSeconds = TIMER_MODES[nextMode].seconds;
  activeSession.timer.remainingSeconds = TIMER_MODES[nextMode].seconds;
  activeSession.timer.running = false;
  activeSession.timer.startedAtISO = null;
  activeSession.timer.lastTickISO = null;
  activeSession.timer.completedAtISO = null;

  if (nextMode === "focus") {
    activeSession.timer.currentBlockStartHHMM = "";
    if (!Array.isArray(activeSession.timer.segments)) activeSession.timer.segments = [];
    syncTimeUIFromSession(activeSession);
  }

  renderTimerFromSession(activeSession);
  setSaveStatus("未保存…");
  scheduleAutosave();
}

function bindTimer() {
  els.startTimerBtn.addEventListener("click", timerStart);
  els.pauseTimerBtn.addEventListener("click", timerPause);
  els.resetTimerBtn.addEventListener("click", timerReset);
  els.focusModeBtn?.addEventListener("click", () => switchTimerMode("focus"));
  els.shortBreakModeBtn?.addEventListener("click", () => switchTimerMode("short_break"));
  els.longBreakModeBtn?.addEventListener("click", () => switchTimerMode("long_break"));
}

// Export
function buildMarkdown(s) {
  const lines = [];
  const segs = Array.isArray(s?.timer?.segments) ? s.timer.segments : [];
  const firstSeg = segs[0];
  const lastSeg = segs[segs.length - 1];
  const startText = (firstSeg?.startTime || s.startTime || "").trim() || "（未填写）";
  const endText = (lastSeg?.endTime || s.endTime || "").trim() || "（未填写）";
  const totalSeconds = computeTotalDurationSecondsFromSegments(segs);
  const totalDuration = totalSeconds > 0 ? formatDurationFromSeconds(totalSeconds) : computeDuration(s.startTime, s.endTime) || "（未知）";

  lines.push("## 🔁 启动动作");
  lines.push("");
  lines.push("我的第一步是：");
  lines.push("");
  lines.push("> ");
  lines.push("> ");
  const first = (s.firstStep || "").trim() || "（未填写）";
  for (const l of first.split("\n")) lines.push(`> > ${l}`);
  lines.push("> ");
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## 📦 本轮产出定义（25分钟后，我要留下一个看得见的痕迹: ）");
  lines.push("");
  lines.push("> ");
  const out = (s.outputDefinition || "").trim() || "（未填写）";
  for (const l of out.split("\n")) lines.push(`> ${l}`);
  lines.push("> ");
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## 🧠 杂念停车场");
  lines.push("");
  const park = (s.parkingLot || "").trim();
  if (park) {
    for (const l of park.split("\n")) lines.push(l);
  } else {
    lines.push("- （空）");
  }
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## ⏳ 开始时间");
  lines.push("");
  lines.push(startText);
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## ⏰ 结束时间");
  lines.push("");
  lines.push(endText);
  lines.push("");
  lines.push("## 🕒 25分钟分段记录");
  lines.push("");
  if (segs.length > 0) {
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i] || {};
      const st = (seg.startTime || "").trim();
      const et = (seg.endTime || "").trim();
      if (!st || !et) continue;
      const d = computeDuration(st, et);
      lines.push(d ? `- ${st}-${et}（${d}）` : `- ${st}-${et}`);
    }
  } else {
    lines.push("- （无）");
  }
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## ✅ 本轮结果");
  lines.push("");
  lines.push("---");
  lines.push("");
  const res = (s.result || "").trim();
  if (res) {
    lines.push(res);
  } else {
    lines.push("（未填写）");
  }
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("- [x] 完成");
  lines.push("- [ ] 未完成");

  if (s.notDoneReasonEnabled && (s.notDoneReason || "").trim()) {
    lines.push("");
    lines.push("未完成原因/下一步：");
    lines.push("");
    lines.push((s.notDoneReason || "").trim());
  }

  lines.push("");
  lines.push(`元信息：日期 ${s.date || "（未填写）"}；主题 ${(s.theme || "").trim() || "（无）"}；用时 ${totalDuration}`);
  return lines.join("\n");
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // fallback
    try {
      const ta = els.exportText;
      ta.focus();
      ta.select();
      document.execCommand("copy");
      return true;
    } catch {
      return false;
    }
  }
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function bindExport() {
  els.exportBtn.addEventListener("click", () => {
    if (!activeSession) return;
    const merged = readSessionFromForm(activeSession);
    merged.timer = { ...activeSession.timer };
    activeSession = merged;
    upsertSession(activeSession);
    refreshHistorySelect(activeSession.id);

    const md = buildMarkdown(activeSession);
    els.exportText.value = md;
    els.exportDialog.showModal();
  });

  els.copyExportBtn.addEventListener("click", async () => {
    const ok = await copyToClipboard(els.exportText.value);
    els.copyExportBtn.textContent = ok ? "已复制" : "复制失败";
    window.setTimeout(() => (els.copyExportBtn.textContent = "复制到剪贴板"), 1200);
  });

  els.downloadExportBtn.addEventListener("click", () => {
    if (!activeSession) return;
    const safeDate = (activeSession.date || "session").replaceAll(":", "-");
    const theme = (activeSession.theme || "").trim().slice(0, 18);
    const slug = theme ? `_${theme.replaceAll(/[^\p{L}\p{N}_-]+/gu, "_")}` : "";
    downloadText(`${safeDate}${slug}_startup.md`, els.exportText.value);
  });
}

function bindHistory() {
  els.loadHistoryBtn.addEventListener("click", () => {
    const id = els.historySelect.value;
    const sessions = loadAllSessions();
    const s = sessions.find((x) => x.id === id);
    if (!s) return;
    activeSession = s;
    setActiveId(s.id);
    hydrateFormFromSession(activeSession);
    setSaveStatus("已加载");
  });

  els.deleteHistoryBtn.addEventListener("click", () => {
    const id = els.historySelect.value;
    if (!id) return;
    if (!window.confirm("确定删除这条记录吗？（仅本地删除）")) return;
    removeSession(id);
    const next = ensureActiveSession();
    activeSession = next;
    refreshHistorySelect(activeSession.id);
    hydrateFormFromSession(activeSession);
    setSaveStatus("已删除并切换到另一条");
  });
}

function bindSessionActions() {
  els.newSessionBtn.addEventListener("click", () => {
    const s = defaultSession();
    upsertSession(s);
    activeSession = s;
    setActiveId(s.id);
    refreshHistorySelect(s.id);
    hydrateFormFromSession(s);
    setSaveStatus("已新建");
  });
}

function bindCloudSync() {
  const cfgInputs = [els.cloudToken, els.cloudGistId, els.cloudEnabled, els.cloudAutoSync];
  for (const el of cfgInputs) {
    el?.addEventListener("input", saveCloudConfigFromUI);
    el?.addEventListener("change", saveCloudConfigFromUI);
  }

  els.cloudCreateBtn?.addEventListener("click", () => {
    createCloudGist().catch((err) => setCloudStatus(`创建失败：${err.message || "未知错误"}`));
  });
  els.cloudPushBtn?.addEventListener("click", () => {
    pushToCloud().catch((err) => setCloudStatus(`上传失败：${err.message || "未知错误"}`));
  });
  els.cloudPullBtn?.addEventListener("click", () => {
    pullFromCloud().catch((err) => setCloudStatus(`下载失败：${err.message || "未知错误"}`));
  });
}

function maybeStartWhiteNoiseAfterGesture() {
  if (!activeSession?.timer?.running) return;
  const type = els.whiteNoiseType?.value;
  const vol = Number(els.whiteNoiseVolume?.value ?? 35);
  if (!type || type === "off" || vol <= 0) return;

  // AudioContext requires a user gesture; resume tick may happen without it.
  document.addEventListener(
    "pointerdown",
    () => {
      startWhiteNoise(type, vol);
    },
    { once: true },
  );
}

function init() {
  hydrateCloudUI();
  activeSession = ensureActiveSession();
  refreshHistorySelect(activeSession.id);
  hydrateFormFromSession(activeSession);
  bindAutosave();
  bindTimer();
  bindExport();
  bindHistory();
  bindSessionActions();
  bindCloudSync();

  // resume ticking if running
  if (activeSession.timer?.running) startTicking();
  maybeStartWhiteNoiseAfterGesture();
  setSaveStatus("已就绪（自动保存开启）");
}

init();
