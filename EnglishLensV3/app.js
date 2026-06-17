/**
 * EnglishLens — app.js  (v2)
 *
 * Módulos:
 *  1. CONFIG         — constantes
 *  2. STATE          — estado reactivo de la app
 *  3. DOM            — referencias cacheadas
 *  4. STORAGE        — wrappers seguros de localStorage
 *  5. NOTIFICATION   — toasts
 *  6. THEME          — modo claro / oscuro
 *  7. HEADER         — colapsar / expandir controles
 *  8. MODELS         — carga de modelos gratuitos
 *  9. ANALYSIS       — prompt y llamada a OpenRouter
 * 10. TOKENS         — renderizado interactivo
 * 11. WORD HIGHLIGHT — resaltar ocurrencias (toggle individual)
 * 12. CAT FILTER     — filtros de categoría (legend buttons)
 * 13. MODAL          — ventana de detalle
 * 14. DICTIONARY     — panel lateral y persistencia
 * 15. INIT           — arranque
 */

'use strict';

// Configurar marked al arranque
if (typeof marked !== 'undefined') {
  marked.use({ breaks: true, gfm: true });
}

/* ═══════════════════════════════════════════════════
   1. CONFIG
═══════════════════════════════════════════════════ */

const API_BASE   = 'https://openrouter.ai/api/v1';
const MODELS_URL = `${API_BASE}/models`;
const CHAT_URL   = `${API_BASE}/chat/completions`;
const SITE_URL   = window.location.href;
const SITE_TITLE = 'EnglishLens';

const LS = {
  API_KEY:     'el_apikey',
  MODEL:       'el_model',
  LEVEL:       'el_level',
  MODELS_CACHE:'el_models_cache',
  DICTIONARY:  'el_dictionary',
  THEME:       'el_theme',
  HDR_COLLAPSED:'el_hdr_collapsed',
  HISTORY:        'el_history',
  HISTORY_LIMIT:  'el_history_limit',
};

/** Opciones de límite de entradas que el usuario puede elegir en el panel de historial. */
const HISTORY_LIMIT_OPTIONS = [10, 20, 30, 50];
const HISTORY_LIMIT_DEFAULT = 20;
/** Tope absoluto, independiente de lo que el usuario seleccione (protege el almacenamiento). */
const HISTORY_MAX_HARD = 50;

/**
 * Mapa de categoría gramatical → clase CSS del token.
 * Las claves son todas las variantes que el modelo puede devolver (ES/EN).
 */
const CAT_CLASS = {
  'verbo':        'cat-verb',   'verb':         'cat-verb',
  'verbo modal':  'cat-verb',   'modal verb':   'cat-verb',
  'auxiliar':     'cat-verb',   'auxiliary':    'cat-verb',
  'sustantivo':   'cat-noun',   'noun':         'cat-noun',
  'adjetivo':     'cat-adj',    'adjective':    'cat-adj',   'adj': 'cat-adj',
  'adverbio':     'cat-adv',    'adverb':       'cat-adv',   'adv': 'cat-adv',
  'phrasal_verb': 'cat-phrasal','phrasal verb': 'cat-phrasal','phrasal':'cat-phrasal',
  'idiom':        'cat-phrasal','expresión':    'cat-phrasal','idioma':'cat-phrasal',
  'preposición':  'cat-prep',   'preposition':  'cat-prep',  'prep':'cat-prep',
  'conjunción':   'cat-conj',   'conjunction':  'cat-conj',  'conj':'cat-conj',
  'pronombre':    'cat-pron',   'pronoun':      'cat-pron',  'pron':'cat-pron',
  'artículo':     'cat-default','article':      'cat-default',
  'determinante': 'cat-default','determiner':   'cat-default',
  'interjección': 'cat-default','interjection': 'cat-default',
  'partícula':    'cat-default','particle':     'cat-default',
};


/* ═══════════════════════════════════════════════════
   2. STATE
═══════════════════════════════════════════════════ */

const state = {
  /** Tokens del texto actualmente analizado */
  tokens: [],

  /** Token mostrado en el modal */
  activeToken: null,

  /**
   * texto_original (lowercase) de la palabra actualmente resaltada con .is-active.
   * null = ninguna.
   */
  activeWordText: null,

  /**
   * Conjunto de clases CSS (ej. 'cat-verb') cuyo filtro está activo.
   * Los tokens de esas categorías reciben .cat-filter-active.
   */
  activeCategoryFilters: new Set(),
};


/* ═══════════════════════════════════════════════════
   3. DOM
═══════════════════════════════════════════════════ */

const $ = id => document.getElementById(id);

const dom = {
  // Header
  appHeader:        $('app-header'),
  headerControls:   $('header-controls'),
  toggleHeader:     $('toggle-header'),
  toggleTheme:      $('toggle-theme'),
  // Controls
  apiKeyInput:      $('api-key-input'),
  toggleApiKey:     $('toggle-api-key'),
  levelSelect:      $('level-select'),
  modelSelect:      $('model-select'),
  refreshModelsBtn: $('refresh-models-btn'),
  // Input
  textInput:        $('text-input'),
  charCount:        $('char-count'),
  analyzeBtn:       $('analyze-btn'),
  // Output
  legend:           $('legend'),
  renderedText:     $('rendered-text'),
  // FAB
  dictionaryBtn:    $('dictionary-btn'),
  dictBadge:        $('dict-count'),
  // Modal
  wordModal:        $('word-modal'),
  modalClose:       $('modal-close'),
  modalHead:        $('modal-head'),
  modalWordTitle:   $('modal-word-title'),
  modalCatBadge:    $('modal-cat-badge'),
  modalTranslation: $('modal-translation'),
  modalDefinition:  $('modal-definition'),
  modalSynonyms:    $('modal-synonyms'),
  modalExamples:    $('modal-examples'),
  openDictBtn:      $('open-dict-btn'),
  // Panel
  dictionaryPanel:  $('dictionary-panel'),
  dictionaryClose:  $('dictionary-close'),
  dictionaryList:   $('dictionary-list'),
  dictExportBtn:    $('dict-export-btn'),
  dictImportBtn:    $('dict-import-btn'),
  dictImportFile:   $('dict-import-file'),
  dictClearBtn:     $('dict-clear-btn'),
  // History
  historyBtn:        $('history-btn'),
  historyBadge:      $('history-badge'),
  historyPanel:      $('history-panel'),
  historyClose:      $('history-close'),
  historyList:       $('history-list'),
  historyLimitSelect:$('history-limit-select'),
  historyExportBtn:  $('history-export-btn'),
  historyImportBtn:  $('history-import-btn'),
  historyImportFile: $('history-import-file'),
  historyClearBtn:   $('history-clear-btn'),
  // Chat
  chatSection:      $('chat-section'),
  chatHistory:      $('chat-history'),
  chatInput:        $('chat-input'),
  chatSendBtn:      $('chat-send-btn'),
  // Toast
  notification:     $('notification'),
  // Pronunciación
  modalPronounceBtn: $('modal-pronounce-btn'),
  modalPhonetic:     $('modal-phonetic'),
  // Flashcards
  fcOverlay:        $('flashcard-overlay'),
  fcClose:          $('fc-close'),
  fcCard:           $('fc-card'),
  fcCardInner:      $('fc-card-inner'),
  fcCounter:        $('fc-counter'),
  fcProgressBar:    $('fc-progress-bar'),
  fcProgressTrack:  $('fc-progress-track'),
  fcCatBadge:       $('fc-cat-badge'),
  fcWord:           $('fc-word'),
  fcTranslation:    $('fc-translation'),
  fcDefinition:     $('fc-definition'),
  fcExample:        $('fc-example'),
  fcActions:        $('fc-actions'),
  fcFlipBtn:        $('fc-flip-btn'),
  fcWrong:          $('fc-wrong'),
  fcRight:          $('fc-right'),
  fcResults:        $('fc-results'),
  fcResultsEmoji:   $('fc-results-emoji'),
  fcResultsScore:   $('fc-results-score'),
  fcRestartWrong:   $('fc-restart-wrong'),
  fcRestartAll:     $('fc-restart-all'),
  dictFlashcardBtn: $('dict-flashcard-btn'),
};


