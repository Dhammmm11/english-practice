/* ═══════════════════════════════════════════════════════════════
   SpeakUp — app.js
   English Speaking Practice App
   All JavaScript logic + Android speech recognition fix
   ═══════════════════════════════════════════════════════════════ */

// ══════════════════════════════════════════════════════════════
// ── DARK MODE / THEME ────────────────────────────────────────
// ══════════════════════════════════════════════════════════════
const MOON_SVG = `<path d="M13 1.5a7 7 0 1 0 0 13A7.5 7.5 0 0 1 13 1.5z" stroke="currentColor" stroke-width="1.3" fill="none"/>`;
const SUN_SVG = `<circle cx="8" cy="8" r="3.5" stroke="currentColor" stroke-width="1.3"/><path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>`;

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const btn = document.getElementById('themeToggle');
  const icon = document.getElementById('themeIcon');
  if (theme === 'dark') {
    icon.innerHTML = MOON_SVG;
    btn.lastChild.textContent = ' Dark';
  } else {
    icon.innerHTML = SUN_SVG;
    btn.lastChild.textContent = ' Light';
  }
  localStorage.setItem('speakup-theme', theme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  applyTheme(current === 'dark' ? 'light' : 'dark');
  playSFX('click');
}

// Init theme immediately (before DOM loaded to prevent flash)
(function() {
  const saved = localStorage.getItem('speakup-theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
})();


// ══════════════════════════════════════════════════════════════
// ── SFX ENGINE (Web Audio API) ───────────────────────────────
// ══════════════════════════════════════════════════════════════
let sfxEnabled = localStorage.getItem('speakup-sfx') !== 'off';
let sfxCtx = null;

function getSFXCtx() {
  if (!sfxCtx) { try { sfxCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {} }
  return sfxCtx;
}

function playSFX(type) {
  if (!sfxEnabled) return;
  const ctx = getSFXCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  const gain = ctx.createGain();
  gain.connect(ctx.destination);

  if (type === 'correct') {
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    const o1 = ctx.createOscillator(); o1.type = 'sine'; o1.frequency.value = 880;
    o1.connect(gain); o1.start(now); o1.stop(now + 0.15);
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = 1174;
    const g2 = ctx.createGain(); g2.gain.setValueAtTime(0.1, now + 0.1); g2.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    o2.connect(g2); g2.connect(ctx.destination); o2.start(now + 0.1); o2.stop(now + 0.4);
  } else if (type === 'wrong') {
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 220;
    o.frequency.exponentialRampToValueAtTime(160, now + 0.25);
    o.connect(gain); o.start(now); o.stop(now + 0.3);
  } else if (type === 'complete') {
    [523, 659, 784, 1047].forEach((freq, i) => {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.1, now + i*0.15);
      g.gain.exponentialRampToValueAtTime(0.001, now + i*0.15 + 0.4);
      o.connect(g); g.connect(ctx.destination); o.start(now + i*0.15); o.stop(now + i*0.15 + 0.4);
    });
  } else if (type === 'click') {
    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 600;
    o.connect(gain); o.start(now); o.stop(now + 0.08);
  }
}

function toggleSFX() {
  sfxEnabled = !sfxEnabled;
  localStorage.setItem('speakup-sfx', sfxEnabled ? 'on' : 'off');
  const btn = document.getElementById('sfxToggle');
  btn.classList.toggle('muted', !sfxEnabled);
  if (sfxEnabled) playSFX('click');
}


// ══════════════════════════════════════════════════════════════
// ── CANVAS WAVEFORM ──────────────────────────────────────────
// ══════════════════════════════════════════════════════════════
let audioCtx = null, analyser = null, micStream = null, waveAnimId = null;
let waveCanvas, waveCtx2d;

function initWaveformCanvas() {
  waveCanvas = document.getElementById('waveformCanvas');
  waveCtx2d = waveCanvas ? waveCanvas.getContext('2d') : null;
}

async function startWaveform() {
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 64;
    const source = audioCtx.createMediaStreamSource(micStream);
    source.connect(analyser);
    drawWaveform();
  } catch(e) { /* mic denied or unavailable */ }
}

