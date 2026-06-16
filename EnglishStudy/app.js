/**
 * English Study App — app.js
 * ─────────────────────────────────────────────────────────────────
 * Responsibilities:
 *  1. OpenRouter API: fetch free models, send analysis request
 *  2. System prompt engineering (level-adaptive, strict JSON output)
 *  3. Token rendering (no split(' '), punctuation-aware)
 *  4. Multi-instance word selection (.is-active)
 *  5. Category filter toggles (legend bar)
 *  6. Word modal (detail view)
 *  7. Persistent dictionary (localStorage)
 *  8. Dictionary modal
 *  9. Dark mode persistence (localStorage)
 * 10. Error handling for API failures and invalid JSON
 */

'use strict';

/* ═══════════════════════════════════════════════════════════
   CONSTANTS & STATE
═══════════════════════════════════════════════════════════ */

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
const DICT_STORAGE_KEY = 'eng_study_dictionary';
const THEME_STORAGE_KEY = 'eng_study_theme';

/**
 * App state — single source of truth.
 * Never mutate directly from event handlers; use setState().
 */
const state = {
  tokens: [],           // Parsed token array from last API response
  activeWord: null,     // Currently selected word text (for multi-instance highlight)
  activeFilters: new Set(), // Category names currently toggled ON by legend filters
  dictionary: [],       // Array of saved token objects
};

/* ═══════════════════════════════════════════════════════════
   DOM REFERENCES
═══════════════════════════════════════════════════════════ */

const $ = (id) => document.getElementById(id);

const dom = {
  themeToggle:    $('themeToggle'),
  apiKey:         $('apiKey'),
  levelSelect:    $('levelSelect'),
  modelSelect:    $('modelSelect'),
  btnFetchModels: $('btnFetchModels'),
  modelStatus:    $('modelStatus'),
  textInput:      $('textInput'),
  btnAnalyze:     $('btnAnalyze'),
  errorBanner:    $('errorBanner'),
  errorMsg:       $('errorMsg'),
  legendBar:      $('legendBar'),
  legendBtns:     $('legendBtns'),
  textDisplay:    $('textDisplay'),
  // Word modal
  wordModal:      $('wordModal'),
  wordModalClose: $('wordModalClose'),
  mWord:          $('mWord'),
  mIPA:           $('mIPA'),
  mCatBadge:      $('mCatBadge'),
  mTranslation:   $('mTranslation'),
  mDefinition:    $('mDefinition'),
  mSynonyms:      $('mSynonyms'),
  mExamples:      $('mExamples'),
  btnDictToggle:  $('btnDictToggle'),
  // Dict modal
  dictModal:      $('dictModal'),
  dictModalClose: $('dictModalClose'),
  btnOpenDict:    $('btnOpenDict'),
  dictCount:      $('dictCount'),
  dictGrid:       $('dictGrid'),
};

/* ═══════════════════════════════════════════════════════════
   CATEGORY DEFINITIONS
   Canonical names must match what the AI returns and CSS selectors.
═══════════════════════════════════════════════════════════ */

const CATEGORIES = [
  { name: 'Verb',        emoji: '⚡' },
  { name: 'Noun',        emoji: '🏷️' },
  { name: 'Adjective',   emoji: '🎨' },
  { name: 'Adverb',      emoji: '🚀' },
  { name: 'Preposition', emoji: '🔗' },
  { name: 'Conjunction', emoji: '🔀' },
  { name: 'Pronoun',     emoji: '👤' },
  { name: 'Determiner',  emoji: '📌' },
  { name: 'Other',       emoji: '•' },
];

/* ═══════════════════════════════════════════════════════════
   SYSTEM PROMPT FACTORY
   Injects CEFR level and enforces strict JSON-only output.
   Defensive design: instructs the model to handle punctuation
   as separate tokens so reconstruction is unambiguous.
═══════════════════════════════════════════════════════════ */