/* ═══════════════════════════════════════════════════
   4. STORAGE
═══════════════════════════════════════════════════ */

const storage = {
  get    : k  => { try { return localStorage.getItem(k); }              catch { return null; } },
  set    : (k,v) => { try { localStorage.setItem(k, v); }              catch {} },
  getJSON: k  => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } },
  setJSON: (k,v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};


/* ═══════════════════════════════════════════════════
   5. NOTIFICATION
═══════════════════════════════════════════════════ */

let _notifTimer = null;

function notify(msg, type = 'info', ms = 3000) {
  dom.notification.textContent = msg;
  dom.notification.className   = `notification ${type} active`;
  clearTimeout(_notifTimer);
  _notifTimer = setTimeout(() => dom.notification.classList.remove('active'), ms);
}


/* ═══════════════════════════════════════════════════
   6. THEME — claro / oscuro
═══════════════════════════════════════════════════ */

function applyTheme(theme) {
  document.body.dataset.theme = theme;
  const label = theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro';
  dom.toggleTheme.title = label;
  dom.toggleTheme.setAttribute('aria-label', label);
}

function initTheme() {
  const saved = storage.get(LS.THEME) || 'light';
  applyTheme(saved);

  dom.toggleTheme.addEventListener('click', () => {
    const next = document.body.dataset.theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    storage.set(LS.THEME, next);
  });
}


/* ═══════════════════════════════════════════════════
   7. HEADER — colapsar / expandir
═══════════════════════════════════════════════════ */

function setHeaderCollapsed(collapsed, animate = true) {
  const chevron = dom.toggleHeader.querySelector('.chevron-icon');

  if (!animate) {
    dom.headerControls.style.transition = 'none';
    requestAnimationFrame(() => {
      dom.headerControls.style.transition = '';
    });
  }

  dom.headerControls.classList.toggle('is-collapsed', collapsed);
  if (chevron) chevron.classList.toggle('rotated', collapsed);

  const label = collapsed ? 'Mostrar controles' : 'Ocultar controles';
  dom.toggleHeader.title = label;
  dom.toggleHeader.setAttribute('aria-label', label);
  dom.toggleHeader.setAttribute('aria-expanded', String(!collapsed));

  storage.set(LS.HDR_COLLAPSED, String(collapsed));
}

function initHeader() {
  const wasCollapsed = storage.get(LS.HDR_COLLAPSED) === 'true';
  if (wasCollapsed) setHeaderCollapsed(true, false);

  dom.toggleHeader.addEventListener('click', () => {
    const isCollapsed = dom.headerControls.classList.contains('is-collapsed');
    setHeaderCollapsed(!isCollapsed);
  });
}


/* ═══════════════════════════════════════════════════
   8. MODELS
═══════════════════════════════════════════════════ */

function isFreeModel(m) {
  if (m.id && m.id.toLowerCase().includes(':free')) return true;
  const p = m.pricing;
  return p && parseFloat(p.prompt) === 0 && parseFloat(p.completion) === 0;
}

async function fetchModels() {
  const apiKey = storage.get(LS.API_KEY);
  if (!apiKey) { notify('Ingresa tu API Key primero.', 'error'); return; }

  dom.refreshModelsBtn.disabled    = true;
  dom.refreshModelsBtn.textContent = '⏳';

  try {
    const res = await fetch(MODELS_URL, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer':   SITE_URL,
        'X-Title':        SITE_TITLE,
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} — ${res.statusText}`);

    const data       = await res.json();
    const freeModels = (data.data || [])
      .filter(isFreeModel)
      .map(m => ({ id: m.id, name: m.name || m.id }))
      .sort((a, b) => a.name.localeCompare(b.name));

    if (!freeModels.length) {
      notify('No se encontraron modelos gratuitos.', 'warning');
      return;
    }

    storage.setJSON(LS.MODELS_CACHE, freeModels);
    populateModelSelect(freeModels);
    notify(`✓ ${freeModels.length} modelos gratuitos cargados`, 'success');

  } catch (err) {
    console.error('[EL] fetchModels:', err);
    notify(`Error: ${err.message}`, 'error');
  } finally {
    dom.refreshModelsBtn.disabled    = false;
    dom.refreshModelsBtn.textContent = '🔄';
  }
}

function populateModelSelect(models) {
  dom.modelSelect.innerHTML = '';
  models.forEach(({ id, name }) => {
    const opt = document.createElement('option');
    opt.value       = id;
    opt.textContent = name;
    dom.modelSelect.appendChild(opt);
  });
  const saved = storage.get(LS.MODEL);
  if (saved && [...dom.modelSelect.options].some(o => o.value === saved)) {
    dom.modelSelect.value = saved;
  } else {
    storage.set(LS.MODEL, dom.modelSelect.value);
  }
}


/* ═══════════════════════════════════════════════════
   9. ANALYSIS
═══════════════════════════════════════════════════ */

/**
 * Instrucciones específicas por nivel CEFR que se insertan
 * en el system prompt para calibrar el vocabulario de la IA.
 */
function getLevelInstructions(level) {
  const map = {
    A1: `
TARGET LEVEL: A1 (absolute beginner).
- "traduccion": single, most common Spanish word only.
- "definicion_en": MAXIMUM 1 sentence. Use only the simplest, most basic words
  (words a 6-year-old native speaker knows). No complex grammar or rare words.
- "sinonimos": only include synonyms if they are equally basic.
- "ejemplos": 2 sentences of 4–7 words each. Topic must be daily life:
  food, family, colors, school, home, greetings, numbers.`,

    A2: `
TARGET LEVEL: A2 (elementary).
- "traduccion": most common Spanish translation.
- "definicion_en": 1–2 simple sentences with common vocabulary.
- "ejemplos": 2 sentences of 7–11 words each. Topics: shopping, travel basics,
  hobbies, daily routines, simple descriptions.`,

    B1: `
TARGET LEVEL: B1 (intermediate).
- "traduccion": natural, common Spanish translation.
- "definicion_en": 2 sentences with intermediate vocabulary.
  Mention the word's typical context or register.
- "ejemplos": 2 sentences of 10–14 words each. Include work, social situations,
  travel, opinions, and common news topics.`,

    B2: `
TARGET LEVEL: B2 (upper-intermediate).
- "traduccion": nuanced translation; note any register difference from Spanish.
- "definicion_en": 2–3 sentences. Distinguish the word from near-synonyms;
  note whether it is formal, informal, or neutral.
- "ejemplos": 2 sentences of 12–17 words each in professional, academic,
  or abstract contexts.`,

    C1: `
TARGET LEVEL: C1 (advanced).
- "traduccion": precise Spanish equivalent; flag if no single-word translation exists.
- "definicion_en": comprehensive definition covering connotation, register
  (colloquial / neutral / formal / academic), and at least one typical collocation.
- "ejemplos": 2 sophisticated sentences of 15–20 words in professional, literary,
  or technical contexts.`,

    C2: `
TARGET LEVEL: C2 (mastery / near-native).
- "traduccion": most accurate Spanish equivalent with any pragmatic nuance.
- "definicion_en": authoritative definition: etymology hints where relevant,
  register spectrum, pragmatic function, key collocations, and usage notes.
- "ejemplos": 2 complex, idiomatic sentences of 18–25 words suitable for
  academic writing, literary prose, or high-level journalism.`,
  };
  return map[level] || map['B1'];
}

function buildSystemPrompt(level) {
  return `You are a professional linguistic tokenizer for American English learners.

CRITICAL OUTPUT RULES:
1. Your ENTIRE response must be ONE valid JSON object. Nothing else.
2. No markdown, no code fences (\`\`\`), no explanations, no preamble.
3. Start with { and end with }.

TASK:
Analyze the user's English text. Tokenize EVERY word and multi-word expression preserving original order.
- Identify phrasal verbs and fixed idioms → group as ONE "compound" token (full phrase as texto_original).
- Include ALL words: articles, prepositions, conjunctions, particles, interjections.
- Do NOT list the individual words of a compound separately.

${getLevelInstructions(level)}

JSON SCHEMA (all fields required for every token):
{
  "tokens": [
    {
      "texto_original": "word or phrase exactly as written in the text",
      "tipo": "single" | "compound",
      "categoria": "verbo" | "sustantivo" | "adjetivo" | "adverbio" |
                   "phrasal_verb" | "preposición" | "conjunción" | "pronombre" |
                   "artículo" | "determinante" | "interjección" | "auxiliar",
      "traduccion": "Spanish translation",
      "definicion_en": "English definition",
      "sinonimos": ["syn1", "syn2"],
      "ejemplos": ["Example sentence 1.", "Example sentence 2."]
    }
  ]
}

Respond ONLY with the JSON object.`;
}

function parseModelResponse(raw) {
  if (!raw || typeof raw !== 'string') throw new Error('Respuesta vacía del modelo.');

  let clean = raw.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  // If model added prose, extract the JSON object
  const start = clean.indexOf('{');
  const end   = clean.lastIndexOf('}');
  if (start === -1 || end === -1)
    throw new Error('La respuesta no contiene un objeto JSON válido.');

  const parsed = JSON.parse(clean.slice(start, end + 1));
  if (!Array.isArray(parsed.tokens))
    throw new Error('El JSON devuelto no contiene un array "tokens".');

  return parsed.tokens;
}

async function analyzeText() {
  const apiKey = storage.get(LS.API_KEY);
  const model  = dom.modelSelect.value;
  const text   = dom.textInput.value.trim();
  const level  = dom.levelSelect.value;

  if (!apiKey) { notify('Ingresa tu API Key primero.',                      'error'); return; }
  if (!model)  { notify('Carga y selecciona un modelo (botón 🔄).',         'error'); return; }
  if (!text)   { notify('Escribe o pega un texto en inglés para analizar.', 'error'); return; }
  if (text.length > 3500) {
    notify('El texto es demasiado largo (máx. 3 500 caracteres).', 'warning');
    return;
  }

  dom.analyzeBtn.disabled  = true;
  dom.analyzeBtn.innerHTML = '<span aria-hidden="true">⏳</span>&ensp;Analizando…';
  dom.renderedText.innerHTML = '<div class="loading">🔍 Consultando la IA…</div>';
  dom.legend.hidden = true;
  resetHighlightState();

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
        temperature: 0.15,
        messages: [
          { role: 'system', content: buildSystemPrompt(level) },
          { role: 'user',   content: text },
        ],
      }),
    });

    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try { const e = await res.json(); msg = e?.error?.message || msg; } catch {}
      throw new Error(msg);
    }

    const data   = await res.json();
    const raw    = data?.choices?.[0]?.message?.content;
    const tokens = parseModelResponse(raw);

    if (!tokens.length) throw new Error('El modelo devolvió una lista de tokens vacía.');

    state.tokens = tokens;
    renderTokens(tokens, text);
    dom.legend.hidden = false;
    addHistoryEntry({ text, level, model, tokens });

    // Mostrar chat y limpiar historial del texto anterior
    dom.chatSection.hidden   = false;
    dom.chatHistory.innerHTML = '';
    chatHistory               = [];
    dom.chatInput.value       = '';
    dom.chatSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  } catch (err) {
    console.error('[EL] analyzeText:', err);
    dom.renderedText.innerHTML =
      `<div class="error-msg">⚠️ ${escHtml(err.message)}<br>
       <small>Revisa tu API Key, el modelo elegido y tu conexión a internet.</small></div>`;
    notify(`Error: ${err.message}`, 'error');
  } finally {
    dom.analyzeBtn.disabled  = false;
    dom.analyzeBtn.innerHTML = '<span aria-hidden="true">🔍</span>&ensp;Analizar Texto';
  }
}


