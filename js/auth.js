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
   CONTROLE DE ESTADO DO MODAL DE EMAIL/SENHA
   Sinaliza se uma autenticação via email/senha está em andamento,
   bloqueando o fechamento do modal e a troca de abas até que o processo conclua.
   ========================================================================== */

/**
 * Flag que indica se uma autenticação por email/senha está em progresso
 */
let isEmailAuthenticationInProgress = false;

/**
 * Ativa o estado de bloqueio do modal de email/senha durante autenticação.
 * - Desabilita o botão de fechar o modal visualmente
 * - Desabilita os botões de alternância de aba para impedir troca durante o processo
 * - Define o flag isEmailAuthenticationInProgress como true
 */
function lockEmailAuthModal() {
  isEmailAuthenticationInProgress = true;

  const closeButton = document.querySelector(
    "#auth-email-modal-overlay .auth-modal-close-button",
  );
  if (closeButton) {
    closeButton.disabled = true;
    closeButton.style.opacity = "0.4";
    closeButton.style.cursor = "not-allowed";
  }

  const signupTabButton = document.getElementById("auth-tab-signup");
  const loginTabButton = document.getElementById("auth-tab-login");

  if (signupTabButton) {
    signupTabButton.disabled = true;
    signupTabButton.style.opacity = "0.4";
    signupTabButton.style.cursor = "not-allowed";
  }

  if (loginTabButton) {
    loginTabButton.disabled = true;
    loginTabButton.style.opacity = "0.4";
    loginTabButton.style.cursor = "not-allowed";
  }
}

/**
 * Desativa o estado de bloqueio do modal de email/senha.
 * - Reabilita o botão de fechar o modal
 * - Reabilita os botões de alternância de aba
 * - Define o flag isEmailAuthenticationInProgress como false
 */
function unlockEmailAuthModal() {
  isEmailAuthenticationInProgress = false;

  const closeButton = document.querySelector(
    "#auth-email-modal-overlay .auth-modal-close-button",
  );
  if (closeButton) {
    closeButton.disabled = false;
    closeButton.style.opacity = "";
    closeButton.style.cursor = "";
  }

  const signupTabButton = document.getElementById("auth-tab-signup");
  const loginTabButton = document.getElementById("auth-tab-login");

  if (signupTabButton) {
    signupTabButton.disabled = false;
    signupTabButton.style.opacity = "";
    signupTabButton.style.cursor = "";
  }

  if (loginTabButton) {
    loginTabButton.disabled = false;
    loginTabButton.style.opacity = "";
    loginTabButton.style.cursor = "";
  }
}

/* ==========================================================================
   GOOGLE SIGN-IN — POPUP
   ========================================================================== */

/**
 * Ativa o estado de loading no botão Google Sign-In.
 * - Adiciona a classe is-loading (exibe spinner via CSS e oculta texto/ícone)
 * - Define disabled=true como camada extra de bloqueio além do pointer-events
 * - Desabilita o botão de continuar com e-mail para evitar conflito de fluxos
 *
 * @param {HTMLElement} googleSignInButton - Referência ao elemento do botão
 */
function activateGoogleButtonLoadingState(googleSignInButton) {
  googleSignInButton.classList.add("is-loading");
  googleSignInButton.disabled = true;

  const emailSignInButton = document.getElementById("button-email-signin");
  if (emailSignInButton) {
    emailSignInButton.disabled = true;
    emailSignInButton.classList.add("auth-button-disabled");
  }
}

/**
 * Desativa o estado de loading no botão Google Sign-In.
 * - Remove a classe is-loading (restaura texto/ícone e oculta spinner)
 * - Remove disabled para reabilitar o botão para novos cliques
 * - Reabilita o botão de continuar com e-mail
 *
 * @param {HTMLElement} googleSignInButton - Referência ao elemento do botão
 */
