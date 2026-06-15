/**
 * EnglishLens — app.js
 * SPA para el estudio interactivo de inglés americano.
 *
 * Arquitectura:
 *  1. CONFIG       — constantes y tokens de diseño
 *  2. STATE        — variables de estado de la aplicación
 *  3. DOM          — referencias cacheadas al DOM
 *  4. STORAGE      — helpers para localStorage
 *  5. NOTIFICATION — sistema de toasts
 *  6. MODELS       — carga de modelos gratuitos de OpenRouter
 *  7. ANALYSIS     — envío de texto y procesamiento de la respuesta
 *  8. TOKENS       — renderizado interactivo de palabras
 *  9. MODAL        — ventana emergente de detalle de palabra
 * 10. DICTIONARY   — panel lateral y persistencia
 * 11. INIT         — arranque y binding de eventos
 */

'use strict';

/* ═══════════════════════════════════════════════════════════
   1. CONFIG
═══════════════════════════════════════════════════════════ */

const API_BASE   = 'https://openrouter.ai/api/v1';
const MODELS_URL = `${API_BASE}/models`;
const CHAT_URL   = `${API_BASE}/chat/completions`;
const SITE_URL   = window.location.href;
const SITE_TITLE = 'EnglishLens';

/** localStorage keys */
const LS = {
  API_KEY:    'el_apikey',
  MODEL:      'el_model',
  LEVEL:      'el_level',
  MODELS_CACHE: 'el_models_cache',
  DICTIONARY: 'el_dictionary',
};

/**
 * Maps every grammar-category string (ES/EN) the API might return
 * to one of the CSS colour classes defined in style.css.
 */
const CATEGORY_CLASS = {
  // Verbs
  'verbo':        'cat-verb',   'verb':      'cat-verb',
  'verbo modal':  'cat-verb',   'modal verb':'cat-verb',
  'auxiliar':     'cat-verb',   'auxiliary': 'cat-verb',
  // Nouns
  'sustantivo':   'cat-noun',   'noun':      'cat-noun',
  // Adjectives
  'adjetivo':     'cat-adj',    'adjective': 'cat-adj',   'adj': 'cat-adj',
  // Adverbs
  'adverbio':     'cat-adv',    'adverb':    'cat-adv',   'adv': 'cat-adv',
  // Phrasal / Compound verbs
  'phrasal_verb': 'cat-phrasal','phrasal verb':'cat-phrasal','phrasal':'cat-phrasal',
  'idiom':        'cat-phrasal','expresión':  'cat-phrasal',
  // Prepositions
  'preposición':  'cat-prep',   'preposition':'cat-prep', 'prep':'cat-prep',
  // Conjunctions
  'conjunción':   'cat-conj',   'conjunction':'cat-conj', 'conj':'cat-conj',
  // Pronouns
  'pronombre':    'cat-pron',   'pronoun':   'cat-pron',  'pron':'cat-pron',
  // Articles / determiners
  'artículo':     'cat-default','article':   'cat-default',
  'determinante': 'cat-default','determiner':'cat-default',
  'interjección': 'cat-default','interjection':'cat-default',
};


/* ═══════════════════════════════════════════════════════════
   2. STATE
═══════════════════════════════════════════════════════════ */

const state = {
  /** Array of token objects returned by the API for the current text */
  tokens: [],
  /** Token currently shown in the modal (null when closed) */
  activeToken: null,
};


/* ═══════════════════════════════════════════════════════════
   3. DOM  — cached references (queried once at init)
═══════════════════════════════════════════════════════════ */

const $ = id => document.getElementById(id);

const dom = {
  // Header controls
  apiKeyInput:      $('api-key-input'),
  toggleApiKey:     $('toggle-api-key'),
  levelSelect:      $('level-select'),
  modelSelect:      $('model-select'),
  refreshModelsBtn: $('refresh-models-btn'),

  // Input area
  textInput:        $('text-input'),
  charCount:        $('char-count'),
  analyzeBtn:       $('analyze-btn'),

  // Output area
  legend:           $('legend'),
  renderedText:     $('rendered-text'),

  // Dictionary FAB
  dictionaryBtn:    $('dictionary-btn'),
  dictBadge:        $('dict-count'),

  // Word modal
  wordModal:        $('word-modal'),
  modalClose:       $('modal-close'),
  modalHead:        $('modal-head'),
  modalWordTitle:   $('modal-word-title'),
  modalCatBadge:    $('modal-cat-badge'),
  modalTranslation: $('modal-translation'),
  modalDefinition:  $('modal-definition'),
  modalSynonyms:    $('modal-synonyms'),
  modalExamples:    $('modal-examples'),
  addToDictBtn:     $('add-to-dict-btn'),

  // Dictionary panel
  dictionaryPanel:  $('dictionary-panel'),
  dictionaryClose:  $('dictionary-close'),
  dictionaryList:   $('dictionary-list'),

  // Toast
  notification:     $('notification'),
};


