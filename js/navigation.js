/* ==========================================================================
   NAVEGAÇÃO — CONTROLE DE TELAS E POPOVER DE OPÇÕES
   ========================================================================== */

import {
  screenValidationConfiguration,
  currentValidationState,
  executeScreenValidation,
  handleValidationResult,
} from "./screen-validator.js";

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
   SAUDAÇÃO E HOME
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
 * Inicializa a tela home quando exibida.
 * Atualiza o título com a saudação e o nome do usuário.
 */
window.initializeHomeScreen = function () {
  window.updateWelcomeTitle();
};

/* ==========================================================================
   POPOVER DE OPÇÕES
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
   SKELETON DO DASHBOARD — PRÉ-NAVEGAÇÃO
   ========================================================================== */

/**
 * Aplica o skeleton da aba padrão do dashboard diretamente no DOM,
 * antes da tela se tornar visível em executeScreenNavigation.
 *
 * Além de preparar o skeleton e o módulo ativo, reseta o estado visual
 * dos botões de aba para garantir que o botão da aba padrão apareça
 * marcado como active desde o primeiro frame — evitando o flash da última
 * aba visitada antes de initDashboardAnalisys atualizar os botões.
 *
 * Também reseta o scrollLeft do container de abas para o início,
 * garantindo que a aba padrão ativa esteja sempre visível ao abrir o dashboard,
 * independentemente de qual aba estava visível na última visita.
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

  // Reseta o scroll horizontal do container de abas para o início,
  // evitando que o scroll fique posicionado no fim da lista ao reabrir o dashboard
  const dashboardTabsContainer = document.querySelector(
    ".dashboard-tabs-container",
  );
  if (dashboardTabsContainer) {
    dashboardTabsContainer.scrollLeft = 0;
  }

  if (window.showTabSkeleton) {
    window.showTabSkeleton(defaultTabName);
  }

  defaultTabModule.classList.add("active");
}

/* ==========================================================================
   NÚCLEO DE NAVEGAÇÃO
   ========================================================================== */

/**
 * Telas que, ao navegar de volta para a lista de compras, devem resetar
 * a paginação para a primeira página.
 * A tela de detalhes (market-list-screen-details) é a única exceção:
 * ao voltar dela, a paginação é preservada para manter a experiência do usuário.
 */
const screensThatResetPagination = new Set(["home-screen", "dashboard-screen"]);

/**
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
    // Telas de conta do usuário
    "my-account-screen",
    "account-details-screen",
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

    // Reseta o scroll vertical do conteúdo da tela de detalhes para o início,
    // evitando que a lista de itens apareça rolada ao abrir uma lista
    const detailsContentWrapper = document.querySelector(
      ".details-content-wrapper",
    );
    if (detailsContentWrapper) {
      detailsContentWrapper.scrollTop = 0;
    }
  }

  if (screenIdentifier === "dashboard-screen") {
    applyDashboardSkeletonBeforeNavigation();
  }

  // Inicializa a tela Minha Conta registrando eventos dos botões do alert de confirmação
  if (screenIdentifier === "my-account-screen") {
    if (window.initializeMyAccountScreen) window.initializeMyAccountScreen();
  }

  // Inicializa a tela de Dados de Cadastro preenchendo nome e email do usuário
  if (screenIdentifier === "account-details-screen") {
    if (window.initializeAccountDetailsScreen) window.initializeAccountDetailsScreen();
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
 * Navega para uma tela aplicando validação de dependências quando necessário.
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
    // Telas de conta do usuário
    "my-account-screen",
    "account-details-screen",
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
      executeScreenNavigation,
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

// Expõe executeScreenNavigation para uso pelo index.js (logout, auth errors, etc.)
export { executeScreenNavigation };
