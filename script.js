/**
 * ============================================
 * LexiDrop v1.0 - Lógica del Juego (Vanilla JS)
 * Videojuego educativo tipo "catcher" para aprender inglés
 * ============================================
 */

// ============================================
// 1. ESTRUCTURA DE DATOS (El Vocabulario)
// ============================================

const wordDatabase = [
    // NOUNS (Sustantivos) - Nivel A1-A2
    { text: "apple", category: "noun" },
    { text: "book", category: "noun" },
    { text: "cat", category: "noun" },
    { text: "dog", category: "noun" },
    { text: "house", category: "noun" },
    { text: "water", category: "noun" },
    
    // VERBS (Verbos) - Nivel A1-A2
    { text: "run", category: "verb" },
    { text: "eat", category: "verb" },
    { text: "drink", category: "verb" },
    { text: "sleep", category: "verb" },
    { text: "walk", category: "verb" },
    { text: "read", category: "verb" },
    
    // ADJECTIVES (Adjetivos) - Nivel A1-A2
    { text: "big", category: "adjective" },
    { text: "small", category: "adjective" },
    { text: "hot", category: "adjective" },
    { text: "cold", category: "adjective" },
    { text: "happy", category: "adjective" },
    { text: "sad", category: "adjective" }
];

// Categorías disponibles para rotación
const categories = ["noun", "verb", "adjective"];

// Mapeo de categorías a texto para mostrar en UI
const categoryLabels = {
    noun: "NOUNS",
    verb: "VERBS",
    adjective: "ADJECTIVES"
};

// ============================================
// 2. ESTADO DEL JUEGO
// ============================================

let score = 0;
let lives = 3;
let currentTargetCategory = "";
let gameActive = false;
let correctCatches = 0; // Contador para rotación de categoría (cada 6 correctas)
let fallSpeed = 2; // Velocidad inicial de caída (píxeles por frame)

// Arrays para gestionar elementos dinámicos
let fallingWords = []; // Almacena los objetos de palabras activas

// Elementos del DOM (cacheados para rendimiento)
const gameArea = document.getElementById("game-area");
const basket = document.getElementById("basket");
const categoryLabel = document.getElementById("category-label");
const scoreDisplay = document.getElementById("score-display");
const livesDisplay = document.getElementById("lives-display");
const gameOverScreen = document.getElementById("game-over-screen");
const finalScoreSpan = document.getElementById("final-score");
const restartBtn = document.getElementById("restart-btn");

// Interval IDs para controlar los bucles
let spawnIntervalId = null;
let animationFrameId = null;

// ============================================
// 3. FUNCIONES DE INICIALIZACIÓN
// ============================================

/**
 * Inicializa una nueva partida
 */
function initGame() {
    // Resetear variables de estado
    score = 0;
    lives = 3;
    correctCatches = 0;
    fallSpeed = 2;
    gameActive = true;
    fallingWords = [];
    
    // Limpiar palabras existentes en el DOM
    document.querySelectorAll(".falling-word").forEach(word => word.remove());
    
    // Ocultar pantalla de Game Over
    gameOverScreen.classList.add("hidden");
    
    // Seleccionar categoría inicial aleatoria
    changeCategory();
    
    // Actualizar HUD
    updateScoreDisplay();
    updateLivesDisplay();
    
    // Iniciar bucles del juego
    startGameLoops();
}

/**
 * Cambia la categoría objetivo aleatoriamente
 */
function changeCategory() {
    // Seleccionar categoría aleatoria diferente a la actual si es posible
    let newCategory;
    do {
        const randomIndex = Math.floor(Math.random() * categories.length);
        newCategory = categories[randomIndex];
    } while (newCategory === currentTargetCategory && categories.length > 1);
    
    currentTargetCategory = newCategory;
    categoryLabel.textContent = categoryLabels[currentTargetCategory];
}

/**
 * Inicia los bucles principales del juego
 */
function startGameLoops() {
    // Bucle de generación de palabras (cada 1500ms)
    spawnIntervalId = setInterval(spawnWord, 1500);
    
    // Bucle principal de animación
    animationFrameId = requestAnimationFrame(gameLoop);
}