/* ═══════════════════════════════════════════════════
   10. TOKENS — renderizado
═══════════════════════════════════════════════════ */

function catClass(categoria) {
  if (!categoria) return 'cat-default';
  return CAT_CLASS[categoria.toLowerCase().trim()] ?? 'cat-default';
}

/**
 * Alinea los tokens devueltos por la IA contra el texto original escrito por el usuario,
 * buscando cada texto_original como substring (case-insensitive) a partir de donde quedó
 * el cursor de la búsqueda anterior. Todo lo que queda "entre medio" de dos tokens
 * (puntuación, espacios, comillas) se conserva literal en un fragmento de tipo 'gap'.
 *
 * Esto hace que el resultado NO dependa de que la IA tokenice signos de puntuación
 * (cosa que el prompt actual no le pide y el modelo normalmente omite): el texto
 * mostrado siempre es fiel al original, sin importar qué devuelva el modelo.
 */
function buildTokenSpans(tokens, sourceText) {
  const spans  = [];
  const source = sourceText || '';
  const lowerSource = source.toLowerCase();
  let cursor = 0;

  tokens.forEach((token, i) => {
    const target = (token.texto_original || '').toLowerCase();
    const idx = target ? lowerSource.indexOf(target, cursor) : -1;

    if (idx === -1) {
      // No se encontró en el texto original (caso raro, p. ej. la IA corrigió algo).
      // Se inserta tal cual sin mover el cursor, para no desalinear los tokens siguientes.
      if (spans.length) spans.push({ type: 'gap', text: ' ' });
      spans.push({ type: 'token', token, index: i, text: token.texto_original || '' });
      return;
    }

    if (idx > cursor) {
      spans.push({ type: 'gap', text: source.slice(cursor, idx) });
    }

    const end = idx + target.length;
    spans.push({ type: 'token', token, index: i, text: source.slice(idx, end) });
    cursor = end;
  });

  if (cursor < source.length) {
    spans.push({ type: 'gap', text: source.slice(cursor) });
  }

  return spans;
}

/**
 * @param {Array} tokens     tokens devueltos por la IA (o restaurados del historial)
 * @param {string} sourceText texto original exacto (con puntuación) que se está analizando
 */
function renderTokens(tokens, sourceText) {
  // Limpiar estado de resaltado anterior
  resetHighlightState();

  const parts = buildTokenSpans(tokens, sourceText);
  const frag  = document.createDocumentFragment();

  parts.forEach(part => {
    if (part.type === 'gap') {
      if (part.text) frag.appendChild(document.createTextNode(part.text));
      return;
    }

    const { token, index, text } = part;
    const span = document.createElement('span');

    // Clase base: 'token' + identificador de categoría + compound si aplica.
    // La categoría NO aplica color por defecto; solo identifica el grupo.
    span.className = [
      'token',
      catClass(token.categoria),
      token.tipo === 'compound' ? 'compound' : '',
    ].filter(Boolean).join(' ');

    span.textContent = text;          // texto exacto tal como aparece en el original
    span.dataset.idx = index;
    span.title       = token.traduccion || '';   // tooltip rápido

    span.setAttribute('role',     'button');
    span.setAttribute('tabindex', '0');
    span.setAttribute('aria-label',
      `${token.texto_original} — ${token.categoria || ''}: ${token.traduccion || ''}`);

    span.addEventListener('click',   () => handleTokenClick(index));
    span.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleTokenClick(index); }
    });

    frag.appendChild(span);
  });

  dom.renderedText.innerHTML = '';
  dom.renderedText.appendChild(frag);

  // Re-aplicar filtros de categoría si había alguno activo (raro, pero defensivo)
  applyFilterClasses();
}


