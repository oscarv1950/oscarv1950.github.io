/**
 * EnglishLens — app.js  (v3 — diccionarios locales, sin IA en el tokenizador)
 *
 * Módulos:
 *  1. CONFIG         — constantes
 *  2. STATE          — estado reactivo de la app
 *  3. DOM            — referencias cacheadas
 *  4. STORAGE        — wrappers seguros de localStorage
 *  5. NOTIFICATION   — toasts
 *  6. THEME          — modo claro / oscuro
 *  7. HEADER         — colapsar / expandir controles
 *  8. MODELS         — carga de modelos gratuitos (solo para el chat con IA)
 *  9. DICTIONARY ENGINE — carga Oxford ES-EN + NOAD + tokenizador local
 * 10. TOKENS         — renderizado interactivo
 * 11. WORD HIGHLIGHT — resaltar ocurrencias (toggle individual)
 * 12. CAT FILTER     — filtros de categoría (legend buttons)
 * 13. MODAL          — ventana de detalle (múltiples acepciones)
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
  'preposición':  'cat-prep',   'preposicion':  'cat-prep',   'preposition':  'cat-prep',  'prep':'cat-prep',
  'conjunción':   'cat-conj',   'conjuncion':   'cat-conj',   'conjunction':  'cat-conj',  'conj':'cat-conj',
  'pronombre':    'cat-pron',   'pronoun':      'cat-pron',   'pron':'cat-pron',
  'artículo':     'cat-default','articulo':     'cat-default','article':      'cat-default',
  'determinante': 'cat-default','determiner':   'cat-default',
  'interjección': 'cat-default','interjeccion': 'cat-default','interjection':  'cat-default',
  'partícula':    'cat-default','particula':    'cat-default','particle':      'cat-default',
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
  modalSenses:      $('modal-senses'),
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
  // JSON Loader modal
  loadJsonBtn:      $('load-json-btn'),
  jlModal:          $('json-loader-modal'),
  jlClose:          $('jl-close'),
  jlTab1:           $('jl-tab-1'),
  jlTab2:           $('jl-tab-2'),
  jlPanel1:         $('jl-panel-1'),
  jlPanel2:         $('jl-panel-2'),
  jlPromptBox:      $('jl-prompt-box'),
  jlCopyPrompt:     $('jl-copy-prompt'),
  jlCopyLabel:      $('jl-copy-label'),
  jlGoStep2:        $('jl-go-step2'),
  jlJsonInput:      $('jl-json-input'),
  jlFileBtn:        $('jl-file-btn'),
  jlFileInput:      $('jl-file-input'),
  jlFileName:       $('jl-file-name'),
  jlError:          $('jl-error'),
  jlBackStep1:      $('jl-back-step1'),
  jlLoadBtn:        $('jl-load-btn'),
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

/* ═══════════════════════════════════════════════════
   9. DICTIONARY ENGINE — carga y tokenizador sin IA
═══════════════════════════════════════════════════ */

const DICT_URLS = {
  oxford: 'data/oxford_es_en.json',
  noad:   'data/noad_en.json',
  pv:     'data/phrasal_verbs_index.json',
};

/** Estado del motor de diccionarios */
const dictEngine = {
  oxford:   null,   // Map<palabra_lower, entry>
  noad:     null,   // Map<palabra_lower, entry>
  pvIndex:  null,   // { raiz: [ {parts, hasGap}, ... ] }
  loading:  null,   // Promise compartida mientras carga
  ready:    false,
};

/** Carga ambos diccionarios + índice de phrasal verbs. Segura para llamar varias veces. */
function loadDictionaries() {
  if (dictEngine.ready) return Promise.resolve();
  if (dictEngine.loading) return dictEngine.loading;

  dictEngine.loading = (async () => {
    const [oxfordRes, noadRes, pvRes] = await Promise.all([
      fetch(DICT_URLS.oxford),
      fetch(DICT_URLS.noad),
      fetch(DICT_URLS.pv),
    ]);

    if (!oxfordRes.ok || !noadRes.ok || !pvRes.ok) {
      throw new Error('No se pudieron cargar los diccionarios. Revisa tu conexión.');
    }

    const [oxfordArr, noadArr, pvIndex] = await Promise.all([
      oxfordRes.json(),
      noadRes.json(),
      pvRes.json(),
    ]);

    const oxfordMap = new Map();
    oxfordArr.forEach(e => oxfordMap.set(e.word.toLowerCase(), e));

    const noadMap = new Map();
    noadArr.forEach(e => noadMap.set(e.word.toLowerCase(), e));

    // Índice inverso: forma flexionada -> palabra raíz (para no iterar 46k entradas
    // cada vez que se busca una palabra conjugada/plural).
    const inflectionIndex = new Map();
    oxfordArr.forEach(e => {
      (e.inflections || []).forEach(infl => {
        const key = infl.toLowerCase();
        if (!inflectionIndex.has(key)) inflectionIndex.set(key, e.word.toLowerCase());
      });
    });

    dictEngine.oxford   = oxfordMap;
    dictEngine.noad     = noadMap;
    dictEngine.pvIndex  = pvIndex;
    dictEngine.inflIdx  = inflectionIndex;
    dictEngine.ready    = true;
  })();

  return dictEngine.loading;
}

