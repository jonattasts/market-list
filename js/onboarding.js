/* ==========================================================================
   ONBOARDING — GERENCIADOR DO CARROSSEL
   Controla a dinâmica de troca entre as três telas do onboarding:
   - Tela 1: Boas-vindas com vídeo                 (onboarding-start.js)
   - Tela 2: Como o app funciona (SVG MIDDLE)      (onboarding-middle.js)
   - Tela 3: Autenticação do usuário (SVG FINISH)  (onboarding-finish.js)

   Comportamentos:
   - Swipe (touch) para esquerda/direita livre entre todos os três slides
   - Indicadores de ponto (dots) visíveis nos três slides
   - Na tela 3: injeta os botões de autenticação via onboarding-auth.js
     substituindo o campo de nome legado pelo fluxo Firebase Auth
   ========================================================================== */

import { createOnboardingStartScreen } from "./onboarding-start.js";
import { createOnboardingMiddleScreen } from "./onboarding-middle.js";
import { createOnboardingFinishScreen } from "./onboarding-finish.js";

/* --------------------------------------------------------------------------
   CONSTANTES E ESTADO INTERNO
   -------------------------------------------------------------------------- */

/** Índice da tela atual do carrossel (0 = início, 1 = meio, 2 = final) */
let currentSlideIndex = 0;

/** Total de slides no carrossel */
const TOTAL_SLIDES = 3;

/** Índice do último slide (tela de autenticação) */
const FINISH_SLIDE_INDEX = 2;

/** Limiar mínimo em pixels para considerar um swipe válido */
const SWIPE_THRESHOLD_PIXELS = 50;

/** Posição X inicial do toque para cálculo do swipe */
let touchStartPositionX = 0;

/** Posição X atual do toque durante o arraste */
let touchCurrentPositionX = 0;

/** Indica se um swipe está em andamento */
let isSwipeInProgress = false;

/* --------------------------------------------------------------------------
   REFERÊNCIAS AOS ELEMENTOS DO DOM (preenchidas em initOnboardingCarousel)
   -------------------------------------------------------------------------- */
let carouselTrackElement = null;
let indicatorDotsElements = [];

/* --------------------------------------------------------------------------
   INICIALIZAÇÃO
   -------------------------------------------------------------------------- */

/**
 * Inicializa o carrossel do onboarding:
 * 1. Cria a estrutura HTML do carrossel com os três slides
 * 2. Injeta os módulos de cada tela nos slides correspondentes
 * 3. Cria os indicadores de ponto
 * 4. Registra os listeners de swipe (touch)
 * 5. Injeta os botões de autenticação na tela finish via onboarding-auth.js
 *
 * Deve ser chamada quando a tela de onboarding for exibida pela primeira vez.
 */
export function initOnboardingCarousel() {
  const onboardingScreenElement = document.getElementById("onboarding-screen");
  if (!onboardingScreenElement) return;

  /* Evita dupla inicialização caso showScreen seja chamado mais de uma vez */
  if (onboardingScreenElement.querySelector(".onboarding-carousel-wrapper")) {
    resetCarouselToFirstSlide();
    return;
  }

  /* Cria o wrapper do carrossel */
  const carouselWrapperElement = document.createElement("div");
  carouselWrapperElement.className = "onboarding-carousel-wrapper";

  /* Cria o trilho deslizante */
  carouselTrackElement = document.createElement("div");
  carouselTrackElement.className = "onboarding-carousel-track";

  /* Cria os três slides e injeta os módulos de cada tela */
  const slideContents = [
    createOnboardingStartScreen(),
    createOnboardingMiddleScreen(),
    createOnboardingFinishScreen(),
  ];

  slideContents.forEach((slideContentElement) => {
    const slideWrapperElement = document.createElement("div");
    slideWrapperElement.className = "onboarding-carousel-slide";
    slideWrapperElement.appendChild(slideContentElement);
    carouselTrackElement.appendChild(slideWrapperElement);
  });

  carouselWrapperElement.appendChild(carouselTrackElement);

  /* Cria os indicadores de ponto (dots) */
  const indicatorsContainerElement = createCarouselIndicators();
  carouselWrapperElement.appendChild(indicatorsContainerElement);

  /* Injeta o carrossel na tela de onboarding */
  onboardingScreenElement.appendChild(carouselWrapperElement);

  /* Registra os listeners de swipe */
  registerSwipeListeners(carouselWrapperElement);

  /* Posiciona o trilho no primeiro slide */
  currentSlideIndex = 0;
  updateCarouselPosition(false);
  updateIndicatorDots();

  /* Injeta os botões de autenticação na tela finish imediatamente após montar
     o carrossel — garante que o container já esteja no DOM ao chamar a função */
  if (window.initOnboardingAuthScreen) {
    window.initOnboardingAuthScreen();
  }
}