/* ═══════════════════════════════════════════════════
   11. WORD HIGHLIGHT — toggle de ocurrencias individuales
═══════════════════════════════════════════════════ */

/**
 * Clic en un token:
 * - Si ya era la palabra activa → toggle OFF (quita .is-active, cierra modal).
 * - Si es otra palabra (o primera vez) → quita highlight anterior,
 *   resalta TODAS las ocurrencias exactas y abre el modal.
 */
function handleTokenClick(index) {
  const token      = state.tokens[index];
  const clickedTxt = token.texto_original.toLowerCase();

  if (state.activeWordText === clickedTxt) {
    // Toggle OFF
    state.activeWordText = null;
    clearWordHighlights();
    closeModal();
  } else {
    // Nueva selección
    clearWordHighlights();
    state.activeWordText = clickedTxt;
    highlightAllOccurrences(clickedTxt);
    openModal(index);
  }
}

function clearWordHighlights() {
  dom.renderedText.querySelectorAll('.token.is-active').forEach(el => {
    el.classList.remove('is-active');
  });
}

/**
 * Añade .is-active a todos los <span class="token"> cuyo texto
 * coincida exactamente (case-insensitive) con la palabra dada.
 */
function highlightAllOccurrences(lowerText) {
  dom.renderedText.querySelectorAll('.token').forEach(el => {
    if (el.textContent.trim().toLowerCase() === lowerText) {
      el.classList.add('is-active');
    }
  });
}

/**
 * Limpia TODO el estado de resaltado (usado al analizar nuevo texto).
 */
function resetHighlightState() {
  state.activeWordText = null;
  state.activeCategoryFilters.clear();
  dom.renderedText.querySelectorAll('.token').forEach(el => {
    el.classList.remove('is-active', 'cat-filter-active');
  });
  document.querySelectorAll('.legend-chip[data-cat]').forEach(btn => {
    btn.classList.remove('legend-active');
  });
}


/* ═══════════════════════════════════════════════════
   12. CAT FILTER — legend buttons (toggles de categoría)
═══════════════════════════════════════════════════ */

/**
 * Activa o desactiva el filtro de una categoría gramatical.
 * Los tokens de esa categoría reciben/pierden .cat-filter-active.
 * No interfiere con .is-active de selecciones individuales.
 */
function toggleCategoryFilter(cls) {
  if (state.activeCategoryFilters.has(cls)) {
    state.activeCategoryFilters.delete(cls);
  } else {
    state.activeCategoryFilters.add(cls);
  }
  applyFilterClasses();
  syncLegendButtons();
}

/** Aplica/quita .cat-filter-active en todos los tokens según los filtros activos */
function applyFilterClasses() {
  dom.renderedText.querySelectorAll('.token').forEach(el => {
    if (state.activeCategoryFilters.size === 0) {
      el.classList.remove('cat-filter-active');
    } else {
      const belongs = [...state.activeCategoryFilters].some(cls => el.classList.contains(cls));
      el.classList.toggle('cat-filter-active', belongs);
    }
  });
}

/** Sincroniza el estado visual de los botones de la leyenda */
function syncLegendButtons() {
  document.querySelectorAll('.legend-chip[data-cat]').forEach(btn => {
    btn.classList.toggle('legend-active', state.activeCategoryFilters.has(btn.dataset.cat));
  });
}

function initLegendFilters() {
  document.querySelectorAll('.legend-chip[data-cat]').forEach(btn => {
    btn.addEventListener('click', () => toggleCategoryFilter(btn.dataset.cat));
  });
}


/* ═══════════════════════════════════════════════════
   13. MODAL
═══════════════════════════════════════════════════ */


/* ═══════════════════════════════════════════════════
   13-A. PRONUNCIACIÓN — Free Dictionary API
═══════════════════════════════════════════════════ */

let _currentAudio = null;

async function loadPronunciation(word) {
  dom.modalPronounceBtn.hidden = true;
  dom.modalPhonetic.textContent = '';
  dom.modalPronounceBtn.classList.remove('is-loading', 'has-error', 'is-playing');
  delete dom.modalPronounceBtn.dataset.audio;

  const cleanWord = word.trim().toLowerCase().split(/\s+/)[0];
  if (!cleanWord) return;

  dom.modalPronounceBtn.classList.add('is-loading');

  try {
    const res = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(cleanWord)}`
    );
    if (!res.ok) throw new Error('not found');
    const data  = await res.json();
    const entry = data[0];

    const phoneticWithAudio = entry.phonetics?.find(p => p.audio && p.audio.trim() !== '');
    const anyPhonetic       = entry.phonetics?.find(p => p.text);
    const phonetic          = phoneticWithAudio || anyPhonetic;

    if (phonetic?.text) {
      dom.modalPhonetic.textContent = phonetic.text;
    }

    if (phoneticWithAudio?.audio) {
      dom.modalPronounceBtn.dataset.audio = phoneticWithAudio.audio;
      dom.modalPronounceBtn.hidden = false;
    }
  } catch {
    // silencioso
  } finally {
    dom.modalPronounceBtn.classList.remove('is-loading');
  }
}

function playPronunciation() {
  const url = dom.modalPronounceBtn.dataset.audio;
  if (!url) return;
  if (_currentAudio) {
    _currentAudio.pause();
    _currentAudio.currentTime = 0;
  }
  _currentAudio = new Audio(url);
  dom.modalPronounceBtn.classList.add('is-playing');
  _currentAudio.play().catch(() => notify('No se pudo reproducir el audio.', 'warning'));
  _currentAudio.addEventListener('ended', () => {
    dom.modalPronounceBtn.classList.remove('is-playing');
    _currentAudio = null;
  });
}

function openModal(index) {
  const token = state.tokens[index];
  if (!token) return;
  state.activeToken = token;

  // Auto-guardar en diccionario
  addToDictionary(token);

  // Poblar campos
  dom.modalWordTitle.textContent   = token.texto_original;

  // Pronunciación en paralelo
  loadPronunciation(token.texto_original);
  dom.modalCatBadge.textContent    = token.categoria || '';
  dom.modalTranslation.textContent = token.traduccion    || '—';
  dom.modalDefinition.textContent  = token.definicion_en || '—';

  // Sinónimos
  dom.modalSynonyms.innerHTML = '';
  const syns = Array.isArray(token.sinonimos) ? token.sinonimos : [];
  if (syns.length) {
    syns.forEach(s => {
      const tag = document.createElement('span');
      tag.className = 'syn-tag';
      tag.textContent = s;
      dom.modalSynonyms.appendChild(tag);
    });
  } else {
    dom.modalSynonyms.textContent = '—';
  }

  // Ejemplos
  dom.modalExamples.innerHTML = '';
  const exs = Array.isArray(token.ejemplos) ? token.ejemplos : [];
  (exs.length ? exs : ['—']).forEach(ex => {
    const li = document.createElement('li');
    li.textContent = ex;
    dom.modalExamples.appendChild(li);
  });

  // Color del encabezado según categoría
  dom.modalHead.className = `modal-head ${catClass(token.categoria)}`;

  dom.wordModal.classList.add('active');
  dom.wordModal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  dom.modalClose.focus();
}

function closeModal() {
  if (!dom.wordModal.classList.contains('active')) return;
  dom.wordModal.classList.remove('active');
  dom.wordModal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  // Limpiar resaltado individual al cerrar el modal
  state.activeWordText = null;
  clearWordHighlights();
  state.activeToken = null;
}


/* ═══════════════════════════════════════════════════
   14. DICTIONARY
═══════════════════════════════════════════════════ */

function getDictionary()   { return storage.getJSON(LS.DICTIONARY) || []; }
function saveDictionary(d) { storage.setJSON(LS.DICTIONARY, d); updateDictBadge(d.length); }

/**
 * Añade token al diccionario (sin duplicados por texto_original).
 * @returns {boolean} true si fue añadido, false si ya existía.
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

function removeFromDictionary(word) {
  saveDictionary(getDictionary().filter(t => t.texto_original !== word));
  renderDictionary();
}

function updateDictBadge(n) {
  dom.dictBadge.textContent = n > 0 ? String(n) : '';
}

function openDictionary() {
  renderDictionary();
  closeHistory();
  dom.dictionaryPanel.classList.add('active');
  dom.dictionaryPanel.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  dom.dictionaryClose.focus();
}

function closeDictionary() {
  dom.dictionaryPanel.classList.remove('active');
  dom.dictionaryPanel.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

function renderDictionary() {
  const dict = getDictionary();
  dom.dictionaryList.innerHTML = '';

  if (!dict.length) {
    dom.dictionaryList.innerHTML =
      '<p class="empty-dict">Tu diccionario está vacío.<br>' +
      'Haz clic en cualquier palabra del texto para guardarla automáticamente.</p>';
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
        <button class="dict-remove" data-word="${escAttr(token.texto_original)}"
                aria-label="Eliminar ${escHtml(token.texto_original)}">✕</button>
      </div>
      <p class="dict-translation">${escHtml(token.traduccion || '—')}</p>
      <p class="dict-definition">${escHtml(token.definicion_en || '')}</p>
      ${synsHTML}`;

    card.querySelector('.dict-remove').addEventListener('click', e => {
      removeFromDictionary(e.currentTarget.dataset.word);
    });

    dom.dictionaryList.appendChild(card);
  });
}


