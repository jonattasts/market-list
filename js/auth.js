/* ==========================================================================
   MÓDULO DE AUTENTICAÇÃO — GOOGLE SIGN-IN + EMAIL/SENHA
   ========================================================================== */

import {
  firebaseAuth,
  signInWithPopup,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
} from "./firebase.js";

/* ==========================================================================
   DETECÇÃO DE DADOS LEGADOS — EXIBE AVISO DE MIGRAÇÃO NO ONBOARDING
   ========================================================================== */

/**
 * Verifica se o usuário possui dados legados no localStorage
 * (chave "marketUserName" sem criptografia, padrão anterior ao Firebase Auth).
 * Usado pelo onboarding-finish para exibir o aviso de migração.
 *
 * @returns {boolean} True se há dados legados a serem migrados
 */
window.hasLegacyUserData = function () {
  return !!localStorage.getItem("marketUserName");
};

/**
 * Retorna o nome legado salvo no localStorage (sem criptografia),
 * para exibição no aviso de migração da tela de onboarding-finish.
 *
 * @returns {string} Nome do usuário legado ou string vazia
 */
window.getLegacyUserName = function () {
  return localStorage.getItem("marketUserName") || "";
};

/* ==========================================================================
   GOOGLE SIGN-IN — POPUP
   ========================================================================== */

/**
 * Inicia o fluxo de autenticação com Google via popup.
 *
 * O erro "Cross-Origin-Opener-Policy would block the window.closed call"
 * é um aviso informativo do Chrome — NÃO impede a autenticação de funcionar.
 * Para eliminá-lo em desenvolvimento local (Live Server), adicione ao
 * .vscode/settings.json:
 *
 *   {
 *     "liveServer.settings.headers": {
 *       "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
 *       "Cross-Origin-Embedder-Policy": "unsafe-none"
 *     }
 *   }
 *
 * Em produção (Firebase Hosting), configure no firebase.json:
 *
 *   "headers": [{
 *     "source": "**",
 *     "headers": [{
 *       "key": "Cross-Origin-Opener-Policy",
 *       "value": "same-origin-allow-popups"
 *     }]
 *   }]
 *
 * O onAuthStateChanged no index.js captura o resultado e executa
 * handleAuthenticatedUser automaticamente após o popup fechar.
 */
window.handleGoogleSignIn = async function () {
  const googleSignInButton = document.getElementById("button-google-signin");

  if (googleSignInButton) {
    googleSignInButton.classList.add("is-loading");
  }

  try {
    const googleProvider = new GoogleAuthProvider();
    await signInWithPopup(firebaseAuth, googleProvider);
    // Autenticação bem-sucedida — onAuthStateChanged cuida do resto
  } catch (googleSignInError) {
    // Ignora cancelamento explícito pelo usuário (fechou o popup)
    if (
      googleSignInError.code === "auth/popup-closed-by-user" ||
      googleSignInError.code === "auth/cancelled-popup-request"
    ) {
      if (googleSignInButton) googleSignInButton.classList.remove("is-loading");
      return;
    }

    console.error("Erro no Google Sign-In:", googleSignInError);
    if (googleSignInButton) googleSignInButton.classList.remove("is-loading");
    window.showToast("Erro ao entrar com Google. Tente novamente.", "danger");
  }
};

/* ==========================================================================
   MODAL DE AUTENTICAÇÃO POR EMAIL/SENHA
   ========================================================================== */

/**
 * Abre o modal de autenticação por e-mail/senha.
 * Inicia na aba de cadastro por padrão.
 */
window.openAuthEmailModal = function () {
  const modalOverlay = document.getElementById("auth-email-modal-overlay");
  if (!modalOverlay) return;

  // Reseta para a aba de cadastro ao abrir
  window.switchAuthModalTab("signup");

  modalOverlay.classList.remove("screen-hidden");
  modalOverlay.classList.add("auth-modal-visible");
};

