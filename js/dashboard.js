/* ==========================================================================
   DASHBOARD & DATA ANALYTICS MODULE - SISTEMA DE ABAS
   ========================================================================= */

// Utilitário local para formatação de moeda
const formatCurrencyBRL = (val) =>
  val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

//Exporta a função de formatação globalmente para os módulos
window.formatCurrencyBRL = formatCurrencyBRL;

// Estado dos Gráficos (para destruí-los antes de recriar)
let chartShareWallet = null;
let chartVolumeItens = null;
let chartHealthProfile = null;

//Exporta os gráficos globalmente para os módulos poderem acessar/destruir
window.chartShareWallet = chartShareWallet;
window.chartVolumeItens = chartVolumeItens;
window.chartHealthProfile = chartHealthProfile;

// Filtro Ativo Padrão (Geral)
let activeFilter = { type: "geral", value: null };

//Exporta o filtro ativo globalmente
window.activeFilter = activeFilter;

// Estado de abas ativas
let activeTabModule = "purchase-efficiency";

/* ==========================================================================
   ESTADO DE PAGINAÇÃO DAS LISTAS
   ========================================================================== */
const paginationState = {
  cpi: { currentPage: 1, itemsPerPage: 4 },
  recurrence: { currentPage: 1, itemsPerPage: 4 },
  restock: { currentPage: 1, itemsPerPage: 4 },
  essentials: { currentPage: 1, itemsPerPage: 4 },
  topLocations: { currentPage: 1, itemsPerPage: 4 },
  conversionRate: { currentPage: 1, itemsPerPage: 3 },
};

//Exporta o estado de paginação globalmente
window.paginationState = paginationState;

// Cache dos dados calculados para evitar re-processamento desnecessário
let cachedDashboardData = {
  cpiItems: null,
  recurrenceItems: null,
  restockItems: null,
  essentialsItems: null,
  topLocationsItems: null,
  conversionRateItems: null,
  lastFilter: null,
};

//Exporta o cache globalmente
window.cachedDashboardData = cachedDashboardData;

/* ==========================================================================
   CONSTANTES DE REGRA DE NEGÓCIO
   ========================================================================== */
const RECURRENCE_CONFIG = {
  minLists: 2, // Mínimo de listas diferentes
  monthsLimit: 3, // Meses máximos sem comprar
};

const ESSENTIALS_CONFIG = {
  minPercentage: 50, // Porcentagem mínima de aparição (50%)
  monthsLimit: 3, // Considerar apenas últimos 3 meses
};

const CONVERSION_RATE_CONFIG = {
  monthsToShow: 3, // Quantidade de meses a exibir na taxa de conversão
};

//Exporta as constantes globalmente
window.RECURRENCE_CONFIG = RECURRENCE_CONFIG;
window.ESSENTIALS_CONFIG = ESSENTIALS_CONFIG;
window.CONVERSION_RATE_CONFIG = CONVERSION_RATE_CONFIG;

/* ==========================================================================
   UTILITÁRIO: CLASSIFICAÇÃO DE PERFORMANCE POR PERCENTUAL
   ========================================================================== */

/**
 * Retorna a classe de performance baseada no percentual
 * Regras: excellent (>=90%), good (>=80%), average (>=70%), low (<70%)
 *
 * @param {number} percentage - Percentual a ser classificado (0-100)
 * @returns {string} - Classe de performance: 'excellent', 'good', 'average', 'low'
 */
function getPerformanceClassByPercentage(percentage) {
  if (percentage >= 90) {
    return "excellent";
  } else if (percentage >= 80) {
    return "good";
  } else if (percentage >= 70) {
    return "average";
  }
  return "low";
}

//Exporta globalmente
window.getPerformanceClassByPercentage = getPerformanceClassByPercentage;

/**
 * Retorna a classe de performance para variação de preço (CPI)
 * Regras invertidas: queda é positiva, alta é negativa
 *
 * @param {number} diff - Diferença percentual (positivo = alta, negativo = queda)
 * @returns {string} - Classe de performance: 'excellent', 'good', 'average', 'low'
 */