function drawWaveform() {
  if (!analyser || !waveCtx2d) return;
  const bufLen = analyser.frequencyBinCount;
  const data = new Uint8Array(bufLen);

  function draw() {
    waveAnimId = requestAnimationFrame(draw);
    analyser.getByteFrequencyData(data);
    const w = waveCanvas.width, h = waveCanvas.height;
    waveCtx2d.clearRect(0, 0, w, h);

    const barCount = 12;
    const barW = Math.floor(w / barCount) - 2;
    const step = Math.floor(bufLen / barCount);
    const style = getComputedStyle(document.documentElement);
    const color = style.getPropertyValue('--accent').trim() || '#c0392b';

    for (let i = 0; i < barCount; i++) {
      const val = data[i * step] / 255;
      const barH = Math.max(2, val * h * 0.9);
      const x = i * (barW + 2) + 1;
      const y = (h - barH) / 2;
      waveCtx2d.fillStyle = color;
      waveCtx2d.fillRect(x, y, barW, barH);
    }
  }
  draw();
}

function stopWaveform() {
  if (waveAnimId) { cancelAnimationFrame(waveAnimId); waveAnimId = null; }
  if (micStream) { micStream.getTracks().forEach(t => t.stop()); micStream = null; }
  if (audioCtx) { audioCtx.close().catch(()=>{}); audioCtx = null; analyser = null; }
  if (waveCtx2d && waveCanvas) { waveCtx2d.clearRect(0, 0, waveCanvas.width, waveCanvas.height); }
}


// ══════════════════════════════════════════════════════════════
// ── DICTIONARY POPUP ─────────────────────────────────────────
// ══════════════════════════════════════════════════════════════
const dictCache = {};