/* ═══════════════════════════════════════════════════
   14-A-2. DICTIONARY — exportar / importar / vaciar
═══════════════════════════════════════════════════ */

/** Descarga el diccionario completo como archivo .json */
function exportDictionary() {
  const dict = getDictionary();
  if (!dict.length) { notify('El diccionario está vacío, no hay nada que exportar.', 'warning'); return; }

  const payload = {
    app:        'EnglishLens',
    type:       'dictionary-export',
    version:    1,
    exportedAt: new Date().toISOString(),
    entries:    dict,
  };

  const blob  = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url   = URL.createObjectURL(blob);
  const a     = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');

  a.href     = url;
  a.download = `englishlens-diccionario-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  notify(`✓ ${dict.length} palabra${dict.length !== 1 ? 's' : ''} exportada${dict.length !== 1 ? 's' : ''}.`, 'success');
}

/** Valida que una entrada del diccionario tiene la forma mínima esperada */
function isValidDictEntry(e) {
  return !!e && typeof e === 'object'
    && typeof e.texto_original === 'string' && e.texto_original.trim() !== '';
}

/**
 * Importa un archivo .json (exportado previamente) y fusiona con el diccionario actual.
 * No genera duplicados (compara por texto_original).
 */
function importDictionaryFile(file) {
  if (!file) return;

  const reader = new FileReader();
  reader.onerror = () => notify('No se pudo leer el archivo.', 'error');

  reader.onload = () => {
    let payload;
    try {
      payload = JSON.parse(reader.result);
    } catch {
      notify('El archivo no es un JSON válido.', 'error');
      return;
    }

    // Acepta tanto array plano como el objeto envoltorio { entries: [...] }
    const incoming = Array.isArray(payload)           ? payload
                   : Array.isArray(payload?.entries)  ? payload.entries
                   : null;

    if (!incoming) {
      notify('El archivo no tiene el formato esperado de diccionario.', 'error');
      return;
    }

    const validIncoming = incoming.filter(isValidDictEntry).map(e => ({
      texto_original: e.texto_original.trim(),
      tipo:           e.tipo           || 'single',
      categoria:      e.categoria      || '',
      traduccion:     e.traduccion     || '',
      definicion_en:  e.definicion_en  || '',
      sinonimos:      Array.isArray(e.sinonimos)  ? e.sinonimos  : [],
      ejemplos:       Array.isArray(e.ejemplos)   ? e.ejemplos   : [],
    }));

    if (!validIncoming.length) {
      notify('El archivo no contenía entradas válidas de diccionario.', 'error');
      return;
    }

    const current    = getDictionary();
    const seenWords  = new Set(current.map(e => e.texto_original));
    const merged     = current.slice();
    let   addedCount = 0;

    validIncoming.forEach(e => {
      if (!seenWords.has(e.texto_original)) {
        merged.push(e);
        seenWords.add(e.texto_original);
        addedCount++;
      }
    });

    saveDictionary(merged);
    renderDictionary();

    if (addedCount === 0) {
      notify('No se importaron palabras nuevas (todas ya existían).', 'info');
    } else {
      notify(
        `✓ ${addedCount} palabra${addedCount !== 1 ? 's' : ''} importada${addedCount !== 1 ? 's' : ''}.`,
        'success'
      );
    }
  };

  reader.readAsText(file);
}

/** Vacía el diccionario completo tras confirmación */
function clearDictionary() {
  if (!getDictionary().length) return;
  if (!window.confirm('¿Vaciar todo el diccionario? Esta acción no se puede deshacer.')) return;
  saveDictionary([]);
  renderDictionary();
  notify('Diccionario vaciado.', 'success');
}


/* ═══════════════════════════════════════════════════
   14-B. HISTORY — guardar y recuperar análisis anteriores
═══════════════════════════════════════════════════ */

/**
 * Lee el límite máximo de entradas configurado por el usuario.
 * Siempre acotado por HISTORY_MAX_HARD, sin importar lo guardado en localStorage.
 */
function getHistoryLimit() {
  const saved = parseInt(storage.get(LS.HISTORY_LIMIT), 10);
  const valid = HISTORY_LIMIT_OPTIONS.includes(saved) ? saved : HISTORY_LIMIT_DEFAULT;
  return Math.min(valid, HISTORY_MAX_HARD);
}

function setHistoryLimit(n) {
  storage.set(LS.HISTORY_LIMIT, String(n));
}

function getHistoryList() { return storage.getJSON(LS.HISTORY) || []; }

/**
 * Intenta persistir la lista en localStorage.
 * A diferencia de storage.setJSON, expone si falló (p. ej. cuota excedida)
 * para poder recortar la lista y reintentar en lugar de perder todo en silencio.
 */
function trySaveHistory(list) {
  try {
    localStorage.setItem(LS.HISTORY, JSON.stringify(list));
    updateHistoryBadge(list.length);
    return true;
  } catch {
    return false;
  }
}

function makeHistoryId() {
  return `h_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function updateHistoryBadge(n) {
  dom.historyBadge.textContent = n > 0 ? String(n) : '';
}

/**
 * Guarda un análisis completo (texto + tokens) al finalizar analyzeText().
 * Si el almacenamiento está casi lleno, descarta las entradas más antiguas
 * hasta que la entrada nueva quepa, en vez de fallar silenciosamente.
 */
function addHistoryEntry({ text, level, model, tokens }) {
  let list = getHistoryList();
  const entry = {
    id:        makeHistoryId(),
    timestamp: Date.now(),
    text,
    level,
    model,
    tokens,
  };

  list.unshift(entry);
  list = list.slice(0, getHistoryLimit());

  while (list.length > 0 && !trySaveHistory(list)) {
    list.pop(); // descarta la entrada más antigua y reintenta
  }

  if (list.length === 0 || list[0].id !== entry.id) {
    notify('No se pudo guardar en el historial: almacenamiento lleno.', 'error');
  }

  if (dom.historyPanel.classList.contains('active')) renderHistory();
}

function removeHistoryEntry(id) {
  const list = getHistoryList().filter(e => e.id !== id);
  trySaveHistory(list);
  renderHistory();
}

function clearHistory() {
  if (!getHistoryList().length) return;
  if (!window.confirm('¿Vaciar todo el historial? Esta acción no se puede deshacer.')) return;
  trySaveHistory([]);
  renderHistory();
  notify('Historial vaciado.', 'success');
}

function formatHistoryDate(ts) {
  try {
    return new Intl.DateTimeFormat('es-CO', {
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit',
    }).format(new Date(ts));
  } catch {
    return '';
  }
}

function truncateText(text, max = 110) {
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max).trim()}…` : text;
}

function renderHistory() {
  const list = getHistoryList();
  dom.historyList.innerHTML = '';
  updateHistoryBadge(list.length);

  if (!list.length) {
    dom.historyList.innerHTML =
      '<p class="empty-dict">Tu historial está vacío.<br>' +
      'Cada análisis exitoso se guardará aquí automáticamente.</p>';
    return;
  }

  list.forEach(entry => {
    const modelLabel = (entry.model || '').split('/').pop() || '—';

    const card = document.createElement('article');
    card.className = 'dict-card history-card';
    card.setAttribute('role', 'listitem');

    card.innerHTML = `
      <div class="dict-card-head">
        <span class="history-level-badge">${escHtml(entry.level || '—')}</span>
        <span class="dict-cat-label" title="${escAttr(entry.model || '')}">${escHtml(modelLabel)}</span>
        <span class="history-date">${escHtml(formatHistoryDate(entry.timestamp))}</span>
        <button class="dict-remove" data-id="${escAttr(entry.id)}"
                aria-label="Eliminar esta entrada del historial">✕</button>
      </div>
      <p class="history-preview">"${escHtml(truncateText(entry.text))}"</p>
      <div class="history-card-foot">
        <span class="history-token-count">${(entry.tokens || []).length} elementos analizados</span>
        <button class="history-load-btn" data-id="${escAttr(entry.id)}">▶ Cargar</button>
      </div>`;

    card.querySelector('.dict-remove').addEventListener('click', e => {
      e.stopPropagation();
      removeHistoryEntry(e.currentTarget.dataset.id);
    });
    card.querySelector('.history-load-btn').addEventListener('click', e => {
      e.stopPropagation();
      loadHistoryEntry(e.currentTarget.dataset.id);
    });

    dom.historyList.appendChild(card);
  });
}

/**
 * Restaura un análisis guardado SIN volver a llamar a la IA:
 * repinta los tokens ya generados directamente desde el historial.
 */
function loadHistoryEntry(id) {
  const entry = getHistoryList().find(e => e.id === id);
  if (!entry) { notify('Esta entrada ya no existe en el historial.', 'error'); return; }

  dom.textInput.value = entry.text;
  dom.textInput.dispatchEvent(new Event('input'));

  if (entry.level && [...dom.levelSelect.options].some(o => o.value === entry.level)) {
    dom.levelSelect.value = entry.level;
    storage.set(LS.LEVEL, entry.level);
  }

  state.tokens = entry.tokens;
  renderTokens(entry.tokens, entry.text);
  dom.legend.hidden = false;

  // Reiniciar chat para el texto restaurado (igual que tras un análisis nuevo)
  dom.chatSection.hidden    = false;
  dom.chatHistory.innerHTML = '';
  chatHistory                = [];
  dom.chatInput.value        = '';

  closeHistory();
  dom.renderedText.scrollIntoView({ behavior: 'smooth', block: 'start' });
  notify('✓ Análisis restaurado desde el historial.', 'success');
}

function openHistory() {
  renderHistory();
  closeDictionary();
  dom.historyPanel.classList.add('active');
  dom.historyPanel.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  dom.historyClose.focus();
}

function closeHistory() {
  dom.historyPanel.classList.remove('active');
  dom.historyPanel.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

/** Descarga el historial completo como archivo .json */
function exportHistory() {
  const list = getHistoryList();
  if (!list.length) { notify('No hay historial para exportar.', 'warning'); return; }

  const payload = {
    app:        'EnglishLens',
    type:       'history-export',
    version:    1,
    exportedAt: new Date().toISOString(),
    entries:    list,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');

  a.href     = url;
  a.download = `englishlens-historial-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  notify(`✓ ${list.length} entrada${list.length !== 1 ? 's' : ''} exportada${list.length !== 1 ? 's' : ''}.`, 'success');
}