function getPerformanceClassForPriceVariation(diff) {
  // Para variação de preço: negativo (queda) é bom, positivo (alta) é ruim
  if (diff <= -10) {
    return "excellent"; // Queda significativa
  } else if (diff < 0) {
    return "good"; // Queda leve
  } else if (diff === 0) {
    return "average"; // Estável
  }
  return "low"; // Alta de preço
}

//Exporta globalmente
window.getPerformanceClassForPriceVariation =
  getPerformanceClassForPriceVariation;

/**
 * Retorna a classe de performance para ranking de top locais
 * Regras: 1º lugar = excellent, 2º lugar = good, 3º lugar = average, demais = low
 *
 * @param {number} position - Posição no ranking (1, 2, 3, etc.)
 * @returns {string} - Classe de performance: 'excellent', 'good', 'average', 'low'
 */
function getPerformanceClassForTopLocation(position) {
  if (position === 1) {
    return "excellent";
  } else if (position === 2) {
    return "good";
  } else if (position === 3) {
    return "average";
  }
  return "low";
}

//Exporta globalmente
window.getPerformanceClassForTopLocation = getPerformanceClassForTopLocation;

/* ==========================================================================
   UTILITÁRIO: Parse de Data Local
   ========================================================================== */
/**
 * Converte string de data YYYY-MM-DD para objeto Date considerando timezone local
 * Evita deslocamento de dia devido a UTC
 */
function parseDateLocal(dateStr) {
  if (!dateStr) return new Date();
  const [year, month, day] = dateStr.split("-").map(Number);
  // Cria data com horário meio-dia para evitar problemas de mudança de dia
  return new Date(year, month - 1, day, 12, 0, 0);
}

//Exporta globalmente
window.parseDateLocal = parseDateLocal;

/**
 * Extrai ano e mês de uma data string (YYYY-MM-DD) para comparação
 * Retorna objeto {year, month} sem criar Date (evita timezone issues)
 */
function getYearMonth(dateStr) {
  if (!dateStr) return { year: 0, month: 0 };
  const [year, month] = dateStr.split("-").map(Number);
  return { year, month };
}

//Exporta globalmente
window.getYearMonth = getYearMonth;

/**
 * Calcula a diferença em meses entre duas datas
 */
function getMonthsDifference(date1, date2) {
  const firstDate = new Date(date1);
  const secondDate = new Date(date2);
  const months =
    (secondDate.getFullYear() - firstDate.getFullYear()) * 12 +
    (secondDate.getMonth() - firstDate.getMonth());
  return months;
}

//Exporta globalmente
window.getMonthsDifference = getMonthsDifference;

/**
 * Obtém a data limite de recência (N meses atrás)
 */
function getRecencyLimitDate() {
  const today = new Date();
  return new Date(
    today.getFullYear(),
    today.getMonth() - ESSENTIALS_CONFIG.monthsLimit,
    today.getDate(),
  );
}

//Exporta globalmente
window.getRecencyLimitDate = getRecencyLimitDate;

/**
 * Verifica se a data está dentro do limite de meses configurado
 */
function isWithinMonthsLimit(dateStr, monthsLimit) {
  const itemDate = parseDateLocal(dateStr);
  const today = new Date();
  const limitDate = new Date(
    today.getFullYear(),
    today.getMonth() - monthsLimit,
    today.getDate(),
  );
  return itemDate >= limitDate;
}

//Exporta globalmente
window.isWithinMonthsLimit = isWithinMonthsLimit;

/**
 * Obtém o nome do mês em português
 */
function getMonthName(monthIndex) {
  const monthNames = [
    "Janeiro",
    "Fevereiro",
    "Março",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro",
  ];
  return monthNames[monthIndex];
}

//Exporta globalmente
window.getMonthName = getMonthName;

/**
 * Formata o período do mês para exibição (ex: "Março/2024")
 */
function formatMonthPeriod(year, month) {
  const monthName = getMonthName(month - 1);
  return `${monthName}`;
}

//Exporta globalmente
window.formatMonthPeriod = formatMonthPeriod;

/* ==========================================================================
   UTILITÁRIO: FILTRO DE RECORRÊNCIA
   ========================================================================== */