function deactivateGoogleButtonLoadingState(googleSignInButton) {
  googleSignInButton.classList.remove("is-loading");
  googleSignInButton.disabled = false;

  // Reabilita o botão de email após o fluxo do Google concluir
  const emailSignInButton = document.getElementById("button-email-signin");
  if (emailSignInButton) {
    emailSignInButton.disabled = false;
    emailSignInButton.classList.remove("auth-button-disabled");
  }
}

/**
 * Inicia o fluxo de autenticação com Google via popup.
 *
 * O botão permanece desabilitado e exibe um spinner animado durante todo o
 * processo — incluindo o intervalo entre o fechamento do popup pelo usuário
 * e o disparo do erro auth/popup-closed-by-user pelo Firebase (5 a 15 s).
 * O estado de loading só é removido após a Promise do signInWithPopup
 * resolver ou rejeitar, garantindo feedback visual consistente.
 *
 * Códigos de erro tratados silenciosamente (sem toast de erro):
 *   - auth/popup-closed-by-user    → usuário fechou o popup intencionalmente
 *   - auth/cancelled-popup-request → novo clique cancelou o popup anterior
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
    activateGoogleButtonLoadingState(googleSignInButton);
  }

  try {
    const googleProvider = new GoogleAuthProvider();
    await signInWithPopup(firebaseAuth, googleProvider);
    // Autenticação bem-sucedida — onAuthStateChanged cuida do resto
  } catch (googleSignInError) {
    if (googleSignInButton) {
      deactivateGoogleButtonLoadingState(googleSignInButton);
    }

    // Ignora cancelamento explícito pelo usuário (fechou o popup)
    if (
      googleSignInError.code === "auth/popup-closed-by-user" ||
      googleSignInError.code === "auth/cancelled-popup-request"
    ) {
      return;
    }

    console.error("Erro no Google Sign-In:", googleSignInError);
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
 *
 * O fechamento é bloqueado enquanto uma autenticação email/senha estiver em progresso.
 */
window.closeAuthEmailModal = function () {
  if (isEmailAuthenticationInProgress) return;

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
 * A troca de aba é bloqueada enquanto uma autenticação email/senha estiver em progresso.
 *
 * @param {string} tabName - "signup" para cadastro ou "login" para entrar
 */
window.switchAuthModalTab = function (tabName) {
  if (isEmailAuthenticationInProgress) return;

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
 *   4. Desbloqueia e fecha o modal
 *
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

  lockEmailAuthModal();

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

    unlockEmailAuthModal();
    window.closeAuthEmailModal();
  } catch (signupError) {
    // Limpa o flag em caso de falha para não contaminar tentativas futuras
    window.pendingEmailSignupDisplayName = null;

    if (submitButton) submitButton.classList.remove("is-loading");

    unlockEmailAuthModal();

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
 *
 * Durante o processo, o modal fica bloqueado para fechamento e troca de abas via lockEmailAuthModal.
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

  lockEmailAuthModal();

  try {
    // Realiza o login — onAuthStateChanged cuida do restante
    await signInWithEmailAndPassword(firebaseAuth, email, password);

    unlockEmailAuthModal();
    window.closeAuthEmailModal();
  } catch (loginError) {
    // Remove o spinner explicitamente em caso de erro para restaurar o botão
    if (submitButton) submitButton.classList.remove("is-loading");

    unlockEmailAuthModal();

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
 * Processa o envio do e-mail de redefinição de senha via Firebase Auth.
 *
 * A verificação prévia via fetchSignInMethodsForEmail foi removida pois essa
 * API foi descontinuada pelo Firebase e retorna array vazio em projetos com
 * "Email Enumeration Protection" habilitada (padrão em projetos novos),
 * causando falso negativo para qualquer e-mail informado.
 *
 * Novo fluxo:
 *   1. Valida o formato do e-mail preenchido pelo usuário
 *   2. Chama sendPasswordResetEmail diretamente
 *   3. Exibe confirmação genérica de envio (por segurança, não confirma
 *      se o e-mail existe — comportamento padrão do Firebase com Email
 *      Enumeration Protection ativa)
 *   4. Em caso de erro técnico: exibe toast de erro e mantém o formulário ativo
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
