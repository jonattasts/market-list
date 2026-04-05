/* ==========================================================================
   ESTADO E CONFIGURAÇÕES
   ========================================================================== */
import {
  firestore,
  firebaseAuth,
  collection,
  doc,
  updateDoc,
  serverTimestamp,
  setDoc,
  getDoc,
  getDocsFromServer,
  getDocs,
  deleteDoc,
  query,
  orderBy,
  onSnapshot,
  where,
  limit,
  signOut,
  onAuthStateChanged,
} from "./firebase.js";

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
// Substitui o uso direto de currentListIndex em operações de leitura/escrita,
// pois o índice posicional muda sempre que o marketListData é reordenado pelo
// onSnapshot — causando referência a listas erradas após sincronização.
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

// Variável de controle para primeira carga
let isFirstLoad = true;

// Flag que sinaliza que o handleAuthenticatedUser já está em execução,
// evitando que o onAuthStateChanged dispare múltiplas vezes enquanto
// o fluxo de autenticação ainda está em andamento (ex: durante o overlay)
let isHandlingAuthenticatedUser = false;

// Flag que sinaliza que o handleLogout já está em execução,
// evitando que um duplo clique no botão de logout dispare signOut duas vezes
let isLoggingOut = false;

let unsubscribeOwnedListsListener = null;

/* ==========================================================================
   CRIPTOGRAFIA — AES-GCM COM CHAVE DERIVADA VIA PBKDF2
   ========================================================================== */

// Salt fixo do app — não é segredo crítico, apenas evita ataques de rainbow table
// O segredo real é o uid que só o Firebase Auth entrega após autenticação real
const APPLICATION_SALT = "marketlist-salt-v1";

/**
 * Deriva uma chave AES-256-GCM a partir do uid do usuário autenticado.
 * Usa PBKDF2 com 100.000 iterações para dificultar brute-force.
 *
 * @param {string} userUid - UID do Firebase Auth do usuário autenticado
 * @returns {Promise<CryptoKey>} Chave AES-GCM derivada
 */
async function deriveEncryptionKeyFromUid(userUid) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(userUid),
    { name: "PBKDF2" },
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: encoder.encode(APPLICATION_SALT),
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/**
 * Criptografa uma string usando AES-GCM com a chave derivada do uid.
 * Gera um IV aleatório a cada chamada para garantir unicidade do cifrado.
 *
 * @param {string} plainText - Texto em claro a ser criptografado
 * @param {CryptoKey} encryptionKey - Chave AES-GCM derivada
 * @returns {Promise<string>} Objeto JSON serializado com iv e dados cifrados em base64
 */
async function encryptData(plainText, encryptionKey) {
  const encoder = new TextEncoder();
  const initializationVector = crypto.getRandomValues(new Uint8Array(12));

  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: initializationVector },
    encryptionKey,
    encoder.encode(plainText),
  );

  // Serializa iv e dados cifrados como base64 para armazenamento no localStorage
  const encryptedArray = Array.from(new Uint8Array(encryptedBuffer));
  const ivArray = Array.from(initializationVector);

  return JSON.stringify({
    iv: btoa(String.fromCharCode(...ivArray)),
    data: btoa(String.fromCharCode(...encryptedArray)),
  });
}

/**
 * Descriptografa um valor cifrado previamente por encryptData.
 * Retorna null se a descriptografia falhar (chave errada, dado corrompido, etc.)
 *
 * @param {string} encryptedJson - JSON serializado com iv e dados em base64
 * @param {CryptoKey} encryptionKey - Chave AES-GCM derivada
 * @returns {Promise<string|null>} Texto em claro ou null em caso de falha
 */
async function decryptData(encryptedJson, encryptionKey) {
  try {
    const { iv, data } = JSON.parse(encryptedJson);

    const initializationVector = new Uint8Array(
      atob(iv)
        .split("")
        .map((char) => char.charCodeAt(0)),
    );
    const encryptedBuffer = new Uint8Array(
      atob(data)
        .split("")
        .map((char) => char.charCodeAt(0)),
    );

    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: initializationVector },
      encryptionKey,
      encryptedBuffer,
    );

    return new TextDecoder().decode(decryptedBuffer);
  } catch (decryptionError) {
    console.error(
      "Erro ao descriptografar dado do localStorage:",
      decryptionError,
    );
    return null;
  }
}

/**
 * Salva os dados do usuário autenticado no localStorage de forma criptografada.
 * A chave de criptografia é derivada do uid via PBKDF2 — nunca exposta em claro.
 *
 * @param {string} userUid - UID do Firebase Auth
 * @param {string} userDisplayName - Nome de exibição do usuário
 */
async function saveEncryptedUserDataToStorage(userUid, userDisplayName) {
  const encryptionKey = await deriveEncryptionKeyFromUid(userUid);
  const encryptedDisplayName = await encryptData(
    userDisplayName,
    encryptionKey,
  );
  const encryptedUid = await encryptData(userUid, encryptionKey);

  // Criptografa também o uid de referência — usado para derivar a chave
  // na próxima sessão via onAuthStateChanged. Mesmo que o uid de referência
  // seja necessário para a descriptografia, mantê-lo criptografado impede
  // leitura direta por extensões maliciosas ou scripts de terceiros.
  // A descriptografia é possível pois o uid real vem do Firebase Auth SDK
  // (onAuthStateChanged), que o entrega mesmo sem o localStorage.
  const encryptedUidReference = await encryptData(userUid, encryptionKey);

  localStorage.setItem("mkuid_ref", encryptedUidReference);
  localStorage.setItem("mku", encryptedDisplayName);
  localStorage.setItem("mkuid", encryptedUid);
}

/**
 * Lê e descriptografa os dados do usuário do localStorage.
 * Requer o uid como parâmetro para derivar a chave correta.
 *
 * @param {string} userUid - UID do Firebase Auth (vem do onAuthStateChanged)
 * @returns {Promise<{displayName: string|null, uid: string|null}>} Dados descriptografados
 */
async function readDecryptedUserDataFromStorage(userUid) {
  const encryptedDisplayName = localStorage.getItem("mku");
  const encryptedUid = localStorage.getItem("mkuid");

  if (!encryptedDisplayName || !encryptedUid) {
    return { displayName: null, uid: null };
  }

  const encryptionKey = await deriveEncryptionKeyFromUid(userUid);

  const displayName = await decryptData(encryptedDisplayName, encryptionKey);
  const uid = await decryptData(encryptedUid, encryptionKey);

  return { displayName, uid };
}

