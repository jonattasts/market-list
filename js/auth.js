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
  sendPasswordResetEmail,
  fetchSignInMethodsForEmail,
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

/* ==========================================================================
   RECUPERAÇÃO DE SENHA — MODAL DEDICADO
   ========================================================================== */

/**
 * Abre o modal de recuperação de senha.
 * Limpa o campo de e-mail e reseta o estado visual antes de exibir.
 */
window.openPasswordRecoveryModal = function () {
  const recoveryModalOverlay = document.getElementById(
    "password-recovery-modal-overlay",
  );
  if (!recoveryModalOverlay) return;

  // Limpa o campo de e-mail e reseta estado do botão antes de abrir
  const recoveryEmailInput = document.getElementById(
    "password-recovery-email-input",
  );
  const recoverySubmitButton = document.getElementById(
    "password-recovery-submit-button",
  );

  if (recoveryEmailInput) recoveryEmailInput.value = "";
  if (recoverySubmitButton) {
    recoverySubmitButton.classList.remove("is-loading");
    recoverySubmitButton.disabled = false;
  }

  // Garante que o estado de feedback de sucesso esteja oculto ao abrir
  hidePasswordRecoverySuccessState();

  recoveryModalOverlay.classList.remove("screen-hidden");
  recoveryModalOverlay.classList.add("auth-modal-visible");
};

/**
 * Fecha o modal de recuperação de senha e limpa todos os campos.
 */
window.closePasswordRecoveryModal = function () {
  const recoveryModalOverlay = document.getElementById(
    "password-recovery-modal-overlay",
  );
  if (!recoveryModalOverlay) return;

  recoveryModalOverlay.classList.remove("auth-modal-visible");
  recoveryModalOverlay.classList.add("screen-hidden");

  // Limpa o campo de e-mail ao fechar
  const recoveryEmailInput = document.getElementById(
    "password-recovery-email-input",
  );
  if (recoveryEmailInput) recoveryEmailInput.value = "";

  // Reseta o estado do botão ao fechar
  const recoverySubmitButton = document.getElementById(
    "password-recovery-submit-button",
  );
  if (recoverySubmitButton) {
    recoverySubmitButton.classList.remove("is-loading");
    recoverySubmitButton.disabled = false;
  }

  // Reseta o estado de feedback de sucesso ao fechar
  hidePasswordRecoverySuccessState();
};

/**
 * Exibe o estado de feedback de sucesso dentro do modal de recuperação,
 * substituindo o formulário por uma mensagem de confirmação de envio.
 * O formulário fica oculto e a mensagem de sucesso fica visível.
 *
 * @param {string} emailAddress - E-mail para o qual o link foi enviado (exibido na mensagem)
 */
function showPasswordRecoverySuccessState(emailAddress) {
  const recoveryForm = document.getElementById("password-recovery-form");
  const recoverySuccessMessage = document.getElementById(
    "password-recovery-success-message",
  );
  const recoverySuccessEmail = document.getElementById(
    "password-recovery-success-email",
  );

  if (recoveryForm) recoveryForm.classList.add("screen-hidden");

  if (recoverySuccessMessage) {
    recoverySuccessMessage.classList.remove("screen-hidden");
  }

  // Exibe o e-mail de destino na mensagem de confirmação
  if (recoverySuccessEmail) {
    recoverySuccessEmail.textContent = emailAddress;
  }
}

/**
 * Reseta o estado de feedback de sucesso, restaurando o formulário
 * e ocultando a mensagem de confirmação.
 * Chamado ao fechar o modal ou ao reabri-lo.
 */
function hidePasswordRecoverySuccessState() {
  const recoveryForm = document.getElementById("password-recovery-form");
  const recoverySuccessMessage = document.getElementById(
    "password-recovery-success-message",
  );

  if (recoveryForm) recoveryForm.classList.remove("screen-hidden");
  if (recoverySuccessMessage) {
    recoverySuccessMessage.classList.add("screen-hidden");
  }
}

/**
 * Verifica via Firebase Auth se o e-mail informado possui métodos de login
 * cadastrados, confirmando se a conta existe antes de tentar o envio do link.
 *
 * Retorna true se o e-mail estiver associado a pelo menos um método de login,
 * false caso contrário (conta inexistente ou sem provedores vinculados).
 *
 * @param {string} emailAddress - E-mail a ser verificado no banco do Firebase Auth
 * @returns {Promise<boolean>} True se o e-mail estiver cadastrado
 */
async function checkIfEmailIsRegistered(emailAddress) {
  const registeredSignInMethods = await fetchSignInMethodsForEmail(
    firebaseAuth,
    emailAddress,
  );
  return registeredSignInMethods.length > 0;
}

/**
 * Processa o envio do e-mail de redefinição de senha via Firebase Auth.
 *
 * Fluxo:
 *   1. Valida o campo de e-mail preenchido pelo usuário
 *   2. Verifica se o e-mail está cadastrado no Firebase Auth via fetchSignInMethodsForEmail
 *   3. Se não cadastrado: exibe toast de erro e mantém o formulário ativo
 *   4. Se cadastrado: chama sendPasswordResetEmail e exibe confirmação de envio
 *   5. Em caso de erro técnico: exibe toast de erro e mantém o formulário ativo
 */
window.handlePasswordRecovery = async function () {
  const recoveryEmailInput = document.getElementById(
    "password-recovery-email-input",
  );
  const recoverySubmitButton = document.getElementById(
    "password-recovery-submit-button",
  );

  if (!recoveryEmailInput) return;

  const emailAddress = recoveryEmailInput.value.trim();

  // Validação básica do campo de e-mail
  if (!emailAddress || !emailAddress.includes("@")) {
    window.showToast("Informe um e-mail válido", "danger");
    return;
  }

  if (recoverySubmitButton) {
    recoverySubmitButton.classList.add("is-loading");
    recoverySubmitButton.disabled = true;
  }

  try {
    // Verifica se o e-mail está cadastrado antes de tentar o envio do link
    const isEmailRegistered = await checkIfEmailIsRegistered(emailAddress);

    if (!isEmailRegistered) {
      // E-mail não cadastrado — informa o usuário e interrompe o fluxo
      window.showToast(
        "Este e-mail não está cadastrado. Verifique ou crie uma conta.",
        "danger",
      );
      return;
    }

    // Envia o e-mail de redefinição de senha via Firebase Auth
    await sendPasswordResetEmail(firebaseAuth, emailAddress);

    // Exibe o estado de sucesso dentro do modal com o e-mail de destino
    showPasswordRecoverySuccessState(emailAddress);
  } catch (passwordResetError) {
    console.error("Erro ao enviar e-mail de recuperação:", passwordResetError);

    // Mensagens de erro amigáveis para os códigos mais comuns
    const friendlyErrorMessages = {
      "auth/invalid-email": "E-mail inválido. Verifique e tente novamente.",
      "auth/network-request-failed": "Sem conexão. Verifique sua internet.",
      "auth/too-many-requests":
        "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
    };

    const friendlyMessage =
      friendlyErrorMessages[passwordResetError.code] ||
      "Erro ao enviar o e-mail. Tente novamente.";

    window.showToast(friendlyMessage, "danger");
  } finally {
    // Restaura o botão independente de sucesso ou erro
    if (recoverySubmitButton) {
      recoverySubmitButton.classList.remove("is-loading");
      recoverySubmitButton.disabled = false;
    }
  }
};
