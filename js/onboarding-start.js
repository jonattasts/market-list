/* ==========================================================================
   TELA 1 DO ONBOARDING: BOAS-VINDAS COM VÍDEO
   Responsável por renderizar o conteúdo da primeira tela do carrossel:
   vídeo em autoplay/loop e texto de boas-vindas ao Market List.
   ========================================================================== */

/**
 * Cria e retorna o elemento HTML completo da tela inicial do onboarding.
 * O elemento é injetado no slide 1 do carrossel pelo onboarding.js.
 *
 * @returns {HTMLElement} Elemento da tela de boas-vindas com vídeo
 */
export function createOnboardingStartScreen() {
  const screenElement = document.createElement("div");
  screenElement.className = "onboarding-start-screen";

  screenElement.innerHTML = `
    <!-- Área do vídeo: ocupa a parte superior da tela -->
    <div class="onboarding-start-video-area">
      <video
        class="onboarding-start-video"
        src="../assets/onboarding-video.mp4"
        autoplay
        loop
        muted
        playsinline>
      </video>
    </div>

    <!-- Área de conteúdo: título e subtítulo de boas-vindas -->
    <div class="onboarding-start-content-area">
      <h2 class="onboarding-start-title">Bem-vindo(a) ao<br>Market List</h2>
      <div class="onboarding-start-title-underline"></div>
      <p class="onboarding-start-subtitle">
        Organize suas compras de forma inteligente e
        tenha controle total dos seus gastos.
      </p>
    </div>
  `;

  return screenElement;
}