/**
 * Fecha o modal de autenticação por e-mail/senha e limpa os campos.
 */
window.closeAuthEmailModal = function () {
  const modalOverlay = document.getElementById("auth-email-modal-overlay");
  if (!modalOverlay) return;

  modalOverlay.classList.remove("auth-modal-visible");
  modalOverlay.classList.add("screen-hidden");

  // Limpa todos os campos do modal após fechamento
  const inputIds = [
    "auth-display-name-input",
    "auth-signup-email-input",
    "auth-signup-password-input",
    "auth-login-email-input",
    "auth-login-password-input",
  ];

  inputIds.forEach((inputId) => {
    const inputElement = document.getElementById(inputId);
    if (inputElement) inputElement.value = "";
  });

  // Remove o estado de loading de todos os botões do modal ao fechar,
  // garantindo que o spinner não persista entre aberturas do modal
  const allModalButtons = modalOverlay.querySelectorAll("button");
  allModalButtons.forEach((button) => button.classList.remove("is-loading"));
};

/**
 * Alterna entre as abas de Cadastro e Login dentro do modal de e-mail/senha.
 *
 * @param {string} tabName - "signup" para cadastro ou "login" para entrar
 */
window.switchAuthModalTab = function (tabName) {
  const signupForm = document.getElementById("auth-signup-form");
  const loginForm = document.getElementById("auth-login-form");
  const signupTabButton = document.getElementById("auth-tab-signup");
  const loginTabButton = document.getElementById("auth-tab-login");
  const modalTitle = document.getElementById("auth-modal-title");

  if (!signupForm || !loginForm) return;

  if (tabName === "signup") {
    signupForm.classList.remove("screen-hidden");
    loginForm.classList.add("screen-hidden");
    signupTabButton.classList.add("auth-tab-active");
    loginTabButton.classList.remove("auth-tab-active");
    if (modalTitle) modalTitle.textContent = "Criar Conta";
  } else {
    loginForm.classList.remove("screen-hidden");
    signupForm.classList.add("screen-hidden");
    loginTabButton.classList.add("auth-tab-active");
    signupTabButton.classList.remove("auth-tab-active");
    if (modalTitle) modalTitle.textContent = "Entrar";
  }
};

/* ==========================================================================
   CADASTRO POR EMAIL/SENHA
   ========================================================================== */

/**
 * Processa o cadastro de novo usuário com e-mail, senha e nome de exibição.
 *
 *   1. Define o flag pendingEmailSignupDisplayName com o nome do usuário
 *   2. Chama createUserWithEmailAndPassword (pode disparar onAuthStateChanged)
 *   3. Chama updateProfile em paralelo (sincroniza o Auth Profile também)
 *   4. Fecha o modal — onAuthStateChanged cuida do restante do fluxo
 */
