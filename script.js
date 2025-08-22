const state = {
  countries: [],
  pool: [],
  index: 0,
  total: 20,
  streak: 0,
  score: 0,
  best: Number(localStorage.getItem('flagmatch.best') || 0),
  allowClick: true,
  current: null,
  answers: [],
  choices: 4
};

const els = {
  flag: document.getElementById('flag'),
  loader: document.getElementById('loader'),
  answers: document.getElementById('answers'),
  qnum: document.getElementById('qnum'),
  progress: document.getElementById('progress'),
  score: document.getElementById('score'),
  streak: document.getElementById('streak'),
  best: document.getElementById('best'),
  region: document.getElementById('region'),
  mode: document.getElementById('mode'),
  restart: document.getElementById('restart'),
  skip: document.getElementById('skip'),
};

els.best.textContent = state.best;

// Fetch countries (no API key)
// We filter to UN members or independent states to keep the set to ~195 countries.
async function loadCountries() {
  const url = 'https://restcountries.com/v3.1/all?fields=name,flags,cca2,region,independent,unMember';
  const res = await fetch(url, {
    cache: 'force-cache'
  });
  if (!res.ok) throw new Error('Failed to fetch countries');
  const raw = await res.json();

  // Normalize and filter
  const list = raw.map(c => ({
      name: c?.name?.common,
      official: c?.name?.official,
      flagSvg: c?.flags?.svg || c?.flags?.png,
      region: c?.region || 'Other',
      code: c?.cca2
    }))
    .filter(c => c.name && c.flagSvg)
    .filter((c, idx, arr) => {
      // Keep UN members or independent states. We only have fields above, so re-check from raw.
      const r = raw.find(x => x.cca2 === c.code);
      return (r?.unMember === true) || (r?.independent === true);
    })
    // Some duplicates exist in rare cases; ensure uniqueness by cca2
    .filter((c, i, arr) => arr.findIndex(x => x.code === c.code) === i)
    .sort((a, b) => a.name.localeCompare(b.name));

  state.countries = list;
}

function filteredPool() {
  const region = els.region.value;
  if (region === 'All') return [...state.countries];
  return state.countries.filter(c => c.region === region);
}