function buildSystemPrompt(level) {
  const isBasic = ['A1', 'A2'].includes(level);
  const isAdvanced = ['B2', 'C1', 'C2'].includes(level);

  const complexityInstruction = isBasic
    ? `Use ONLY basic, high-frequency vocabulary (CEFR ${level}). 
       Definitions must be very simple, 1-2 short sentences max. 
       Examples must be very short (5-8 words), concrete, and literal. 
       Avoid idioms, metaphors, or complex grammar in your explanations.`
    : isAdvanced
    ? `Use sophisticated vocabulary appropriate for CEFR ${level} learners. 
       Definitions may include nuanced usage notes and register distinctions. 
       Examples should demonstrate complex grammatical structures, idiomatic use, 
       and abstract or professional contexts.`
    : `Calibrate vocabulary and explanation depth to CEFR ${level}. 
       Use moderately complex sentences and common idioms in examples.`;

  return `You are a professional English linguistics API for CEFR level ${level} learners.

TASK: Analyze the English text provided and return a linguistic tokenization as a JSON array.

COMPLEXITY LEVEL: ${level}
${complexityInstruction}

OUTPUT FORMAT: You MUST return ONLY a raw JSON object. No markdown, no code fences, no explanations.
The JSON object must have exactly one key: "tokens", whose value is an array.

TOKEN STRUCTURE — each element must have ALL of these keys:
{
  "texto_original": "the exact word or compound phrase as written",
  "tipo": "single" | "compound",
  "categoria": "Verb" | "Noun" | "Adjective" | "Adverb" | "Preposition" | "Conjunction" | "Pronoun" | "Determiner" | "Other",
  "traduccion": "Spanish translation (1-3 words)",
  "definicion_en": "English definition calibrated to level ${level}",
  "sinonimos": ["word1", "word2", "word3"],
  "ejemplos": ["Example sentence 1.", "Example sentence 2."],
  "pronunciacion_ipa": "/IPA transcription/"
}

TOKENIZATION RULES:
1. Treat punctuation marks (. , ; : ! ? ' " - ( ) [ ]) as SEPARATE tokens with categoria "Other".
2. Compound phrases (phrasal verbs, idioms, collocations) that function as a single unit (e.g. "get up", "in spite of") must be ONE token with tipo "compound".
3. Contractions ("don't", "I'm") are single tokens.
4. For "Other" category tokens (punctuation etc.), set sinonimos=[] and ejemplos=[].
5. Never merge two distinct words unless they form a true compound or phrasal unit.
6. Preserve original capitalisation in texto_original.

CRITICAL: Return ONLY the JSON object. Any text outside the JSON will break the application.`;
}

/* ═══════════════════════════════════════════════════════════
   OPENROUTER API CALLS
═══════════════════════════════════════════════════════════ */

/**
 * Fetch free models from OpenRouter and populate the select.
 * Error: non-200 responses or network failures are caught and shown.
 */
