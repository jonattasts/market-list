/* ==========================================================================
   TELA 3 DO ONBOARDING: IDENTIFICAÇÃO DO USUÁRIO (SVG FINISH + FORMULÁRIO)
   Responsável por renderizar o conteúdo da terceira tela do carrossel:
   ilustração SVG, campo de nome e botão "Começar a usar".
   Esta tela não possui indicadores de carrossel nem permite voltar.
   ========================================================================== */

/**
 * Cria e retorna o elemento HTML completo da tela final do onboarding.
 * O elemento é injetado no slide 3 do carrossel pelo onboarding.js.
 * O botão "Começar a usar" chama window.handleUserIdentification ao clicar.
 *
 * @returns {HTMLElement} Elemento da tela de identificação do usuário
 */
export function createOnboardingFinishScreen() {
  const screenElement = document.createElement("div");
  screenElement.className = "onboarding-finish-screen";

  screenElement.innerHTML = `
    <!-- Área da ilustração SVG -->
    <div class="onboarding-finish-image-area">
      <img
        class="onboarding-finish-image"
        src="../assets/onboarding-finish.svg"
        alt="Ilustração de início de uso do app"
        draggable="false" />
    </div>

    <!-- Área de conteúdo: título, campo de nome e botão -->
    <div class="onboarding-finish-content-area">
      <h2 class="onboarding-finish-title">Pronto para começar?</h2>
      <div class="onboarding-finish-title-underline"></div>
      <p class="onboarding-finish-subtitle">
        Para personalizar sua experiência, como gostaria de ser chamado?
      </p>

      <!-- Campo de nome do usuário — ID mantido para compatibilidade com handleUserIdentification -->
      <div class="onboarding-finish-input-group">
        <label for="user-name-input">Seu nome</label>
        <input
          type="text"
          id="user-name-input"
          placeholder="Digite seu nome aqui..."
          autocomplete="given-name" />
      </div>

      <!-- Botão de início — chama handleUserIdentification do index.js -->
      <button
        class="button-start onboarding-finish-button"
        onclick="handleUserIdentification()">
        Começar a usar
      </button>
    </div>
  `;

  return screenElement;
}