/**
 * Limpa todos os dados do usuário do localStorage.
 * Chamado no logout ou em caso de erro de autenticação.
 */
function clearUserDataFromStorage() {
  localStorage.removeItem("mku");
  localStorage.removeItem("mkuid");
  localStorage.removeItem("mkuid_ref");
  // Remove chave legada de versões anteriores sem criptografia
  localStorage.removeItem("marketUserName");
}

/* ==========================================================================
   SISTEMA DE VALIDAÇÃO DE DEPENDÊNCIAS - INTEGRADO AO SKELETON EXISTENTE
   ========================================================================== */

/**
 * Configuração de validação para cada tela que requer verificação de dependências
 */
const screenValidationConfiguration = {
  "market-lists-screen": {
    screenName: "Listas de Compras",
    requiredFunctions: [
      "renderMarketLists",
      "showListsSkeleton",
      "handleSearchInput",
      "navigateToPreviousPage",
      "navigateToNextPage",
    ],
    requiresDatabase: true,
    requiresChartJs: false,
    previousScreen: "home-screen",
    skeletonHiderFunction: "hideListsSkeleton",
  },
  "dashboard-screen": {
    screenName: "Análise de Consumo",
    requiredFunctions: [
      "initDashboardAnalisys",
      "activateDashboardTab",
      "applyDashboardFilter",
      "toggleFilterModal",
    ],
    requiresDatabase: true,
    requiresChartJs: true,
    previousScreen: "market-lists-screen",
    skeletonHiderFunction: "hideTabSkeleton",
  },
};

// Estado atual da validação
let currentValidationState = {
  isValidating: false,
  targetScreen: null,
  validationResults: {},
};

/* ==========================================================================
   UTILITÁRIOS GLOBAIS
   ========================================================================== */
window.normalizeString = function (str) {
  if (!str) return "";
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
};

window.capitalize = function (str) {
  if (!str) return "";
  const trimmed = str.trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() + trimmed.slice(1) : "";
};

window.showToast = function (message, type = "danger") {
  window.toastMessage.innerText = message;
  window.toast.classList.remove("success", "danger", "show");
  window.toast.classList.add(type === "success" ? "success" : "danger");
  window.toastIcon.setAttribute(
    "name",
    type === "success" ? "checkmark-circle-outline" : "alert-circle-outline",
  );

  setTimeout(() => toast.classList.add("show"), 10);
  const autoHide = setTimeout(() => toast.classList.remove("show"), 3500);
  window.toast.onclick = () => {
    window.toast.classList.remove("show");
    clearTimeout(autoHide);
  };
};

window.formatDate = function (dateStr) {
  if (!dateStr) return "";
  const [year, month, day] = dateStr.split("-");
  return `${day}/${month}/${year}`;
};

window.formatCurrencyInput = function (input) {
  let value = input.value.replace(/\D/g, "");
  value = (value / 100).toFixed(2) + "";
  value = value.replace(".", ",").replace(/(\d)(?=(\d{3})+(?!\d))/g, "$1.");
  input.value = value;
};

/**
 * Resolve o índice posicional atual da lista aberta usando o currentListId estável.
 * Deve ser chamado no início de qualquer operação que precise de currentListIndex,
 * garantindo que o índice reflita a posição real no array após reordenações do onSnapshot.
 *
 * @returns {number} Índice atual da lista no marketListData, ou o currentListIndex anterior se não encontrado
 */
window.resolveCurrentListIndex = function () {
  if (!window.currentListId) return window.currentListIndex;

  const resolvedIndex = window.marketListData.findIndex(
    (list) => list.id === window.currentListId,
  );

  // Atualiza o currentListIndex para manter compatibilidade com módulos externos
  if (resolvedIndex !== -1) {
    window.currentListIndex = resolvedIndex;
  }

  return resolvedIndex !== -1 ? resolvedIndex : window.currentListIndex;
};

/* ==========================================================================
   PROTEÇÃO ANTI-REGRESSÃO DE DADOS — COMPARAÇÃO POR TIMESTAMP
   ========================================================================== */

/**
 *
 * @param {Object|null|undefined} updatedAt - Campo updatedAt do documento
 * @returns {number} Tempo em milissegundos, ou 0 se inválido
 */
function extractTimestampMilliseconds(updatedAt) {
  if (!updatedAt) return 0;

  // Timestamp do Firestore com método toMillis()
  if (typeof updatedAt.toMillis === "function") {
    return updatedAt.toMillis();
  }

  // Objeto com campo seconds (formato serializado do Firestore)
  if (typeof updatedAt.seconds === "number") {
    return updatedAt.seconds * 1000;
  }

  return 0;
}

/**
 * Verifica se os dados recebidos do Firestore são mais recentes do que
 * os dados atualmente armazenados em memória para a mesma lista.
 *
 * Regra: se o timestamp do dado recebido for MENOR que o do dado em memória,
 * o dado em memória é considerado mais atual e NÃO deve ser substituído.
 *
 * @param {Object} incomingListData - Dados recebidos do snapshot do Firestore
 * @param {Object|undefined} existingListData - Dados atualmente em memória para a mesma lista
 * @returns {boolean} True se os dados recebidos são mais recentes ou iguais (pode substituir)
 */
function isIncomingDataMoreRecent(incomingListData, existingListData) {
  // Se não há dado em memória, sempre aceita o dado recebido
  if (!existingListData) return true;

  const incomingTimestamp = extractTimestampMilliseconds(
    incomingListData.updatedAt,
  );
  const existingTimestamp = extractTimestampMilliseconds(
    existingListData.updatedAt,
  );

  // Aceita dado sem timestamp (documentos antigos sem o campo updatedAt)
  if (incomingTimestamp === 0) return true;

  // Só substitui se o dado recebido for mais recente ou igual ao que está em memória
  return incomingTimestamp >= existingTimestamp;
}

/**
 * Mescla uma lista de documentos recebidos do Firestore com o marketListData atual,
 * aplicando proteção anti-regressão por timestamp em cada item individualmente.
 *
 * Para cada documento recebido:
 * - Se não existe em memória: insere normalmente
 * - Se já existe em memória: substitui APENAS se o dado recebido for mais recente
 *
 * @param {Array} currentMarketListData - Array atual do marketListData
 * @param {Array} incomingDocuments - Documentos recebidos do snapshot
 * @returns {Array} Novo array mesclado com proteção anti-regressão
 */