async function fetchFreeModels() {
  const apiKey = dom.apiKey.value.trim();
  if (!apiKey) { showError('Enter your API key first.'); return; }

  dom.btnFetchModels.textContent = '⏳';
  dom.btnFetchModels.disabled = true;
  dom.modelStatus.textContent = 'Loading…';

  try {
    const res = await fetch(`${OPENROUTER_BASE}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error?.message || `HTTP ${res.status}`);
    }

    const data = await res.json();

    // Filter to free models (pricing.prompt === "0")
    const freeModels = (data.data || []).filter(
      (m) => m?.pricing?.prompt === '0' || m?.pricing?.prompt === 0
    );

    if (!freeModels.length) {
      dom.modelStatus.textContent = 'No free models found.';
      return;
    }

    // Repopulate select
    dom.modelSelect.innerHTML = '';
    freeModels.forEach((m) => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.name || m.id;
      dom.modelSelect.appendChild(opt);
    });

    dom.modelStatus.textContent = `${freeModels.length} free models loaded.`;
    hideError();

  } catch (err) {
    showError(`Could not fetch models: ${err.message}`);
    dom.modelStatus.textContent = '';
  } finally {
    dom.btnFetchModels.textContent = '⟳';
    dom.btnFetchModels.disabled = false;
  }
}

/**
 * Send the text to the selected model and return the parsed token array.
 * @returns {Promise<Array>} Array of token objects.
 * Throws on API error or invalid JSON.
 */
async function analyzeText(text, model, level) {
  const apiKey = dom.apiKey.value.trim();

  const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': window.location.origin,
      'X-Title': 'English Study App',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: buildSystemPrompt(level) },
        { role: 'user', content: text },
      ],
      temperature: 0.2,  // Low temperature for consistent JSON
      max_tokens: 4096,
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message || `API error ${res.status}`);
  }

  const data = await res.json();
  const raw = data?.choices?.[0]?.message?.content?.trim();

  if (!raw) throw new Error('The model returned an empty response.');

  // Strip markdown code fences if the model disobeyed the prompt
  const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(clean);
  } catch {
    // Attempt to extract first JSON object from response (last-resort recovery)
    const match = clean.match(/\{[\s\S]*\}/);
    if (match) {
      try { parsed = JSON.parse(match[0]); } catch { /* fall through */ }
    }
    if (!parsed) {
      throw new Error('The model did not return valid JSON. Try a different model or retry.');
    }
  }

  if (!Array.isArray(parsed?.tokens)) {
    throw new Error('Unexpected JSON structure: "tokens" array not found.');
  }

  return parsed.tokens;
}

/* ═══════════════════════════════════════════════════════════
   RENDERING — TOKEN → DOM
   Punctuation reconstruction rule:
   - Tokens with categoria "Other" and a single non-alphanumeric
     character are treated as punctuation — no space before . , ; : ! ?
   - All other tokens get a space prefix EXCEPT the first token
     and tokens immediately after an opening bracket/quote.
═══════════════════════════════════════════════════════════ */

const PUNCT_NO_SPACE_BEFORE = new Set(['.', ',', ';', ':', '!', '?', ')', ']', '»', '"']);
const PUNCT_NO_SPACE_AFTER  = new Set(['(', '[', '«', '"']);

function renderTokens(tokens) {
  const container = dom.textDisplay;
  container.innerHTML = '';

  // Track "no space before next token"
  let suppressNextSpace = true; // first token never gets leading space

  tokens.forEach((token, idx) => {
    const text = token.texto_original;
    const isPunct = (token.categoria === 'Other' || token.categoria === 'Punctuation')
                    && text.length <= 2 && !/\w/.test(text);

    // Decide spacing
    let needSpace = !suppressNextSpace;
    if (isPunct && PUNCT_NO_SPACE_BEFORE.has(text)) needSpace = false;

    if (needSpace) {
      const space = document.createElement('span');
      space.className = 'token-space';
      space.textContent = ' ';
      container.appendChild(space);
    }

    // Build token span
    const span = document.createElement('span');
    span.className = isPunct ? 'token token--punct' : 'token';
    span.dataset.idx = idx;
    span.dataset.word = text.toLowerCase();
    span.dataset.cat = token.categoria || 'Other';
    span.textContent = text;

    if (!isPunct) {
      span.addEventListener('click', (e) => {
        e.stopPropagation();
        handleTokenClick(token, text.toLowerCase());
      });
    }

    container.appendChild(span);

    // Update space-suppression for next iteration
    suppressNextSpace = isPunct && PUNCT_NO_SPACE_AFTER.has(text);
  });
}

/* ═══════════════════════════════════════════════════════════
   LEGEND BAR — CATEGORY FILTERS
═══════════════════════════════════════════════════════════ */

/**
 * Build legend buttons for the categories actually present in current tokens.
 */
function buildLegend(tokens) {
  const presentCats = new Set(tokens.map((t) => t.categoria || 'Other'));

  dom.legendBtns.innerHTML = '';
  state.activeFilters.clear();

  CATEGORIES.filter((c) => presentCats.has(c.name)).forEach((cat) => {
    const btn = document.createElement('button');
    btn.className = `legend-btn cat-color--${cat.name}`;
    btn.dataset.cat = cat.name;
    btn.setAttribute('aria-pressed', 'false');
    btn.innerHTML = `<span class="dot"></span>${cat.emoji} ${cat.name}`;
    btn.addEventListener('click', () => toggleCategoryFilter(cat.name, btn));
    dom.legendBtns.appendChild(btn);
  });

  dom.legendBar.hidden = false;
}

/**
 * Toggle a category filter on/off.
 * When a filter is active, ALL tokens of that category get .is-active.
 * Individual selection (.activeWord) is cleared when a filter is toggled.
 */
function toggleCategoryFilter(catName, btn) {
  // Clear individual selection to avoid conflict
  clearIndividualSelection();

  if (state.activeFilters.has(catName)) {
    state.activeFilters.delete(catName);
    btn.classList.remove('is-filter-active');
    btn.setAttribute('aria-pressed', 'false');
  } else {
    state.activeFilters.add(catName);
    btn.classList.add('is-filter-active');
    btn.setAttribute('aria-pressed', 'true');
  }

  applyActiveState();
}

/* ═══════════════════════════════════════════════════════════
   SELECTION LOGIC
═══════════════════════════════════════════════════════════ */

/**
 * Handle click on a word token.
 * 1. Clear category filters (individual selection takes priority).
 * 2. If clicking the already-active word, deselect it.
 * 3. Otherwise, select word and open modal.
 */
function handleTokenClick(token, wordKey) {
  clearFilterButtons();
  state.activeFilters.clear();

  if (state.activeWord === wordKey) {
    // Deselect
    state.activeWord = null;
    applyActiveState();
    return;
  }

  state.activeWord = wordKey;
  applyActiveState();
  openWordModal(token);
}

/**
 * Set .is-active on all relevant spans based on current state:
 * - activeWord: all spans whose data-word matches
 * - activeFilters: all spans whose data-cat is in the filter set
 */
function applyActiveState() {
  const allTokenSpans = dom.textDisplay.querySelectorAll('.token:not(.token--punct)');

  allTokenSpans.forEach((span) => {
    const matchesWord   = state.activeWord && span.dataset.word === state.activeWord;
    const matchesFilter = state.activeFilters.size > 0
                          && state.activeFilters.has(span.dataset.cat);

    if (matchesWord || matchesFilter) {
      span.classList.add('is-active');
    } else {
      span.classList.remove('is-active');
    }
  });
}

function clearIndividualSelection() {
  state.activeWord = null;
}

function clearFilterButtons() {
  dom.legendBtns.querySelectorAll('.legend-btn').forEach((btn) => {
    btn.classList.remove('is-filter-active');
    btn.setAttribute('aria-pressed', 'false');
  });
}

/* ═══════════════════════════════════════════════════════════
   WORD MODAL
═══════════════════════════════════════════════════════════ */

/** Current token being displayed in the modal */
let currentModalToken = null;

function openWordModal(token) {
  currentModalToken = token;

  dom.mWord.textContent = token.texto_original;
  dom.mIPA.textContent  = token.pronunciacion_ipa || '';
  dom.mCatBadge.textContent = token.categoria || 'Other';
  dom.mCatBadge.className   = `modal-cat-badge cat-color--${token.categoria || 'Other'}`;

  dom.mTranslation.textContent = token.traduccion || '—';
  dom.mDefinition.textContent  = token.definicion_en || '—';

  // Synonyms
  const syns = Array.isArray(token.sinonimos) ? token.sinonimos : [];
  dom.mSynonyms.textContent = syns.length ? syns.join(', ') : '—';

  // Examples
  const exs = Array.isArray(token.ejemplos) ? token.ejemplos : [];
  dom.mExamples.innerHTML = exs.length
    ? exs.map((e) => `<li>${escapeHtml(e)}</li>`).join('')
    : '<li>—</li>';

  // Auto-save to dictionary
  saveToDict(token);
  updateDictToggleBtn(token);

  dom.wordModal.hidden = false;
  document.body.style.overflow = 'hidden'; // prevent background scroll on mobile
}

function closeWordModal() {
  dom.wordModal.hidden = true;
  document.body.style.overflow = '';
  currentModalToken = null;
}

function updateDictToggleBtn(token) {
  const inDict = isInDict(token.texto_original);
  if (inDict) {
    dom.btnDictToggle.textContent = '🗑 Quitar de mi Diccionario';
    dom.btnDictToggle.className   = 'btn-dict-toggle state-remove';
  } else {
    dom.btnDictToggle.textContent = '📖 Agregar al Diccionario';
    dom.btnDictToggle.className   = 'btn-dict-toggle state-add';
  }
}

/* ═══════════════════════════════════════════════════════════
   DICTIONARY (localStorage)
═══════════════════════════════════════════════════════════ */

function loadDict() {
  try {
    const raw = localStorage.getItem(DICT_STORAGE_KEY);
    state.dictionary = raw ? JSON.parse(raw) : [];
  } catch {
    state.dictionary = [];
  }
}

function saveDict() {
  localStorage.setItem(DICT_STORAGE_KEY, JSON.stringify(state.dictionary));
  updateDictCount();
}

function isInDict(word) {
  return state.dictionary.some(
    (t) => t.texto_original.toLowerCase() === word.toLowerCase()
  );
}

function saveToDict(token) {
  if (isInDict(token.texto_original)) return; // no duplicates
  state.dictionary.push(token);
  saveDict();
}

function removeFromDict(word) {
  state.dictionary = state.dictionary.filter(
    (t) => t.texto_original.toLowerCase() !== word.toLowerCase()
  );
  saveDict();
}

function updateDictCount() {
  dom.dictCount.textContent = state.dictionary.length;
}

/* ═══════════════════════════════════════════════════════════
   DICTIONARY MODAL
═══════════════════════════════════════════════════════════ */

function openDictModal() {
  renderDictGrid();
  dom.dictModal.hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeDictModal() {
  dom.dictModal.hidden = true;
  document.body.style.overflow = '';
}

function renderDictGrid() {
  dom.dictGrid.innerHTML = '';

  if (!state.dictionary.length) {
    dom.dictGrid.innerHTML = '<p class="dict-empty">Your dictionary is empty. Click words while reading to add them.</p>';
    return;
  }

  state.dictionary.forEach((token) => {
    const card = document.createElement('div');
    card.className = 'dict-card';

    card.innerHTML = `
      <span class="dict-card-word">${escapeHtml(token.texto_original)}</span>
      <span class="dict-card-cat cat-color--${token.categoria || 'Other'}">${token.categoria || 'Other'}</span>
      <span class="dict-card-trans">${escapeHtml(token.traduccion || '')}</span>
      <button class="dict-card-remove" data-word="${escapeHtml(token.texto_original)}" title="Remove">✕</button>
    `;

    card.querySelector('.dict-card-remove').addEventListener('click', (e) => {
      const word = e.currentTarget.dataset.word;
      removeFromDict(word);
      renderDictGrid(); // re-render in place
      // If word modal is open for the same word, update the toggle button
      if (currentModalToken && currentModalToken.texto_original.toLowerCase() === word.toLowerCase()) {
        updateDictToggleBtn(currentModalToken);
      }
    });

    dom.dictGrid.appendChild(card);
  });
}

/* ═══════════════════════════════════════════════════════════
   ANALYZE — MAIN HANDLER
═══════════════════════════════════════════════════════════ */

async function handleAnalyze() {
  const text  = dom.textInput.value.trim();
  const model = dom.modelSelect.value;
  const level = dom.levelSelect.value;
  const apiKey = dom.apiKey.value.trim();

  // Validation
  if (!apiKey) { showError('Enter your OpenRouter API key.'); return; }
  if (!text)   { showError('Paste a text in English to analyze.'); return; }
  if (!model)  { showError('Select a model (click ⟳ to load free models).'); return; }

  hideError();
  setAnalyzeLoading(true);

  // Reset state
  state.tokens = [];
  state.activeWord = null;
  state.activeFilters.clear();
  dom.legendBar.hidden = true;
  dom.legendBtns.innerHTML = '';
  dom.textDisplay.innerHTML = '<p class="placeholder-msg">⏳ Analyzing…</p>';

  try {
    const tokens = await analyzeText(text, model, level);
    state.tokens = tokens;

    renderTokens(tokens);
    buildLegend(tokens);

  } catch (err) {
    showError(err.message);
    dom.textDisplay.innerHTML = '<p class="placeholder-msg">Analysis failed. See error above.</p>';
  } finally {
    setAnalyzeLoading(false);
  }
}

function setAnalyzeLoading(on) {
  dom.btnAnalyze.disabled = on;
  dom.btnAnalyze.querySelector('.btn-text').hidden = on;
  dom.btnAnalyze.querySelector('.btn-spinner').hidden = !on;
}

/* ═══════════════════════════════════════════════════════════
   DARK MODE
═══════════════════════════════════════════════════════════ */

function initTheme() {
  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  const isDark = saved === 'dark';
  document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
  dom.themeToggle.checked = isDark;
}

function toggleTheme() {
  const isDark = dom.themeToggle.checked;
  document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
  localStorage.setItem(THEME_STORAGE_KEY, isDark ? 'dark' : 'light');
}

/* ═══════════════════════════════════════════════════════════
   ERROR HELPERS
═══════════════════════════════════════════════════════════ */

function showError(msg) {
  dom.errorMsg.textContent = msg;
  dom.errorBanner.hidden = false;
}

function hideError() {
  dom.errorBanner.hidden = true;
  dom.errorMsg.textContent = '';
}

/* ═══════════════════════════════════════════════════════════
   UTILITY
═══════════════════════════════════════════════════════════ */

function escapeHtml(str = '') {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ═══════════════════════════════════════════════════════════
   EVENT BINDING
═══════════════════════════════════════════════════════════ */

function bindEvents() {
  // Dark mode
  dom.themeToggle.addEventListener('change', toggleTheme);

  // Fetch models
  dom.btnFetchModels.addEventListener('click', fetchFreeModels);

  // Analyze
  dom.btnAnalyze.addEventListener('click', handleAnalyze);

  // Word modal close
  dom.wordModalClose.addEventListener('click', closeWordModal);
  dom.wordModal.addEventListener('click', (e) => {
    if (e.target === dom.wordModal) closeWordModal();
  });

  // Dict toggle inside word modal
  dom.btnDictToggle.addEventListener('click', () => {
    if (!currentModalToken) return;
    if (isInDict(currentModalToken.texto_original)) {
      removeFromDict(currentModalToken.texto_original);
    } else {
      saveToDict(currentModalToken);
    }
    updateDictToggleBtn(currentModalToken);
  });

  // Open dictionary modal
  dom.btnOpenDict.addEventListener('click', openDictModal);

  // Dict modal close
  dom.dictModalClose.addEventListener('click', closeDictModal);
  dom.dictModal.addEventListener('click', (e) => {
    if (e.target === dom.dictModal) closeDictModal();
  });

  // Close modals on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeWordModal();
      closeDictModal();
    }
  });

  // Dismiss error on click
  dom.errorBanner.addEventListener('click', hideError);
}

/* ═══════════════════════════════════════════════════════════
   INIT
═══════════════════════════════════════════════════════════ */

function init() {
  initTheme();
  loadDict();
  updateDictCount();
  bindEvents();
}

document.addEventListener('DOMContentLoaded', init);
