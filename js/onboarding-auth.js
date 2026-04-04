/* ==========================================================================
   ONBOARDING AUTH — INJETA BOTÕES DE AUTENTICAÇÃO NA TELA FINISH
   ========================================================================== */

/**
 * Injeta o conteúdo de autenticação na tela onboarding-finish.
 * Chamado pelo onboarding.js ao renderizar a última tela do carrossel,
 * substituindo o campo de nome pelo fluxo de autenticação real.
 *
 * Detecta automaticamente se há dados legados no localStorage e exibe:
 * - Com dados legados: aviso de migração + botões de autenticação
 * - Sem dados legados (usuário novo): apenas botões de autenticação
 *
 * Esta função deve ser chamada pelo onboarding.js após renderizar o HTML
 * da tela finish no DOM, dentro de initOnboardingCarousel ou equivalente.
 */
window.initOnboardingAuthScreen = function () {
  const authContainerElement = document.getElementById("onboarding-auth-container");

  if (!authContainerElement) return;

  // Detecta se há dados legados para exibir o aviso de migração
  const hasLegacyData =
    typeof window.hasLegacyUserData === "function"
      ? window.hasLegacyUserData()
      : !!localStorage.getItem("marketUserName");

  const legacyUserName =
    typeof window.getLegacyUserName === "function"
      ? window.getLegacyUserName()
      : localStorage.getItem("marketUserName") || "";

  // Bloco de aviso de migração — exibido apenas para usuários com dados legados
  const migrationWarningHTML = hasLegacyData
    ? `
      <div class="auth-migration-notice">
        <ion-icon name="information-circle-outline" class="auth-migration-icon"></ion-icon>
        <div class="auth-migration-text">
          <strong>Olá, ${legacyUserName}!</strong>
          <p>
            Encontramos suas listas existentes. Ao autenticar, elas serão
            migradas automaticamente para sua nova conta segura.
          </p>
        </div>
      </div>
    `
    : "";

  // Injeta os botões de autenticação e o aviso de migração (se houver)
  authContainerElement.innerHTML = `
    ${migrationWarningHTML}

    <div class="auth-options-container">

      <!-- Botão de Google Sign-In -->
      <button
        id="button-google-signin"
        class="auth-google-button"
        onclick="window.handleGoogleSignIn()">
        <svg class="auth-google-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        Continuar com Google
      </button>

      <!-- Divisor visual -->
      <div class="auth-divider">
        <span class="auth-divider-line"></span>
        <span class="auth-divider-text">ou</span>
        <span class="auth-divider-line"></span>
      </div>

      <!-- Botão de E-mail/Senha -->
      <button
        id="button-email-signin"
        class="auth-email-button"
        onclick="window.openAuthEmailModal()">
        <ion-icon name="mail-outline"></ion-icon>
        Continuar com E-mail
      </button>

    </div>
  `;
};