function isValidHistoryEntry(e) {
  return !!e && typeof e === 'object'
    && typeof e.text === 'string' && e.text.trim() !== ''
    && Array.isArray(e.tokens);
}

/** Importa un archivo .json exportado previamente y fusiona con el historial actual (sin duplicados por id). */
function importHistoryFile(file) {
  if (!file) return;

  const reader = new FileReader();
  reader.onerror = () => notify('No se pudo leer el archivo.', 'error');

  reader.onload = () => {
    let payload;
    try {
      payload = JSON.parse(reader.result);
    } catch {
      notify('El archivo no es un JSON válido.', 'error');
      return;
    }

    const incoming = Array.isArray(payload)          ? payload
                    : Array.isArray(payload?.entries) ? payload.entries
                    : null;

    if (!incoming) {
      notify('El archivo no tiene el formato esperado de historial.', 'error');
      return;
    }

    const validIncoming = incoming.filter(isValidHistoryEntry).map(e => ({
      id:        typeof e.id === 'string' && e.id ? e.id : makeHistoryId(),
      timestamp: Number.isFinite(e.timestamp) ? e.timestamp : Date.now(),
      text:      e.text,
      level:     e.level || '',
      model:     e.model || '',
      tokens:    e.tokens,
    }));

    if (!validIncoming.length) {
      notify('El archivo no contenía entradas válidas.', 'error');
      return;
    }

    const current  = getHistoryList();
    const seenIds  = new Set(current.map(e => e.id));
    const merged   = current.slice();
    let addedCount = 0;

    validIncoming.forEach(e => {
      if (!seenIds.has(e.id)) {
        merged.push(e);
        seenIds.add(e.id);
        addedCount++;
      }
    });

    merged.sort((a, b) => b.timestamp - a.timestamp);

    const limit = getHistoryLimit();
    let trimmed = merged.slice(0, limit);
    while (trimmed.length > 0 && !trySaveHistory(trimmed)) {
      trimmed.pop();
    }

    renderHistory();

    if (addedCount === 0) {
      notify('No se importaron entradas nuevas (ya existían).', 'info');
    } else {
      const discarded = merged.length - trimmed.length;
      const suffix = discarded > 0
        ? ` (se descartaron ${discarded} por el límite de ${limit}).`
        : '.';
      notify(
        `✓ ${addedCount} entrada${addedCount !== 1 ? 's' : ''} importada${addedCount !== 1 ? 's' : ''}${suffix}`,
        'success'
      );
    }
  };

  reader.readAsText(file);
}

function initHistory() {
  updateHistoryBadge(getHistoryList().length);
  dom.historyLimitSelect.value = String(getHistoryLimit());

  dom.historyBtn.addEventListener('click', openHistory);
  dom.historyClose.addEventListener('click', closeHistory);
  dom.historyPanel.addEventListener('click', e => {
    if (e.target === dom.historyPanel) closeHistory();
  });

  dom.historyLimitSelect.addEventListener('change', () => {
    const n = parseInt(dom.historyLimitSelect.value, 10);
    setHistoryLimit(n);

    const list = getHistoryList();
    if (list.length > n) {
      trySaveHistory(list.slice(0, n));
      renderHistory();
      notify(`Límite actualizado: se conservaron las ${n} entradas más recientes.`, 'info');
    } else {
      notify('Límite de historial actualizado.', 'success');
    }
  });

  dom.historyExportBtn.addEventListener('click', exportHistory);
  dom.historyImportBtn.addEventListener('click', () => dom.historyImportFile.click());
  dom.historyImportFile.addEventListener('change', () => {
    importHistoryFile(dom.historyImportFile.files?.[0]);
    dom.historyImportFile.value = '';
  });

  dom.historyClearBtn.addEventListener('click', clearHistory);
}