async function lookupWord(word) {
  const popup = document.getElementById('dictPopup');
  const content = document.getElementById('dictContent');
  const clean = word.replace(/[.,!?;:'"()\[\]{}\-–—]/g, '').toLowerCase();
  if (!clean) return;

  content.innerHTML = '<div class="dict-loading">Looking up...</div>';
  popup.classList.add('show');

  popup.style.left = Math.min(window.innerWidth - 380, Math.max(10, window._dictX || 100)) + 'px';
  popup.style.top = Math.min(window.innerHeight - 300, (window._dictY || 200) + 20) + 'px';

  if (dictCache[clean]) { renderDict(dictCache[clean], clean); return; }

  try {
    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${clean}`);
    if (!res.ok) throw new Error('Not found');
    const data = await res.json();
    dictCache[clean] = data;
    renderDict(data, clean);
  } catch(e) {
    content.innerHTML = `<div class="dict-error">No definition found for "${clean}".</div>`;
  }
}

function renderDict(data, word) {
  const content = document.getElementById('dictContent');
  const entry = data[0];
  let html = `<div class="dict-word">${entry.word || word}</div>`;
  if (entry.phonetic) html += `<div class="dict-phonetic">${entry.phonetic}</div>`;
  else if (entry.phonetics && entry.phonetics.length) {
    const ph = entry.phonetics.find(p => p.text) || {};
    if (ph.text) html += `<div class="dict-phonetic">${ph.text}</div>`;
  }

  const meanings = (entry.meanings || []).slice(0, 2);
  meanings.forEach(m => {
    html += `<div class="dict-pos">${m.partOfSpeech || ''}</div>`;
    const defs = (m.definitions || []).slice(0, 2);
    defs.forEach(d => {
      html += `<div class="dict-def">${d.definition}</div>`;
      if (d.example) html += `<div class="dict-example">"${d.example}"</div>`;
    });
  });
  content.innerHTML = html;
}


// ══════════════════════════════════════════════════════════════
// ── APP STATE ────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════
const PRESETS = [
  {
    title: "Daily Conversation",
    text: "Good morning! How are you doing today? I hope you had a great night's sleep. Would you like to have some coffee or tea before we get started? The weather looks beautiful outside, so maybe we could take a short walk later."
  },
  {
    title: "Business English",
    text: "Thank you for joining this meeting. I'd like to discuss our quarterly performance and outline the key priorities for the next three months. Our team has made significant progress, and I'm confident we will achieve our targets."
  },
  {
    title: "Travel Phrases",
    text: "Excuse me, could you tell me how to get to the nearest train station? I'm looking for a hotel that is close to the city center. Could you please recommend a good restaurant for dinner? I would prefer somewhere that serves local cuisine."
  },
  {
    title: "News Article",
    text: "Scientists have announced a major breakthrough in renewable energy technology. The new solar panels are twice as efficient as existing models and cost significantly less to produce. Experts believe this discovery could accelerate the transition to clean energy worldwide."
  },
  {
    title: "Tongue Twisters",
    text: "She sells seashells by the seashore. Peter Piper picked a peck of pickled peppers. How much wood would a woodchuck chuck if a woodchuck could chuck wood? Red lorry yellow lorry."
  }
];

let selectedPresetIdx = 0;
let currentText = '';
let words = [];
let currentWordIdx = 0;
let isRecording = false;
let recognition = null;
let correctCount = 0;
let retryCount = 0;
let totalAttempts = 0;
let currentWordAttempts = 0;
let isCustom = false;

// Pronunciation hints
const HINTS = {
  'the': { sym: '/ðə/', hint: 'Voiced "th" sound — place tongue between teeth.' },
  'a': { sym: '/eɪ/', hint: 'When used as the letter "a", say "ay".' },
  'their': { sym: '/ðɛr/', hint: 'Sounds like "there" — voiced "th".' },
  'through': { sym: '/θruː/', hint: 'Rhymes with "crew" — unvoiced "th".' },
  'thought': { sym: '/θɔːt/', hint: 'Unvoiced "th" + "awt" sound.' },
  'world': { sym: '/wɜːrld/', hint: 'Round your lips for the "w", curved "r".' },
  'three': { sym: '/θriː/', hint: 'Tongue between teeth for "th", then "ree".' },
  'this': { sym: '/ðɪs/', hint: 'Voiced "th" — like "the" + "is".' },
  'that': { sym: '/ðæt/', hint: 'Voiced "th" + short "a" sound.' },
  'which': { sym: '/wɪtʃ/', hint: '"W" sound + "itch" at the end.' },
  'quarterly': { sym: '/ˈkwɔːrtərli/', hint: 'Stress on first syllable: QUAR-ter-ly.' },
  'significant': { sym: '/sɪɡˈnɪfɪkənt/', hint: 'Stress on second syllable: sig-NIF-i-cant.' },
  'accelerate': { sym: '/əkˈsɛləreɪt/', hint: 'Stress on second syllable: ac-CEL-er-ate.' },
  'seashells': { sym: '/ˈsiːʃɛlz/', hint: 'Two words joined: "sea" + "shells".' },
  'woodchuck': { sym: '/ˈwʊdtʃʌk/', hint: 'Stress on first syllable: WOOD-chuck.' },
};


// ══════════════════════════════════════════════════════════════
// ── TEXT-TO-SPEECH ───────────────────────────────────────────
// ══════════════════════════════════════════════════════════════
let currentTTS = null;
const synth = window.speechSynthesis || null;

// Pre-load voices (Chrome lazy-loads them)
if (synth) {
  synth.getVoices();
  synth.onvoiceschanged = () => synth.getVoices();
}

const SPEAKER_SVG = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M1 4.5h2l3-3v9L3 7.5H1v-3z" fill="#f5f0e8"/>
  <path d="M8 3.5a3.5 3.5 0 0 1 0 5" stroke="#f5f0e8" stroke-width="1.2" stroke-linecap="round"/>
  <path d="M9.5 2a5.5 5.5 0 0 1 0 8" stroke="#f5f0e8" stroke-width="1.2" stroke-linecap="round" opacity="0.5"/>
</svg>`;

function speakWord(word, idx) {
  if (!synth) { showToast('Text-to-speech not supported in this browser.', 'warning'); return; }

  const btn = document.getElementById('tts-' + idx);
  if (!btn) return;

  synth.cancel();
  document.querySelectorAll('.tts-btn').forEach(b => b.classList.remove('speaking'));

  const utter = new SpeechSynthesisUtterance(word);
  utter.lang = 'en-US';
  utter.rate = 0.82;
  utter.pitch = 1;
  utter.volume = 1;

  const voices = synth.getVoices();
  const preferred = voices.find(v =>
    (v.lang === 'en-US' || v.lang === 'en-GB') &&
    (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Samantha') || v.name.includes('Daniel'))
  ) || voices.find(v => v.lang === 'en-US') || voices[0];
  if (preferred) utter.voice = preferred;

  utter.onstart = () => { btn.classList.add('speaking'); };
  utter.onend   = () => { btn.classList.remove('speaking'); };
  utter.onerror = () => { btn.classList.remove('speaking'); };

  synth.speak(utter);
}


// ══════════════════════════════════════════════════════════════
// ── WORD RENDERING ───────────────────────────────────────────
// ══════════════════════════════════════════════════════════════
function markWord(idx, status) {
  const el = document.getElementById('word-' + idx);
  if (!el) return;
  el.style.animation = 'none';
  void el.offsetWidth; // force reflow to restart animation
  el.style.animation = '';
  el.className = 'word ' + status;
}

function updateProgress() {
  const pct = words.length > 0 ? (currentWordIdx / words.length) * 100 : 0;
  document.getElementById('progressFill').style.width = pct + '%';
}

function renderWords() {
  const container = document.getElementById('wordsContainer');
  container.innerHTML = words.map((w, i) => {
    let cls = 'pending';
    if (i < currentWordIdx) cls = 'correct';
    else if (i === currentWordIdx) cls = 'current';
    return `<span class="word-wrap" id="wrap-${i}">` +
      `<button class="tts-btn" id="tts-${i}" onclick="speakWord('${w.replace(/'/g,"\\'")}', ${i})" title="Hear pronunciation" tabindex="-1">` +
      SPEAKER_SVG +
      `<span class="tts-label">Hear</span>` +
      `</button>` +
      `<span class="word ${cls}" id="word-${i}" data-dict="${w}" onclick="window._dictX=event.clientX; window._dictY=event.clientY; lookupWord(this.dataset.dict)">${w}</span>` +
      `</span>`;
  }).join('');
  updateProgress();
}


// ══════════════════════════════════════════════════════════════
// ── SPEECH RECOGNITION (with Android fix) ────────────────────
// ══════════════════════════════════════════════════════════════
let isRestarting = false;

// Android detection
const isAndroid = /Android/i.test(navigator.userAgent);
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

// ── INTERIM TIMEOUT SYSTEM (Android Fix) ─────────────────────
// Problem: Android Chrome often sends interimResults but isFinal
// never fires or fires very late. This causes words to not be
// detected even though the waveform is moving.
// Solution: If interim transcript stays stable for 1500ms, treat
// it as final and process it.
let interimTimeoutId = null;
let lastInterimTranscript = '';
let interimStableStartTime = 0;
const INTERIM_STABLE_MS = isAndroid ? 1200 : 2000; // Faster on Android
const FORCE_RESTART_MS = 25000; // Force restart recognition every 25s on Android
let forceRestartId = null;

function clearInterimTimeout() {
  if (interimTimeoutId) {
    clearTimeout(interimTimeoutId);
    interimTimeoutId = null;
  }
  lastInterimTranscript = '';
  interimStableStartTime = 0;
}

function scheduleInterimFallback(transcript) {
  const trimmed = transcript.trim();
  if (!trimmed) return;

  // If transcript changed, reset the timer
  if (trimmed !== lastInterimTranscript) {
    lastInterimTranscript = trimmed;
    interimStableStartTime = Date.now();
  }

  // Clear previous timeout
  if (interimTimeoutId) clearTimeout(interimTimeoutId);

  // Schedule fallback processing
  interimTimeoutId = setTimeout(() => {
    if (!isRecording || currentWordIdx >= words.length) return;
    if (lastInterimTranscript) {
      console.log('[Android Fix] Interim fallback triggered:', lastInterimTranscript);
      totalAttempts++;
      currentWordAttempts++;
      processSpokenText(lastInterimTranscript, []);
      lastInterimTranscript = '';
      interimStableStartTime = 0;
    }
  }, INTERIM_STABLE_MS);
}

function createRecognitionInstance() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const r = new SpeechRecognition();
  r.lang = 'en-US';
  r.continuous = true;
  r.interimResults = true;
  r.maxAlternatives = 5;

  r.onstart = () => {
    isRestarting = false;
    setStatus('active', 'Listening... Speak naturally!');
    document.getElementById('playBtn').classList.add('recording');
    startWaveform();

    // Android: Force restart every 25 seconds to prevent freezing
    if (isAndroid && !forceRestartId) {
      forceRestartId = setInterval(() => {
        if (!isRecording) return;
        console.log('[Android Fix] Force restarting recognition...');
        isRestarting = true;
        try { r.stop(); } catch(e) {}
      }, FORCE_RESTART_MS);
    }
  };

  r.onend = () => {
    if (isRecording && !isRestarting) {
      // Auto-restart for continuous listening
      try { r.start(); } catch(e) {
        // If start fails, create new instance
        console.log('[Android Fix] Recreating recognition instance on restart fail');
        setTimeout(() => {
          if (isRecording) {
            recognition = createRecognitionInstance();
            try { recognition.start(); } catch(e2) {}
          }
        }, 300);
      }
    } else if (isRecording && isRestarting) {
      // Force restart case (Android)
      isRestarting = false;
      setTimeout(() => {
        if (isRecording) {
          try { r.start(); } catch(e) {
            recognition = createRecognitionInstance();
            try { recognition.start(); } catch(e2) {}
          }
        }
      }, 200);
    } else if (!isRecording) {
      document.getElementById('playBtn').classList.remove('recording');
      stopWaveform();
      clearInterimTimeout();
      if (forceRestartId) {
        clearInterval(forceRestartId);
        forceRestartId = null;
      }
    }
  };

  r.onerror = (e) => {
    console.warn('[Speech Error]', e.error);
    if (e.error === 'no-speech') return;
    if (e.error === 'not-allowed') {
      setStatus('error', 'Microphone access denied. Please allow microphone access.');
      isRecording = false;
      return;
    }
    if (e.error === 'audio-capture' || e.error === 'aborted') {
      // On Android, these errors are common during device switch
      // Let onend handle the restart
      return;
    }
  };

  r.onresult = (e) => {
    if (!isRecording || currentWordIdx >= words.length) return;

    let finalTranscript = '';
    let interimTranscript = '';
    let allAlternatives = [];

    for (let i = e.resultIndex; i < e.results.length; i++) {
      const result = e.results[i];
      if (result.isFinal) {
        finalTranscript += result[0].transcript + ' ';
        // Collect all alternatives
        for (let j = 0; j < result.length; j++) {
          allAlternatives.push(result[j].transcript.trim());
        }
      } else {
        interimTranscript += result[0].transcript;
      }
    }

    // Show what user is saying
    const heard = (finalTranscript || interimTranscript).trim();
    if (heard) document.getElementById('heardText').textContent = '"' + heard + '"';

    if (finalTranscript.trim()) {
      // Got final result — clear interim fallback and process
      clearInterimTimeout();
      totalAttempts++;
      currentWordAttempts++;
      processSpokenText(finalTranscript.trim(), allAlternatives);
    } else if (interimTranscript.trim()) {
      // Only interim — schedule fallback (critical for Android)
      scheduleInterimFallback(interimTranscript);
    }
  };

  return r;
}

function setupSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    setStatus('error', 'Speech Recognition not supported. Use Chrome or Edge.');
    document.getElementById('playBtn').disabled = true;
    return;
  }

  recognition = createRecognitionInstance();

  // Device change: reinitialize when mic is swapped
  if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
    navigator.mediaDevices.addEventListener('devicechange', async () => {
      if (!isRecording) return;

      isRestarting = true;
      setStatus('active', 'Microphone changed — reconnecting...');

      try { recognition.abort(); } catch(e) {}

      await new Promise(res => setTimeout(res, 600));

      recognition = createRecognitionInstance();
      isRestarting = false;

      try {
        recognition.start();
      } catch(e) {
        setStatus('error', 'Failed to reconnect mic. Press Stop then Start again.');
        isRecording = false;
        document.getElementById('playBtn').disabled = false;
        document.getElementById('stopBtn').disabled = true;
        document.getElementById('waveform').classList.remove('active');
      }
    });
  }
}


// ══════════════════════════════════════════════════════════════
// ── WORD MATCHING ────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════
function normalizeWord(w) {
  return w.toLowerCase()
          .replace(/[.,!?;:'"()\[\]{}\-–—]/g, '')
          .replace(/'s$|'t$|'re$|'ve$|'ll$|'d$|n't$/i, '')
          .trim();
}

function wordMatch(spoken, target) {
  const s = normalizeWord(spoken);
  const t = normalizeWord(target);
  if (!s || !t) return false;

  // Exact match
  if (s === t) return true;

  // Levenshtein distance for fuzzy matching
  const maxLen = Math.max(s.length, t.length);
  if (maxLen === 0) return true;

  const matrix = [];
  for (let i = 0; i <= s.length; i++) {
    matrix[i] = [i];
    for (let j = 1; j <= t.length; j++) {
      if (i === 0) { matrix[i][j] = j; continue; }
      const cost = s[i-1] === t[j-1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i-1][j] + 1,
        matrix[i][j-1] + 1,
        matrix[i-1][j-1] + cost
      );
    }
  }
  const distance = matrix[s.length][t.length];
  const similarity = 1 - distance / maxLen;

  // Accept if 75%+ similar
  if (similarity >= 0.75) return true;

  // Phonetic fallback
  const phoneticMap = (str) => str.toLowerCase()
    .replace(/ph/g, 'f').replace(/tion/g, 'shun').replace(/sion/g, 'zhun')
    .replace(/ious/g, 'us').replace(/ough/g, 'o').replace(/gh/g, '')
    .replace(/kn/g, 'n').replace(/wr/g, 'r').replace(/mb$/g, 'm')
    .replace(/ee|ea|ie/g, 'i').replace(/oo/g, 'u').replace(/oa/g, 'o')
    .replace(/ai|ay/g, 'a').replace(/([aeiou])r/g, '$1').replace(/x/g, 'ks');

  if (phoneticMap(s) === phoneticMap(t)) return true;

  return false;
}

function processSpokenText(transcript, alternatives) {
  if (currentWordIdx >= words.length) return;

  alternatives = alternatives || [];

  // Collect all spoken phrases: transcript + alternatives
  const allPhrases = [transcript.trim()];
  for (const alt of alternatives) {
    const a = alt.trim();
    if (a && !allPhrases.includes(a)) allPhrases.push(a);
  }

  // Try to match multiple consecutive words from the spoken phrase
  let bestMatchCount = 0;

  for (const phrase of allPhrases) {
    const spokenWords = phrase.split(/\s+/);
    let matchCount = 0;
    let wordPtr = currentWordIdx;

    for (let si = 0; si < spokenWords.length && wordPtr < words.length; si++) {
      if (wordMatch(spokenWords[si], words[wordPtr])) {
        matchCount++;
        wordPtr++;
      }
    }

    if (matchCount > bestMatchCount) {
      bestMatchCount = matchCount;
    }
  }

  if (bestMatchCount > 0) {
    // Mark all matched words as correct
    for (let m = 0; m < bestMatchCount; m++) {
      markWord(currentWordIdx, 'correct');
      correctCount++;
      currentWordIdx++;
    }
    currentWordAttempts = 0;
    document.getElementById('heardText').textContent = '';
    updateStats();
    updatePhonetic();
    playSFX('correct');

    if (bestMatchCount > 1) {
      showToast(`${bestMatchCount} words matched!`, 'success');
    }

    if (currentWordIdx >= words.length) {
      playSFX('complete');
      setTimeout(showComplete, 400);
      stopPractice();
    } else {
      markWord(currentWordIdx, 'current');
      updateProgress();
      setStatus('active', `Correct! Now say: "${words[currentWordIdx]}"`);
      if (bestMatchCount <= 1) {
        showToast(`"${words[currentWordIdx - 1]}" -- Correct!`, 'success');
      }
    }
  } else {
    // WRONG
    const target = words[currentWordIdx];
    retryCount++;
    if (window.wordStats && window.wordStats[currentWordIdx]) {
      window.wordStats[currentWordIdx].errors++;
    }
    updateStats();
    markWord(currentWordIdx, 'wrong');
    playSFX('wrong');

    const hint = currentWordAttempts >= 2
      ? ` (Tip: try saying "${target}" more slowly)`
      : '';
    setStatus('error', `Not quite. Please say: "${target}"${hint}`);
    showToast(`Say "${target}" again`, 'error');

    setTimeout(() => {
      if (currentWordIdx < words.length) markWord(currentWordIdx, 'current');
    }, 400);
  }
}


// ══════════════════════════════════════════════════════════════
// ── MIC PERMISSION (critical for Android) ────────────────────
// ══════════════════════════════════════════════════════════════
let micPermissionGranted = false;

function isSecureContext() {
  if (window.isSecureContext) return true;
  const h = location.hostname;
  return h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || location.protocol === 'https:';
}

async function requestMicPermission() {
  if (micPermissionGranted) return true;

  if (!isSecureContext()) {
    setStatus('error', 'Microphone requires HTTPS. Deploy via GitHub Pages or Vercel for mobile mic access.');
    showToast('HTTPS required for microphone!', 'error');
    return false;
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    micPermissionGranted = true;
    return true;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(track => track.stop());
    micPermissionGranted = true;
    return true;
  } catch (err) {
    console.error('Mic permission error:', err.name, err.message);
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      setStatus('error', 'Microphone blocked. Tap the lock icon in address bar and allow microphone.');
      showToast('Mic blocked! Allow in address bar.', 'error');
    } else if (err.name === 'NotFoundError') {
      setStatus('error', 'No microphone detected.');
      showToast('No microphone found!', 'error');
    } else {
      micPermissionGranted = true;
      return true;
    }
    return false;
  }
}


// ══════════════════════════════════════════════════════════════
// ── CONTROLS ─────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════
async function startPractice() {
  if (!currentText) { showToast('Please load a text first!', 'warning'); return; }
  if (currentWordIdx >= words.length) { showToast('Text complete! Reset to practice again.', 'warning'); return; }
  if (!recognition) { showToast('Speech Recognition not available.', 'error'); return; }

  setStatus('active', 'Requesting microphone access...');
  const hasPermission = await requestMicPermission();
  if (!hasPermission) return;

  isRecording = true;
  document.getElementById('playBtn').disabled = true;
  document.getElementById('stopBtn').disabled = false;
  markWord(currentWordIdx, 'current');
  updatePhonetic();
  setStatus('active', 'Listening... Speak naturally, you can say full phrases!');
  playSFX('click');

  try { recognition.start(); } catch(e) {
    console.error('Recognition start error:', e);
    isRecording = false;
    document.getElementById('playBtn').disabled = false;
    document.getElementById('stopBtn').disabled = true;
  }
}

function stopPractice() {
  isRecording = false;
  isRestarting = false;
  clearInterimTimeout();
  if (forceRestartId) {
    clearInterval(forceRestartId);
    forceRestartId = null;
  }
  if (recognition) { try { recognition.abort(); } catch(e) {} }
  document.getElementById('playBtn').disabled = false;
  document.getElementById('playBtn').classList.remove('recording');
  document.getElementById('stopBtn').disabled = true;
  stopWaveform();
  document.getElementById('heardText').textContent = '';
  if (words.length > 0 && currentWordIdx < words.length) {
    setStatus('idle', `Paused. Say "${words[currentWordIdx]}" when ready.`);
  }
}

function resetAll() {
  stopPractice();
  document.getElementById('completeOverlay').classList.remove('show');
  if (currentText) {
    loadText(currentText);
  } else {
    currentWordIdx = 0;
    correctCount = 0;
    retryCount = 0;
    totalAttempts = 0;
    if (window.wordStats) {
      window.wordStats.forEach(ws => ws.errors = 0);
    }
    updateStats();
  }
  setStatus('idle', 'Reset complete. Press Start Practice when ready.');
  document.getElementById('phoneticWord').textContent = '\u2014';
  document.getElementById('phoneticSymbol').textContent = '';
  document.getElementById('phoneticHint').textContent = 'Start speaking to see pronunciation tips here.';
}


// ══════════════════════════════════════════════════════════════
// ── UI HELPERS ───────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════
function setStatus(type, msg) {
  const dot = document.getElementById('statusDot');
  const text = document.getElementById('statusText');
  dot.className = 'status-dot';
  if (type === 'active') dot.classList.add('active');
  else if (type === 'success') dot.classList.add('success');
  else if (type === 'error') dot.classList.add('error');
  text.textContent = msg;
}

let toastTimer = null;
function showToast(msg, type) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'feedback-toast show ' + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.classList.remove('show'); }, 2200);
}