/**
 * Filtra itens baseado nos critérios de recorrência:
 * 1. Apareceu em pelo menos N listas diferentes
 * 2. Última compra dentro do limite de meses configurado
 *
 * @param {Object} itemData - Objeto com dados do item (deve ter listIds e lastPurchaseDate)
 * @returns {Boolean} - true se o item atende aos critérios de recorrência
 */
function meetsRecurrenceCriteria(itemData) {
  // FILTRO 1: Item deve aparecer em pelo menos N listas diferentes
  const listCount = itemData.listIds ? itemData.listIds.size : 0;
  if (listCount < RECURRENCE_CONFIG.minLists) return false;

  // FILTRO 2: Item deve ter sido comprado nos últimos N meses
  const lastPurchase = itemData.lastPurchaseDate;
  const dataLimite = getRecencyLimitDate();
  if (!lastPurchase || lastPurchase < dataLimite) return false;

  return true;
}

//Exporta globalmente
window.meetsRecurrenceCriteria = meetsRecurrenceCriteria;

/**
 * Extrai dados de recorrência de uma lista de compras
 * Retorna mapa de itens com suas listIds e lastPurchaseDate
 */
function extractRecurringData(lists) {
  const itemsData = {};

  lists.forEach((list) => {
    (list.categories || []).forEach((category) => {
      category.items.forEach((item) => {
        if (!item.checked) return;

        const normalizedName = window.normalizeString(item.name);

        if (!itemsData[normalizedName]) {
          itemsData[normalizedName] = {
            name: item.name,
            listIds: new Set(),
            lastPurchaseDate: null,
            prices: [],
            dates: [],
            totalQuantity: 0,
          };
        }

        itemsData[normalizedName].listIds.add(list.id);

        itemsData[normalizedName].prices.push({
          price: item.price,
          date: list.date,
          listId: list.id,
        });

        itemsData[normalizedName].dates.push(list.date);

        // Acumula a quantidade total comprada
        itemsData[normalizedName].totalQuantity += item.quantity || 1;

        const itemDate = parseDateLocal(list.date);
        if (
          !itemsData[normalizedName].lastPurchaseDate ||
          itemDate > itemsData[normalizedName].lastPurchaseDate
        ) {
          itemsData[normalizedName].lastPurchaseDate = itemDate;
        }
      });
    });
  });

  return itemsData;
}

//Exporta globalmente
window.extractRecurringData = extractRecurringData;

/* ==========================================================================
   SKELETON LOADING - FUNÇÕES DE CARREGAMENTO
   ========================================================================== */

/**
 * Retorna o HTML do skeleton correspondente ao layout de cada aba
 * Cada aba tem seu próprio skeleton que imita sua estrutura real
 *
 * @param {string} tabModuleName - Nome da aba a ser carregada
 * @returns {string} - HTML do skeleton correspondente
 */
function getSkeletonTemplateForTab(tabModuleName) {
  const skeletonTemplates = {
    // Skeleton da aba de Eficiência de Compra
    "purchase-efficiency": `
      <div class="skeleton-tab-container">
        <div class="skeleton skeleton-section-title"></div>
        <div class="skeleton-metrics-grid">
          <div class="skeleton skeleton-metric-card"></div>
          <div class="skeleton skeleton-metric-card"></div>
        </div>
        <div class="skeleton skeleton-chart-card"></div>
        <div class="skeleton skeleton-full-card"></div>
        <div class="skeleton skeleton-chart-card"></div>
      </div>
    `,
    // Skeleton da aba de Inflação Pessoal
    "personal-inflation": `
      <div class="skeleton-tab-container">
        <div class="skeleton skeleton-section-title"></div>
        <div class="skeleton skeleton-list-card"></div>
        <div class="skeleton skeleton-list-item"></div>
        <div class="skeleton skeleton-list-item"></div>
        <div class="skeleton skeleton-list-item"></div>
      </div>
    `,
    // Skeleton da aba de Comportamento e Hábito
    "behavior-habits": `
      <div class="skeleton-tab-container">
        <div class="skeleton skeleton-section-title"></div>
        <div class="skeleton-metrics-grid">
          <div class="skeleton skeleton-metric-card"></div>
          <div class="skeleton skeleton-metric-card"></div>
        </div>
        <div class="skeleton skeleton-full-card"></div>
        <div class="skeleton skeleton-full-card"></div>
        <div class="skeleton skeleton-list-item"></div>
        <div class="skeleton skeleton-list-item"></div>
        <div class="skeleton skeleton-list-item"></div>
      </div>
    `,
    // Skeleton da aba de Insights de Saúde
    "health-insights": `
      <div class="skeleton-tab-container">
        <div class="skeleton skeleton-section-title"></div>
        <div class="skeleton skeleton-chart-card"></div>
        <div class="skeleton skeleton-full-card"></div>
      </div>
    `,
  };

  return (
    skeletonTemplates[tabModuleName] ||
    `
    <div class="skeleton-tab-container">
      <div class="skeleton skeleton-section-title"></div>
      <div class="skeleton skeleton-chart-card"></div>
      <div class="skeleton skeleton-full-card"></div>
    </div>
  `
  );
}