function mergeListDataWithTimestampProtection(
  currentMarketListData,
  incomingDocuments,
) {
  const mergedData = [...currentMarketListData];

  incomingDocuments.forEach((incomingDocument) => {
    const existingIndex = mergedData.findIndex(
      (existingList) => existingList.id === incomingDocument.id,
    );

    if (existingIndex === -1) {
      // Lista ainda não existe em memória: insere normalmente
      mergedData.push(incomingDocument);
    } else {
      // Lista já existe: substitui apenas se o dado recebido for mais recente
      if (
        isIncomingDataMoreRecent(incomingDocument, mergedData[existingIndex])
      ) {
        mergedData[existingIndex] = incomingDocument;
      }
      // Caso contrário, mantém o dado mais recente que já está em memória
    }
  });

  return mergedData;
}

/* ==========================================================================
   MIGRAÇÃO AUTOMÁTICA — NOME → UID
   ========================================================================== */

/**
 * Busca os IDs das listas legadas após a autenticação do usuário.
 *
 * Retorna diretamente o array de IDs — sem passar por localStorage,
 * evitando problemas de sincronização entre pré e pós autenticação.
 *
 * @param {string} legacyUserName - Nome legado do usuário (ex: "Jhon")
 * @returns {Promise<Array<string>>} Array de IDs de listas encontradas
 */
async function fetchLegacyListIdsAfterAuth(legacyUserName) {
  try {
    const legacyQuery = query(
      collection(firestore, "lists"),
      where("userId", "==", legacyUserName),
    );
    const legacySnapshot = await getDocs(legacyQuery);
    return legacySnapshot.docs.map((firestoreDoc) => firestoreDoc.id);
  } catch (fetchError) {
    console.warn(
      "Não foi possível buscar listas legadas:",
      fetchError.code,
      fetchError.message,
    );
    return [];
  }
}

/**
 * Executa a migração dos dados legados (nome → UID) usando os IDs
 * obtidos por fetchLegacyListIdsAfterAuth após a autenticação.
 *
 * @param {Object} authenticatedUser - Objeto user do Firebase Auth
 * @param {string} legacyUserName - Nome salvo no localStorage antes da migração
 * @param {Array<string>} legacyListIds - IDs das listas legadas a migrar
 * @param {string} resolvedDisplayName - displayName já resolvido (inclui pendingEmailSignupDisplayName)
 * @returns {Promise<boolean>} True se migração bem-sucedida
 */
async function executeLegacyDataMigration(
  authenticatedUser,
  legacyUserName,
  legacyListIds,
  resolvedDisplayName,
) {
  try {
    // Força refresh do token para garantir que as Security Rules
    // recebam credenciais válidas e atualizadas antes das operações no Firestore
    await authenticatedUser.getIdToken(true);

    // Etapa 1: cria o documento users/{uid} individualmente
    const newUserReference = doc(firestore, "users", authenticatedUser.uid);
    await setDoc(newUserReference, {
      uid: authenticatedUser.uid,
      displayName: resolvedDisplayName,
      email: authenticatedUser.email || null,
      createdAt: serverTimestamp(),
      migratedAt: serverTimestamp(),
    });

    // Etapa 2: atualiza cada lista individualmente por ID
    const migrationPromises = legacyListIds.map((listId) => {
      const listReference = doc(firestore, "lists", listId);
      return updateDoc(listReference, {
        userId: authenticatedUser.uid,
        sharedWith: [],
        updatedAt: serverTimestamp(),
      });
    });

    await Promise.all(migrationPromises);

    // Etapa 3: remove o documento legado users/{nomeNormalizado}
    const legacyUserId = legacyUserName.toLowerCase().replace(/\s/g, "");
    const legacyUserReference = doc(firestore, "users", legacyUserId);
    try {
      const legacyUserSnapshot = await getDoc(legacyUserReference);
      if (legacyUserSnapshot.exists()) {
        await deleteDoc(legacyUserReference);
      }
    } catch (legacyUserSnapshotError) {
      console.error(
        "Erro ao buscar documento legado:",
        legacyUserSnapshotError,
      );
    }

    return true;
  } catch (migrationError) {
    console.error(
      "Erro na migração de dados:",
      migrationError.code,
      migrationError.message,
    );
    return false;
  }
}