/** Indica si los diccionarios ya están listos (para UI no bloqueante) */
function dictionariesReady() {
  return dictEngine.ready;
}


/* ── Normalización de categorías para clave de color (compat. con CAT_CLASS) ── */
function firstSenseCategoria(senses) {
  const withCat = senses.find(s => s.categoria);
  return withCat ? withCat.categoria : '';
}

/**
 * Filtra "traducciones" que en realidad son notas gramaticales residuales
 * del parser (ej. "(+ adv compl):", "[colloq]", "past & past p get1").
 * Una traducción real nunca empieza con corchete/paréntesis-solo ni es
 * puramente una nota de uso.
 */
/**
 * Limpia una traducción del Oxford ES-EN:
 * - Devuelve null si es ruido puro (nota gramatical sin traducción real).
 * - Devuelve el texto limpio si hay traducción válida (con o sin prefijo de registro).
 * Los prefijos de registro como [frml], [liter], [colloq] se eliminan del texto
 * pero su presencia NO invalida la traducción que viene después.
 */
function cleanTranslation(text) {
  if (!text) return null;
  let t = text.trim();
  if (!t) return null;

  // Ruido puro: el contenido entero es solo una nota entre [ ] o ( ) sin texto después
  if (/^[\[(][^\])]*[\])]:?\s*$/.test(t)) return null;

  // Ruido puro: notas de forma gramatical sin traducción real
  if (/^(past|pres|pp|ger)\b/i.test(t)) return null;

  // Prefijos de registro: [frml], [liter], [colloq], etc.
  // IMPORTANTE: eliminar el prefijo pero conservar la traducción que le sigue.
  t = t.replace(/^\[(?:crit|colloq|fml|frml|liter|ant|br|us)\]\s*/i, '').trim();

  // Prefijos de concordancia gramatical: "(+ sing vb)", "(+ pl vb)", "(+ adv compl)"
  // que preceden a la traducción real.
  t = t.replace(/^\(\+[^)]+\)\s*:?\s*/i, '').trim();

  // Si tras quitar prefijos queda otra nota gramatical, es ruido
  if (/^(past|pres|pp|ger)\b/i.test(t)) return null;

  // Si tras quitar los prefijos no queda texto con letras reales, es ruido
  if (!t || !/[a-záéíóúñ]/i.test(t)) return null;

  return t;
}

/** Compatibilidad: devuelve true si la traducción es ruido puro */
function isNoiseTranslation(text) {
  return cleanTranslation(text) === null;
}