function sample(arr, n, excludeCode) {
  const out = [];
  const used = new Set(excludeCode ? [excludeCode] : []);
  // Try to keep distractors within same region for better challenge
  while (out.length < n && used.size < arr.length) {
    const item = arr[Math.floor(Math.random() * arr.length)];
    if (!used.has(item.code)) {
      used.add(item.code);
      out.push(item);
    }
  }
  return out;
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function setChoicesCount() {
  state.choices = (els.mode.value === 'mc6') ? 6 : 4;
}

function setProgress() {
  els.qnum.textContent = String(state.index + 1);
  const pct = Math.round(((state.index) / state.total) * 100);
  els.progress.style.width = pct + '%';
  els.score.textContent = state.score;
  els.streak.textContent = state.streak;
  els.best.textContent = state.best;
}

function loadFlag(src) {
  els.loader.style.display = 'grid';
  els.flag.classList.remove('loaded');
  els.flag.src = src;
  els.flag.onload = () => {
    els.loader.style.display = 'none';
    requestAnimationFrame(() => els.flag.classList.add('loaded'));
  };
  els.flag.onerror = () => {
    els.loader.textContent = 'Failed to load flag, skipping…';
    setTimeout(() => nextQuestion(true), 800);
  };
}

function makeAnswersUI(options, correctCode) {
  els.answers.innerHTML = '';
  options.forEach((c, idx) => {
    const btn = document.createElement('button');
    btn.className = 'answer';
    btn.textContent = c.name;
    btn.dataset.code = c.code;
    btn.addEventListener('click', () => pickAnswer(c.code, correctCode, btn));
    // Keyboard hints: 1-6
    btn.accessKey = String((idx + 1));
    els.answers.appendChild(btn);
  });
}

function pickAnswer(picked, correct, btnEl) {
  if (!state.allowClick) return;
  state.allowClick = false;

  const buttons = [...document.querySelectorAll('.answer')];
  buttons.forEach(b => b.disabled = true);

  if (picked === correct) {
    btnEl.classList.add('correct');
    const gain = 100 + Math.min(state.streak, 5) * 20; // light streak bonus
    state.streak += 1;
    state.score += gain;
  } else {
    btnEl.classList.add('wrong');
    const correctBtn = buttons.find(b => b.dataset.code === correct);
    if (correctBtn) correctBtn.classList.add('correct');
    state.streak = 0;
  }

  setTimeout(() => {
    nextQuestion();
  }, 700);
}

function nextQuestion(forceSkip = false) {
  // End of round
  if (state.index >= state.total - 1 && !forceSkip) {
    finishRound();
    return;
  }
  if (!forceSkip) state.index += 1;
  setProgress();

  const pool = filteredPool();
  if (pool.length < state.choices) {
    // fallback to all
    state.pool = [...state.countries];
  } else {
    state.pool = pool;
  }

  // Pick a correct answer
  const correct = state.pool[Math.floor(Math.random() * state.pool.length)];

  // Prefer distractors from same region as correct
  const sameRegion = state.pool.filter(c => c.region === correct.region && c.code !== correct.code);
  const fallback = state.pool.filter(c => c.code !== correct.code);

  let distractors = sample(sameRegion.length >= (state.choices - 1) ? sameRegion : fallback, state.choices - 1, correct.code);
  // Ensure enough unique options
  if (distractors.length < state.choices - 1) {
    const fill = sample(state.countries, (state.choices - 1) - distractors.length, correct.code);
    distractors = distractors.concat(fill);
  }

  const options = shuffle([correct, ...distractors]);
  state.current = correct;
  state.answers = options.map(o => o.code);

  loadFlag(correct.flagSvg);
  makeAnswersUI(options, correct.code);
  state.allowClick = true;
}

function finishRound() {
  // Update high score
  if (state.score > state.best) {
    state.best = state.score;
    localStorage.setItem('flagmatch.best', String(state.best));
  }
  els.best.textContent = state.best;

  // Show simple summary as an overlay using the answers container
  els.answers.innerHTML = '';
  const summary = document.createElement('div');
  summary.className = 'hint';
  summary.innerHTML = `
        <div style="font-size:18px; font-weight:800; margin-bottom:8px">Round complete!</div>
        <div style="margin-bottom:10px">Score: <strong>${state.score}</strong> · Best: <strong>${state.best}</strong></div>
        <button class="primary" style="padding:12px 16px; border-radius:14px; border:none" id="again">Play again</button>
      `;
  els.answers.appendChild(summary);
  document.getElementById('again').addEventListener('click', resetGame);
}

function resetGame() {
  state.index = 0;
  state.score = 0;
  state.streak = 0;
  setChoicesCount();
  setProgress();
  nextQuestion(true); // jumps to first question cleanly
}

// Keyboard shortcuts
window.addEventListener('keydown', (e) => {
  if (['1', '2', '3', '4', '5', '6'].includes(e.key)) {
    const idx = Number(e.key) - 1;
    const btn = document.querySelectorAll('.answer')[idx];
    if (btn) btn.click();
  } else if (e.key.toLowerCase() === 'n' || e.key === 'Enter') {
    // Skip / next
    els.skip.click();
  }
});

// UI events
els.restart.addEventListener('click', resetGame);
els.skip.addEventListener('click', () => nextQuestion());
els.region.addEventListener('change', () => resetGame());
els.mode.addEventListener('change', () => resetGame());

// Boot
(async function init() {
  try {
    await loadCountries();
    resetGame();
  } catch (err) {
    console.error(err);
    els.loader.textContent = 'Could not load country data. Check your network and try again.';
  }
})();