/* ═══════════════════════════════════════════════════════════
   4. STORAGE — safe localStorage wrappers
═══════════════════════════════════════════════════════════ */

const storage = {
  get(key)        { try { return localStorage.getItem(key); }         catch { return null; } },
  set(key, val)   { try { localStorage.setItem(key, val); }           catch {} },
  getJSON(key)    { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } },
  setJSON(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch {} },
  remove(key)     { try { localStorage.removeItem(key); }             catch {} },
};


/* ═══════════════════════════════════════════════════════════
   5. NOTIFICATION  — toast messages
═══════════════════════════════════════════════════════════ */

let _notifTimer = null;

/**
 * Displays a transient toast notification.
 * @param {string} msg   - Message to display.
 * @param {'info'|'success'|'error'|'warning'} type
 * @param {number} duration - Auto-dismiss delay in ms.
 */
function notify(msg, type = 'info', duration = 3200) {
  dom.notification.textContent = msg;
  dom.notification.className   = `notification ${type} active`;
  clearTimeout(_notifTimer);
  _notifTimer = setTimeout(() => dom.notification.classList.remove('active'), duration);
}


/* ═══════════════════════════════════════════════════════════
   6. MODELS — fetching & populating the model dropdown
═══════════════════════════════════════════════════════════ */

/**
 * Determines whether an OpenRouter model is free.
 * A model is free when its ID ends in ':free' OR
 * both prompt and completion costs are 0.
 */
function isFreeModel(model) {
  if (model.id && model.id.toLowerCase().includes(':free')) return true;
  const p = model.pricing;
  if (!p) return false;
  return parseFloat(p.prompt) === 0 && parseFloat(p.completion) === 0;
}

/** Fetches models from OpenRouter and populates the dropdown */
async function fetchModels() {
  const apiKey = storage.get(LS.API_KEY);
  if (!apiKey) {
    notify('Ingresa tu API Key primero.', 'error');
    return;
  }

  dom.refreshModelsBtn.disabled     = true;
  dom.refreshModelsBtn.textContent  = '⏳';

  try {
    const res = await fetch(MODELS_URL, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer':   SITE_URL,
        'X-Title':        SITE_TITLE,
      },
    });

    if (!res.ok) throw new Error(`HTTP ${res.status} — ${res.statusText}`);

    const data        = await res.json();
    const allModels   = data.data || [];
    const freeModels  = allModels
      .filter(isFreeModel)
      .map(m => ({ id: m.id, name: m.name || m.id }))
      // Sort alphabetically by name
      .sort((a, b) => a.name.localeCompare(b.name));

    if (!freeModels.length) {
      notify('No se encontraron modelos gratuitos. Verifica tu API Key.', 'warning');
      return;
    }

    // Cache for next session
    storage.setJSON(LS.MODELS_CACHE, freeModels);

    populateModelSelect(freeModels);
    notify(`✓ ${freeModels.length} modelos gratuitos cargados`, 'success');

  } catch (err) {
    console.error('[EnglishLens] fetchModels:', err);
    notify(`Error al cargar modelos: ${err.message}`, 'error');
  } finally {
    dom.refreshModelsBtn.disabled    = false;
    dom.refreshModelsBtn.textContent = '🔄';
  }
}

/**
 * Fills the model <select> from a list of {id, name} objects
 * and restores the previously selected model from localStorage.
 */
function populateModelSelect(models) {
  dom.modelSelect.innerHTML = '';

  models.forEach(({ id, name }) => {
    const opt      = document.createElement('option');
    opt.value      = id;
    opt.textContent = name;
    dom.modelSelect.appendChild(opt);
  });

  // Restore saved selection
  const saved = storage.get(LS.MODEL);
  if (saved && [...dom.modelSelect.options].some(o => o.value === saved)) {
    dom.modelSelect.value = saved;
  } else {
    storage.set(LS.MODEL, dom.modelSelect.value);
  }
}