/**
 * Detiene todos los bucles del juego
 */
function stopGameLoops() {
    if (spawnIntervalId) {
        clearInterval(spawnIntervalId);
        spawnIntervalId = null;
    }
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
}

// ============================================
// 4. MOVIMIENTO DE LA CESTA
// ============================================

/**
 * Maneja el movimiento horizontal de la cesta siguiendo el ratón
 */
gameArea.addEventListener("mousemove", (e) => {
    if (!gameActive) return;
    
    // Obtener posición del ratón relativa al game-area
    const rect = gameArea.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    
    // Calcular posición de la cesta (centrada en el ratón)
    const basketWidth = 120;
    let basketX = mouseX - (basketWidth / 2);
    
    // Limitar movimiento dentro de los bordes del juego
    const maxX = gameArea.offsetWidth - basketWidth;
    basketX = Math.max(0, Math.min(basketX, maxX));
    
    // Aplicar posición
    basket.style.left = basketX + "px";
});

// ============================================
// 5. GENERACIÓN DE PALABRAS (SPAWNING)
// ============================================

/**
 * Crea una nueva palabra que cae desde la parte superior
 */
function spawnWord() {
    if (!gameActive) return;
    
    // Seleccionar palabra aleatoria del database
    const randomIndex = Math.floor(Math.random() * wordDatabase.length);
    const wordData = wordDatabase[randomIndex];
    
    // Crear elemento DOM
    const wordElement = document.createElement("div");
    wordElement.classList.add("falling-word");
    wordElement.textContent = wordData.text;
    wordElement.dataset.category = wordData.category; // Guardar categoría real
    
    // Posición X aleatoria dentro de los límites
    const wordWidth = 80; // Ancho aproximado
    const maxX = gameArea.offsetWidth - wordWidth;
    const randomX = Math.floor(Math.random() * maxX);
    
    // Posición inicial (justo encima del área visible)
    const startY = -50;
    
    wordElement.style.left = randomX + "px";
    wordElement.style.top = startY + "px";
    
    // Añadir al game-area
    gameArea.appendChild(wordElement);
    
    // Guardar referencia en el array de palabras activas
    fallingWords.push({
        element: wordElement,
        y: startY,
        speed: fallSpeed + (Math.random() * 1), // Pequeña variación de velocidad
        caught: false
    });
}

// ============================================
// 6. BUCLE PRINCIPAL DE ANIMACIÓN
// ============================================

/**
 * Bucle principal que actualiza todas las palabras cayendo
 * y detecta colisiones
 */
function gameLoop() {
    if (!gameActive) return;
    
    // Actualizar cada palabra
    for (let i = fallingWords.length - 1; i >= 0; i--) {
        const wordObj = fallingWords[i];
        
        // Mover palabra hacia abajo
        wordObj.y += wordObj.speed;
        wordObj.element.style.top = wordObj.y + "px";
        
        // Detectar colisión con la cesta
        if (checkCollision(wordObj)) {
            handleCatch(wordObj, i);
            continue;
        }
        
        // Detectar si llegó al fondo (fuera de límites)
        if (wordObj.y > gameArea.offsetHeight) {
            handleMiss(wordObj, i);
        }
    }
    
    // Continuar el bucle
    animationFrameId = requestAnimationFrame(gameLoop);
}

/**
 * Verifica si una palabra colisiona con la cesta
 * @param {Object} wordObj - Objeto de palabra con elemento y posición
 * @returns {boolean} - True si hay colisión
 */