/* --------------------------------------------------------------------------
   INDICADORES DE PONTO (DOTS)
   -------------------------------------------------------------------------- */

/**
 * Cria o container dos indicadores de ponto e os dots individuais.
 * Um dot é criado para cada um dos três slides do carrossel.
 *
 * @returns {HTMLElement} Container com os dots de navegação
 */
function createCarouselIndicators() {
  const indicatorsContainerElement = document.createElement("div");
  indicatorsContainerElement.className = "onboarding-carousel-indicators";

  indicatorDotsElements = [];

  for (let dotIndex = 0; dotIndex < TOTAL_SLIDES; dotIndex++) {
    const dotElement = document.createElement("div");
    dotElement.className = "onboarding-indicator-dot";
    dotElement.setAttribute("aria-label", `Ir para slide ${dotIndex + 1}`);
    dotElement.addEventListener("click", () => navigateToSlide(dotIndex));
    indicatorsContainerElement.appendChild(dotElement);
    indicatorDotsElements.push(dotElement);
  }

  return indicatorsContainerElement;
}

/**
 * Atualiza o estado visual dos dots conforme o slide atual.
 * Os indicadores permanecem visíveis em todos os três slides.
 */
function updateIndicatorDots() {
  const indicatorsContainerElement = document.querySelector(
    ".onboarding-carousel-indicators",
  );

  if (!indicatorsContainerElement) return;

  /* Indicadores sempre visíveis em todos os slides */
  indicatorsContainerElement.style.opacity = "1";
  indicatorsContainerElement.style.pointerEvents = "auto";

  /* Atualiza a classe active de cada dot conforme o slide atual */
  indicatorDotsElements.forEach((dotElement, dotIndex) => {
    dotElement.classList.toggle("active", dotIndex === currentSlideIndex);
  });
}

/* --------------------------------------------------------------------------
   NAVEGAÇÃO ENTRE SLIDES
   -------------------------------------------------------------------------- */

/**
 * Navega para o slide de índice informado.
 * Permite navegação livre entre todos os três slides, incluindo o de autenticação.
 *
 * @param {number} targetSlideIndex - Índice do slide de destino (0, 1 ou 2)
 */
function navigateToSlide(targetSlideIndex) {
  /* Limita o índice entre 0 e o último slide */
  const clampedSlideIndex = Math.max(
    0,
    Math.min(targetSlideIndex, TOTAL_SLIDES - 1),
  );

  currentSlideIndex = clampedSlideIndex;
  updateCarouselPosition(true);
  updateIndicatorDots();

  if (currentSlideIndex === FINISH_SLIDE_INDEX) {
    if (window.initOnboardingAuthScreen) {
      window.initOnboardingAuthScreen();
    }
  }
}

/**
 * Avança para o próximo slide (usado externamente se necessário).
 * Não permite avançar além do último slide.
 */
export function navigateToNextSlide() {
  if (currentSlideIndex < TOTAL_SLIDES - 1) {
    navigateToSlide(currentSlideIndex + 1);
  }
}

/**
 * Volta para o slide anterior.
 * Não permite voltar antes do primeiro slide.
 */
export function navigateToPreviousSlide() {
  if (currentSlideIndex > 0) {
    navigateToSlide(currentSlideIndex - 1);
  }
}