/* ═══════════════════════════════════════════════════════════
   7. ANALYSIS — sending text to OpenRouter and parsing JSON
═══════════════════════════════════════════════════════════ */

/**
 * Builds the strict system prompt that forces the model to
 * return ONLY a JSON object matching our token schema.
 */
function buildSystemPrompt(level) {
  return `You are a professional linguistic tokenizer for American English learners at CEFR level ${level}.

CRITICAL RULES — READ CAREFULLY:
1. Your ENTIRE response must be one valid JSON object. Nothing else.
2. No markdown, no code fences (\`\`\`), no explanations, no comments.
3. Start your response with { and end it with }.

TASK:
Analyze the user's English text and tokenize EVERY word and multi-word expression.
- Identify phrasal verbs and idioms and group them as a single "compound" token.
- Include all words: articles, prepositions, conjunctions, particles.
- Maintain original word order from the input text.
- Adapt definitions and examples to CEFR level ${level}.

RESPONSE SCHEMA (return exactly this shape, every field required):
{
  "tokens": [
    {
      "texto_original": "word or phrase exactly as it appears in the text",
      "tipo": "single",
      "categoria": "verbo",
      "traduccion": "Spanish translation for level ${level}",
      "definicion_en": "Clear English definition for level ${level}",
      "sinonimos": ["synonym1", "synonym2"],
      "ejemplos": ["American English example sentence 1.", "Example sentence 2."]
    }
  ]
}

VALID VALUES FOR "tipo": "single" | "compound"
VALID VALUES FOR "categoria": "verbo" | "sustantivo" | "adjetivo" | "adverbio" |
  "phrasal_verb" | "preposición" | "conjunción" | "pronombre" | "artículo" |
  "determinante" | "interjección" | "auxiliar"

IMPORTANT: For a compound token (phrasal verb like "look up"), include the FULL phrase as one token.
Do NOT also include each individual word separately.

Respond ONLY with the JSON object.`;
}

/**
 * Extracts and parses the JSON token array from a raw model response.
 * Handles accidental markdown code fences and leading/trailing whitespace.
 */
function parseResponse(raw) {
  if (!raw || typeof raw !== 'string') throw new Error('Respuesta vacía del modelo.');

  // Strip markdown code fences if present (some models ignore the system prompt)
  let clean = raw.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  // If the model still wrapped with prose, try to extract the JSON object
  const jsonStart = clean.indexOf('{');
  const jsonEnd   = clean.lastIndexOf('}');
  if (jsonStart === -1 || jsonEnd === -1) throw new Error('No se encontró un objeto JSON válido en la respuesta.');
  clean = clean.slice(jsonStart, jsonEnd + 1);

  const parsed = JSON.parse(clean);
  if (!Array.isArray(parsed.tokens)) throw new Error('El JSON no contiene un array "tokens" válido.');

  return parsed.tokens;
}

