class EnglishStudyApp {
    constructor() {
        this.currentTokens = [];
        this.currentTokenIndex = null;

        // DOM
        this.apiKeyInput = document.getElementById('api-key');
        this.saveApiKeyBtn = document.getElementById('save-api-key');
        this.levelSelect = document.getElementById('level');
        this.modelSelect = document.getElementById('model');
        this.fetchModelsBtn = document.getElementById('fetch-models');
        this.textInput = document.getElementById('text-input');
        this.analyzeBtn = document.getElementById('analyze-btn');
        this.textContainer = document.getElementById('text-container');
        this.loadingDiv = document.getElementById('loading');
        this.dictionaryToggle = document.getElementById('dictionary-toggle');
        this.dictionaryPanel = document.getElementById('dictionary-panel');
        this.closeDictionaryBtn = document.getElementById('close-dictionary');
        this.dictionaryCards = document.getElementById('dictionary-cards');
        this.wordModal = document.getElementById('word-modal');
        this.modalBody = document.getElementById('modal-body');
        this.modalCloseBtn = this.wordModal.querySelector('.modal-close');
        this.modalOverlay = this.wordModal.querySelector('.modal-overlay');
        this.addToDictBtn = document.getElementById('add-to-dictionary');
        this.panelOverlay = document.getElementById('panel-overlay');

        this.init();
    }

    init() {
        this.loadSettings();
        this.bindEvents();
        this.renderDictionary();
    }

    /* ========== LOCAL STORAGE ========== */
    loadSettings() {
        const apiKey = localStorage.getItem('openrouter_api_key') || '';
        const model = localStorage.getItem('openrouter_model') || '';
        const level = localStorage.getItem('english_level') || 'B1';
        this.apiKeyInput.value = apiKey;
        this.levelSelect.value = level;
        if (model) {
            this.modelSelect.innerHTML = `<option value="${model}">${model}</option>`;
            this.modelSelect.value = model;
        }
    }

    saveApiKey() {
        localStorage.setItem('openrouter_api_key', this.apiKeyInput.value.trim());
        this.showToast('API Key guardada ✅');
    }

    saveModel() {
        localStorage.setItem('openrouter_model', this.modelSelect.value);
    }

    saveLevel() {
        localStorage.setItem('english_level', this.levelSelect.value);
    }

    getDictionary() {
        try { return JSON.parse(localStorage.getItem('dictionary') || '[]'); }
        catch { return []; }
    }

    saveDictionary(dict) {
        localStorage.setItem('dictionary', JSON.stringify(dict));
    }

    /* ========== EVENTOS ========== */
    bindEvents() {
        this.saveApiKeyBtn.addEventListener('click', () => this.saveApiKey());
        this.apiKeyInput.addEventListener('change', () => this.saveApiKey());
        this.levelSelect.addEventListener('change', () => this.saveLevel());
        this.modelSelect.addEventListener('change', () => this.saveModel());
        this.fetchModelsBtn.addEventListener('click', () => this.fetchModels());
        this.analyzeBtn.addEventListener('click', () => this.analyzeText());

        // Delegación de clic en el contenedor de texto
        this.textContainer.addEventListener('click', (e) => {
            const span = e.target.closest('.interactive-word');
            if (span) {
                const prev = this.textContainer.querySelector('.interactive-word.active');
                if (prev) prev.classList.remove('active');
                span.classList.add('active');
                const index = parseInt(span.dataset.tokenIndex, 10);
                this.handleWordClick(index);
            }
        });

        // Modal
        this.modalCloseBtn.addEventListener('click', () => this.closeModal());
        this.modalOverlay.addEventListener('click', () => this.closeModal());

        // Panel diccionario
        this.dictionaryToggle.addEventListener('click', () => this.toggleDictionaryPanel());
        this.closeDictionaryBtn.addEventListener('click', () => this.closeDictionaryPanel());
        this.panelOverlay.addEventListener('click', () => this.closeDictionaryPanel());

        // Eliminar del diccionario desde el panel
        this.dictionaryCards.addEventListener('click', (e) => {
            if (e.target.classList.contains('delete-word')) {
                const index = parseInt(e.target.dataset.index, 10);
                this.removeFromDictionary(index);
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeModal();
                this.closeDictionaryPanel();
            }
        });
    }

