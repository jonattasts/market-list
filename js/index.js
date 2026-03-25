/* ==========================================================================
   ESTADO E CONFIGURAÇÕES
   ========================================================================== */
import {
  firestore,
  collection,
  doc,
  updateDoc,
  serverTimestamp,
  setDoc,
  getDoc,
  getDocs,
  query,
  orderBy,
  onSnapshot,
  where,
  limit,
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

/* ==========================================================================
   SISTEMA DE VALIDAÇÃO - FUNÇÕES CORE
   ========================================================================== */

/**
 * Verifica se a conexão com o Firebase/Firestore está funcionando corretamente
 * Tenta fazer uma operação de leitura real para validar conectividade e permissões
 * Usa a instância configurada do Firebase (firestore)
 *
 * @returns {Promise<boolean>} True se conexão OK e com permissões, false se falhou
 */
async function validateDatabaseConnection() {
  try {
    // Tenta acessar a coleção de listas do usuário atual para verificar conexão real
    const userName = localStorage.getItem("marketUserName");

    // Se não há usuário logado, não pode validar - considera falha
    if (!userName) {
      console.warn("Database validation: No user name found in localStorage");
      return false;
    }

    // Cria uma query que deve funcionar se o usuário tem permissão e conexão
    // Usando os métodos importados do firebase.js (instância configurada)
    const listsQuery = query(
      collection(firestore, "lists"),
      where("userName", "==", userName),
      limit(1),
    );

    // Tenta executar a query - isso vai falhar se:
    // 1. Não há conexão de internet
    // 2. As regras de segurança negam acesso
    // 3. O projeto Firebase está inacessível
    await getDocs(listsQuery);

    return true;
  } catch (error) {
    console.error("Database validation error:", error);

    // Erros que indicam falha real de conexão ou permissão
    const connectionErrorCodes = [
      "permission-denied", // Sem permissão de acesso
      "unavailable", // Serviço indisponível
      "network-request-failed", // Sem conexão de rede
      "resource-exhausted", // Quota excedida
      "unauthenticated", // Não autenticado
      "internal", // Erro interno do Firebase
      "unknown", // Erro desconhecido
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
 * Executa a validação completa de dependências de uma tela
 * Esta função roda em paralelo ao skeleton existente
 *
 * @param {string} screenIdentifier - ID da tela a ser validada
 * @returns {Promise<Object>} Resultado da validação com status e erros
 */
async function executeScreenValidation(screenIdentifier) {
  const configuration = screenValidationConfiguration[screenIdentifier];
  if (!configuration) {
    return { isValid: true, errors: [] }; // Tela não requer validação
  }

  const validationResults = {
    isValid: true,
    errors: [],
    details: {},
  };

  // Etapa 1: Validação do Banco de Dados (se necessário)
  if (configuration.requiresDatabase) {
    const databaseConnectionValid = await validateDatabaseConnection();
    validationResults.details.database = databaseConnectionValid;

    if (!databaseConnectionValid) {
      validationResults.isValid = false;
      validationResults.errors.push("Conexão com banco de dados indisponível");
    }
  }

  // Etapa 2: Validação do Chart.js (se necessário)
  if (configuration.requiresChartJs && validationResults.isValid) {
    const chartJsLibraryValid = validateChartJsLibrary();
    validationResults.details.chartJs = chartJsLibraryValid;

    if (!chartJsLibraryValid) {
      validationResults.isValid = false;
      validationResults.errors.push("Biblioteca Chart.js não disponível");
    }
  }

  // Etapa 3: Validação das Funções da Tela (se ainda válido)
  if (validationResults.isValid) {
    const functionsValidationResult = validateScreenFunctions(
      configuration.requiredFunctions,
    );
    validationResults.details.functions = functionsValidationResult;

    if (!functionsValidationResult.isValid) {
      validationResults.isValid = false;
      validationResults.errors.push(
        `Funções indisponíveis: ${functionsValidationResult.missingFunctions.join(", ")}`,
      );
    }
  }

  currentValidationState.validationResults = validationResults;
  return validationResults;
}

/**
 * Trata o resultado da validação - sucesso ou falha
 * Esconde o skeleton existente e toma ação apropriada
 * SEMPRE redireciona para home-screen e exibe toast em caso de falha de conexão
 *
 * @param {string} screenIdentifier - ID da tela validada
 * @param {Object} validationResult - Resultado da validação
 * @returns {boolean} True se pode prosseguir com renderização, false se deve abortar
 */
function handleValidationResult(screenIdentifier, validationResult) {
  const configuration = screenValidationConfiguration[screenIdentifier];

  // Sempre tenta esconder o skeleton existente via função específica da tela
  if (configuration && configuration.skeletonHiderFunction) {
    const hiderFunction = window[configuration.skeletonHiderFunction];
    if (typeof hiderFunction === "function") {
      // Para dashboard, precisa passar o nome da aba ativa
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
  } else {
    window.showToast("Erro de conexão com o Servidor!", "danger");

    executeScreenNavigation("home-screen");

    currentValidationState.isValidating = false;
    return false;
  }
}

/* ==========================================================================
   PERSISTÊNCIA FIREBASE
   ========================================================================== */
window.saveAndSync = async function () {
  const currentList = window.marketListData[window.currentListIndex];
  if (!currentList || !currentList.id) return;

  try {
    const listRef = doc(firestore, "lists", currentList.id);
    await updateDoc(listRef, {
      listName: currentList.listName,
      location: currentList.location,
      date: currentList.date,
      categories: currentList.categories,
      updatedAt: serverTimestamp(),
      userName: localStorage.getItem("marketUserName"),
    });
  } catch (e) {
    console.error("Erro ao atualizar Firestore:", e);
    window.showToast("Erro de conexão com o Servidor!", "danger");
  }
};

/* --- LÓGICA DE CONFIGURAÇÃO COM UI DE ANIMAÇÃO --- */
async function runSetupAnimation(userName) {
  const overlay = document.getElementById("sync-overlay");
  const progressBar = document.getElementById("sync-progress-bar");
  const syncText = document.querySelector(".sync-text");
  const syncSubtext = document.querySelector(".sync-subtext"); // Ativa a Overlay Visual

  if (overlay) {
    overlay.style.display = "flex";
    await new Promise((r) => setTimeout(r, 50));
    overlay.classList.add("active");
  }

  if (syncText) syncText.innerText = "Configurando seu espaço...";
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
   IDENTIFICAÇÃO DE USUÁRIO
   ========================================================================== */
window.handleUserIdentification = async function () {
  const nameInput = document.getElementById("user-name-input");
  const buttonStart = document.querySelector(".button-start");
  const onboardingScreen = document.getElementById("onboarding-screen");

  const name = window.capitalize(nameInput.value);
  const userId = name.toLowerCase().replace(/\s/g, "");

  if (!name || name.length < 3) {
    window.showToast("O nome deve ter pelo menos 3 caracteres", "danger");
    return;
  }

  if (buttonStart) buttonStart.classList.add("is-loading");

  try {
    const userRef = doc(firestore, "users", userId);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      const savedLocalName = localStorage.getItem("marketUserName");
      if (savedLocalName !== name) {
        if (buttonStart) buttonStart.classList.remove("is-loading");
        window.showToast("Este nome já está em uso!", "danger");
        return;
      }
    }

    localStorage.setItem("marketUserName", name);
    await setDoc(
      userRef,
      { name: name, lastLogin: serverTimestamp() },
      { merge: true },
    );

    if (onboardingScreen) {
      onboardingScreen.classList.add("screen-hidden");
      onboardingScreen.style.display = "none";
    }

    await runSetupAnimation(name);

    setTimeout(() => {
      isFirstLoad = true;
      initFirebaseListener(name);
    }, 100);
  } catch (error) {
    if (buttonStart) buttonStart.classList.remove("is-loading");
    console.error("Erro identificação:", error);
    window.showToast("Erro de conexão com o Servidor!", "danger");
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
 * e o nome do usuário armazenado.
 * Busca no localStorage pela key 'marketUserName'.
 */
window.updateWelcomeTitle = function () {
  const welcomeTitleElement = document.getElementById("welcome-user-title");
  const storedUserName = localStorage.getItem("marketUserName");
  const greeting = window.getGreetingByTimeOfDay();

  if (welcomeTitleElement) {
    if (storedUserName && storedUserName.trim() !== "") {
      welcomeTitleElement.textContent = `${greeting}, ${storedUserName.trim()}!`;
    } else {
      welcomeTitleElement.textContent = `${greeting}!`;
    }
  }
};

/**
 * Inicializa a tela home quando exibida.
 * Atualiza o título com a saudação e o nome do usuário.
 */
window.initializeHomeScreen = function () {
  window.updateWelcomeTitle();
};

/**
 * Executa a navegação de tela sem validação (uso interno para evitar loops)
 *
 * @param {string} screenIdentifier - ID da tela de destino
 */
function executeScreenNavigation(screenIdentifier) {
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

  screens.forEach((id) => {
    const element = document.getElementById(id);
    if (element) {
      element.classList.remove("screen-fade-out");
      element.classList.toggle("screen-hidden", id !== screenIdentifier);
      element.style.display =
        id === screenIdentifier
          ? id === "onboarding-screen"
            ? "block"
            : "flex"
          : "none";
    }
  });

  window.closePopover();

  if (screenIdentifier === "home-screen") {
    window.initializeHomeScreen();
  }

  if (screenIdentifier === "market-lists-screen") {
    window.searchInput.value = "";

    // Exibe skeleton existente e garante que paginação esteja escondida
    if (window.showListsSkeleton) window.showListsSkeleton();

    // O timer garante que o skeleton seja visível por tempo suficiente
    setTimeout(() => {
      if (window.renderMarketLists) window.renderMarketLists();
    }, 350);
  }

  if (screenIdentifier === "dashboard-screen" && window.initDashboardAnalisys)
    window.initDashboardAnalisys();
}

/**
 * Navega para uma tela específica com validação de dependências quando necessário
 * A validação ocorre DURANTE o skeleton já existente da tela
 *
 * @param {string} screenIdentifier - ID da tela de destino
 */
window.showScreen = async function (screenIdentifier) {
  const requiresValidation =
    screenValidationConfiguration.hasOwnProperty(screenIdentifier);

  if (requiresValidation) {
    // Marca que está validando para controlar o fluxo
    currentValidationState.isValidating = true;
    currentValidationState.targetScreen = screenIdentifier;

    // Primeiro navega para a tela (que já exibe o skeleton existente)
    executeScreenNavigation(screenIdentifier);

    // Executa a validação em paralelo (durante o skeleton)
    const validationResult = await executeScreenValidation(screenIdentifier);

    // Trata o resultado - esconde skeleton e decide se continua ou volta
    const canProceed = handleValidationResult(
      screenIdentifier,
      validationResult,
    );

    if (!canProceed) {
      // Se falhou, o handleValidationResult já voltou para home-screen
      return;
    }
    // Se sucesso, o skeleton já foi escondido e a tela continua visível
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
function initFirebaseListener(userName) {
  const q = query(
    collection(firestore, "lists"),
    where("userName", "==", userName),
    orderBy("date", "desc"),
  );

  onSnapshot(
    q,
    (snapshot) => {
      window.marketListData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      if (isFirstLoad) {
        window.showScreen("home-screen");
        isFirstLoad = false;
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
          window.renderListDetails();
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
        window.showToast("Erro de conexão com o Servidor!", "danger");
        executeScreenNavigation("home-screen");
      }

      if (isFirstLoad) {
        window.showScreen("home-screen");
        isFirstLoad = false;
      }
    },
  );
}

/**
 * Valida se o usuário ainda existe no Firebase
 * Se houver erro de conexão, exibe toast e redireciona para home-screen
 *
 * @param {string} savedName - Nome do usuário salvo no localStorage
 */
async function validateUserPersistence(savedName) {
  try {
    const userId = savedName.toLowerCase().replace(/\s/g, "");
    const userRef = doc(firestore, "users", userId);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      localStorage.removeItem("marketUserName");
      window.showToast("Sessão expirada ou usuário removido.", "danger");
      // Redireciona para onboarding se usuário não existe
      executeScreenNavigation("onboarding-screen");
      return;
    }

    window.showScreen("home-screen");
    initFirebaseListener(savedName);
  } catch (error) {
    console.error("Erro ao validar persistência:", error);

    window.showToast("Erro de conexão com o Servidor!", "danger");
    executeScreenNavigation("home-screen");
  }
}

async function initApp() {
  const savedName = localStorage.getItem("marketUserName");

  if (!savedName) {
    window.showScreen("onboarding-screen");
  } else {
    await validateUserPersistence(savedName);
  }

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