/** Main action: reads form values → calls API → renders tokens */
async function analyzeText() {
  const apiKey = storage.get(LS.API_KEY);
  const model  = dom.modelSelect.value;
  const text   = dom.textInput.value.trim();
  const level  = dom.levelSelect.value;

  // Guards
  if (!apiKey) { notify('Ingresa tu API Key primero.', 'error'); return; }
  if (!model)  { notify('Selecciona un modelo (haz clic en 🔄 para cargar).', 'error'); return; }
  if (!text)   { notify('Escribe o pega un texto en inglés para analizar.', 'error'); return; }
  if (text.length > 3000) { notify('El texto es muy largo. Usa fragmentos de hasta 3 000 caracteres.', 'warning'); return; }

  // UI: loading state
  dom.analyzeBtn.disabled     = true;
  dom.analyzeBtn.innerHTML    = '<span aria-hidden="true">⏳</span>&ensp;Analizando…';
  dom.renderedText.innerHTML  = '<div class="loading">🔍 Consultando a la IA…</div>';
  dom.legend.hidden           = true;

  try {
    const res = await fetch(CHAT_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type':  'application/json',
        'HTTP-Referer':   SITE_URL,
        'X-Title':        SITE_TITLE,
      },
      body: JSON.stringify({
        model,
        temperature: 0.15,  // low temperature = more deterministic JSON
        messages: [
          { role: 'system', content: buildSystemPrompt(level) },
          { role: 'user',   content: text },
        ],
      }),
    });

    if (!res.ok) {
      let errMsg = `HTTP ${res.status}`;
      try {
        const errData = await res.json();
        errMsg = errData?.error?.message || errMsg;
      } catch (_) { /* ignore parse error */ }
      throw new Error(errMsg);
    }

    const data    = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    const tokens  = parseResponse(content);

    if (!tokens.length) throw new Error('El modelo devolvió una lista de tokens vacía.');

    state.tokens = tokens;
    renderTokens(tokens);
    dom.legend.hidden = false;

  } catch (err) {
    console.error('[EnglishLens] analyzeText:', err);
    dom.renderedText.innerHTML = `
      <div class="error-msg">
        ⚠️ ${escHtml(err.message)}<br>
        <small>Revisa tu API Key, el modelo seleccionado y tu conexión.</small>
      </div>`;
    notify(`Error: ${err.message}`, 'error');
  } finally {
    dom.analyzeBtn.disabled  = false;
    dom.analyzeBtn.innerHTML = '<span aria-hidden="true">🔍</span>&ensp;Analizar Texto';
  }
}


/* ═══════════════════════════════════════════════════════════
   8. TOKENS — rendering word spans in the output area
═══════════════════════════════════════════════════════════ */

/**
 * Resolves the CSS colour class for a grammar category string.
 * Falls back to 'cat-default' for unrecognised values.
 */
function catClass(categoria) {
  if (!categoria) return 'cat-default';
  return CATEGORY_CLASS[categoria.toLowerCase().trim()] ?? 'cat-default';
}

/**
 * Creates and appends all token <span> elements to the rendered-text container.
 * Uses a DocumentFragment for a single reflow.
 */
function renderTokens(tokens) {
  const frag = document.createDocumentFragment();

  tokens.forEach((token, i) => {
    const span = document.createElement('span');

    span.className   = ['token', catClass(token.categoria), token.tipo === 'compound' ? 'compound' : '']
                         .filter(Boolean).join(' ');
    span.textContent  = token.texto_original;
    span.dataset.idx  = i;
    span.title        = token.traduccion || '';  // quick tooltip on hover

    // Accessibility: make focusable and keyboard-activatable
    span.setAttribute('role', 'button');
    span.setAttribute('tabindex', '0');
    span.setAttribute('aria-label',
      `${token.texto_original} — ${token.categoria || ''}: ${token.traduccion || ''}`);

    span.addEventListener('click', () => openModal(i));
    span.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openModal(i); }
    });

    frag.appendChild(span);

    // Natural spacing between tokens.
    // Avoid double-space before punctuation marks.
    const isLastToken       = i === tokens.length - 1;
    const nextText          = !isLastToken ? tokens[i + 1]?.texto_original : '';
    const nextIsPunctuation = /^[.,;:!?'"\)\]\}]/.test(nextText || '');
    if (!isLastToken && !nextIsPunctuation) {
      frag.appendChild(document.createTextNode(' '));
    }
  });

  dom.renderedText.innerHTML = '';
  dom.renderedText.appendChild(frag);
}


/* ═══════════════════════════════════════════════════════════
   9. MODAL — word detail popup
═══════════════════════════════════════════════════════════ */

/**
 * Opens the word-detail modal for the token at the given index.
 * Also auto-saves the word to the dictionary (no duplicates).
 */