    /* ========== FETCH MODELOS ========== */
    async fetchModels() {
        const apiKey = this.apiKeyInput.value.trim();
        if (!apiKey) return this.showToast('⚠️ Primero ingresa tu API Key');

        this.fetchModelsBtn.textContent = '⏳ Cargando...';
        this.fetchModelsBtn.disabled = true;

        try {
            const response = await fetch('https://openrouter.ai/api/v1/models', {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'HTTP-Referer': window.location.origin,
                    'X-Title': 'English Study App'
                }
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            const free = data.data.filter(m => {
                const id = (m.id || '').toLowerCase();
                const name = (m.name || '').toLowerCase();
                const pCost = parseFloat(m.pricing?.prompt || '0');
                const cCost = parseFloat(m.pricing?.completion || '0');
                return id.includes('free') || name.includes('free') || (pCost === 0 && cCost === 0);
            });

            this.modelSelect.innerHTML = '';
            if (free.length === 0) {
                this.modelSelect.innerHTML = '<option value="">-- No se encontraron modelos gratuitos --</option>';
                this.showToast('No se encontraron modelos gratuitos');
            } else {
                free.forEach(m => {
                    const opt = document.createElement('option');
                    opt.value = m.id;
                    opt.textContent = `${m.name || m.id} (free)`;
                    this.modelSelect.appendChild(opt);
                });
                const saved = localStorage.getItem('openrouter_model');
                if (saved && free.some(m => m.id === saved)) this.modelSelect.value = saved;
                this.showToast(`✅ ${free.length} modelos gratuitos cargados`);
            }
        } catch (err) {
            console.error(err);
            this.showToast(`❌ ${err.message}`);
        } finally {
            this.fetchModelsBtn.textContent = '🔄 Actualizar Modelos';
            this.fetchModelsBtn.disabled = false;
        }
    }

    /* ========== ANALIZAR TEXTO ========== */
    async analyzeText() {
        const apiKey = this.apiKeyInput.value.trim();
        const model = this.modelSelect.value;
        const text = this.textInput.value.trim();
        const level = this.levelSelect.value;

        if (!apiKey) return this.showToast('⚠️ Ingresa tu API Key');
        if (!model) return this.showToast('⚠️ Selecciona un modelo');
        if (!text) return this.showToast('⚠️ Ingresa un texto');

        this.loadingDiv.classList.remove('hidden');
        this.textContainer.innerHTML = '';
        this.analyzeBtn.disabled = true;

        const systemPrompt = `You are an American English teacher. Analyze the provided text at ${level} level.
Return ONLY a valid JSON object, no markdown, no extra text.
Schema:
{
  "tokens": [
    {
      "texto_original": "word or compound phrase",
      "tipo": "single" or "compound",
      "categoria": "verbo" | "sustantivo" | "adjetivo" | "adverbio" | "phrasal_verb" | "preposicion" | "conjuncion" | "pronombre" | "otro",
      "traduccion": "Spanish translation",
      "definicion_en": "clear English definition",
      "sinonimos": ["syn1", "syn2"],
      "ejemplos": ["Example 1", "Example 2"]
    }
  ]
}`;

        try {
            const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'HTTP-Referer': window.location.origin,
                    'X-Title': 'English Study App',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: `Level: ${level}\n\nText:\n${text}` }
                    ],
                    temperature: 0.3,
                    max_tokens: 3000
                })
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error?.message || `HTTP ${res.status}`);
            }

            const data = await res.json();
            const content = data.choices?.[0]?.message?.content || '';
            let cleaned = content.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```$/i, '').trim();
            let parsed;
            try {
                parsed = JSON.parse(cleaned);
            } catch {
                const match = cleaned.match(/\{[\s\S]*\}/);
                if (match) parsed = JSON.parse(match[0]);
                else throw new Error('Respuesta no contiene JSON válido');
            }

            if (!parsed.tokens || !Array.isArray(parsed.tokens)) {
                throw new Error('JSON sin array "tokens"');
            }

            this.currentTokens = parsed.tokens;
            this.renderInteractiveText(text, parsed.tokens);
            this.showToast(`✅ ${parsed.tokens.length} tokens analizados`);

        } catch (err) {
            console.error(err);
            this.textContainer.innerHTML = `<p style="color:#dc3545; font-style:italic;">❌ ${this.escapeHTML(err.message)}</p>`;
            this.showToast(`❌ ${err.message}`);
        } finally {
            this.loadingDiv.classList.add('hidden');
            this.analyzeBtn.disabled = false;
        }
    }

    /* ========== RENDERIZADO INTERACTIVO (CORREGIDO) ========== */
    renderInteractiveText(originalText, tokens) {
        // Caso: sin tokens
        if (!tokens.length) {
            this.textContainer.textContent = originalText;
            return;
        }

        // 1. Encontrar posiciones de cada token en el texto original (sin overlaping)
        const matches = [];
        const usedRanges = []; // para evitar solapamientos
        // Ordenar por longitud descendente para priorizar compuestos largos
        const sorted = tokens
            .map((t, idx) => ({ ...t, idx }))
            .sort((a, b) => b.texto_original.length - a.texto_original.length);

        for (const token of sorted) {
            const phrase = token.texto_original;
            // Buscar todas las ocurrencias de la frase (case‑insensitive)
            const lowerText = originalText.toLowerCase();
            const lowerPhrase = phrase.toLowerCase();
            let start = 0;
            while (start < lowerText.length) {
                const pos = lowerText.indexOf(lowerPhrase, start);
                if (pos === -1) break;
                // Verificar que no se solape con rangos ya usados
                const end = pos + phrase.length;
                const overlap = usedRanges.some(([a, b]) => pos < b && end > a);
                if (!overlap) {
                    matches.push({ start: pos, end, tokenIdx: token.idx });
                    usedRanges.push([pos, end]);
                    break; // tomar solo la primera ocurrencia no solapada
                }
                start = pos + 1; // seguir buscando
            }
        }

        // Ordenar matches por posición de inicio
        matches.sort((a, b) => a.start - b.start);

        // 2. Construir HTML intercalando fragmentos de texto y spans
        let html = '';
        let lastPos = 0;
        for (const m of matches) {
            // Texto entre último match y este
            if (m.start > lastPos) {
                html += this.escapeHTML(originalText.slice(lastPos, m.start));
            }
            const token = tokens[m.tokenIdx];
            const tipo = token.tipo || 'single';
            const category = token.categoria || 'otro';
            const catClass = this.getCategoryClass(category);
            const compoundClass = tipo === 'compound' ? ' compound-word' : '';
            html += `<span class="interactive-word cat-${catClass}${compoundClass}" data-token-index="${m.tokenIdx}">`;
            html += this.escapeHTML(originalText.slice(m.start, m.end));
            html += `</span>`;
            lastPos = m.end;
        }
        // Resto del texto
        if (lastPos < originalText.length) {
            html += this.escapeHTML(originalText.slice(lastPos));
        }

        this.textContainer.innerHTML = html;
    }

    getCategoryClass(categoria) {
        const map = {
            'verbo': 'verbo', 'sustantivo': 'sustantivo', 'adjetivo': 'adjetivo',
            'adverbio': 'adverbio', 'phrasal_verb': 'phrasal_verb', 'phrasal verb': 'phrasal_verb',
            'preposicion': 'preposicion', 'preposición': 'preposicion',
            'conjuncion': 'conjuncion', 'conjunción': 'conjuncion', 'pronombre': 'pronombre'
        };
        return map[(categoria || '').toLowerCase()] || 'otro';
    }

    escapeHTML(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    /* ========== MANEJO DE CLIC EN PALABRA (AUTO‑GUARDADO) ========== */
    handleWordClick(tokenIndex) {
        const token = this.currentTokens[tokenIndex];
        if (!token) return;

        // Guardar automáticamente en el diccionario (evitando duplicados)
        this.addToDictionary(token, true); // silent = true para no mostrar toast

        // Abrir modal
        this.openWordModal(tokenIndex);
    }

    /* ========== MODAL ========== */
    openWordModal(tokenIndex) {
        const token = this.currentTokens[tokenIndex];
        if (!token) return;

        this.currentTokenIndex = tokenIndex;

        const category = token.categoria || 'otro';
        const catClass = this.getCategoryClass(category);
        const isInDict = this.isInDictionary(token.texto_original);

        // Construir contenido
        const synonyms = (token.sinonimos || []).map(s => `<span class="synonym-tag">${this.escapeHTML(s)}</span>`).join(' ');
        const examples = (token.ejemplos || []).map(e => `<div class="example-item">${this.escapeHTML(e)}</div>`).join('');

        this.modalBody.innerHTML = `
            <h2>${this.escapeHTML(token.texto_original)}</h2>
            <span class="word-category cat-${catClass}">${this.escapeHTML(category)} (${token.tipo || 'single'})</span>
            <div class="word-translation">🇪🇸 <strong>Traducción:</strong> ${this.escapeHTML(token.traduccion || 'N/A')}</div>
            <div class="word-definition">📖 <strong>Definición (EN):</strong> ${this.escapeHTML(token.definicion_en || 'N/A')}</div>
            ${synonyms ? `<div class="word-synonyms"><strong>Sinónimos:</strong> ${synonyms}</div>` : ''}
            ${examples ? `<div class="word-examples"><strong>Ejemplos:</strong> ${examples}</div>` : ''}
        `;

        // Configurar botón según estado del diccionario
        this.addToDictBtn.textContent = isInDict ? '🗑️ Quitar del Diccionario' : '➕ Agregar al Diccionario';
        this.addToDictBtn.onclick = () => {
            if (isInDict) {
                this.removeFromDictionaryByText(token.texto_original);
                this.addToDictBtn.textContent = '➕ Agregar al Diccionario';
                this.showToast('🗑️ Palabra quitada del diccionario');
            } else {
                this.addToDictionary(token, false);
                this.addToDictBtn.textContent = '🗑️ Quitar del Diccionario';
                this.showToast('✅ Palabra agregada al diccionario');
            }
        };

        this.wordModal.classList.remove('hidden');
    }

    closeModal() {
        this.wordModal.classList.add('hidden');
        this.currentTokenIndex = null;
        const active = this.textContainer.querySelector('.interactive-word.active');
        if (active) active.classList.remove('active');
    }

    /* ========== DICCIONARIO ========== */
    isInDictionary(word) {
        const dict = this.getDictionary();
        return dict.some(item => item.texto_original.toLowerCase() === word.toLowerCase());
    }

    addToDictionary(token, silent = false) {
        const dict = this.getDictionary();
        const exists = dict.some(item => item.texto_original.toLowerCase() === token.texto_original.toLowerCase());
        if (exists) return;
        dict.push({ ...token });
        this.saveDictionary(dict);
        this.renderDictionary();
        if (!silent) this.showToast('✅ Palabra agregada al diccionario');
    }

    removeFromDictionaryByText(word) {
        const dict = this.getDictionary();
        const index = dict.findIndex(item => item.texto_original.toLowerCase() === word.toLowerCase());
        if (index !== -1) {
            dict.splice(index, 1);
            this.saveDictionary(dict);
            this.renderDictionary();
        }
    }

    removeFromDictionary(index) {
        const dict = this.getDictionary();
        if (index >= 0 && index < dict.length) {
            const word = dict[index].texto_original;
            dict.splice(index, 1);
            this.saveDictionary(dict);
            this.renderDictionary();
            this.showToast(`🗑️ "${word}" eliminada`);
        }
    }

    renderDictionary() {
        const dict = this.getDictionary();
        this.dictionaryCards.innerHTML = '';
        if (dict.length === 0) {
            this.dictionaryCards.innerHTML = '<p class="empty-message">No hay palabras guardadas aún. ¡Analiza un texto y agrega palabras!</p>';
            return;
        }
        dict.forEach((token, i) => {
            const catClass = this.getCategoryClass(token.categoria || 'otro');
            const card = document.createElement('div');
            card.className = 'dict-card';
            card.innerHTML = `
                <div class="card-word">
                    <span>${this.escapeHTML(token.texto_original)}</span>
                    <button class="delete-word" data-index="${i}" title="Eliminar">🗑️</button>
                </div>
                <div class="card-translation">🇪🇸 ${this.escapeHTML(token.traduccion || 'N/A')}</div>
                <div class="card-definition">${this.escapeHTML(token.definicion_en || 'N/A')}</div>
                <div class="card-category cat-${catClass}">${this.escapeHTML(token.categoria || 'otro')}</div>
            `;
            this.dictionaryCards.appendChild(card);
        });
    }

    toggleDictionaryPanel() {
        if (this.dictionaryPanel.classList.contains('hidden')) {
            this.openDictionaryPanel();
        } else {
            this.closeDictionaryPanel();
        }
    }

    openDictionaryPanel() {
        this.dictionaryPanel.classList.remove('hidden');
        this.panelOverlay.classList.remove('hidden');
        this.renderDictionary();
    }

    closeDictionaryPanel() {
        this.dictionaryPanel.classList.add('hidden');
        this.panelOverlay.classList.add('hidden');
    }

    showToast(msg) {
        const existing = document.querySelector('.toast');
        if (existing) existing.remove();
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = msg;
        document.body.appendChild(toast);
        toast.addEventListener('animationend', (e) => {
            if (e.animationName === 'toastOut') toast.remove();
        });
    }
}

document.addEventListener('DOMContentLoaded', () => new EnglishStudyApp());