window.handleEmailSignup = async function () {
  const displayNameInput = document.getElementById("auth-display-name-input");
  const emailInput = document.getElementById("auth-signup-email-input");
  const passwordInput = document.getElementById("auth-signup-password-input");
  const submitButton = document.getElementById("auth-signup-submit-button");

  if (!displayNameInput || !emailInput || !passwordInput) return;

  const displayName = window.capitalize(displayNameInput.value.trim());
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  // Validações do formulário de cadastro
  if (!displayName || displayName.length < 3) {
    window.showToast("O nome deve ter pelo menos 3 caracteres", "danger");
    return;
  }

  if (!email || !email.includes("@")) {
    window.showToast("Informe um e-mail válido", "danger");
    return;
  }

  if (!password || password.length < 6) {
    window.showToast("A senha deve ter pelo menos 6 caracteres", "danger");
    return;
  }

  if (submitButton) submitButton.classList.add("is-loading");

  try {
    // Define o flag antes de createUserWithEmailAndPassword para garantir que
    // o handleAuthenticatedUser no index.js já encontre o nome correto quando
    // o onAuthStateChanged disparar imediatamente após a criação da conta.
    window.pendingEmailSignupDisplayName = displayName;

    // Cria o usuário no Firebase Auth com e-mail e senha.
    const userCredential = await createUserWithEmailAndPassword(
      firebaseAuth,
      email,
      password,
    );

    // Atualiza o displayName no perfil do Firebase Auth em paralelo.
    // usa o flag pendingEmailSignupDisplayName como fonte primária do nome.
    updateProfile(userCredential.user, { displayName: displayName }).catch(
      (profileUpdateError) => {
        // Falha no updateProfile não impede o fluxo principal —
        // o nome já foi salvo no Firestore via pendingEmailSignupDisplayName.
        // O usuário verá o nome correto na sessão atual.
        console.warn(
          "Aviso: updateProfile falhou após criação da conta:",
          profileUpdateError,
        );
      },
    );

    // Fecha o modal — onAuthStateChanged cuida do restante do fluxo
    window.closeAuthEmailModal();
  } catch (signupError) {
    // Limpa o flag em caso de falha para não contaminar tentativas futuras
    window.pendingEmailSignupDisplayName = null;

    if (submitButton) submitButton.classList.remove("is-loading");

    console.error("Erro no cadastro:", signupError);

    // Tratamento de mensagens de erro
    const friendlyErrorMessages = {
      "auth/email-already-in-use":
        'Este e-mail já está cadastrado. Use a aba "Entrar".',
      "auth/invalid-email": "E-mail inválido. Verifique e tente novamente.",
      "auth/weak-password": "Senha muito fraca. Use pelo menos 6 caracteres.",
      "auth/network-request-failed": "Sem conexão. Verifique sua internet.",
    };

    const friendlyMessage =
      friendlyErrorMessages[signupError.code] ||
      "Erro ao criar conta. Tente novamente.";

    window.showToast(friendlyMessage, "danger");
  }
};

/* ==========================================================================
   LOGIN POR EMAIL/SENHA
   ========================================================================== */

/**
 * Processa o login de usuário existente com e-mail e senha.
 * Exibe um spinner no botão Entrar durante o processo de autenticação.
 * Remove o spinner explicitamente em caso de erro; em caso de sucesso,
 * o closeAuthEmailModal garante a limpeza ao fechar o modal.
 */
window.handleEmailLogin = async function () {
  const emailInput = document.getElementById("auth-login-email-input");
  const passwordInput = document.getElementById("auth-login-password-input");
  const submitButton = document.getElementById("auth-login-submit-button");

  if (!emailInput || !passwordInput) return;

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password) {
    window.showToast("Preencha e-mail e senha", "danger");
    return;
  }

  if (submitButton) submitButton.classList.add("is-loading");

  try {
    // Realiza o login — onAuthStateChanged cuida do restante
    await signInWithEmailAndPassword(firebaseAuth, email, password);

    setTimeout(() => {
      window.closeAuthEmailModal();
    }, 750);
  } catch (loginError) {
    // Remove o spinner explicitamente em caso de erro para restaurar o botão
    if (submitButton) submitButton.classList.remove("is-loading");

    console.error("Erro no login:", loginError);

    // Mensagens de erro amigáveis para os códigos mais comuns
    const friendlyErrorMessages = {
      "auth/user-not-found": "Nenhuma conta encontrada com este e-mail.",
      "auth/wrong-password": "Senha incorreta. Tente novamente.",
      "auth/invalid-email": "E-mail inválido.",
      "auth/too-many-requests": "Muitas tentativas. Aguarde alguns minutos.",
      "auth/network-request-failed": "Sem conexão. Verifique sua internet.",
      "auth/invalid-credential": "E-mail ou senha incorretos.",
    };

    const friendlyMessage =
      friendlyErrorMessages[loginError.code] ||
      "Erro ao entrar. Verifique seus dados.";

    window.showToast(friendlyMessage, "danger");
  }
};