/**
 * Exibe o skeleton de carregamento no módulo de aba ativo
 * Salva o innerHTML original no dataset para restaurar após o carregamento.
 *
 * IMPORTANTE: Não sobrescreve o originalContent se ele já foi salvo.
 * Isso evita que uma segunda chamada (ex: via activateDashboardTab após
 * applyDashboardSkeletonBeforeNavigation em index.js) salve o próprio
 * skeleton como "original", corrompendo a restauração posterior e fazendo
 * com que os elementos reais do DOM nunca sejam recuperados pelo hideTabSkeleton.
 *
 * @param {string} tabModuleName - Nome da aba sendo carregada
 */
function showTabSkeleton(tabModuleName) {
  const activeModule = document.getElementById(`tab-module-${tabModuleName}`);
  if (!activeModule) return;

  // Só salva o conteúdo original se ainda não foi salvo nesta sessão de navegação.
  // Se originalContent já existe, significa que applyDashboardSkeletonBeforeNavigation
  // já preservou o HTML real — reutiliza esse registro sem sobrescrevê-lo.
  if (activeModule.dataset.originalContent === undefined) {
    activeModule.dataset.originalContent = activeModule.innerHTML;
  }

  activeModule.innerHTML = getSkeletonTemplateForTab(tabModuleName);
}

// Exporta globalmente para que index.js possa aplicar o skeleton antes da navegação
window.showTabSkeleton = showTabSkeleton;

/**
 * Remove o skeleton e restaura o conteúdo original do módulo de aba
 * Deve ser chamado ANTES do módulo tentar acessar elementos do DOM
 *
 * @param {string} tabModuleName - Nome da aba que vai carregar os dados
 */
function hideTabSkeleton(tabModuleName) {
  const activeModule = document.getElementById(`tab-module-${tabModuleName}`);
  if (!activeModule) return;

  // Restaura o conteúdo original se o skeleton estiver sendo exibido
  if (activeModule.dataset.originalContent !== undefined) {
    activeModule.innerHTML = activeModule.dataset.originalContent;
    delete activeModule.dataset.originalContent;
  }
}

// Exporta globalmente para o sistema de validação acessar
window.hideTabSkeleton = hideTabSkeleton;

/* ==========================================================================
   GERENCIAMENTO DE ABAS
   ========================================================================== */

/**
 * Ativa uma aba específica e carrega seu módulo.
 * O skeleton é aplicado ANTES do módulo se tornar visível (active),
 * evitando o flash do conteúdo real enquanto os dados ainda não foram carregados.
 */