/* ═══════════════════════════════════════════════════
   UTILITIES
═══════════════════════════════════════════════════ */

function escHtml(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function escAttr(s) {
  return String(s).replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}


/* ═══════════════════════════════════════════════════
   16. CHAT — consultas libres sobre el texto analizado
═══════════════════════════════════════════════════ */

/** Historial de conversación para el contexto multi-turno del chat */
let chatHistory = [];

/** Construye el system prompt del chat incluyendo el texto original como contexto */
function buildChatPrompt() {
  const level = dom.levelSelect.value;
  const text  = dom.textInput.value.trim();

  // Vocabulario clave identificado (hasta 25 tokens relevantes)
  const keyVocab = state.tokens
    .filter(t => ['verbo','sustantivo','adjetivo','phrasal_verb','phrasal verb','phrasal'].includes(
      (t.categoria || '').toLowerCase()))
    .slice(0, 25)
    .map(t => `"${t.texto_original}" (${t.categoria}: ${t.traduccion})`)
    .join('; ');

  return `You are an expert American English language tutor. The student's CEFR level is ${level}.

They are studying this text:
"""
${text}
"""

Key vocabulary identified in the text: ${keyVocab || '(not yet identified)'}.

INSTRUCTIONS:
- Answer ALL questions in SPANISH, clearly and concisely.
- Reference the text and its vocabulary when relevant.
- Adapt grammar explanations to level ${level}.
- Keep answers focused; avoid unnecessary padding.
- If asked about a word from the text, explain it in that specific context.`;
}

/**
 * Añade un mensaje al historial visual del chat.
 * Devuelve el elemento .chat-bubble para poder actualizarlo después (caso loading).
 */
function appendChatMsg(content, role, isLoading = false) {
  const msg    = document.createElement('div');
  msg.className = `chat-msg chat-msg--${role}`;

  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble';

  if (isLoading) {
    const dots = document.createElement('div');
    dots.className = 'chat-typing-dots';
    dots.innerHTML = '<span></span><span></span><span></span>';
    bubble.appendChild(dots);
  } else if (role === 'ai' && typeof marked !== 'undefined') {
    bubble.innerHTML = marked.parse(content);
  } else {
    bubble.textContent = content;
  }

  msg.appendChild(bubble);
  dom.chatHistory.appendChild(msg);
  // Auto-scroll al último mensaje
  dom.chatHistory.scrollTop = dom.chatHistory.scrollHeight;
  return bubble;
}

/** Envía la pregunta del usuario a OpenRouter con el contexto del texto */
async function sendChatMessage() {
  const question = dom.chatInput.value.trim();
  if (!question) return;

  const apiKey = storage.get(LS.API_KEY);
  const model  = dom.modelSelect.value;
  if (!apiKey || !model) {
    notify('Configura tu API Key y modelo primero.', 'error');
    return;
  }

  // Mostrar mensaje del usuario y limpiar input
  appendChatMsg(question, 'user');
  dom.chatInput.value     = '';
  dom.chatSendBtn.disabled = true;
  chatHistory.push({ role: 'user', content: question });

  // Burbuja de carga
  const loadingBubble = appendChatMsg('', 'ai', true);

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
        temperature: 0.45,
        messages: [
          { role: 'system', content: buildChatPrompt() },
          ...chatHistory,
        ],
      }),
    });

    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try { const e = await res.json(); msg = e?.error?.message || msg; } catch {}
      throw new Error(msg);
    }

    const data   = await res.json();
    const answer = data?.choices?.[0]?.message?.content;
    if (!answer) throw new Error('Respuesta vacía del modelo.');

    // Reemplazar la burbuja de carga con la respuesta real
    loadingBubble.innerHTML = '';
    if (typeof marked !== 'undefined') {
      loadingBubble.innerHTML = marked.parse(answer);
    } else {
      loadingBubble.textContent = answer;
    }
    chatHistory.push({ role: 'assistant', content: answer });
    dom.chatHistory.scrollTop = dom.chatHistory.scrollHeight;

  } catch (err) {
    console.error('[EL] chat:', err);
    loadingBubble.innerHTML = '';
    loadingBubble.textContent = `⚠️ Error: ${err.message}`;
    chatHistory.pop(); // quitar la pregunta fallida del historial
  } finally {
    dom.chatSendBtn.disabled = false;
    dom.chatInput.focus();
  }
}



/* ═══════════════════════════════════════════════════
   17. FLASHCARDS — modo repaso del diccionario
═══════════════════════════════════════════════════ */

const fc = {
  deck:    [],   // mazo actual
  index:   0,    // carta en curso
  flipped: false,
  correct: 0,    // aprendidas en esta sesión
  wrong:   [],   // entradas marcadas como "no aprendida"
};

/** Fisher-Yates shuffle (in-place) */
function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Abre el overlay con el mazo dado */
function openFlashcards(entries) {
  if (!entries || entries.length === 0) {
    notify('El diccionario está vacío. Guarda palabras primero.', 'warning');
    return;
  }
  fc.deck    = shuffleArray([...entries]);
  fc.index   = 0;
  fc.correct = 0;
  fc.wrong   = [];

  dom.fcResults.classList.add('fc-results--hidden');
  dom.fcCard.style.display = '';
  dom.fcActions.classList.add('fc-actions--hidden');
  dom.fcCardInner.classList.remove('is-flipped');
  fc.flipped = false;

  renderFcCard();
  dom.fcOverlay.classList.add('active');
  dom.fcOverlay.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  dom.fcCard.focus();
  closeDictionary();
  closeHistory();
}

/** Cierra el overlay */
function closeFlashcards() {
  dom.fcOverlay.classList.remove('active');
  dom.fcOverlay.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  dom.fcCardInner.classList.remove('is-flipped');
  fc.flipped = false;
}

/** Pinta la tarjeta en fc.index */
function renderFcCard() {
  const entry = fc.deck[fc.index];
  if (!entry) return;

  // Cortar la transición antes de resetear para evitar que el reverso
  // sea visible durante la animación de vuelta a 0deg.
  dom.fcCardInner.style.transition = 'none';
  dom.fcCardInner.classList.remove('is-flipped');
  fc.flipped = false;
  dom.fcActions.classList.add('fc-actions--hidden');

  // Restaurar la transición en el siguiente frame de pintura,
  // una vez el navegador ya aplicó el reset a 0deg sin animar.
  requestAnimationFrame(() => {
    dom.fcCardInner.style.transition = '';
  });

  // Frente — palabra en inglés
  const catClass = CAT_CLASS[(entry.categoria || '').toLowerCase()] || 'cat-default';
  dom.fcCatBadge.className   = `fc-cat-badge ${catClass}`;
  dom.fcCatBadge.textContent = entry.categoria || 'palabra';
  dom.fcWord.textContent     = entry.texto_original || '—';

  // Reverso — traducción al español + definición + ejemplo
  dom.fcTranslation.textContent = entry.traduccion  || '—';
  dom.fcDefinition.textContent  = entry.definicion_en || '';
  dom.fcExample.textContent     = (Array.isArray(entry.ejemplos) && entry.ejemplos[0])
    ? `"${entry.ejemplos[0]}"`
    : '';

  // Contador y barra
  const total = fc.deck.length;
  dom.fcCounter.textContent = `${fc.index + 1} / ${total}`;
  const pct = (fc.index / total) * 100;
  dom.fcProgressBar.style.width = `${pct}%`;
  dom.fcProgressTrack.setAttribute('aria-valuenow', Math.round(pct));
}

/** Voltea la tarjeta */
function flipFcCard() {
  if (!dom.fcResults.classList.contains('fc-results--hidden')) return;
  fc.flipped = !fc.flipped;
  dom.fcCardInner.classList.toggle('is-flipped', fc.flipped);
  dom.fcActions.classList.toggle('fc-actions--hidden', !fc.flipped);
}