function openModal(index) {
  const token = state.tokens[index];
  if (!token) return;

  state.activeToken = token;

  // Auto-add to dictionary every time a word is tapped
  addToDictionary(token);

  // ── Populate modal fields ──
  dom.modalWordTitle.textContent   = token.texto_original;
  dom.modalCatBadge.textContent    = token.categoria || '';
  dom.modalTranslation.textContent = token.traduccion   || '—';
  dom.modalDefinition.textContent  = token.definicion_en || '—';

  // Synonyms — rendered as pill tags
  dom.modalSynonyms.innerHTML = '';
  const syns = Array.isArray(token.sinonimos) ? token.sinonimos : [];
  if (syns.length) {
    syns.forEach(s => {
      const tag       = document.createElement('span');
      tag.className   = 'syn-tag';
      tag.textContent = s;
      dom.modalSynonyms.appendChild(tag);
    });
  } else {
    dom.modalSynonyms.textContent = '—';
  }

  // Examples — list items
  dom.modalExamples.innerHTML = '';
  const exs = Array.isArray(token.ejemplos) ? token.ejemplos : [];
  if (exs.length) {
    exs.forEach(ex => {
      const li       = document.createElement('li');
      li.textContent = ex;
      dom.modalExamples.appendChild(li);
    });
  } else {
    const li       = document.createElement('li');
    li.textContent = '—';
    dom.modalExamples.appendChild(li);
  }

  // Apply grammar-category colour to modal header
  dom.modalHead.className = `modal-head ${catClass(token.categoria)}`;

  // Show overlay
  dom.wordModal.classList.add('active');
  dom.wordModal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';

  // Focus the close button for keyboard users
  dom.modalClose.focus();
}

function closeModal() {
  dom.wordModal.classList.remove('active');
  dom.wordModal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  state.activeToken = null;
}


/* ═══════════════════════════════════════════════════════════
   10. DICTIONARY — persistence, panel and card rendering
═══════════════════════════════════════════════════════════ */

/** Returns the saved dictionary array from localStorage */
function getDictionary() {
  return storage.getJSON(LS.DICTIONARY) || [];
}

/** Persists the dictionary array and refreshes the badge counter */
function saveDictionary(dict) {
  storage.setJSON(LS.DICTIONARY, dict);
  updateDictBadge(dict.length);
}

/**
 * Adds a token to the dictionary if not already present (dedup by texto_original).
 * Returns true if a new entry was added, false if it was already there.
 */
function addToDictionary(token) {
  const dict   = getDictionary();
  const exists = dict.some(t => t.texto_original === token.texto_original);
  if (!exists) {
    dict.push(token);
    saveDictionary(dict);
    return true;
  }
  updateDictBadge(dict.length);
  return false;
}

/** Removes a word from the dictionary by texto_original */
function removeFromDictionary(word) {
  saveDictionary(getDictionary().filter(t => t.texto_original !== word));
  renderDictionary();  // re-render panel while open
}

/** Updates the red badge number on the FAB */
function updateDictBadge(count) {
  dom.dictBadge.textContent = count > 0 ? String(count) : '';
}

/** Opens the dictionary side-panel */
function openDictionary() {
  renderDictionary();
  dom.dictionaryPanel.classList.add('active');
  dom.dictionaryPanel.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  dom.dictionaryClose.focus();
}