window.activateDashboardTab = function (tabModuleName) {
  activeTabModule = tabModuleName;
  // Atualiza a referência global
  window.activeTabModule = activeTabModule;

  // Atualiza estado visual das abas
  const tabButtons = document.querySelectorAll(".dashboard-tab-button");
  tabButtons.forEach((button) => {
    if (button.getAttribute("data-tab") === tabModuleName) {
      button.classList.add("active");
    } else {
      button.classList.remove("active");
    }
  });

  // Oculta todos os módulos
  const tabModules = document.querySelectorAll(".dashboard-tab-module");
  tabModules.forEach((module) => {
    module.classList.remove("active");
  });

  // Carrega dados do módulo se houver função específica
  // Converte nome-da-aba para loadNomeDaAbaModule (ex: personal-inflation → loadPersonalInflationModule)
  const functionName =
    "load" +
    tabModuleName
      .split("-")
      .map((segment) => capitalizeFirstLetter(segment))
      .join("") +
    "Module";

  // Obtém o módulo alvo
  const targetModule = document.getElementById(`tab-module-${tabModuleName}`);

  if (window[functionName] && targetModule) {
    // Verifica se o skeleton já foi aplicado antes da navegação
    // (por applyDashboardSkeletonBeforeNavigation em index.js).
    // Quando dataset.originalContent já existe, significa que o HTML real foi
    // preservado e o skeleton já está visível — reaplicar causaria o piscar duplo
    // observado exclusivamente na abertura do dashboard (não na troca de abas).
    const skeletonAlreadyApplied =
      targetModule.dataset.originalContent !== undefined;

    if (!skeletonAlreadyApplied) {
      // Troca de aba normal: aplica o skeleton ANTES de tornar o módulo visível,
      // garantindo que o conteúdo real não apareça por nenhum frame antes do carregamento
      showTabSkeleton(tabModuleName);
    }

    // Torna o módulo visível — com skeleton já no lugar em ambos os caminhos
    targetModule.classList.add("active");

    // Aguarda um frame para o skeleton ser pintado pelo browser,
    // depois restaura o HTML original e carrega os dados reais
    requestAnimationFrame(() => {
      setTimeout(() => {
        // Restaura os elementos originais no DOM antes de o módulo acessá-los
        hideTabSkeleton(tabModuleName);
        // Carrega os dados do módulo com os elementos já disponíveis no DOM
        window[functionName]();
      }, 350);
    });
  } else if (targetModule) {
    // Sem função de carregamento: apenas torna o módulo visível normalmente
    targetModule.classList.add("active");
  }
};

/**
 * Capitaliza a primeira letra de uma string
 */