/**
 * Cria o documento de usuário no Firestore para um novo usuário autenticado
 * que não possui dados legados no sistema.
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

/**
 * Verifica se o usuário autenticado já possui documento no Firestore.
 * Executa migração se necessário, controlando o fluxo de telas corretamente.
 *
 * Fluxo com dados legados:
 *   1. Overlay inicia com "Migrando seus dados..."
 *   2. Migração executa DENTRO da animação
 *   3. Se sucesso → overlay termina → home-screen → toast de sucesso
 *   4. Se erro → overlay termina → logout → onboarding → toast de erro
 *
 * Fluxo sem dados legados (usuário novo):
 *   1. Overlay inicia com "Preparando seu ambiente..."
 *   2. Cria documento no Firestore
 *   3. Overlay termina → home-screen
 *
 * Fluxo de login (documento já existe):
 *   1. Vai direto para home-screen via initFirebaseListener
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

    // Verifica se o documento users/{uid} já existe (usuário já migrado ou logado antes)
    const userDocumentReference = doc(
      firestore,
      "users",
      authenticatedUser.uid,
    );
    const userDocumentSnapshot = await getDoc(userDocumentReference);

    if (!userDocumentSnapshot.exists()) {
      // Primeiro login com este uid — verifica se há dados legados para migrar
      const legacyUserName = localStorage.getItem("marketUserName");

      if (legacyUserName) {
        // --- FLUXO COM DADOS LEGADOS ---
        const overlayElement = document.getElementById("sync-overlay");
        const progressBarElement = document.getElementById("sync-progress-bar");
        const syncTextElement = document.querySelector(".sync-text");
        const syncSubtextElement = document.querySelector(".sync-subtext");

        // Esconde todas as telas e exibe apenas o overlay de migração,
        // evitando que a tela de onboarding-finish apareça durante o processo
        const allScreens = document.querySelectorAll(
          ".app-container > div[id$='-screen']",
        );
        allScreens.forEach((screen) => {
          screen.classList.add("screen-hidden");
          screen.style.display = "none";
        });

        // Exibe o overlay imediatamente
        if (overlayElement) {
          overlayElement.style.display = "flex";
          await new Promise((r) => setTimeout(r, 50));
          overlayElement.classList.add("active");
        }

        if (syncTextElement)
          syncTextElement.innerText = "Migrando seus dados...";
        if (syncSubtextElement) {
          syncSubtextElement.innerText =
            "Atualizando suas listas para o novo sistema seguro.";
        }

        // Etapa 1 (33%): busca os IDs das listas com o usuário já autenticado
        // A query funciona agora porque request.auth != null é true
        if (progressBarElement) progressBarElement.style.width = "33%";
        const legacyListIds = await fetchLegacyListIdsAfterAuth(legacyUserName);
        await new Promise((r) => setTimeout(r, 400));

        // Etapa 2 (66%): executa a migração com os IDs encontrados
        if (progressBarElement) progressBarElement.style.width = "66%";
        const migrationSucceeded = await executeLegacyDataMigration(
          authenticatedUser,
          legacyUserName,
          legacyListIds,
          resolvedDisplayName,
        );
        await new Promise((r) => setTimeout(r, 400));

        if (!migrationSucceeded) {
          // Migração falhou — fecha overlay, faz logout e volta ao onboarding
          if (progressBarElement) progressBarElement.style.width = "0%";
          if (overlayElement) {
            overlayElement.classList.remove("active");
            await new Promise((r) => setTimeout(r, 500));
            overlayElement.style.display = "none";
          }
          isHandlingAuthenticatedUser = false;
          await firebaseAuth.signOut();

          window.resetThemeToLight();

          executeScreenNavigation("onboarding-screen");
          setTimeout(() => {
            window.showToast(
              "Erro ao migrar dados. Tente novamente.",
              "danger",
            );
          }, 400);
          return;
        }

        // Etapa 3 (100%): migração concluída — fecha overlay e vai para home
        if (progressBarElement) progressBarElement.style.width = "100%";
        await new Promise((r) => setTimeout(r, 600));

        if (overlayElement) {
          overlayElement.classList.remove("active");
          await new Promise((r) => setTimeout(r, 500));
          overlayElement.style.display = "none";
        }

        // Remove chave legada após migração bem-sucedida
        localStorage.removeItem("marketUserName");

        // Salva dados criptografados e inicializa o listener
        // initFirebaseListener → isFirstLoad → showScreen("home-screen")
        await saveEncryptedUserDataToStorage(
          authenticatedUser.uid,
          resolvedDisplayName,
        );

        isFirstLoad = true;
        isHandlingAuthenticatedUser = false;
        initFirebaseListener(authenticatedUser.uid);

        // Toast de sucesso exibido após a home estar visível
        setTimeout(() => {
          window.showToast("Dados migrados com sucesso!", "success");
        }, 900);

        return;
      } else {
        // Exibe o overlay com mensagem de preparação do ambiente antes de ir para home.
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
    }

    // Salva dados criptografados no localStorage
    const displayNameToStore =
      resolvedDisplayName || authenticatedUser.displayName || "";
    await saveEncryptedUserDataToStorage(
      authenticatedUser.uid,
      displayNameToStore,
    );

    // Inicializa o listener do Firebase com o uid
    isFirstLoad = true;
    isHandlingAuthenticatedUser = false;
    initFirebaseListener(authenticatedUser.uid);
  } catch (authHandlingError) {
    console.error("Erro ao processar usuário autenticado:", authHandlingError);
    isHandlingAuthenticatedUser = false;
    window.showToast("Falha na comunicação com o Servidor!", "danger");
    executeScreenNavigation("home-screen");
  }
}

/* ==========================================================================
   SISTEMA DE VALIDAÇÃO - FUNÇÕES CORE
   ========================================================================== */

/**
 *
 * Verifica se a conexão com o Firebase/Firestore está funcionando corretamente.
 * Usa getDocsFromServer para forçar leitura direta no servidor, ignorando o cache
 * offline do Firestore.
 *
 * Um timeout de 5 segundos é usado como fallback para casos em que o Firebase
 * simplesmente não responde (ex: sem rede, projectId inexistente).
 *
 * @returns {Promise<boolean>} True se conexão OK e com permissões, false se falhou
 */
async function validateDatabaseConnection() {
  try {
    const currentUser = firebaseAuth.currentUser;

    if (!currentUser) {
      console.warn("Database validation: No authenticated user found");
      return false;
    }

    // Cria uma promise de timeout para forçar falha caso o Firebase fique pendente
    // Necessário porque projectId inexistente pode não gerar exceção imediata
    // O tempo é maior (5s) para acomodar latência real de rede sem falsos negativos
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(
          new Error(
            "VALIDATION_TIMEOUT: Firebase connection timed out after 5 seconds",
          ),
        );
      }, 5000);
    });

    const listsQuery = query(
      collection(firestore, "lists"),
      where("userId", "==", currentUser.uid),
      limit(1),
    );

    // Tenta executar a query - isso vai falhar se:
    // 1. Não há conexão de internet
    // 2. As regras de segurança negam acesso
    // 3. O projeto Firebase está inacessível
    await Promise.race([getDocsFromServer(listsQuery), timeoutPromise]);

    return true;
  } catch (error) {
    console.error("Database validation error:", error);

    if (error.message && error.message.startsWith("VALIDATION_TIMEOUT")) {
      return false;
    }

    // Erros que indicam falha real de conexão ou permissão
    const connectionErrorCodes = [
      "permission-denied", // Sem permissão de acesso
      "unavailable", // Serviço indisponível
      "network-request-failed", // Sem conexão de rede
      "resource-exhausted", // Quota excedida
      "unauthenticated", // Não autenticado
      "internal", // Erro interno do Firebase
      "unknown", // Erro desconhecido
      "invalid-argument", // Argumento inválido (ex: projectId malformado)
      "not-found", // Projeto não encontrado no Firebase
    ];

    // Se o código do erro está na lista de erros críticos, considera falha
    if (error.code && connectionErrorCodes.includes(error.code)) {
      return false;
    }

    // Se o erro indica que está offline explicitamente
    if (error.message && error.message.includes("client is offline")) {
      return false;
    }

    // Se o erro indica que não conseguiu conectar ao backend
    if (
      error.message &&
      error.message.includes("Could not reach Cloud Firestore backend")
    ) {
      return false;
    }

    // Se o erro contém indicadores de configuração inválida do Firebase
    if (
      error.message &&
      (error.message.includes("invalid") ||
        error.message.includes("not found") ||
        error.message.includes("does not exist"))
    ) {
      return false;
    }

    // Para outros erros (como não encontrar documentos), considera sucesso
    // pois a conexão existe mas não há dados
    return true;
  }
}

/**
 * Verifica se a biblioteca Chart.js está carregada e funcional
 *
 * @returns {boolean} True se Chart.js disponível, false se não
 */
