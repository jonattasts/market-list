/* ==========================================================================
   ESTADO E CONFIGURAÇÕES GLOBAIS
   ========================================================================== */

import {
  firestore,
  firebaseAuth,
  doc,
  setDoc,
  serverTimestamp,
  signOut,
  onAuthStateChanged,
} from "./firebase.js";

import {
  saveEncryptedUserDataToStorage,
  readDecryptedUserDataFromStorage,
  clearUserDataFromStorage,
} from "./crypto.js";

import {
  runSetupAnimation,
  showLogoutTransitionOverlay,
  hideLogoutTransitionOverlay,
} from "./sync-overlay.js";

import { initFirebaseListener } from "./firebase-listener.js";

// Importa navigation.js para garantir que showScreen e utilitários estejam disponíveis
import "./navigation.js";

window.listItemsContainer = document.getElementById("list-items-container");
window.listsMasterContainer = document.getElementById("lists-master-container");
window.searchInput = document.getElementById("search-input");
window.itemSearchInput = document.getElementById("item-search-input");

window.itemNameInput = document.getElementById("item-name-input");
window.itemDescInput = document.getElementById("item-desc-input");
window.itemPriceInput = document.getElementById("item-price-input");
window.itemQuantityInput = document.getElementById("item-quantity-input");
window.itemCategorySelect = document.getElementById("item-category-select");

window.toast = document.getElementById("toast");
window.toastMessage = document.getElementById("toast-message");
window.toastIcon = document.getElementById("toast-icon");

// Expondo variáveis de controle ao escopo global para outros módulos
window.currentListIndex = 0;

// Identificador estável da lista aberta.
window.currentListId = null;

window.editingItemIndex = null;
window.editingCategoryIndex = null;
window.isEditingListMode = false;
window.isCopyingListMode = false;
window.previousScreen = "home-screen";

// Estado do Swipe
window.touchStartX = 0;
window.activeSwipeCard = null;

window.marketListData = [];

// Flag que sinaliza que o handleAuthenticatedUser já está em execução
let isHandlingAuthenticatedUser = false;

// Flag que sinaliza que o handleLogout já está em execução
let isLoggingOut = false;

// Flag que sinaliza que o fluxo de exclusão de conta está em andamento.
window.isAccountDeletionInProgress = false;

// Referência mutável ao flag de primeira carga — passada ao firebase-listener.js
// como objeto para permitir atualização bidirecional sem closures complexas
const firstLoadReference = { value: true };

// Referência à função de unsubscribe do listener de listas próprias
let unsubscribeOwnedListsListener = null;

/* ==========================================================================
   ATUALIZAÇÃO DO TÍTULO DE BOAS-VINDAS
   ========================================================================== */

/**
 * Atualiza o título de boas-vindas com a saudação baseada na hora do dia
 * e o nome do usuário descriptografado do localStorage.
 */
window.updateWelcomeTitle = async function () {
  const welcomeTitleElement = document.getElementById("welcome-user-title");
  const greeting = window.getGreetingByTimeOfDay();

  if (!welcomeTitleElement) return;

  // Tenta ler o displayName descriptografado usando o uid do usuário autenticado
  const currentUser = firebaseAuth.currentUser;
  if (currentUser) {
    const { displayName } = await readDecryptedUserDataFromStorage(
      currentUser.uid,
    );
    if (displayName && displayName.trim() !== "") {
      // Exibe apenas o primeiro nome
      const firstNameOnly = displayName.trim().split(" ")[0];
      welcomeTitleElement.textContent = `${greeting}, ${firstNameOnly}!`;
      return;
    }
  }

  welcomeTitleElement.textContent = `${greeting}!`;
};

/* ==========================================================================
   CRIAÇÃO DE DOCUMENTO DE NOVO USUÁRIO
   ========================================================================== */

/**
 * Cria o documento de usuário no Firestore para um novo usuário autenticado
 * que não possui dados no sistema.
 *
 * @param {Object} authenticatedUser - Objeto user do Firebase Auth
 * @param {string} resolvedDisplayName - displayName já resolvido com fallback ao pending flag
 * @returns {Promise<void>}
 */
async function createNewUserDocument(authenticatedUser, resolvedDisplayName) {
  const userReference = doc(firestore, "users", authenticatedUser.uid);
  await setDoc(userReference, {
    uid: authenticatedUser.uid,
    displayName: resolvedDisplayName,
    email: authenticatedUser.email || null,
    createdAt: serverTimestamp(),
  });
}

