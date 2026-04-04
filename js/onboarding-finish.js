/* ==========================================================================
   TELA 3 DO ONBOARDING: AUTENTICAÇÃO DO USUÁRIO (SVG FINISH + AUTH)
   Responsável por renderizar o conteúdo da terceira tela do carrossel:
   ilustração SVG e container de autenticação.
   O container é preenchido dinamicamente pelo onboarding-auth.js via
   window.initOnboardingAuthScreen(), que injeta os botões de Google Sign-In
   e E-mail/Senha — além do aviso de migração para usuários com dados legados.
   Esta tela não possui indicadores de carrossel nem permite voltar.
   ========================================================================== */

/**
 * Cria e retorna o elemento HTML completo da tela final do onboarding.
 * O elemento é injetado no slide 3 do carrossel pelo onboarding.js.
 * O container #onboarding-auth-container é preenchido pelo onboarding-auth.js
 * com os botões de autenticação Firebase (Google ou E-mail/Senha).
 *
 * @returns {HTMLElement} Elemento da tela de autenticação do usuário
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

    <!-- Área de conteúdo: título e container de autenticação -->
    <div class="onboarding-finish-content-area">
      <h2 class="onboarding-finish-title">Pronto para começar?</h2>
      <div class="onboarding-finish-title-underline"></div>
      <p class="onboarding-finish-subtitle">
        Escolha como deseja entrar para salvar suas listas com segurança.
      </p>

      <!-- Container preenchido dinamicamente pelo onboarding-auth.js
           com botões de Google Sign-In, E-mail/Senha e aviso de migração -->
      <div id="onboarding-auth-container"></div>
    </div>
  `;

  return screenElement;
}