function validateChartJsLibrary() {
  try {
    // Verifica se o objeto Chart existe no window
    if (typeof window.Chart === "undefined") {
      return false;
    }

    // Verifica se é possível criar um canvas de teste
    const testCanvas = document.createElement("canvas");
    const testContext = testCanvas.getContext("2d");

    if (!testContext) {
      return false;
    }

    // Tenta criar um gráfico de teste mínimo
    const testChart = new window.Chart(testContext, {
      type: "bar",
      data: {
        labels: ["test"],
        datasets: [{ data: [1] }],
      },
      options: { animation: false, responsive: false },
    });

    // Destrói o gráfico de teste imediatamente
    testChart.destroy();

    return true;
  } catch (error) {
    console.error("Chart.js validation error:", error);
    return false;
  }
}

/**
 * Verifica se as funções necessárias de uma tela estão disponíveis no escopo global
 *
 * @param {Array<string>} requiredFunctionsList - Lista de nomes de funções requeridas
 * @returns {Object} Objeto com status e funções faltantes
 */
function validateScreenFunctions(requiredFunctionsList) {
  const missingFunctions = [];
  const availableFunctions = [];

  for (const functionName of requiredFunctionsList) {
    if (typeof window[functionName] === "function") {
      availableFunctions.push(functionName);
    } else {
      missingFunctions.push(functionName);
    }
  }

  return {
    isValid: missingFunctions.length === 0,
    missingFunctions: missingFunctions,
    availableFunctions: availableFunctions,
  };
}

/**
 *
 * Executa a validação completa de dependências de uma tela.
 * Esta função roda em paralelo ao skeleton existente.
 *
 * A ordem de validação é intencional e garante o redirecionamento correto:
 * 1. Banco de dados → falha redireciona para home-screen com toast de conexão
 * 2. Chart.js → falha redireciona para tela anterior com toast de indisponibilidade
 * 3. Funções da tela → falha redireciona para tela anterior com toast de indisponibilidade
 *
 * @param {string} screenIdentifier - ID da tela a ser validada
 * @returns {Promise<Object>} Resultado da validação com status, tipo de falha e erros
 */
async function executeScreenValidation(screenIdentifier) {
  const configuration = screenValidationConfiguration[screenIdentifier];
  if (!configuration) {
    return { isValid: true, failureType: null, errors: [] }; // Tela não requer validação
  }

  const validationResults = {
    isValid: true,
    // Tipo de falha: "database" redireciona para home-screen, "screen" redireciona para tela anterior
    failureType: null,
    errors: [],
    details: {},
  };

  // Etapa 1: Validação do Banco de Dados (se necessário)
  if (configuration.requiresDatabase) {
    const databaseConnectionValid = await validateDatabaseConnection();
    validationResults.details.database = databaseConnectionValid;

    if (!databaseConnectionValid) {
      validationResults.isValid = false;
      validationResults.failureType = "database";
      validationResults.errors.push("Conexão com banco de dados indisponível");
      return validationResults;
    }
  }

  // Etapa 2: Validação do Chart.js (se necessário)
  if (configuration.requiresChartJs) {
    const chartJsLibraryValid = validateChartJsLibrary();
    validationResults.details.chartJs = chartJsLibraryValid;

    if (!chartJsLibraryValid) {
      validationResults.isValid = false;
      validationResults.failureType = "screen";
      validationResults.errors.push("Biblioteca Chart.js não disponível");
      return validationResults;
    }
  }

  // Etapa 3: Validação das Funções da Tela
  const functionsValidationResult = validateScreenFunctions(
    configuration.requiredFunctions,
  );
  validationResults.details.functions = functionsValidationResult;

  if (!functionsValidationResult.isValid) {
    validationResults.isValid = false;
    validationResults.failureType = "screen";
    validationResults.errors.push(
      `Funções indisponíveis: ${functionsValidationResult.missingFunctions.join(", ")}`,
    );
  }

  currentValidationState.validationResults = validationResults;
  return validationResults;
}

/**
 *
 * - Falha de banco (failureType === "database"):
 *   Redireciona para home-screen com toast "Falha na comunicação com o Servidor!"
 *
 * - Falha de tela (failureType === "screen"):
 *   Redireciona para a tela anterior com toast "A [Nome da Tela] não está disponível no momento!"
 *
 * @param {string} screenIdentifier - ID da tela validada
 * @param {Object} validationResult - Resultado da validação (com failureType)
 * @returns {boolean} True se pode prosseguir com renderização, false se deve abortar
 */
function handleValidationResult(screenIdentifier, validationResult) {
  const configuration = screenValidationConfiguration[screenIdentifier];

  /**
   *
   * Para o dashboard o skeleton será restaurado e substituído pelo conteúdo real dentro de
   * activateDashboardTab → hideTabSkeleton → loadPurchaseEfficiencyModule,
   * chamado logo em seguida por initDashboardAnalisys.
   *
   * Para listas e para falhas de validação do dashboard, o hider ainda é chamado normalmente.
   *
   */
  const isDashboardSuccessPath =
    screenIdentifier === "dashboard-screen" && validationResult.isValid;

  if (
    !isDashboardSuccessPath &&
    configuration &&
    configuration.skeletonHiderFunction
  ) {
    const hiderFunction = window[configuration.skeletonHiderFunction];
    if (typeof hiderFunction === "function") {
      // Para dashboard em falha, precisa passar o nome da aba ativa
      if (screenIdentifier === "dashboard-screen" && window.activeTabModule) {
        hiderFunction(window.activeTabModule);
      } else {
        hiderFunction();
      }
    }
  }

  if (validationResult.isValid) {
    currentValidationState.isValidating = false;
    return true;
  }

  // Falha de banco de dados: redireciona para home-screen
  if (validationResult.failureType === "database") {
    window.showToast("Falha na comunicação com o Servidor!", "danger");
    executeScreenNavigation("home-screen");
  }
  // Falha de funcionalidades da tela (plugins ou funções): redireciona para tela anterior
  // Mantém o usuário no fluxo informando que aquela tela específica está indisponível
  else if (validationResult.failureType === "screen" && configuration) {
    const screenDisplayName = configuration.screenName || screenIdentifier;
    window.showToast(
      `A ${screenDisplayName} não está disponível no momento!`,
      "danger",
    );
    executeScreenNavigation(configuration.previousScreen);
  }
  // Fallback genérico para casos não mapeados
  else {
    window.showToast("Falha na comunicação com o Servidor!", "danger");
    executeScreenNavigation("home-screen");
  }

  currentValidationState.isValidating = false;
  return false;
}

/* ==========================================================================
   PERSISTÊNCIA FIREBASE
   ========================================================================== */