/* ==========================================================================
   CANCELAMENTO DE LISTENERS DO FIRESTORE
   ========================================================================== */

/**
 * Cancela todos os listeners ativos do Firestore antes do signOut ou da deleção de conta.
 *
 * Exposta via window para que o my-account.js possa chamá-la durante o fluxo
 * de exclusão de conta.
 */
window.cancelActiveFirestoreListeners = function cancelActiveFirestoreListeners() {
  // Cancela o listener das listas próprias do usuário (initFirebaseListener)
  if (typeof unsubscribeOwnedListsListener === "function") {
    unsubscribeOwnedListsListener();
    unsubscribeOwnedListsListener = null;
  }

  // Cancela o listener das listas compartilhadas (initSharedListsListener no share-window.js)
  if (typeof window.unsubscribeSharedListsListener === "function") {
    window.unsubscribeSharedListsListener();
    window.unsubscribeSharedListsListener = null;
  }
};

/* ==========================================================================
   AUTENTICAÇÃO — FLUXO DE USUÁRIO AUTENTICADO
   ========================================================================== */

/**
 * Callback chamado após o primeiro carregamento do listener de listas próprias.
 * Navega para home-screen e inicializa o listener de listas compartilhadas.
 *
 * @param {string} userUid - UID do Firebase Auth do usuário autenticado
 */
function onFirstLoadComplete(userUid) {
  window.showScreen("home-screen");

  // Inicializa o listener de listas compartilhadas com o uid do usuário atual
  // após carregar as listas próprias (evita condição de corrida)
  if (window.initSharedListsListener) {
    window.initSharedListsListener(userUid);
  }
}

/**
 * Processa o usuário autenticado: verifica se é novo usuário, exibe overlay
 * de setup se necessário, salva dados criptografados e inicia o listener.
 *
 * Fluxo sem documento existente (novo usuário):
 *   1. Overlay inicia com "Preparando seu ambiente..."
 *   2. Cria documento no Firestore
 *   3. Overlay termina → home-screen
 *
 * Fluxo de login (documento já existe):
 *   1. Vai direto para home-screen via initFirebaseListener
 *
 * O guard isHandlingAuthenticatedUser impede re-disparos do
 * onAuthStateChanged (que podem ocorrer durante o fluxo de cadastro por
 * email/senha enquanto o updateProfile ainda está sendo executado).
 *
 * @param {Object} authenticatedUser - Objeto user do Firebase Auth
 */
async function handleAuthenticatedUser(authenticatedUser) {
  // Impede execuções paralelas do fluxo de autenticação
  if (isHandlingAuthenticatedUser) return;
  isHandlingAuthenticatedUser = true;

  try {
    const resolvedDisplayName =
      window.pendingEmailSignupDisplayName ||
      authenticatedUser.displayName ||
      "";

    // Limpa o flag após consumir — evita que reutilizações acidentais ocorram
    window.pendingEmailSignupDisplayName = null;

    // Verifica se o documento users/{uid} já existe (usuário já cadastrado)
    const { getDoc } = await import("./firebase.js");
    const userDocumentReference = doc(
      firestore,
      "users",
      authenticatedUser.uid,
    );
    const userDocumentSnapshot = await getDoc(userDocumentReference);

    if (!userDocumentSnapshot.exists()) {
      // Primeiro login com este uid — exibe overlay de preparação do ambiente
      const allScreens = document.querySelectorAll(
        ".app-container > div[id$='-screen']",
      );
      allScreens.forEach((screen) => {
        screen.classList.add("screen-hidden");
        screen.style.display = "none";
      });

      await runSetupAnimation(resolvedDisplayName);
      await createNewUserDocument(authenticatedUser, resolvedDisplayName);
    }

    // Salva dados criptografados no localStorage
    const displayNameToStore =
      resolvedDisplayName || authenticatedUser.displayName || "";
    await saveEncryptedUserDataToStorage(
      authenticatedUser.uid,
      displayNameToStore,
    );

    // Reseta o flag de primeira carga antes de iniciar o listener
    firstLoadReference.value = true;
    isHandlingAuthenticatedUser = false;

    // Inicia o listener e armazena o unsubscribe para controle no logout
    unsubscribeOwnedListsListener = initFirebaseListener(
      authenticatedUser.uid,
      firstLoadReference,
      onFirstLoadComplete,
    );
  } catch (authHandlingError) {
    console.error("Erro ao processar usuário autenticado:", authHandlingError);
    isHandlingAuthenticatedUser = false;
    window.showToast("Falha na comunicação com o Servidor!", "danger");
    if (window.showScreen) window.showScreen("home-screen");
  }
}