/* ── Búsqueda de una palabra en ambos diccionarios y fusión de acepciones ── */
function lookupWord(wordLower) {
  const oxEntry   = dictEngine.oxford.get(wordLower);
  const noadEntry = dictEngine.noad.get(wordLower);

  if (!oxEntry && !noadEntry) return null;

  const senses = [];

  // Oxford ES-EN aporta traduccion; NOAD aporta definicion_en.
  // Se recorren TODAS las acepciones de Oxford en su orden original (incluso
  // las que resulten "ruido" de traducción) para poder rellenar ese mismo
  // hueco con la definición de NOAD de la misma categoría, sin perder la
  // posición relativa (ej. que el verbo siga apareciendo antes que el sustantivo).
  const oxSensesAll = oxEntry ? oxEntry.senses : [];
  const noadSenses  = noadEntry ? noadEntry.senses : [];
  const usedNoad    = new Set();

  oxSensesAll.forEach(os => {
    // cleanTranslation: null si es ruido puro, o el texto limpio (sin prefijo de registro)
    const cleanedTrans = cleanTranslation(os.traduccion);
    const oxNoisy      = cleanedTrans === null;

    // Buscar una definición en inglés de NOAD con la misma categoría, aún no usada
    const matchIdx = noadSenses.findIndex((ns, i) =>
      !usedNoad.has(i) && ns.categoria === os.categoria);
    let definicion_en = '';
    let ejemplosEn = [];
    if (matchIdx !== -1) {
      usedNoad.add(matchIdx);
      definicion_en = noadSenses[matchIdx].definicion_en || '';
      ejemplosEn    = noadSenses[matchIdx].ejemplos || [];
    }

    // Si la traduccion de Oxford es ruido puro Y NOAD no aporta definición, omitir el sense.
    if (oxNoisy && !definicion_en) return;

    const ejemplos = !oxNoisy
      ? (os.ejemplos || []).map(ex => `${ex.en} — ${ex.es}`)
      : [];
    if (!ejemplos.length && ejemplosEn.length) {
      ejemplos.push(...ejemplosEn);
    }

    senses.push({
      categoria:     os.categoria    || '',
      traduccion:    cleanedTrans    || '',   // texto limpio sin prefijo de registro
      definicion_en: definicion_en,
      ejemplos:      ejemplos.slice(0, 3),
      sinonimos:     [],
    });
  });

  // Acepciones de NOAD que no tuvieron match en Oxford (categorías solo en inglés)
  noadSenses.forEach((ns, i) => {
    if (usedNoad.has(i)) return;
    if (!ns.definicion_en) return;
    senses.push({
      categoria:     ns.categoria || '',
      traduccion:    '',
      definicion_en: ns.definicion_en,
      ejemplos:      ns.ejemplos || [],
      sinonimos:     [],
    });
  });

  if (!senses.length) return null;

  // Deduplicar traducciones identicas y limitar a 6 acepciones (las primeras
  // suelen ser las mas frecuentes/relevantes en estos diccionarios editoriales)
  const seenTrans = new Set();
  const dedupedSenses = [];
  for (const s of senses) {
    const key = `${s.categoria}|${s.traduccion}`;
    if (seenTrans.has(key)) continue;
    seenTrans.add(key);
    dedupedSenses.push(s);
    if (dedupedSenses.length >= 6) break;
  }

  const phonetic = (oxEntry && oxEntry.phonetic) || (noadEntry && noadEntry.phonetic) || '';

  return { senses: dedupedSenses, phonetic };
}

/** Busca un phrasal verb dado un verbo raíz y las palabras que le siguen en el texto. */
function matchPhrasalVerb(rootLower, followingWordsLower) {
  const candidates = dictEngine.pvIndex[rootLower];
  if (!candidates || !candidates.length) return null;

  for (const cand of candidates) {
    const particles = cand.parts.slice(1); // sin el verbo raíz
    if (cand.hasGap) {
      // Patrón "verbo + ... + partícula(s)": permite 1-3 palabras de objeto en medio
      // antes de encontrar la(s) partícula(s) finales en orden.
      for (let gapLen = 1; gapLen <= 3; gapLen++) {
        const afterGap = followingWordsLower.slice(gapLen, gapLen + particles.length);
        if (afterGap.length === particles.length &&
            afterGap.every((w, i) => w === particles[i])) {
          return { parts: cand.parts, totalWords: 1 + gapLen + particles.length };
        }
      }
    } else {
      const direct = followingWordsLower.slice(0, particles.length);
      if (direct.length === particles.length &&
          direct.every((w, i) => w === particles[i])) {
        return { parts: cand.parts, totalWords: 1 + particles.length };
      }
    }
  }
  return null;
}


/* ── Tokenizador principal: separa el texto y cruza contra los diccionarios ── */

/**
 * Divide el texto en palabras "crudas" preservando su posición original,
 * para poder reconstruir gaps (espacios/puntuación) con precisión.
 */