window.saveAndSync = async function () {
  // Resolve o índice pelo ID estável antes de qualquer operação,
  // evitando que uma reordenação do onSnapshot aponte para a lista errada
  const resolvedIndex = window.resolveCurrentListIndex();

  const currentList = window.marketListData[resolvedIndex];
  if (!currentList || !currentList.id) return;

  try {
    const listRef = doc(firestore, "lists", currentList.id);
    await updateDoc(listRef, {
      listName: currentList.listName,
      location: currentList.location,
      date: currentList.date,
      categories: currentList.categories,
      updatedAt: serverTimestamp(),
      // Preserva o userId original do documento — não sobrescreve com o usuário logado,
      userId: currentList.userId,
    });
  } catch (e) {
    console.error("Erro ao atualizar Firestore:", e);
    window.showToast("Falha na comunicação com o Servidor!", "danger");
  }
};

/* --- LÓGICA DE CONFIGURAÇÃO COM UI DE ANIMAÇÃO --- */
async function runSetupAnimation() {
  const overlay = document.getElementById("sync-overlay");
  const progressBar = document.getElementById("sync-progress-bar");
  const syncText = document.querySelector(".sync-text");
  const syncSubtext = document.querySelector(".sync-subtext");

  // Ativa a Overlay Visual
  if (overlay) {
    overlay.style.display = "flex";
    await new Promise((r) => setTimeout(r, 50));
    overlay.classList.add("active");
  }

  if (syncText) syncText.innerText = "Preparando seu ambiente...";
  if (syncSubtext)
    syncSubtext.innerText =
      "Preparando sua nuvem e organizando as prateleiras.";

  for (let i = 1; i <= 3; i++) {
    await new Promise((r) => setTimeout(r, 700));
    if (progressBar) {
      progressBar.style.width = `${(i / 3) * 100}%`;
    }
  }

  await new Promise((r) => setTimeout(r, 800));
  if (overlay) {
    overlay.classList.remove("active");
    setTimeout(() => (overlay.style.display = "none"), 500);
  }
  return true;
}

/* ==========================================================================
   LOGOUT
   ========================================================================== */

/**
 * Cancela todos os listeners ativos do Firestore antes do signOut.
 * Evita o erro "Missing or insufficient permissions" que ocorre quando
 * o onSnapshot tenta ler dados com credenciais já invalidadas.
 */
function cancelActiveFirestoreListeners() {
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
}

/**
 * Exibe o overlay de transição do logout para cobrir a tela
 * durante o intervalo entre o signOut e a exibição do onboarding,
 * eliminando o flash branco/cinza que ocorria nesse período.
 *
 * O overlay usa opacity para uma transição suave de entrada,
 * e é removido apenas após o onboarding estar visível e inicializado.
 */
function showLogoutTransitionOverlay() {
  const logoutOverlayElement = document.getElementById(
    "logout-transition-overlay",
  );
  if (!logoutOverlayElement) return;

  // Garante que o overlay esteja renderizado antes de animar a opacidade
  logoutOverlayElement.style.display = "block";
  requestAnimationFrame(() => {
    logoutOverlayElement.classList.add("visible");
  });
}

/**
 * Remove o overlay de transição do logout com um fade-out suave.
 * Chamado apenas após o onboarding estar visível e o carrossel inicializado,
 * garantindo que a tela de destino já esteja pronta antes do overlay sair.
 *
 * O delay de 350ms antes de ocultar o display corresponde à duração
 * da transição de opacidade definida no CSS (.logout-transition-overlay).
 */
function hideLogoutTransitionOverlay() {
  const logoutOverlayElement = document.getElementById(
    "logout-transition-overlay",
  );
  if (!logoutOverlayElement) return;

  logoutOverlayElement.classList.remove("visible");

  // Aguarda o fade-out antes de remover do fluxo visual
  setTimeout(() => {
    logoutOverlayElement.style.display = "none";
  }, 350);
}

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
    // sem alterar ou remover nenhum dado do Firestore do usuário
    await signOut(firebaseAuth);

    clearUserDataFromStorage();
    window.marketListData = [];
    isFirstLoad = true;
    isHandlingAuthenticatedUser = false;
    isLoggingOut = false;

    window.resetThemeToLight();

    // Navega para o onboarding e aguarda o carrossel estar inicializado
    // antes de remover o overlay, garantindo que a tela de destino já
    // esteja pronta e visível ao usuário quando o overlay desaparecer
    executeScreenNavigation("onboarding-screen");

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
   NAVEGAÇÃO E INICIALIZAÇÃO
   ========================================================================== */

/**
 * Obtém a saudação apropriada baseada na hora atual do sistema.
 * @returns {string} A saudação correspondente ao período do dia
 */
window.getGreetingByTimeOfDay = function () {
  const currentDate = new Date();
  const currentHour = currentDate.getHours();

  if (currentHour >= 5 && currentHour < 12) {
    return "Bom dia";
  } else if (currentHour >= 12 && currentHour < 18) {
    return "Boa tarde";
  } else {
    return "Boa noite";
  }
};

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

/**
 * Inicializa a tela home quando exibida.
 * Atualiza o título com a saudação e o nome do usuário.
 */
window.initializeHomeScreen = function () {
  window.updateWelcomeTitle();
};

/**
 *
 * Aplica o skeleton da aba padrão do dashboard diretamente no DOM,
 * antes da tela se tornar visível em executeScreenNavigation.
 *
 * Além de preparar o skeleton e o módulo ativo, reseta o estado visual
 * dos botões de aba para garantir que o botão da aba padrão apareça
 * marcado como active desde o primeiro frame — evitando o flash da última
 * aba visitada antes de initDashboardAnalisys atualizar os botões.
 *
 */
function applyDashboardSkeletonBeforeNavigation() {
  // A aba padrão ao abrir o dashboard é sempre "purchase-efficiency"
  const defaultTabName = "purchase-efficiency";
  const defaultTabModule = document.getElementById(
    `tab-module-${defaultTabName}`,
  );

  if (!defaultTabModule) return;

  // Remove a classe active de todos os módulos para garantir estado limpo
  const allTabModules = document.querySelectorAll(".dashboard-tab-module");
  allTabModules.forEach((module) => module.classList.remove("active"));

  // Reseta o estado visual dos botões de aba ANTES da tela ficar visível,
  // evitando o flash da última aba visitada enquanto initDashboardAnalisys
  // ainda não foi chamado para atualizar os botões via activateDashboardTab
  const allTabButtons = document.querySelectorAll(".dashboard-tab-button");
  allTabButtons.forEach((tabButton) => {
    if (tabButton.getAttribute("data-tab") === defaultTabName) {
      tabButton.classList.add("active");
    } else {
      tabButton.classList.remove("active");
    }
  });

  if (window.showTabSkeleton) {
    window.showTabSkeleton(defaultTabName);
  }

  defaultTabModule.classList.add("active");
}