function checkCollision(wordObj) {
    const wordRect = wordObj.element.getBoundingClientRect();
    const basketRect = basket.getBoundingClientRect();
    const gameAreaRect = gameArea.getBoundingClientRect();
    
    // Convertir coordenadas absolutas a relativas al game-area
    const wordBottom = wordRect.bottom - gameAreaRect.top;
    const basketTop = basketRect.top - gameAreaRect.top;
    
    // Verificar superposición vertical (palabra tocando o dentro de la cesta)
    const verticalOverlap = wordBottom >= basketTop && wordBottom <= basketTop + 30;
    
    if (!verticalOverlap) return false;
    
    // Verificar superposición horizontal
    const wordLeft = wordRect.left - gameAreaRect.left;
    const wordRight = wordRect.right - gameAreaRect.left;
    const basketLeft = basketRect.left - gameAreaRect.left;
    const basketRight = basketRect.right - gameAreaRect.left;
    
    const horizontalOverlap = wordRight > basketLeft && wordLeft < basketRight;
    
    return horizontalOverlap;
}

/**
 * Maneja cuando una palabra es atrapada por la cesta
 * @param {Object} wordObj - Objeto de palabra atrapada
 * @param {number} index - Índice en el array fallingWords
 */
function handleCatch(wordObj, index) {
    const wordCategory = wordObj.element.dataset.category;
    
    if (wordCategory === currentTargetCategory) {
        // ✅ Acierto: Categoría correcta
        score += 10;
        correctCatches++;
        updateScoreDisplay();
        
        // Rotar categoría cada 6 aciertos
        if (correctCatches % 6 === 0) {
            changeCategory();
            // Aumentar dificultad ligeramente
            fallSpeed += 0.3;
        }
    } else {
        // ❌ Error: Categoría incorrecta
        lives--;
        updateLivesDisplay();
        triggerBasketFlash();
        
        // Verificar Game Over
        if (lives <= 0) {
            endGame();
        }
    }
    
    // Eliminar palabra del DOM y del array
    removeWord(wordObj, index);
}

/**
 * Maneja cuando una palabra llega al fondo sin ser atrapada
 * @param {Object} wordObj - Objeto de palabra perdida
 * @param {number} index - Índice en el array fallingWords
 */
function handleMiss(wordObj, index) {
    const wordCategory = wordObj.element.dataset.category;
    
    // Penalización solo si era la categoría correcta
    if (wordCategory === currentTargetCategory) {
        lives--;
        updateLivesDisplay();
        
        // Verificar Game Over
        if (lives <= 0) {
            endGame();
        }
    }
    
    // Eliminar palabra
    removeWord(wordObj, index);
}

/**
 * Elimina una palabra del DOM y del array de activas
 * @param {Object} wordObj - Objeto de palabra a eliminar
 * @param {number} index - Índice en el array fallingWords
 */
function removeWord(wordObj, index) {
    wordObj.element.remove();
    fallingWords.splice(index, 1);
}

/**
 * Aplica efecto visual de flash rojo a la cesta
 */
function triggerBasketFlash() {
    basket.classList.add("flash-red");
    setTimeout(() => {
        basket.classList.remove("flash-red");
    }, 200);
}

// ============================================
// 7. ACTUALIZACIÓN DEL HUD
// ============================================

/**
 * Actualiza el marcador en pantalla
 */
function updateScoreDisplay() {
    scoreDisplay.textContent = `Score: ${score}`;
}

/**
 * Actualiza las vidas (corazones) en pantalla
 */
function updateLivesDisplay() {
    let hearts = "";
    for (let i = 0; i < lives; i++) {
        hearts += "❤️";
    }
    livesDisplay.textContent = `Lives: ${hearts}`;
}

// ============================================
// 8. CONDICIÓN DE FIN DE JUEGO
// ============================================

/**
 * Termina el juego y muestra la pantalla de Game Over
 */
function endGame() {
    gameActive = false;
    stopGameLoops();
    
    // Mostrar pantalla de Game Over
    finalScoreSpan.textContent = score;
    gameOverScreen.classList.remove("hidden");
}

// ============================================
// 9. EVENT LISTENERS GLOBALES
// ============================================

// Botón de reiniciar
restartBtn.addEventListener("click", () => {
    initGame();
});

// ============================================
// 10. INICIAR EL JUEGO AL CARGAR
// ============================================

// Iniciar automáticamente cuando se carga la página
window.addEventListener("DOMContentLoaded", () => {
    initGame();
});