/**
 * Aplica a transformação CSS que posiciona o trilho no slide atual.
 *
 * @param {boolean} withAnimation - Se true aplica a transição CSS, se false posiciona sem animação
 */
function updateCarouselPosition(withAnimation) {
  if (!carouselTrackElement) return;

  /* Cada slide ocupa 1/3 do trilho (300% de largura total) */
  const offsetPercentage = currentSlideIndex * (100 / TOTAL_SLIDES);

  if (!withAnimation) {
    /* Remove temporariamente a transição para posicionamento instantâneo */
    carouselTrackElement.style.transition = "none";
    carouselTrackElement.style.transform = `translateX(-${offsetPercentage}%)`;
    /* Força reflow antes de reativar a transição */
    carouselTrackElement.getBoundingClientRect();
    carouselTrackElement.style.transition = "";
  } else {
    carouselTrackElement.style.transform = `translateX(-${offsetPercentage}%)`;
  }
}

/**
 * Reseta o carrossel para o primeiro slide sem animação.
 * Usado quando o onboarding é exibido novamente após já ter sido inicializado.
 */
function resetCarouselToFirstSlide() {
  currentSlideIndex = 0;
  updateCarouselPosition(false);
  updateIndicatorDots();
}

/* --------------------------------------------------------------------------
   SWIPE POR TOQUE (TOUCH)
   -------------------------------------------------------------------------- */

/**
 * Registra os listeners de eventos de toque no wrapper do carrossel.
 * Permite arrastar para esquerda (avançar) ou direita (voltar) entre slides.
 *
 * @param {HTMLElement} carouselWrapperElement - Container do carrossel
 */
function registerSwipeListeners(carouselWrapperElement) {
  carouselWrapperElement.addEventListener("touchstart", handleTouchStart, {
    passive: true,
  });

  carouselWrapperElement.addEventListener("touchmove", handleTouchMove, {
    passive: true,
  });

  carouselWrapperElement.addEventListener("touchend", handleTouchEnd, {
    passive: true,
  });
}

/**
 * Registra a posição X inicial do toque.
 *
 * @param {TouchEvent} touchEvent - Evento de início do toque
 */
function handleTouchStart(touchEvent) {
  touchStartPositionX = touchEvent.touches[0].clientX;
  touchCurrentPositionX = touchStartPositionX;
  isSwipeInProgress = true;
}

/**
 * Atualiza a posição X atual durante o arraste.
 *
 * @param {TouchEvent} touchEvent - Evento de movimento do toque
 */
function handleTouchMove(touchEvent) {
  if (!isSwipeInProgress) return;
  touchCurrentPositionX = touchEvent.touches[0].clientX;
}

/**
 * Calcula a direção do swipe ao soltar o toque e navega se o limiar for atingido.
 * Swipe para esquerda → avança (próximo slide).
 * Swipe para direita → volta (slide anterior).
 *
 * @param {TouchEvent} touchEvent - Evento de fim do toque
 */
function handleTouchEnd(touchEvent) {
  if (!isSwipeInProgress) return;

  isSwipeInProgress = false;

  const swipeDeltaX = touchStartPositionX - touchCurrentPositionX;
  const swipeDistanceAbsolute = Math.abs(swipeDeltaX);

  /* Ignora swipes menores que o limiar para evitar navegação acidental */
  if (swipeDistanceAbsolute < SWIPE_THRESHOLD_PIXELS) return;

  if (swipeDeltaX > 0) {
    /* Swipe para esquerda: avança para o próximo slide */
    navigateToNextSlide();
  } else {
    /* Swipe para direita: volta para o slide anterior */
    navigateToPreviousSlide();
  }
}

/* --------------------------------------------------------------------------
   EXPOSIÇÃO GLOBAL
   Permite que o index.js chame initOnboardingCarousel via window,
   já que os módulos ES são isolados por escopo.
   -------------------------------------------------------------------------- */
window.initOnboardingCarousel = initOnboardingCarousel;