/**
 *
 * Executa a navegação de tela sem validação (uso interno para evitar loops).
 * O render das listas deve ocorrer apenas após a validação ser concluída (em showScreen),
 * para evitar que hideListsSkeleton sobrescreva o conteúdo já renderizado.
 *
 * Para o dashboard, initDashboardAnalisys NÃO é chamado aqui quando a tela
 * requer validação — será chamado pelo próprio módulo após a validação concluir,
 * evitando que o dashboard renderize com credenciais inválidas do firebase.js.
 *
 * Ao navegar para fora da tela de detalhes, o listener em tempo real da lista
 * aberta é desativado automaticamente para liberar recursos do Firestore.
 *
 * @param {string} screenIdentifier - ID da tela de destino
 * @param {boolean} isReturnFromDetails - Indica se a navegação vem da tela de detalhes.
 *   Quando true, suprime o skeleton e o clearListsSearch na tela de listas.
 *   O conteúdo já está em memória e é re-renderizado diretamente por showScreen.
 */
function executeScreenNavigation(
  screenIdentifier,
  isReturnFromDetails = false,
) {
  const screens = [
    "onboarding-screen",
    "home-screen",
    "market-lists-screen",
    "market-list-screen-details",
    "new-list-screen",
    "new-category-screen",
    "new-item-screen",
    "dashboard-screen",
  ];

  if (screenIdentifier !== "market-list-screen-details") {
    if (window.deactivateDetailsRealtimeListener) {
      window.deactivateDetailsRealtimeListener();
    }
  }

  screens.forEach((id) => {
    const element = document.getElementById(id);
    if (element) {
      element.classList.remove("screen-fade-out");
      element.classList.toggle("screen-hidden", id !== screenIdentifier);
      element.style.display = id === screenIdentifier ? "flex" : "none";
    }
  });

  window.closePopover();

  /* Inicializa o carrossel do onboarding ao navegar para a tela de onboarding */
  if (screenIdentifier === "onboarding-screen") {
    if (window.initOnboardingCarousel) window.initOnboardingCarousel();
  }

  if (screenIdentifier === "home-screen") {
    window.initializeHomeScreen();
  }

  if (screenIdentifier === "market-lists-screen") {
    if (!isReturnFromDetails) {
      window.searchInput.value = "";

      if (window.clearListsSearch) window.clearListsSearch();

      if (window.showListsSkeleton) window.showListsSkeleton();
    }
  }

  if (screenIdentifier === "market-list-screen-details") {
    if (window.clearItemSearch) window.clearItemSearch();
  }

  if (screenIdentifier === "dashboard-screen") {
    applyDashboardSkeletonBeforeNavigation();
  }

  const dashboardRequiresValidation =
    screenValidationConfiguration.hasOwnProperty("dashboard-screen");

  if (
    screenIdentifier === "dashboard-screen" &&
    !dashboardRequiresValidation &&
    window.initDashboardAnalisys
  ) {
    window.initDashboardAnalisys();
  }
}

/**
 * Telas que, ao navegar de volta para a lista de compras, devem resetar
 * a paginação para a primeira página.
 * A tela de detalhes (market-list-screen-details) é a única exceção:
 * ao voltar dela, a paginação é preservada para manter a experiência do usuário.
 */
const screensThatResetPagination = new Set(["home-screen", "dashboard-screen"]);

/**
 *
 * Regra de validação ao entrar na tela de listas:
 * - Vindo de home-screen ou dashboard-screen: executa validação completa (banco + funções)
 *   e exibe skeleton durante a validação
 * - Vindo de market-list-screen-details: navega diretamente sem validação nem skeleton,
 *   pois os dados já estão em memória — evita o flash e o sumiço das listas
 *
 * @param {string} screenIdentifier - ID da tela de destino
 */
window.showScreen = async function (screenIdentifier) {
  const requiresValidation =
    screenValidationConfiguration.hasOwnProperty(screenIdentifier);

  // Captura a tela atualmente visível antes de navegar,
  // para usar como referência na decisão de reset de paginação e de validação
  const currentlyVisibleScreen = [
    "home-screen",
    "market-lists-screen",
    "market-list-screen-details",
    "dashboard-screen",
    "new-list-screen",
    "new-category-screen",
    "new-item-screen",
    "onboarding-screen",
  ].find((screenId) => {
    const element = document.getElementById(screenId);
    return element && !element.classList.contains("screen-hidden");
  });

  const isReturnFromDetailsToLists =
    screenIdentifier === "market-lists-screen" &&
    currentlyVisibleScreen === "market-list-screen-details";

  if (isReturnFromDetailsToLists) {
    executeScreenNavigation(screenIdentifier, true);

    if (window.renderMarketLists) window.renderMarketLists();
    return;
  }

  if (requiresValidation) {
    // Marca que está validando para controlar o fluxo
    currentValidationState.isValidating = true;
    currentValidationState.targetScreen = screenIdentifier;

    // Reseta paginação para primeira página se a origem exige isso
    // (ex: home-screen, dashboard-screen), mas preserva ao voltar dos detalhes
    if (
      screenIdentifier === "market-lists-screen" &&
      screensThatResetPagination.has(currentlyVisibleScreen)
    ) {
      if (window.resetPaginationToFirstPage)
        window.resetPaginationToFirstPage();
    }

    // Primeiro navega para a tela (que já exibe o skeleton existente)
    // Para listas: apenas mostra skeleton, SEM agendar renderMarketLists
    // Para dashboard: aplica skeleton da aba padrão antes da tela ficar visível
    executeScreenNavigation(screenIdentifier);

    // Executa a validação em paralelo (durante o skeleton)
    const validationResult = await executeScreenValidation(screenIdentifier);

    // Trata o resultado — esconde skeleton e decide se continua ou redireciona
    const canProceed = handleValidationResult(
      screenIdentifier,
      validationResult,
    );

    if (!canProceed) {
      // handleValidationResult redireciona para a tela correta
      return;
    }

    // Para listas: o skeleton já foi limpo por hideListsSkeleton dentro de handleValidationResult
    if (screenIdentifier === "market-lists-screen") {
      if (window.renderMarketLists) window.renderMarketLists();
    }

    // Para dashboard: só inicializa APÓS a validação confirmar que banco e Chart.js estão OK
    // Evita que o dashboard tente renderizar gráficos ou buscar dados com conexão inválida
    if (screenIdentifier === "dashboard-screen") {
      if (window.initDashboardAnalisys) window.initDashboardAnalisys();
    }
  } else {
    // Tela não requer validação, navegação normal
    executeScreenNavigation(screenIdentifier);
  }
};

