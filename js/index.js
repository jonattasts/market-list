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
  getDocsFromServer,
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
    const userName = localStorage.getItem("marketUserName");

    // Se não há usuário logado
    if (!userName) {
      console.warn("Database validation: No user name found in localStorage");
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

    // Cria a query normalmente — o filtro garante escopo correto do usuário
    const listsQuery = query(
      collection(firestore, "lists"),
      where("userName", "==", userName),
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
      // Preserva o userName original do documento — não sobrescreve com o usuário logado,
      // pois listas compartilhadas pertencem ao dono original, não ao usuário que editou
      userName: currentList.userName,
    });
  } catch (e) {
    console.error("Erro ao atualizar Firestore:", e);
    window.showToast("Falha na comunicação com o Servidor!", "danger");
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
    window.showToast("Falha na comunicação com o Servidor!", "danger");
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
 *
 * Aplica o skeleton da aba padrão do dashboard diretamente no DOM,
 * antes da tela se tornar visível em executeScreenNavigation.
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

    if (window.showListsSkeleton) window.showListsSkeleton();
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
 * Regra de paginação ao entrar na tela de listas:
 * - Vindo de home-screen ou dashboard-screen: reseta para página 1
 * - Vindo de market-list-screen-details: preserva a página atual
 *
 * @param {string} screenIdentifier - ID da tela de destino
 */
window.showScreen = async function (screenIdentifier) {
  const requiresValidation =
    screenValidationConfiguration.hasOwnProperty(screenIdentifier);

  // Captura a tela atualmente visível antes de navegar,
  // para usar como referência na decisão de reset de paginação
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
function initFirebaseListener(userName) {
  const q = query(
    collection(firestore, "lists"),
    where("userName", "==", userName),
    orderBy("date", "desc"),
  );

  onSnapshot(
    q,
    (snapshot) => {
      // Preserva as listas compartilhadas já carregadas pelo
      // initSharedListsListener ao atualizar as listas próprias do usuário.
      const ownedLists = snapshot.docs.map((firestoreDoc) => ({
        id: firestoreDoc.id,
        ...firestoreDoc.data(),
      }));

      // Mantém no array global apenas as listas compartilhadas (não-próprias),
      // depois insere as listas próprias atualizadas no início
      const sharedListsAlreadyLoaded = window.marketListData.filter(
        (existingList) =>
          !ownedLists.some((ownedList) => ownedList.id === existingList.id) &&
          existingList.userName !== userName,
      );

      window.marketListData = [...ownedLists, ...sharedListsAlreadyLoaded];

      if (isFirstLoad) {
        window.showScreen("home-screen");
        isFirstLoad = false;

        // Inicializa o listener de listas compartilhadas com o usuário atual
        // após carregar as listas próprias (evita condição de corrida)
        if (window.initSharedListsListener) {
          window.initSharedListsListener(userName);
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
          window.resolveCurrentListIndex();
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

    window.showToast("Falha na comunicação com o Servidor!", "danger");
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
