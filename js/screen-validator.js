/* ==========================================================================
   SCREEN VALIDATOR — VALIDAÇÃO DE DEPENDÊNCIAS ANTES DE EXIBIR TELAS
   ========================================================================== */

import {
  firestore,
  firebaseAuth,
  collection,
  query,
  where,
  limit,
  getDocsFromServer,
} from "./firebase.js";

/* ==========================================================================
   CONFIGURAÇÃO DAS TELAS QUE REQUEREM VALIDAÇÃO
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
   FUNÇÕES INTERNAS DE VALIDAÇÃO
   ========================================================================== */

/**
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

/* ==========================================================================
   FUNÇÕES EXPORTADAS DE VALIDAÇÃO
   ========================================================================== */

/**
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
 * Trata o resultado da validação e decide se a navegação pode prosseguir.
 *
 * - Falha de banco (failureType === "database"):
 *   Redireciona para home-screen com toast "Falha na comunicação com o Servidor!"
 *
 * - Falha de tela (failureType === "screen"):
 *   Redireciona para a tela anterior com toast "A [Nome da Tela] não está disponível no momento!"
 *
 * @param {string} screenIdentifier - ID da tela validada
 * @param {Object} validationResult - Resultado da validação (com failureType)
 * @param {Function} executeScreenNavigationCallback - Função de navegação sem validação (do navigation.js)
 * @returns {boolean} True se pode prosseguir com renderização, false se deve abortar
 */
function handleValidationResult(screenIdentifier, validationResult, executeScreenNavigationCallback) {
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
    executeScreenNavigationCallback("home-screen");
  }
  // Falha de funcionalidades da tela (plugins ou funções): redireciona para tela anterior
  // Mantém o usuário no fluxo informando que aquela tela específica está indisponível
  else if (validationResult.failureType === "screen" && configuration) {
    const screenDisplayName = configuration.screenName || screenIdentifier;
    window.showToast(
      `A ${screenDisplayName} não está disponível no momento!`,
      "danger",
    );
    executeScreenNavigationCallback(configuration.previousScreen);
  }
  // Fallback genérico para casos não mapeados
  else {
    window.showToast("Falha na comunicação com o Servidor!", "danger");
    executeScreenNavigationCallback("home-screen");
  }

  currentValidationState.isValidating = false;
  return false;
}

/**
 * Expõe a configuração de validação para que o navigation.js possa
 * verificar quais telas requerem validação via hasOwnProperty.
 */
window.screenValidationConfiguration = screenValidationConfiguration;

export {
  screenValidationConfiguration,
  currentValidationState,
  executeScreenValidation,
  handleValidationResult,
};