function capitalizeFirstLetter(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

//Exporta globalmente
window.capitalizeFirstLetter = capitalizeFirstLetter;

/* ==========================================================================
   INICIALIZAÇÃO E FLUXO PRINCIPAL
   ========================================================================== */
window.initDashboardAnalisys = function () {
  const data = window.marketListData;

  if (!data || data.length === 0) {
    window.showToast("Crie listas para ativar a análise.", "info");
    window.showScreen("market-lists-screen");
    return;
  }

  // Neste ponto o skeleton da aba padrão (purchase-efficiency) já foi aplicado
  // por applyDashboardSkeletonBeforeNavigation em index.js, antes da tela ficar
  // visível, e o módulo já está com a classe active.
  // O bloco que adicionava classList.add("active") manualmente foi removido pois
  // era redundante e causava um piscar duplo do skeleton ao abrir o dashboard:
  // o módulo já chega aqui visível e com o skeleton correto no lugar —
  // activateDashboardTab cuida de reaplicar o skeleton e carregar os dados reais.

  // Reseta o filtro para geral
  activeFilter = { type: "geral", value: null };
  window.activeFilter = activeFilter;

  // Limpa campos visuais do modal de filtro para refletir o reset
  updateFilterChipsUI();
  const dynamicSection = document.getElementById("dynamic-filter-section");
  if (dynamicSection) dynamicSection.style.display = "none";

  resetPagination();
  clearCache();

  updateFilterIndicator();
  updateFilterButtonVisualState();

  // Ativa a primeira aba por padrão
  // O skeleton já está visível desde antes da navegação — activateDashboardTab
  // vai reaplicá-lo internamente antes de carregar os dados reais da aba
  activeTabModule = "purchase-efficiency";
  activateDashboardTab("purchase-efficiency");
};

function resetPagination() {
  paginationState.cpi.currentPage = 1;
  paginationState.recurrence.currentPage = 1;
  paginationState.restock.currentPage = 1;
  paginationState.essentials.currentPage = 1;
  paginationState.topLocations.currentPage = 1;
  paginationState.conversionRate.currentPage = 1;
}

function clearCache() {
  cachedDashboardData = {
    cpiItems: null,
    recurrenceItems: null,
    restockItems: null,
    essentialsItems: null,
    topLocationsItems: null,
    conversionRateItems: null,
    lastFilter: null,
  };
  // Atualiza a referência global
  window.cachedDashboardData = cachedDashboardData;
}

/* ==========================================================================
   LÓGICA DE PAGINAÇÃO
   ========================================================================== */
/**
 * @param {HTMLElement} container - Elemento container onde a lista será renderizada
 * @param {Array} items - Array de itens a serem renderizados
 * @param {string} paginationKey - Chave do estado de paginação ('cpi', 'recurrence', 'restock', 'essentials')
 * @param {Function} renderLeftContent - Função que retorna HTML do conteúdo esquerdo (recebe item)
 * @param {Function} renderRightContent - Função que retorna HTML do conteúdo direito (recebe item)
 */
function renderPaginatedList(
  container,
  items,
  paginationKey,
  renderLeftContent,
  renderRightContent,
) {
  const state = paginationState[paginationKey];
  const totalPages = Math.ceil(items.length / state.itemsPerPage);

  // Garante que a página atual é válida
  if (state.currentPage > totalPages) {
    state.currentPage = totalPages || 1;
  }

  const startIndex = (state.currentPage - 1) * state.itemsPerPage;
  const endIndex = startIndex + state.itemsPerPage;
  const paginatedItems = items.slice(startIndex, endIndex);

  // Cria wrapper para a lista
  const listWrapper = document.createElement("div");
  listWrapper.className = "paginated-list-wrapper";

  // Renderiza os itens da página atual com margem inferior para espaçamento
  paginatedItems.forEach((item, index) => {
    const div = document.createElement("div");
    div.className = "data-item";
    div.style.cssText = `
      animation-delay: ${index * 0.1}s;
    `;
    div.innerHTML = `
      <div>${renderLeftContent(item)}</div>
      ${renderRightContent(item)}
    `;
    listWrapper.appendChild(div);
  });

  // Remove margem do último item para evitar espaço extra antes da paginação
  const lastItem = listWrapper.lastElementChild;
  if (lastItem) {
    lastItem.style.marginBottom = "0";
  }

  container.innerHTML = ""; // Limpa o container antes de renderizar
  container.appendChild(listWrapper);

  // Renderiza controles de paginação
  if (totalPages > 1) {
    const paginationControls = createPaginationControls(
      state.currentPage,
      totalPages,
      paginationKey,
      items,
      renderLeftContent,
      renderRightContent,
    );
    container.appendChild(paginationControls);
  }
}

//Exporta globalmente para os módulos usarem
window.renderPaginatedList = renderPaginatedList;

function createPaginationControls(
  currentPage,
  totalPages,
  paginationKey,
  items,
  renderLeftContent,
  renderRightContent,
) {
  const controls = document.createElement("div");
  controls.className = "pagination-controls";
  controls.style.cssText = `
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 12px;
    margin-top: 16px;
    padding: 12px;
    /* CORRIGIDO: Alterado background de rgba(255, 255, 255, 0.03) para rgba(76, 51, 230, 0.05) para melhor visibilidade em fundo claro */
    background: rgba(76, 51, 230, 0.05);
    /* CORRIGIDO: Alterado border-color de rgba(255, 255, 255, 0.05) para rgba(76, 51, 230, 0.15) para melhor visibilidade em fundo claro */
    border-radius: 12px;
    border: 1px solid rgba(76, 51, 230, 0.15);
  `;

  const prevBtn = document.createElement("button");
  prevBtn.innerHTML = '<ion-icon name="chevron-back-outline"></ion-icon>';
  prevBtn.className = "pagination-button";
  prevBtn.disabled = currentPage === 1;

  if (!prevBtn.disabled) {
    prevBtn.onclick = () => {
      paginationState[paginationKey].currentPage--;
      // Re-renderiza apenas esta lista específica
      const container = controls.parentElement;
      container.innerHTML = "";
      renderPaginatedList(
        container,
        items,
        paginationKey,
        renderLeftContent,
        renderRightContent,
      );
    };
  } else {
    prevBtn.style.opacity = "0.3";
    prevBtn.style.cursor = "not-allowed";
  }

  const pageIndicator = document.createElement("span");
  pageIndicator.innerText = `${currentPage} / ${totalPages}`;
  pageIndicator.style.cssText = `
    font-size: 13px;
    font-weight: 600;
    min-width: 50px;
    text-align: center;
  `;
  /* CORRIGIDO: Usa CSS variable --text-main para que a cor do índice responda
     automaticamente ao tema dark/light sem precisar de override manual em JS */
  pageIndicator.style.color = "var(--text-main)";

  const nextBtn = document.createElement("button");
  nextBtn.innerHTML = '<ion-icon name="chevron-forward-outline"></ion-icon>';
  nextBtn.className = "pagination-button";
  nextBtn.disabled = currentPage === totalPages;

  if (!nextBtn.disabled) {
    nextBtn.onclick = () => {
      paginationState[paginationKey].currentPage++;
      // Re-renderiza apenas esta lista específica
      const container = controls.parentElement;
      container.innerHTML = "";
      renderPaginatedList(
        container,
        items,
        paginationKey,
        renderLeftContent,
        renderRightContent,
      );
    };
  } else {
    nextBtn.style.opacity = "0.3";
    nextBtn.style.cursor = "not-allowed";
  }

  controls.appendChild(prevBtn);
  controls.appendChild(pageIndicator);
  controls.appendChild(nextBtn);

  return controls;
}

/* ==========================================================================
   SISTEMA DE FILTROS DO DASHBOARD
   ========================================================================== */

window.toggleFilterModal = function () {
  const modal = document.getElementById("filter-modal");
  modal.classList.toggle("modal-hidden");
};

window.selectFilterType = function (type) {
  activeFilter.type = type;
  window.activeFilter = activeFilter;
  updateFilterChipsUI();
  renderDynamicFilterInputs();
};

function updateFilterChipsUI() {
  const chips = document.querySelectorAll("#filter-type-chips .filter-chip");
  chips.forEach((chip) => {
    if (chip.getAttribute("data-value") === activeFilter.type) {
      chip.classList.add("active");
    } else {
      chip.classList.remove("active");
    }
  });
}

function renderDynamicFilterInputs() {
  const section = document.getElementById("dynamic-filter-section");
  const label = document.getElementById("dynamic-filter-label");
  const container = document.getElementById("dynamic-filter-inputs");

  container.innerHTML = "";

  if (activeFilter.type === "geral") {
    section.style.display = "none";
    return;
  }

  section.style.display = "block";

  if (activeFilter.type === "mes") {
    label.innerText = "Selecione o Mês";
    // Gera lista de meses únicos do histórico
    const dates = [
      ...new Set(
        window.marketListData.map((marketList) =>
          marketList.date.substring(0, 7),
        ),
      ),
    ]
      .sort()
      .reverse();

    const select = document.createElement("select");
    select.id = "filter-month-select";
    select.className = "filter-select";

    dates.forEach((date) => {
      const [year, month] = date.split("-");
      const option = document.createElement("option");
      option.value = date;
      option.innerText = `${month}/${year}`;
      select.appendChild(option);
    });

    container.appendChild(select);
  } else if (activeFilter.type === "periodo") {
    label.innerText = "Intervalo de Datas";
    container.innerHTML = `
      <div class="filter-date-group">
        <input type="date" id="filter-date-start" class="filter-input" />
        <span>até</span>
        <input type="date" id="filter-date-end" class="filter-input" />
      </div>
    `;
  } else if (activeFilter.type === "local") {
    label.innerText = "Selecione o Local";
    const locations = [
      ...new Set(
        window.marketListData.map((list) => list.location || "Não Informado"),
      ),
    ].sort();

    const select = document.createElement("select");
    select.id = "filter-location-select";
    select.className = "filter-select";

    locations.forEach((l) => {
      const option = document.createElement("option");
      option.value = l;
      option.innerText = l;
      select.appendChild(option);
    });

    container.appendChild(select);
  }
}

window.applyDashboardFilter = function () {
  if (activeFilter.type === "mes") {
    activeFilter.value = document.getElementById("filter-month-select").value;
  } else if (activeFilter.type === "periodo") {
    activeFilter.value = {
      start: document.getElementById("filter-date-start").value,
      end: document.getElementById("filter-date-end").value,
    };
    if (!activeFilter.value.start || !activeFilter.value.end) {
      window.showToast("Selecione as datas de início e fim.", "warning");
      return;
    }
  } else if (activeFilter.type === "local") {
    activeFilter.value = document.getElementById(
      "filter-location-select",
    ).value;
  }

  // Atualiza a referência global
  window.activeFilter = activeFilter;

  resetPagination();
  clearCache();

  updateFilterIndicator();
  updateFilterButtonVisualState();

  // Recarrega o módulo ativo com novo filtro
  // Converte nome-da-aba para loadNomeDaAbaModule (ex: personal-inflation → loadPersonalInflationModule)
  const functionName =
    "load" +
    activeTabModule
      .split("-")
      .map((segment) => capitalizeFirstLetter(segment))
      .join("") +
    "Module";
  if (window[functionName]) {
    window[functionName]();
  }

  window.toggleFilterModal();
};

window.clearFilter = function () {
  activeFilter = { type: "geral", value: null };
  window.activeFilter = activeFilter;
  updateFilterChipsUI();
  document.getElementById("dynamic-filter-section").style.display = "none";

  resetPagination();
  clearCache();

  applyDashboardFilter();
};

/**
 * Aplica o filtro atual às listas
 */
function applyCurrentFilter(allLists) {
  if (activeFilter.type === "geral") return allLists;

  return allLists.filter((list) => {
    if (activeFilter.type === "mes") {
      return list.date.startsWith(activeFilter.value);
    } else if (activeFilter.type === "periodo") {
      const d = parseDateLocal(list.date);
      const start = parseDateLocal(activeFilter.value.start);
      const end = parseDateLocal(activeFilter.value.end);
      return d >= start && d <= end;
    } else if (activeFilter.type === "local") {
      return (list.location || "Não Informado") === activeFilter.value;
    }
    return true;
  });
}

//Exporta globalmente para os módulos usarem
window.applyCurrentFilter = applyCurrentFilter;

function updateFilterIndicator() {
  const indicator = document.getElementById("active-filter-indicator");
  const text = document.getElementById("filter-text-display");

  if (activeFilter.type === "geral") {
    indicator.classList.add("screen-hidden");
  } else {
    indicator.classList.remove("screen-hidden");
    if (activeFilter.type === "mes") {
      const [y, m] = activeFilter.value.split("-");
      text.innerText = `Mês: ${m}/${y}`;
    } else if (activeFilter.type === "periodo") {
      text.innerText = `${formatDateBRL(activeFilter.value.start)} - ${formatDateBRL(activeFilter.value.end)}`;
    } else if (activeFilter.type === "local") {
      text.innerText = `Local: ${activeFilter.value}`;
    }
  }
}

function updateFilterButtonVisualState() {
  const button = document.querySelector(".icon-filter");
  if (activeFilter.type !== "geral") {
    button.style.color = "var(--accent-green)";
    button.style.filter = "drop-shadow(0 0 5px var(--accent-green))";
  } else {
    button.style.color = "";
    button.style.filter = "";
  }
}

/* ==========================================================================
   ESTADOS VAZIOS E AUXILIARES
   ========================================================================== */

function renderEmptyState() {
  const dashboardContent = document.querySelector(".dashboard-content");
  const emptyStateContainer = document.getElementById("dashboard-empty-state");

  if (dashboardContent) dashboardContent.style.display = "none";
  if (emptyStateContainer) {
    emptyStateContainer.style.display = "flex";
    emptyStateContainer.innerHTML = `
      <img src="assets/empty-dashboard.png" alt="Sem dados" onerror="this.src='https://cdn-icons-png.flaticon.com/512/4076/4076432.png'">
      <h3>Nenhum dado encontrado</h3>
      <p>Não há compras registradas para o filtro selecionado. Tente mudar o filtro ou criar novas listas.</p>
      <button class="button-filter-apply mt-20" onclick="clearFilter()">Limpar Filtros</button>
    `;
  }
}

function formatDateBRL(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

//Exporta globalmente
window.formatDateBRL = formatDateBRL;