function updateStats() {
  document.getElementById('statCorrect').textContent = correctCount;
  document.getElementById('statWrong').textContent = retryCount;
  document.getElementById('statProgress').textContent = currentWordIdx + '/' + (words.length || 0);
  const acc = totalAttempts > 0
    ? Math.round((correctCount / totalAttempts) * 100) + '%'
    : '\u2014';
  document.getElementById('statAccuracy').textContent = acc;
}

function updatePhonetic() {
  if (currentWordIdx >= words.length) return;
  const w = words[currentWordIdx];
  const wLower = normalizeWord(w);
  const hint = HINTS[wLower];

  document.getElementById('phoneticWord').textContent = w;
  document.getElementById('phoneticSymbol').textContent = hint ? hint.sym : '';
  document.getElementById('phoneticHint').textContent = hint
    ? hint.hint
    : 'Say this word clearly and naturally.';
}

function showComplete() {
  const acc = totalAttempts > 0
    ? Math.round((correctCount / totalAttempts) * 100) + '%'
    : '100%';
  document.getElementById('finalWords').textContent = correctCount;
  document.getElementById('finalAttempts').textContent = totalAttempts;
  document.getElementById('finalAccuracy').textContent = acc;

  const reviewContainer = document.getElementById('reviewWordsContainer');
  if (reviewContainer && window.wordStats) {
      const hardest = [...window.wordStats]
          .filter(ws => ws.errors > 0)
          .sort((a, b) => b.errors - a.errors)
          .slice(0, 3);
          
      if (hardest.length > 0) {
          reviewContainer.innerHTML = hardest.map(hw => {
             const cleanId = hw.word.replace(/[^a-zA-Z0-9]/g, '');
             return `<div class="review-word-item">
                <span class="rw-text">${hw.word}</span>
                <span class="rw-err">${hw.errors} retries</span>
                <button class="rw-hear" id="tts-rw-${cleanId}" onclick="speakWord('${hw.word.replace(/'/g,"\\'").replace(/"/g,"&quot;")}', 'rw-${cleanId}')" title="Hear pronunciation" tabindex="-1">
                  ${SPEAKER_SVG}
                </button>
              </div>`;
          }).join('');
          document.getElementById('reviewSection').style.display = 'block';
      } else {
          document.getElementById('reviewSection').style.display = 'none';
      }
  }

  document.getElementById('completeOverlay').classList.add('show');
}