/* ==========================================================================
   LOGOUT
   ========================================================================== */

/**
 * Realiza o logout do usuário, limpa os dados criptografados do localStorage
 * e redireciona para a tela de onboarding.
 *
 * Os listeners do Firestore são cancelados ANTES do signOut para evitar
 * que o onSnapshot dispare com credenciais inválidas após a sessão ser encerrada.
 *
 * O guard isLoggingOut impede que um duplo clique no botão de logout dispare
 * signOut duas vezes, evitando erros silenciosos no Firebase Auth.
 *
 * O overlay de transição cobre a tela durante todo o processo para eliminar
 * o flash branco que ocorria entre o signOut e a exibição do onboarding.
 */
window.handleLogout = async function () {
  // Guard contra duplo clique: impede que o logout seja executado duas vezes
  if (isLoggingOut) return;
  isLoggingOut = true;

  // Exibe o overlay imediatamente para cobrir a transição visual
  showLogoutTransitionOverlay();

  try {
    if (window.deactivateDetailsRealtimeListener) {
      window.deactivateDetailsRealtimeListener();
    }

    cancelActiveFirestoreListeners();
    // Realiza o logout no Firebase Auth — invalida a sessão no servidor
    await signOut(firebaseAuth);

    clearUserDataFromStorage();
    window.marketListData = [];
    firstLoadReference.value = true;
    isHandlingAuthenticatedUser = false;
    isLoggingOut = false;

    window.resetThemeToLight();

    // Navega para o onboarding e aguarda o carrossel estar inicializado antes de remover o overlay
    window.showScreen("onboarding-screen");

    // Aguarda um frame extra após a navegação para garantir que o
    // initOnboardingCarousel já renderizou o conteúdo no DOM
    await new Promise((resolve) => requestAnimationFrame(resolve));
    await new Promise((resolve) => setTimeout(resolve, 80));

    hideLogoutTransitionOverlay();
  } catch (logoutError) {
    // Libera o guard e remove o overlay em caso de erro para permitir nova tentativa
    isLoggingOut = false;
    hideLogoutTransitionOverlay();

    console.error("Erro ao fazer logout:", logoutError);
    window.showToast("Erro ao sair. Tente novamente.", "danger");
  }
};

/* ==========================================================================
   INICIALIZAÇÃO DO APP — FIREBASE AUTH COMO PORTÃO DE ENTRADA
   ========================================================================== */

/**
 * Inicializa o app ouvindo o estado de autenticação do Firebase.
 * O onAuthStateChanged é o único ponto de entrada.
 *
 * Fluxo:
 * - Usuário autenticado → handleAuthenticatedUser → initFirebaseListener
 * - Usuário não autenticado → onboarding
 *
 * O guard isHandlingAuthenticatedUser impede re-disparos do
 * onAuthStateChanged (que podem ocorrer durante o fluxo de cadastro por
 * email/senha enquanto o updateProfile ainda está sendo executado).
 */
async function initApp() {
  onAuthStateChanged(firebaseAuth, async (authenticatedUser) => {
    if (authenticatedUser) {
      // Usuário com sessão ativa no Firebase Auth
      if (!isHandlingAuthenticatedUser) {
        await handleAuthenticatedUser(authenticatedUser);
      }
    } else {
      // Sem sessão ativa — exibe onboarding
      if (!isHandlingAuthenticatedUser && !window.isAccountDeletionInProgress) {
        window.showScreen("onboarding-screen");
      }
    }
  });

  const searchInputElement = document.getElementById("search-input");
  if (searchInputElement) {
    searchInputElement.addEventListener("input", () => {
      if (window.renderMarketLists) window.renderMarketLists();
    });
  }

  const itemSearchInputElement = document.getElementById("item-search-input");
  if (itemSearchInputElement) {
    itemSearchInputElement.addEventListener("input", () => {
      if (window.renderListDetails) window.renderListDetails();
    });
  }
}

document.addEventListener("DOMContentLoaded", initApp);
