/* ==========================================================================
   TELA 2 DO ONBOARDING: COMO O APP FUNCIONA (SVG MIDDLE)
   Responsável por renderizar o conteúdo da segunda tela do carrossel:
   ilustração SVG e explicação breve de como o app funciona.
   ========================================================================== */

/**
 * Cria e retorna o elemento HTML completo da tela intermediária do onboarding.
 * O elemento é injetado no slide 2 do carrossel pelo onboarding.js.
 *
 * @returns {HTMLElement} Elemento da tela de explicação do funcionamento
 */
export function createOnboardingMiddleScreen() {
  const screenElement = document.createElement("div");
  screenElement.className = "onboarding-middle-screen";

  screenElement.innerHTML = `
    <!-- Área da ilustração SVG -->
    <div class="onboarding-middle-image-area">
      <img
        class="onboarding-middle-image"
        src="../assets/onboarding-middle.svg"
        alt="Ilustração de organização de compras"
        draggable="false" />
    </div>

    <!-- Área de conteúdo: título e explicação -->
    <div class="onboarding-middle-content-area">
      <h2 class="onboarding-middle-title">Como funciona?</h2>
      <div class="onboarding-middle-title-underline"></div>
      <p class="onboarding-middle-subtitle">
        Crie listas de compras, adicione itens por categoria,
        acompanhe seus gastos em tempo real e analise seu histórico
        de consumo no dashboard.
      </p>
    </div>
  `;

  return screenElement;
}