function shareResult() {
  const accuracy = document.getElementById('finalAccuracy').textContent;
  const wordsText = document.getElementById('finalWords').textContent;
  const attempts = document.getElementById('finalAttempts').textContent;
  
  const textToShare = `SpeakUp Practice Complete! \nWords: ${wordsText}\nAttempts: ${attempts}\nAccuracy: ${accuracy}\n\nPractice makes fluent!`;
  
  if (navigator.share) {
    navigator.share({
      title: 'My SpeakUp Score',
      text: textToShare,
    }).catch(err => {
      console.log('Error sharing', err);
    });
  } else {
    navigator.clipboard.writeText(textToShare).then(() => {
      showToast('Result copied to clipboard!', 'success');
    }).catch(err => {
      showToast('Failed to copy result.', 'error');
    });
  }
}

// ══════════════════════════════════════════════════════════════
// ── TEXT LOADING ─────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════
function updatePresetPreview(idx) {
  const el = document.getElementById('presetPreview');
  if (idx === 5) {
    el.textContent = '';
    document.getElementById('customTextArea').style.display = 'block';
  } else {
    document.getElementById('customTextArea').style.display = 'none';
    el.textContent = '"' + PRESETS[idx].text.substring(0, 100) + '..."';
  }
}

function selectPreset(idx, btn) {
  selectedPresetIdx = idx;
  isCustom = idx === 5;
  document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  updatePresetPreview(idx);
}