window.handleBackFromForm = function () {
  window.showScreen(previousScreen);
};

/* ==========================================================================
   LÓGICA DO POPOVER DE OPÇÕES
   ========================================================================== */
window.toggleMenuOptions = function (event) {
  if (event) event.stopPropagation();

  const popover = document.getElementById("options-popover");
  if (!popover) return;

  const isHidden = popover.classList.contains("popover-hidden");

  if (isHidden) {
    popover.classList.remove("popover-hidden");
    popover.classList.add("popover-visible");

    if (popover.showPopover) {
      try {
        popover.showPopover();
      } catch (e) {
        console.log("Manual trigger active");
      }
    }
  } else {
    window.closePopover();
  }
};

window.closePopover = function () {
  const popover = document.getElementById("options-popover");
  if (popover) {
    popover.classList.add("popover-hidden");
    popover.classList.remove("popover-visible");
    if (popover.hidePopover) {
      try {
        popover.hidePopover();
      } catch (e) {}
    }
  }
};

window.handlePopoverAction = function (action) {
  window.closePopover();
  if (action === "new-list") {
    if (window.openNewListForm) window.openNewListForm();
  } else if (action === "dashboard") {
    window.showScreen("dashboard-screen");
  }
};

// Listener global para fechar ao clicar fora
document.addEventListener("click", function (event) {
  const popover = document.getElementById("options-popover");
  const button = document.getElementById("button-options-list");

  if (
    popover &&
    !popover.contains(event.target) &&
    button &&
    !button.contains(event.target)
  ) {
    window.closePopover();
  }
});

/* ==========================================================================
   FIREBASE LISTENER E PERSISTÊNCIA
   ========================================================================== */

/**
 * Inicializa o listener em tempo real das listas do Firestore.
 * A query agora filtra pelo uid do usuário autenticado (não mais pelo nome).
 *
 * A função de unsubscribe retornada pelo onSnapshot é armazenada em
 * unsubscribeOwnedListsListener para permitir cancelamento explícito
 * no logout, evitando disparos com credenciais inválidas.
 *
 * @param {string} userUid - UID do Firebase Auth do usuário autenticado
 */
function initFirebaseListener(userUid) {
  const q = query(
    collection(firestore, "lists"),
    where("userId", "==", userUid),
    orderBy("date", "desc"),
  );

  // Armazena o unsubscribe para cancelar o listener antes do logout
  unsubscribeOwnedListsListener = onSnapshot(
    q,
    (snapshot) => {
      // Mapeia os documentos recebidos do Firestore para objetos de lista
      const ownedListsFromFirestore = snapshot.docs.map((firestoreDoc) => ({
        id: firestoreDoc.id,
        ...firestoreDoc.data(),
      }));

      // Preserva as listas compartilhadas já carregadas pelo initSharedListsListener
      // ao atualizar as listas próprias do usuário.
      // Filtra do array global apenas as listas que não são próprias do usuário.
      const sharedListsAlreadyLoaded = window.marketListData.filter(
        (existingList) =>
          !ownedListsFromFirestore.some(
            (ownedList) => ownedList.id === existingList.id,
          ) && existingList.userId !== userUid,
      );

      // Aplica proteção anti-regressão ao mesclar as listas próprias:
      // substitui cada lista própria em memória apenas se o dado recebido do Firestore
      // for mais recente (baseado em updatedAt).
      const mergedOwnedLists = mergeListDataWithTimestampProtection(
        // Passa apenas as listas próprias que já estão em memória como base
        window.marketListData.filter(
          (existingList) => existingList.userId === userUid,
        ),
        ownedListsFromFirestore,
      );

      const receivedOwnedListIds = new Set(
        ownedListsFromFirestore.map((ownedList) => ownedList.id),
      );

      const sanitizedOwnedLists = mergedOwnedLists.filter((mergedList) =>
        receivedOwnedListIds.has(mergedList.id),
      );

      // Reconstrói o marketListData: listas próprias sanitizadas + compartilhadas preservadas
      window.marketListData = [
        ...sanitizedOwnedLists,
        ...sharedListsAlreadyLoaded,
      ];

      if (isFirstLoad) {
        window.showScreen("home-screen");
        isFirstLoad = false;

        // Inicializa o listener de listas compartilhadas com o uid do usuário atual
        // após carregar as listas próprias (evita condição de corrida)
        if (window.initSharedListsListener) {
          window.initSharedListsListener(userUid);
        }
      } else {
        if (
          !document
            .getElementById("market-lists-screen")
            .classList.contains("screen-hidden")
        ) {
          // Exibe skeleton antes de re-renderizar ao receber atualizações do Firestore
          if (window.showListsSkeleton) window.showListsSkeleton();

          // Timer mínimo para garantir visibilidade do skeleton na atualização
          // e sincronizar com a renderização das listas e paginação
          setTimeout(() => {
            if (window.renderMarketLists) window.renderMarketLists();
          }, 350);
        }
        if (
          !document
            .getElementById("market-list-screen-details")
            .classList.contains("screen-hidden")
        ) {
          const hasActivePontualListener =
            window.getActiveDetailsListIdentifier &&
            window.getActiveDetailsListIdentifier() !== null;

          if (!hasActivePontualListener) {
            window.resolveCurrentListIndex();
            window.renderListDetails();
          }
        }
      }
    },
    (error) => {
      console.error("Erro listener:", error);

      const connectionErrorCodes = [
        "permission-denied",
        "unavailable",
        "network-request-failed",
        "unauthenticated",
        "internal",
        "unknown",
      ];

      if (error.code && connectionErrorCodes.includes(error.code)) {
        window.showToast("Falha na comunicação com o Servidor!", "danger");
        executeScreenNavigation("home-screen");
      }

      if (isFirstLoad) {
        window.showScreen("home-screen");
        isFirstLoad = false;
      }
    },
  );
}

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
      // O guard evita execuções paralelas durante o fluxo de autenticação
      if (!isHandlingAuthenticatedUser) {
        await handleAuthenticatedUser(authenticatedUser);
      }
    } else {
      // Sem sessão ativa — exibe onboarding
      // Só redireciona ao onboarding se não há um fluxo de autenticação em andamento
      if (!isHandlingAuthenticatedUser) {
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