/** Avanza o muestra resultados */
function nextFcCard(knew) {
  const entry = fc.deck[fc.index];
  if (knew) {
    fc.correct++;
    // Eliminar del diccionario persistente al marcar como aprendida
    removeFromDictionary(entry.texto_original);
  } else {
    fc.wrong.push(entry);
  }
  fc.index++;
  if (fc.index >= fc.deck.length) { showFcResults(); }
  else { renderFcCard(); }
}

/** Pantalla de resultados */
function showFcResults() {
  dom.fcCard.style.display = 'none';
  dom.fcActions.classList.add('fc-actions--hidden');
  dom.fcResults.classList.remove('fc-results--hidden');

  const total = fc.deck.length;
  const pct   = Math.round((fc.correct / total) * 100);
  dom.fcResultsEmoji.textContent = pct >= 80 ? '🎉' : pct >= 50 ? '💪' : '📖';
  dom.fcResultsScore.innerHTML   =
    `Aprendidas: <strong>${fc.correct} / ${total}</strong> (${pct}%)`;

  dom.fcProgressBar.style.width = '100%';
  dom.fcProgressTrack.setAttribute('aria-valuenow', 100);
  dom.fcCounter.textContent = `${total} / ${total}`;

  dom.fcRestartWrong.disabled = fc.wrong.length === 0;
  dom.fcRestartWrong.title    = fc.wrong.length === 0
    ? 'No tienes palabras fallidas 🎉'
    : `Repasar ${fc.wrong.length} palabra${fc.wrong.length !== 1 ? 's' : ''} fallida${fc.wrong.length !== 1 ? 's' : ''}`;
}

/** Inicializa todos los listeners de flashcards */
function initFlashcards() {
  // Botón en panel de diccionario
  if (dom.dictFlashcardBtn) {
    dom.dictFlashcardBtn.addEventListener('click', () => openFlashcards(getDictionary()));
  }

  // Cerrar
  dom.fcClose.addEventListener('click', closeFlashcards);
  dom.fcOverlay.addEventListener('click', e => {
    if (e.target === dom.fcOverlay) closeFlashcards();
  });

  // Voltear al clic en la tarjeta
  dom.fcCard.addEventListener('click', flipFcCard);

  // Botón voltear explícito
  dom.fcFlipBtn.addEventListener('click', e => { e.stopPropagation(); flipFcCard(); });

  // Aprendida / no aprendida
  dom.fcRight.addEventListener('click',  e => { e.stopPropagation(); nextFcCard(true);  });
  dom.fcWrong.addEventListener('click',  e => { e.stopPropagation(); nextFcCard(false); });

  // Reiniciar
  dom.fcRestartAll.addEventListener('click',   () => openFlashcards(getDictionary()));
  dom.fcRestartWrong.addEventListener('click', () => {
    if (fc.wrong.length > 0) openFlashcards(fc.wrong);
  });
}

/* ═══════════════════════════════════════════════════
   15. INIT
═══════════════════════════════════════════════════ */

function init() {

  /* ── Tema y header ── */
  initTheme();
  initHeader();

  /* ── Restaurar configuración guardada ── */
  const savedKey = storage.get(LS.API_KEY);
  if (savedKey) dom.apiKeyInput.value = savedKey;

  const savedLevel = storage.get(LS.LEVEL);
  if (savedLevel) dom.levelSelect.value = savedLevel;

  const cachedModels = storage.getJSON(LS.MODELS_CACHE);
  if (cachedModels?.length) populateModelSelect(cachedModels);

  updateDictBadge(getDictionary().length);

  /* ── Header: API Key ── */
  dom.apiKeyInput.addEventListener('blur', () => {
    storage.set(LS.API_KEY, dom.apiKeyInput.value.trim());
  });
  dom.apiKeyInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') dom.apiKeyInput.blur();
  });
  dom.toggleApiKey.addEventListener('click', () => {
    const hidden = dom.apiKeyInput.type === 'password';
    dom.apiKeyInput.type      = hidden ? 'text' : 'password';
    dom.toggleApiKey.textContent = hidden ? '🙈' : '👁';
  });

  /* ── Header: Nivel y Modelo ── */
  dom.levelSelect.addEventListener('change', () => storage.set(LS.LEVEL, dom.levelSelect.value));
  dom.modelSelect.addEventListener('change', () => storage.set(LS.MODEL, dom.modelSelect.value));
  dom.refreshModelsBtn.addEventListener('click', fetchModels);

  /* ── Input ── */
  dom.textInput.addEventListener('input', () => {
    const txt = dom.textInput.value.trim();
    const n   = txt === '' ? 0 : txt.split(/\s+/).filter(Boolean).length;
    dom.charCount.textContent = `${n} palabra${n !== 1 ? 's' : ''}`;
  });
  dom.textInput.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      analyzeText();
    }
  });
  dom.analyzeBtn.addEventListener('click', analyzeText);

  /* ── Leyenda (filtros de categoría) ── */
  initLegendFilters();

  /* ── Modal ── */
  dom.modalClose.addEventListener('click', closeModal);
  dom.modalPronounceBtn.addEventListener('click', playPronunciation);
  dom.wordModal.addEventListener('click', e => { if (e.target === dom.wordModal) closeModal(); });
  dom.openDictBtn.addEventListener('click', () => {
    closeModal();
    openDictionary();
  });

  /* ── Diccionario ── */
  dom.dictionaryBtn.addEventListener('click', openDictionary);
  dom.dictionaryClose.addEventListener('click', closeDictionary);
  dom.dictionaryPanel.addEventListener('click', e => {
    if (e.target === dom.dictionaryPanel) closeDictionary();
  });
  dom.dictExportBtn.addEventListener('click', exportDictionary);
  dom.dictImportBtn.addEventListener('click', () => dom.dictImportFile.click());
  dom.dictImportFile.addEventListener('change', () => {
    importDictionaryFile(dom.dictImportFile.files?.[0]);
    dom.dictImportFile.value = '';
  });
  dom.dictClearBtn.addEventListener('click', clearDictionary);

  /* ── Historial ── */
  initHistory();

  /* ── Chat ── */
  dom.chatSendBtn.addEventListener('click', sendChatMessage);
  dom.chatInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage();
    }
  });

  /* ── Flashcards ── */
  initFlashcards();

  /* ── Atajos de teclado globales ── */
  document.addEventListener('keydown', e => {
    // Flashcards activas → sus propios atajos
    if (dom.fcOverlay.classList.contains('active')) {
      if (e.key === 'Escape') { closeFlashcards(); return; }
      if (e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); flipFcCard(); return; }
      if (e.key === 'ArrowRight' && fc.flipped)   { e.preventDefault(); nextFcCard(true);  return; }
      if (e.key === 'ArrowLeft'  && fc.flipped)   { e.preventDefault(); nextFcCard(false); return; }
      return; // no propagar otros atajos mientras las flashcards están abiertas
    }

    if (e.key === 'Escape') {
      if (dom.wordModal.classList.contains('active'))      { closeModal();       return; }
      if (dom.dictionaryPanel.classList.contains('active')){ closeDictionary();  return; }
      if (dom.historyPanel.classList.contains('active'))   { closeHistory();     return; }
    }
    // Shift+D → abrir/cerrar diccionario
    if (e.shiftKey && e.key === 'D' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      dom.dictionaryPanel.classList.contains('active') ? closeDictionary() : openDictionary();
    }
    // Shift+H → abrir/cerrar historial
    if (e.shiftKey && e.key === 'H' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      dom.historyPanel.classList.contains('active') ? closeHistory() : openHistory();
    }
    // Shift+F → abrir/cerrar flashcards
    if (e.shiftKey && e.key === 'F' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      dom.fcOverlay.classList.contains('active') ? closeFlashcards() : openFlashcards(getDictionary());
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