/** Closes the dictionary side-panel */
function closeDictionary() {
  dom.dictionaryPanel.classList.remove('active');
  dom.dictionaryPanel.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

/** Renders all saved words as interactive cards inside the dictionary panel */
function renderDictionary() {
  const dict = getDictionary();
  dom.dictionaryList.innerHTML = '';

  if (!dict.length) {
    dom.dictionaryList.innerHTML =
      '<p class="empty-dict">Tu diccionario está vacío.<br>' +
      'Haz clic en cualquier palabra del texto analizado para guardarla aquí automáticamente.</p>';
    return;
  }

  dict.forEach(token => {
    const cc   = catClass(token.categoria);
    const card = document.createElement('article');
    card.className = 'dict-card';
    card.setAttribute('role', 'listitem');

    const synsHTML = (Array.isArray(token.sinonimos) && token.sinonimos.length)
      ? `<div class="dict-synonyms">
           ${token.sinonimos.map(s => `<span class="syn-tag">${escHtml(s)}</span>`).join('')}
         </div>`
      : '';

    card.innerHTML = `
      <div class="dict-card-head">
        <span class="dict-word ${cc}">${escHtml(token.texto_original)}</span>
        <span class="dict-cat-label">${escHtml(token.categoria || '')}</span>
        <button class="dict-remove"
                data-word="${escAttr(token.texto_original)}"
                title="Eliminar '${escAttr(token.texto_original)}' del diccionario"
                aria-label="Eliminar ${escHtml(token.texto_original)}">✕</button>
      </div>
      <p class="dict-translation">${escHtml(token.traduccion || '—')}</p>
      <p class="dict-definition">${escHtml(token.definicion_en || '')}</p>
      ${synsHTML}
    `;

    card.querySelector('.dict-remove').addEventListener('click', e => {
      removeFromDictionary(e.currentTarget.dataset.word);
    });

    dom.dictionaryList.appendChild(card);
  });
}


/* ═══════════════════════════════════════════════════════════
   UTILITIES
═══════════════════════════════════════════════════════════ */

/** Escapes a string for safe insertion as HTML text content */
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Escapes a string for safe use inside an HTML attribute value */
function escAttr(str) {
  return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}


/* ═══════════════════════════════════════════════════════════
   11. INIT — bootstrap the application
═══════════════════════════════════════════════════════════ */

function init() {

  /* ── Restore persisted settings ── */

  // API Key
  const savedKey = storage.get(LS.API_KEY);
  if (savedKey) dom.apiKeyInput.value = savedKey;

  // Level
  const savedLevel = storage.get(LS.LEVEL);
  if (savedLevel) dom.levelSelect.value = savedLevel;

  // Models from cache (avoids network on every reload)
  const cachedModels = storage.getJSON(LS.MODELS_CACHE);
  if (cachedModels && cachedModels.length) {
    populateModelSelect(cachedModels);
  }

  // Dictionary badge
  updateDictBadge(getDictionary().length);


  /* ── Header controls ── */

  // Persist API key when the input loses focus
  dom.apiKeyInput.addEventListener('blur', () => {
    storage.set(LS.API_KEY, dom.apiKeyInput.value.trim());
  });
  // Also save on Enter key
  dom.apiKeyInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') { dom.apiKeyInput.blur(); }
  });

  // Toggle API key visibility
  dom.toggleApiKey.addEventListener('click', () => {
    const isHidden = dom.apiKeyInput.type === 'password';
    dom.apiKeyInput.type      = isHidden ? 'text' : 'password';
    dom.toggleApiKey.textContent = isHidden ? '🙈' : '👁';
    dom.toggleApiKey.setAttribute('title', isHidden ? 'Ocultar' : 'Mostrar');
  });

  // Persist level selection
  dom.levelSelect.addEventListener('change', () => {
    storage.set(LS.LEVEL, dom.levelSelect.value);
  });

  // Persist model selection
  dom.modelSelect.addEventListener('change', () => {
    storage.set(LS.MODEL, dom.modelSelect.value);
  });

  // Refresh models button
  dom.refreshModelsBtn.addEventListener('click', fetchModels);


  /* ── Input area ── */

  // Live character counter
  dom.textInput.addEventListener('input', () => {
    const n = dom.textInput.value.length;
    dom.charCount.textContent = `${n.toLocaleString()} caracter${n !== 1 ? 'es' : ''}`;
  });

  // Ctrl/Cmd + Enter submits the form
  dom.textInput.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      analyzeText();
    }
  });

  // Analyze button
  dom.analyzeBtn.addEventListener('click', analyzeText);


  /* ── Word Modal ── */

  dom.modalClose.addEventListener('click', closeModal);

  // Close on backdrop click
  dom.wordModal.addEventListener('click', e => {
    if (e.target === dom.wordModal) closeModal();
  });

  // "Ver en Diccionario" button inside modal
  dom.addToDictBtn.addEventListener('click', () => {
    if (!state.activeToken) return;
    const added = addToDictionary(state.activeToken);
    notify(
      added
        ? `"${state.activeToken.texto_original}" guardado en el diccionario.`
        : `"${state.activeToken.texto_original}" ya estaba en el diccionario.`,
      'success'
    );
    closeModal();
    openDictionary();
  });


  /* ── Dictionary Panel ── */

  dom.dictionaryBtn.addEventListener('click', openDictionary);
  dom.dictionaryClose.addEventListener('click', closeDictionary);

  // Close on backdrop click
  dom.dictionaryPanel.addEventListener('click', e => {
    if (e.target === dom.dictionaryPanel) closeDictionary();
  });


  /* ── Global keyboard shortcuts ── */
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      // Close whichever overlay is open
      if (dom.wordModal.classList.contains('active'))     { closeModal();      return; }
      if (dom.dictionaryPanel.classList.contains('active')){ closeDictionary(); return; }
    }
    // Shift+D opens dictionary from anywhere
    if (e.shiftKey && e.key === 'D' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      dom.dictionaryPanel.classList.contains('active') ? closeDictionary() : openDictionary();
    }
  });
}

/* ── Boot ── */
document.addEventListener('DOMContentLoaded', init);