function loadSelectedText() {
  let text = '';
  if (isCustom) {
    text = document.getElementById('customTextArea').value.trim();
    if (!text) { showToast('Please enter some text first.', 'warning'); return; }
  } else {
    text = PRESETS[selectedPresetIdx].text;
  }
  currentText = text;
  loadText(text);
  showToast('Text loaded. Press Start Practice!', 'success');
}

function loadText(text) {
  stopPractice();
  words = text.split(/\s+/).filter(w => w.length > 0);
  window.wordStats = words.map((w, i) => ({ word: w, errors: 0, idx: i }));
  currentWordIdx = 0;
  correctCount = 0;
  retryCount = 0;
  totalAttempts = 0;
  currentWordAttempts = 0;
  renderWords();
  updateStats();
  setStatus('idle', 'Text loaded. Press Start Practice when ready.');
}


// ══════════════════════════════════════════════════════════════
// ── INIT ─────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════
window.onload = () => {
  initWaveformCanvas();
  updatePresetPreview(0);
  setupSpeechRecognition();

  // Apply saved theme
  const savedTheme = localStorage.getItem('speakup-theme') || 'light';
  applyTheme(savedTheme);

  // Apply saved SFX state
  const sfxBtn = document.getElementById('sfxToggle');
  if (sfxBtn) sfxBtn.classList.toggle('muted', !sfxEnabled);

  document.getElementById('dictClose').addEventListener('click', () => {
    document.getElementById('dictPopup').classList.remove('show');
  });
  document.addEventListener('click', (e) => {
    const popup = document.getElementById('dictPopup');
    if (popup.classList.contains('show') && !popup.contains(e.target) && !e.target.closest('.word')) {
      popup.classList.remove('show');
    }
  })
  document.addEventListener('keydown', (e) => {
    if (e.key === ' ' && e.target.tagName !== 'TEXTAREA') {
      e.preventDefault();
      if (!isRecording && currentText) startPractice();
      else if (isRecording) stopPractice();
    }
    if (e.key === 'Escape') stopPractice();
  });
  if (isAndroid) {
    console.log('[SpeakUp] Android detected — interim fallback enabled');
  }
  
};