function splitWords(text) {
  // Cada match es una "palabra" en sentido amplio: letras, apóstrofes internos, guiones internos.
  const re = /[A-Za-zÀ-ÖØ-öø-ÿ]+(?:['’-][A-Za-zÀ-ÖØ-öø-ÿ]+)*/g;
  const words = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    words.push({ text: m[0], start: m.index, end: m.index + m[0].length });
  }
  return words;
}

/**
 * Tokeniza el texto completo: detecta phrasal verbs (cruzando contra el índice)
 * y, para el resto, busca cada palabra individual en los diccionarios.
 * Devuelve un array de tokens en el mismo shape que antes generaba la IA,
 * compatible con renderTokens / buildTokenSpans (usa texto_original + posición implícita).
 */
function tokenizeText(text) {
  const rawWords = splitWords(text);
  const lowerWords = rawWords.map(w => w.text.toLowerCase());
  const tokens = [];

  let i = 0;
  while (i < rawWords.length) {
    const word = rawWords[i];
    const wordLower = lowerWords[i];

    // 1. Intentar phrasal verb empezando en esta palabra (usando su forma base,
    //    ya que el índice solo registra verbos en infinitivo: "look", no "looked")
    const rootLower = baseFormOf(wordLower) || wordLower;
    const following = lowerWords.slice(i + 1, i + 5); // hasta 4 palabras siguientes
    const pvMatch = matchPhrasalVerb(rootLower, following);

    if (pvMatch) {
      const span = rawWords.slice(i, i + pvMatch.totalWords);
      const phraseText = text.slice(span[0].start, span[span.length - 1].end);
      const lookupKey = pvMatch.parts.join(' ');

      // Buscar datos del phrasal verb en ambos diccionarios (por su entrada propia)
      const pvData = lookupPhrasalVerbData(rootLower, lookupKey);

      tokens.push(buildToken(phraseText, 'compound', pvData));
      i += pvMatch.totalWords;
      continue;
    }

    // 2. Palabra individual: buscar en el diccionario (probando también su forma base)
    const data = lookupWord(wordLower) || lookupByInflection(wordLower);
    tokens.push(buildToken(word.text, 'single', data));
    i += 1;
  }

  return tokens;
}

/** Busca el phrasal verb dentro de las entradas de phrasal_verbs de la palabra raíz */
function lookupPhrasalVerbData(rootLower, phraseKey) {
  const sources = [dictEngine.oxford.get(rootLower), dictEngine.noad.get(rootLower)];
  const senses = [];
  let phonetic = '';

  sources.forEach(entry => {
    if (!entry) return;
    const pv = (entry.phrasal_verbs || []).find(
      p => normalizePvPhrase(p.phrase) === phraseKey
    );
    if (!pv) return;
    const cleanedPvTrans = cleanTranslation(pv.traduccion);
    if (cleanedPvTrans) {
      senses.push({
        categoria: 'phrasal_verb',
        traduccion: cleanedPvTrans,
        definicion_en: '',
        ejemplos: (pv.ejemplos || []).map(ex =>
          typeof ex === 'string' ? ex : `${ex.en} — ${ex.es}`),
        sinonimos: [],
      });
    } else if (pv.definicion_en) {
      senses.push({
        categoria: 'phrasal_verb',
        traduccion: '',
        definicion_en: pv.definicion_en,
        ejemplos: pv.ejemplos || [],
        sinonimos: [],
      });
    }
  });

  if (!senses.length) {
    senses.push({
      categoria: 'phrasal_verb', traduccion: '', definicion_en: '',
      ejemplos: [], sinonimos: [],
    });
  }

  return { senses, phonetic };
}

function normalizePvPhrase(phrase) {
  return phrase.toLowerCase()
    .replace(/\s*\([^)]*\)/g, '')
    .split(' ')
    .filter(w => !/^(someone|something|sb|sth|one's|oneself)$/.test(w.replace(/\//g, '')))
    .join(' ');
}

/**
 * Devuelve la forma base (raíz) de una palabra si existe en el índice de
 * inflexiones o puede deducirse con heurísticas simples; si no, null.
 * No consulta traducciones — solo resuelve la forma canónica para lookup.
 */
function baseFormOf(wordLower) {
  const fromIndex = dictEngine.inflIdx.get(wordLower);
  if (fromIndex) return fromIndex;

  // Heurísticas simples de desinflexión en inglés, probadas contra el diccionario
  const guesses = [];
  if (wordLower.endsWith('ies'))      guesses.push(wordLower.slice(0, -3) + 'y');
  if (wordLower.endsWith('es'))       guesses.push(wordLower.slice(0, -2));
  if (wordLower.endsWith('s') && !wordLower.endsWith('ss'))
                                       guesses.push(wordLower.slice(0, -1));
  if (wordLower.endsWith('ing')) {
    guesses.push(wordLower.slice(0, -3));
    guesses.push(wordLower.slice(0, -3) + 'e');
  }
  if (wordLower.endsWith('ed')) {
    guesses.push(wordLower.slice(0, -2));
    guesses.push(wordLower.slice(0, -1));
  }
  for (const g of guesses) {
    if (dictEngine.oxford.has(g) || dictEngine.noad.has(g)) return g;
  }
  return null;
}

/** Si la palabra no se encontró directamente, intenta buscar por su forma base */
function lookupByInflection(wordLower) {
  const base = baseFormOf(wordLower);
  if (!base || base === wordLower) return null;
  return lookupWord(base);
}

/** Construye el objeto token final con campos planos (compat.) + senses[] completo */
function buildToken(texto_original, tipo, data) {
  const senses    = data ? data.senses : [];
  const categoria = firstSenseCategoria(senses);

  // Para los campos planos de compatibilidad, preferir el primer sense de la
  // MISMA categoría principal que tenga traducción real (evita que un sustantivo
  // suelto se cuele por delante del verbo cuando éste solo tiene definicion_en).
  // Si ninguno de esa categoría tiene traducción, se usa definicion_en de esa
  // misma categoría; en último caso, se cae al primer sense general.
  const sameCategory = senses.filter(s => s.categoria === categoria);
  const pool         = sameCategory.length ? sameCategory : senses;
  // 1) traduccion dentro de la misma categoria
  // 2) definicion_en dentro de la misma categoria (ej. "wake" verbo solo tiene definicion_en)
  // 3) cualquier sense con traduccion, cruzando categoria, como ultimo recurso
  // 4) cualquier sense con definicion_en, cruzando categoria
  const first =
    pool.find(s => s.traduccion) ||
    pool.find(s => s.definicion_en) ||
    senses.find(s => s.traduccion) ||
    senses.find(s => s.definicion_en) ||
    senses[0] || {};

  return {
    texto_original,
    tipo,
    categoria,
    // Campos planos de compatibilidad — usados por diccionario, flashcards,
    // exportar/importar y el chat.
    traduccion:    first.traduccion    || '',
    definicion_en: first.definicion_en || '',
    sinonimos:     first.sinonimos     || [],
    ejemplos:      first.ejemplos      || [],
    // Fonética (solo disponible en single words con match directo)
    phonetic: data ? data.phonetic : '',
    // Todas las acepciones, para el modal
    senses,
    // Indica si la palabra no se encontró en ningún diccionario
    sinDatos: senses.length === 0,
  };
}


/** Nuevo analyzeText() local: tokeniza usando los diccionarios cargados en memoria,
 * sin llamar a ninguna API de IA. Carga los diccionarios bajo demanda si aún
 * no están listos (primera vez que el usuario analiza texto en la sesión). */
async function analyzeText() {
  const text = dom.textInput.value.trim();

  if (!text) { notify('Escribe o pega un texto en inglés para analizar.', 'error'); return; }
  if (text.length > 8000) {
    notify('El texto es demasiado largo (máx. 8 000 caracteres).', 'warning');
    return;
  }

  dom.analyzeBtn.disabled  = true;
  dom.analyzeBtn.innerHTML = '<span aria-hidden="true">⏳</span>&ensp;Analizando…';
  dom.legend.hidden = true;
  resetHighlightState();

  if (!dictionariesReady()) {
    dom.renderedText.innerHTML =
      '<div class="loading">📚 Cargando diccionarios (solo la primera vez)…</div>';
  } else {
    dom.renderedText.innerHTML = '<div class="loading">🔍 Analizando…</div>';
  }

  try {
    await loadDictionaries();

    const tokens = tokenizeText(text);
    if (!tokens.length) throw new Error('No se pudo tokenizar el texto.');

    state.tokens = tokens;
    renderTokens(tokens, text);
    dom.legend.hidden = false;
    addHistoryEntry({ text, level: dom.levelSelect.value, model: 'diccionario-local', tokens });

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
       <small>Revisa tu conexión a internet (los diccionarios deben poder descargarse).</small></div>`;
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


/**
 * Versión directa de renderTokens para cuando no hay texto fuente.
 * Cada token se renderiza como su propio span sin necesidad de alineación.
 */
function renderTokensDirect(tokens) {
  resetHighlightState();
  const frag = document.createDocumentFragment();

  tokens.forEach((token, i) => {
    const span = document.createElement('span');
    span.className = [
      'token',
      catClass(token.categoria),
      token.tipo === 'compound' ? 'compound' : '',
    ].filter(Boolean).join(' ');

    span.textContent = token.texto_original;
    span.dataset.idx = i;
    span.title       = token.traduccion || '';
    span.setAttribute('role',     'button');
    span.setAttribute('tabindex', '0');
    span.setAttribute('aria-label',
      `${token.texto_original} — ${token.categoria || ''}: ${token.traduccion || ''}`);

    span.addEventListener('click',   () => handleTokenClick(i));
    span.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleTokenClick(i); }
    });

    frag.appendChild(span);

    // Separador natural entre tokens
    frag.appendChild(document.createTextNode(' '));
  });

  dom.renderedText.innerHTML = '';
  dom.renderedText.appendChild(frag);
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
  if (!token) { console.error('[EL] openModal: no token at index', index); return; }
  state.activeToken = token;

  try {
    // Auto-guardar en diccionario
    addToDictionary(token);
  } catch(e) {
    console.warn('[EL] addToDictionary failed (storage full?):', e.message);
  }

  try {
    // Poblar campos
    dom.modalWordTitle.textContent = token.texto_original;
    loadPronunciation(token.texto_original);
    dom.modalCatBadge.textContent  = token.categoria || '';
    renderModalSenses(token);
    dom.modalHead.className = `modal-head ${catClass(token.categoria)}`;
  } catch(e) {
    console.error('[EL] openModal render error:', e);
    dom.modalSenses.innerHTML = `<p class="sense-empty-msg">Error al mostrar: ${e.message}</p>`;
  }

  dom.wordModal.classList.add('active');
  dom.wordModal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  dom.modalClose.focus();
}

/**
 * Renderiza una tarjeta por cada acepción del token (token.senses).
 * Si no hay senses (palabra sin datos en los diccionarios, o un token
 * legado de un export/import previo), cae a una sola tarjeta usando los
 * campos planos de compatibilidad (traduccion/definicion_en/etc.).
 */
function renderModalSenses(token) {
  dom.modalSenses.innerHTML = '';

  // Fallback: si el token no tiene senses (legacy o sin datos del diccionario)
  const senses = Array.isArray(token.senses) && token.senses.length
    ? token.senses
    : token.sinDatos ? [] : [{
        categoria:     token.categoria     || '',
        traduccion:    token.traduccion    || '',
        definicion_en: token.definicion_en || '',
        sinonimos:     token.sinonimos     || [],
        ejemplos:      token.ejemplos      || [],
      }];

  if (!senses.length) {
    const msg = document.createElement('p');
    msg.className = 'sense-empty-msg';
    msg.textContent = 'Esta palabra no se encontr\u00f3 en los diccionarios disponibles.';
    dom.modalSenses.appendChild(msg);
    return;
  }

  // ── Estilo diccionario impreso (tipo Kindle): sin tarjetas, jerarqu\u00eda tipogr\u00e1fica ──
  const container = document.createElement('div');
  container.className = 'dict-entry';

  // Fonética (si existe en el token)
  if (token.phonetic) {
    const ph = document.createElement('span');
    ph.className = 'dict-phonetic';
    ph.textContent = token.phonetic;
    container.appendChild(ph);
  }

  // Acepciones
  senses.forEach((sense, idx) => {
    const senseEl = document.createElement('div');
    senseEl.className = 'dict-sense';

    // Número de acepción + categoría gramatical abreviada
    const senseHead = document.createElement('p');
    senseHead.className = 'dict-sense-head';
    const numEl = document.createElement('span');
    numEl.className = 'dict-sense-num';
    numEl.textContent = `${idx + 1}.`;
    const catEl = document.createElement('em');
    catEl.className = 'dict-pos';
    catEl.textContent = sense.categoria || '';
    senseHead.appendChild(numEl);
    if (sense.categoria) { senseHead.appendChild(document.createTextNode('\u00a0')); senseHead.appendChild(catEl); }
    senseEl.appendChild(senseHead);

    // Traducción principal (negrita, prominente)
    if (sense.traduccion) {
      const tr = document.createElement('p');
      tr.className = 'dict-translation';
      tr.textContent = sense.traduccion;
      senseEl.appendChild(tr);
    }

    // Definición en inglés (italic, más pequeña)
    if (sense.definicion_en) {
      const def = document.createElement('p');
      def.className = 'dict-definition';
      def.textContent = sense.definicion_en;
      senseEl.appendChild(def);
    }

    // Ejemplos con bullet •
    const exs = Array.isArray(sense.ejemplos) ? sense.ejemplos : [];
    if (exs.length) {
      const exList = document.createElement('ul');
      exList.className = 'dict-examples';
      exs.forEach(ex => {
        const li = document.createElement('li');
        li.textContent = ex;
        exList.appendChild(li);
      });
      senseEl.appendChild(exList);
    }

    container.appendChild(senseEl);
  });

  // Fuente del diccionario al pie (como el Kindle)
  const source = document.createElement('p');
  source.className = 'dict-source';
  source.textContent = 'Oxford English\u2013Spanish Dictionary & New Oxford American Dictionary';
  container.appendChild(source);

  dom.modalSenses.appendChild(container);
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
    // Guardar versión compacta: solo campos planos (sin senses[], que puede ser muy grande
    // para localStorage). El modal ya obtiene los datos completos de state.tokens en tiempo real.
    const compact = {
      texto_original: token.texto_original,
      tipo:           token.tipo        || 'single',
      categoria:      token.categoria   || '',
      traduccion:     token.traduccion  || '',
      definicion_en:  token.definicion_en || '',
      sinonimos:      Array.isArray(token.sinonimos) ? token.sinonimos.slice(0, 3) : [],
      ejemplos:       Array.isArray(token.ejemplos)  ? token.ejemplos.slice(0, 2)  : [],
    };
    dict.push(compact);
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
    const isExternal = entry.model === 'ia-externa';
    const modelLabel = isExternal
      ? 'IA externa'
      : (entry.model || '').split('/').pop() || '—';

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
   14-C. JSON LOADER — cargar análisis generado por IA
═══════════════════════════════════════════════════ */

/** Genera el prompt que el usuario debe pegar en su IA favorita */
function buildJsonLoaderPrompt() {
  const level = dom.levelSelect?.value || 'B1';
  const levelLine = getLevelInstructions(level)
    .trim()
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .join('\n');

  return [
    'You are a professional linguistic tokenizer for American English learners.',
    '',
    'CRITICAL OUTPUT RULES:',
    '1. Your ENTIRE response must be ONE valid JSON object. Nothing else.',
    '2. No markdown, no code fences, no explanations, no preamble.',
    '3. Start with { and end with }.',
    '',
    'TASK:',
    'Analyze the English text I provide below. Tokenize EVERY word and multi-word',
    'expression, preserving original order.',
    '- Identify phrasal verbs and fixed idioms -> group as ONE compound token.',
    '- Include ALL words: articles, prepositions, conjunctions, particles, interjections.',
    '- Do NOT list individual words of a compound separately.',
    '',
    levelLine,
    '',
    'JSON SCHEMA (IMPORTANT: include the "text" field with the original text EXACTLY as provided):',
    '{',
    '  "text": "the full original text, copied exactly — punctuation, line breaks and all",',
    '  "tokens": [',
    '    {',
    '      "texto_original": "word or phrase exactly as written",',
    '      "tipo": "single",',
    '      "categoria": "verbo | sustantivo | adjetivo | adverbio | phrasal_verb |',
    '                    preposicion | conjuncion | pronombre | articulo |',
    '                    determinante | interjeccion | auxiliar",',
    '      "traduccion": "Spanish translation",',
    '      "definicion_en": "English definition",',
    '      "sinonimos": ["syn1"],',
    '      "ejemplos": ["Example 1.", "Example 2."]',
    '    }',
    '  ]',
    '}',
    '',
    'Respond ONLY with the JSON object. Here is the text:',
    '',
    '[PASTE YOUR ENGLISH TEXT HERE]',
  ].join('\n');
}

/** Valida que un token tiene los campos mínimos requeridos */
function isValidToken(t) {
  return !!t
    && typeof t === 'object'
    && typeof t.texto_original === 'string' && t.texto_original.trim() !== ''
    && typeof t.tipo       === 'string'
    && typeof t.categoria  === 'string'
    && typeof t.traduccion === 'string';
}

/** Valida y parsea el JSON pegado por el usuario */
function parseJsonLoaderInput(raw) {
  let parsed;
  try {
    // Limpiar posibles backticks de markdown que algunos modelos añaden
    const clean = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
    parsed = JSON.parse(clean);
  } catch {
    throw new Error('El texto pegado no es un JSON válido. Asegúrate de copiar la respuesta completa de la IA.');
  }

  // Aceptar tanto { tokens: [...] } como array plano
  const tokens = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.tokens)
      ? parsed.tokens
      : null;

  if (!tokens) throw new Error('El JSON no contiene un campo "tokens" con el listado de palabras.');

  const valid = tokens.filter(isValidToken);
  if (valid.length === 0) throw new Error('No se encontraron tokens válidos en el JSON.');

  const hasSourceText = typeof parsed?.text === 'string' && parsed.text.trim().length > 0;
  const text  = hasSourceText
    ? parsed.text.trim()
    : valid.map(t => t.texto_original).join(' ');

  const level = typeof parsed?.level === 'string' ? parsed.level : (dom.levelSelect?.value || 'B1');

  return { text, level, tokens: valid, hasSourceText };
}

/** Muestra un error dentro del modal */
function jlShowError(msg) {
  dom.jlError.textContent = msg;
  dom.jlError.classList.remove('jl-error--hidden');
}
function jlClearError() {
  dom.jlError.textContent = '';
  dom.jlError.classList.add('jl-error--hidden');
}

/** Activa una pestaña del modal */
function jlGoToStep(step) {
  const isStep1 = step === 1;
  dom.jlTab1.classList.toggle('is-active',  isStep1);
  dom.jlTab2.classList.toggle('is-active', !isStep1);
  dom.jlTab1.setAttribute('aria-selected', String(isStep1));
  dom.jlTab2.setAttribute('aria-selected', String(!isStep1));
  // Usar clase en vez de atributo hidden — evita conflicto con display:flex del CSS
  dom.jlPanel1.classList.toggle('jl-panel--hidden', !isStep1);
  dom.jlPanel2.classList.toggle('jl-panel--hidden',  isStep1);
  if (!isStep1) jlClearError();
}

function openJsonLoader() {
  // Actualizar el prompt con el nivel actual cada vez que se abre
  dom.jlPromptBox.textContent = buildJsonLoaderPrompt();
  dom.jlJsonInput.value = '';
  dom.jlFileName.textContent = '';
  jlClearError();
  jlGoToStep(1);
  dom.jlModal.classList.add('active');
  dom.jlModal.setAttribute('aria-hidden', 'false');
}

function closeJsonLoader() {
  dom.jlModal.classList.remove('active');
  dom.jlModal.setAttribute('aria-hidden', 'true');
}

function initJsonLoader() {
  dom.loadJsonBtn.addEventListener('click', openJsonLoader);

  dom.jlClose.addEventListener('click', closeJsonLoader);
  dom.jlModal.addEventListener('click', e => {
    if (e.target === dom.jlModal) closeJsonLoader();
  });

  // Pestañas
  dom.jlTab1.addEventListener('click', () => jlGoToStep(1));
  dom.jlTab2.addEventListener('click', () => jlGoToStep(2));
  dom.jlGoStep2.addEventListener('click', () => jlGoToStep(2));
  dom.jlBackStep1.addEventListener('click', () => jlGoToStep(1));

  // Copiar prompt
  dom.jlCopyPrompt.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(dom.jlPromptBox.textContent);
      dom.jlCopyLabel.textContent = '¡Copiado!';
      setTimeout(() => { dom.jlCopyLabel.textContent = 'Copiar prompt'; }, 2000);
    } catch {
      notify('No se pudo copiar. Selecciona el texto manualmente.', 'error');
    }
  });

  // Cargar desde archivo
  dom.jlFileBtn.addEventListener('click', () => dom.jlFileInput.click());
  dom.jlFileInput.addEventListener('change', () => {
    const file = dom.jlFileInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onerror = () => jlShowError('No se pudo leer el archivo.');
    reader.onload  = () => {
      dom.jlJsonInput.value    = reader.result;
      dom.jlFileName.textContent = file.name;
      jlClearError();
    };
    reader.readAsText(file);
    dom.jlFileInput.value = '';
  });

  // Limpiar error al editar el textarea
  dom.jlJsonInput.addEventListener('input', jlClearError);

  // Cargar análisis
  dom.jlLoadBtn.addEventListener('click', () => {
    const raw = dom.jlJsonInput.value.trim();
    if (!raw) { jlShowError('Pega el JSON de la IA o carga un archivo .json primero.'); return; }

    let parsed;
    try { parsed = parseJsonLoaderInput(raw); }
    catch (err) { jlShowError(err.message); return; }

    // Aplicar nivel si viene en el JSON
    if (parsed.level && dom.levelSelect) {
      dom.levelSelect.value = parsed.level;
      storage.set(LS.LEVEL, parsed.level);
    }

    // Normalizar tokens al mismo shape que usa la app
    const tokens = parsed.tokens.map(t => ({
      texto_original: t.texto_original.trim(),
      tipo:           t.tipo           || 'single',
      categoria:      t.categoria      || '',
      traduccion:     t.traduccion     || '',
      definicion_en:  t.definicion_en  || '',
      sinonimos:      Array.isArray(t.sinonimos) ? t.sinonimos : [],
      ejemplos:       Array.isArray(t.ejemplos)  ? t.ejemplos  : [],
    }));

    // Replicar el flujo post-análisis exactamente igual que analyzeText()
    const model = 'ia-externa';  // Siempre identificar como importación externa
    state.tokens = tokens;
    // Si el JSON trae el texto original, usarlo para reconstruir puntuación y párrafos.
    // Si no, renderizar los tokens directamente sin alineación.
    if (parsed.hasSourceText) {
      renderTokens(tokens, parsed.text);
    } else {
      renderTokensDirect(tokens);
    }
    dom.legend.hidden = false;
    resetHighlightState();
    addHistoryEntry({ text: parsed.text, level: parsed.level, model, tokens });

    // Mostrar chat limpio
    dom.chatSection.hidden    = false;
    dom.chatHistory.innerHTML = '';
    chatHistory               = [];
    dom.chatInput.value       = '';

    closeJsonLoader();
    notify(`✓ Análisis cargado · ${tokens.length} tokens`, 'success');
    dom.renderedText?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}


/* ═══════════════════════════════════════════════════
   15. INIT
═══════════════════════════════════════════════════ */

function init() {

  /* ── Tema y header ── */
  initTheme();
  initHeader();

  /* ── Diccionarios: empezar a cargar en segundo plano de inmediato.
     El usuario puede escribir/navegar mientras tanto; analyzeText()
     espera automáticamente a que terminen si aún no están listos. ── */
  loadDictionaries().catch(err => {
    console.error('[EL] loadDictionaries (background):', err);
  });

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

  /* ── JSON Loader ── */
  initJsonLoader();

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
      if (dom.jlModal.classList.contains('active'))        { closeJsonLoader();  return; }
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
