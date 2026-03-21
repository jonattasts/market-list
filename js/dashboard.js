/* ==========================================================================
   DASHBOARD & DATA ANALYTICS MODULE
   ========================================================================= */

// Utilitário local para formatação de moeda
const formatCurrencyBRL = (val) =>
  val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Estado dos Gráficos (para destruí-los antes de recriar)
let chartShareWallet = null;
let chartVolumeItens = null;
let chartHealthProfile = null;

// Filtro Ativo Padrão (Geral)
let activeFilter = { type: "geral", value: null };

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

/**
 * Extrai ano e mês de uma data string (YYYY-MM-DD) para comparação
 * Retorna objeto {year, month} sem criar Date (evita timezone issues)
 */
function getYearMonth(dateStr) {
  if (!dateStr) return { year: 0, month: 0 };
  const [year, month] = dateStr.split("-").map(Number);
  return { year, month };
}

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

/**
 * Formata o período do mês para exibição (ex: "Março/2024")
 */
function formatMonthPeriod(year, month) {
  const monthName = getMonthName(month - 1);
  return `${monthName}`;
}

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

  activeFilter = { type: "geral", value: null };

  // Limpa campos visuais do modal de filtro para refletir o reset
  updateFilterChipsUI();
  const dynamicSection = document.getElementById("dynamic-filter-section");
  if (dynamicSection) dynamicSection.style.display = "none";

  resetPagination();
  clearCache();

  updateFilterIndicator();
  updateFilterButtonVisualState();
  processDashboardData(data);
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
}

/* ==========================================================================
   PROCESSAMENTO DE DADOS E CÁLCULO DE MÉTRICAS
   ========================================================================== */
function processDashboardData(allLists) {
  // 1. Aplica o filtro ativo aos dados
  const filteredLists = applyCurrentFilter(allLists);

  const dashboardContent = document.querySelector(".dashboard-content");
  const emptyStateContainer = document.getElementById("dashboard-empty-state");

  if (filteredLists.length === 0) {
    renderEmptyState();
    return;
  }

  // Garante que o conteúdo seja exibido e o estado vazio ocultado
  if (dashboardContent) dashboardContent.style.display = "flex";
  if (emptyStateContainer) emptyStateContainer.style.display = "none";

  // Agrega todos os itens e categorias das listas filtradas
  const allFlattenedItems = [];
  const categoryTotals = {};
  let totalSpentInPeriod = 0;
  let totalItemsAdded = 0;
  let totalItemsChecked = 0;
  let forecastTotal = 0;

  filteredLists.forEach((list) => {
    (list.categories || []).forEach((category) => {
      // Agregação para gasto por categoria
      if (!categoryTotals[category.name]) categoryTotals[category.name] = 0;

      category.items.forEach((item) => {
        allFlattenedItems.push(item);
        totalItemsAdded += item.quantity || 1;

        const unitValue = parseFloat(
          item.price.replace(/\./g, "").replace(",", "."),
        );
        const quantity = item.quantity || 1;
        const valorTotalItem = unitValue * quantity;

        forecastTotal += valorTotalItem;

        if (item.checked) {
          totalItemsChecked += item.quantity || 1;
          categoryTotals[category.name] += valorTotalItem;
          totalSpentInPeriod += valorTotalItem;
        }
      });
    });
  });

  // ---------------------------------------------------------
  // 1. MÉTRICAS DE PERFORMANCE FINANCEIRA
  // ---------------------------------------------------------

  // A. Ticket Médio por Lista
  const averageTicket = totalSpentInPeriod / filteredLists.length;
  document.getElementById("metric-ticket-medio").innerText =
    formatCurrencyBRL(averageTicket);

  // B. Economia Potencial (Desejado - Comprado)
  const economy = forecastTotal - totalSpentInPeriod;
  document.getElementById("metric-economy").innerText =
    formatCurrencyBRL(economy);

  // C. Gasto por Categoria (Gráfico Pizza)
  renderShareWalletChart(categoryTotals);

  // D. Inflação Pessoal (CPI) - Com critérios de recorrência
  calculateCPI(filteredLists);

  // ---------------------------------------------------------
  // 2. MÉTRICAS DE COMPORTAMENTO E HÁBITO
  // ---------------------------------------------------------

  // A. Índice de Fidelidade de Local - Card pequeno + Lista dos 3 mais visitados
  calculateLocationFidelity(filteredLists);

  // B. Recorrência de Itens e Ciclo de Reposição - Com critérios de recorrência
  calculateItemRecurrenceAndRestock(filteredLists);

  // C. Itens Essenciais - Baseado em TODAS as listas dos últimos 3 meses (50% de aparição)
  calculateEssentialItems(allLists);

  // ---------------------------------------------------------
  // 3. MÉTRICAS DE EFICIÊNCIA DA COMPRA
  // ---------------------------------------------------------

  // A. Volume de Itens por Lista (Gráfico Coluna)
  renderVolumeItemsChart(filteredLists);

  // B. Taxa de Conversão dos Últimos 3 Meses - NOVA IMPLEMENTAÇÃO
  calculateMonthlyConversionRate(allLists);

  // ---------------------------------------------------------
  // 4. INSIGHTS DE SAÚDE E NUTRIÇÃO
  // ---------------------------------------------------------

  // A. Ratio Ultraprocessados vs In Natura (Gráfico Pizza)
  calculateHealthRatio(categoryTotals);

  // B. Sazonalidade de Consumo
  calculateSeasonality(filteredLists);
}

/* ==========================================================================
   CÁLCULOS ESPECÍFICOS E LÓGICA DE DADOS
   ========================================================================== */

/**
 * Métrica 3.B: Taxa de Conversão dos Últimos 3 Meses
 *
 * Calcula a taxa de conversão (itens comprados / itens adicionados)
 * para cada um dos últimos 3 meses e exibe em formato de lista.
 *
 * @param {Array} allLists - Todas as listas de compras
 */
function calculateMonthlyConversionRate(allLists) {
  const container = document.getElementById("conversion-rate-container");

  if (!container) return;

  const currentFilterKey = JSON.stringify(activeFilter);
  if (
    cachedDashboardData.conversionRateItems &&
    cachedDashboardData.lastFilter === currentFilterKey
  ) {
    renderPaginatedList(
      container,
      cachedDashboardData.conversionRateItems,
      "conversionRate",
      (item) => `
        <div class="conversion-month-info">
          <div class="item-main-text">${item.monthPeriod}</div>
          <span class="item-sub-text">${item.totalLists} lista(s) | ${item.totalItemsAdded} item(ns)</span>
        </div>
      `,
      (item) => `
        <div class="conversion-rate-badge-container">
          <div class="conversion-rate-badge ${item.performanceClass}">
            ${item.conversionRateFormatted}
          </div>
          <span class="item-sub-text">${item.totalItemsChecked} de ${item.totalItemsAdded} comprados</span>
        </div>
      `,
    );
    return;
  }

  container.innerHTML = "";

  // Agrupa listas por mês/ano
  const listsByMonth = {};

  allLists.forEach((list) => {
    const date = parseDateLocal(list.date);
    const yearMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

    if (!listsByMonth[yearMonth]) {
      listsByMonth[yearMonth] = {
        year: date.getFullYear(),
        month: date.getMonth() + 1,
        lists: [],
      };
    }

    listsByMonth[yearMonth].lists.push(list);
  });

  // Ordena os meses (mais recente primeiro) e pega os últimos 3
  const sortedMonths = Object.keys(listsByMonth)
    .sort()
    .reverse()
    .slice(0, CONVERSION_RATE_CONFIG.monthsToShow);

  if (sortedMonths.length === 0) {
    container.innerHTML = `<div class="empty-state-minor">Sem dados suficientes para calcular a taxa de conversão.</div>`;
    return;
  }

  const conversionRateItems = [];

  sortedMonths.forEach((yearMonth) => {
    const monthData = listsByMonth[yearMonth];
    const monthPeriod = formatMonthPeriod(monthData.year, monthData.month);

    let totalItemsAdded = 0;
    let totalItemsChecked = 0;

    // Agrega dados de todas as listas do mês
    monthData.lists.forEach((list) => {
      (list.categories || []).forEach((category) => {
        category.items.forEach((item) => {
          const quantity = item.quantity || 1;
          totalItemsAdded += quantity;

          if (item.checked) {
            totalItemsChecked += quantity;
          }
        });
      });
    });

    const conversionRate =
      totalItemsAdded > 0 ? (totalItemsChecked / totalItemsAdded) * 100 : 0;

    // Define a classe de performance baseada na taxa
    let performanceClass = "low";
    if (conversionRate >= 90) {
      performanceClass = "excellent";
    } else if (conversionRate >= 80) {
      performanceClass = "good";
    } else if (conversionRate >= 70) {
      performanceClass = "average";
    }

    conversionRateItems.push({
      monthPeriod: monthPeriod,
      yearMonth: yearMonth,
      totalLists: monthData.lists.length,
      totalItemsAdded: totalItemsAdded,
      totalItemsChecked: totalItemsChecked,
      conversionRate: conversionRate,
      conversionRateFormatted: `${conversionRate.toFixed(0)}%`,
      performanceClass: performanceClass,
    });
  });

  cachedDashboardData.conversionRateItems = conversionRateItems;
  cachedDashboardData.lastFilter = currentFilterKey;

  renderPaginatedList(
    container,
    conversionRateItems,
    "conversionRate",
    (item) => `
      <div class="conversion-month-info">
        <div class="item-main-text">${item.monthPeriod}</div>
        <span class="item-sub-text">${item.totalLists} lista(s) | ${item.totalItemsAdded} item(ns)</span>
      </div>
    `,
    (item) => `
      <div class="conversion-rate-badge-container">
        <div class="conversion-rate-badge ${item.performanceClass}">
          ${item.conversionRateFormatted}
        </div>
        <span class="item-sub-text">${item.totalItemsChecked} de ${item.totalItemsAdded} comprados</span>
      </div>
    `,
  );
}

/**
 * Métrica 1.D: Inflação Pessoal (CPI)
 *
 * Busca em TODAS as listas (até 3 meses atrás) e exibe o item
 * quando encontrar pelo menos 2 ocorrências em listas diferentes.
 * Compara sempre a última ocorrência com a penúltima ocorrência do item.
 */
function calculateCPI(filteredLists) {
  const container = document.getElementById("cpi-container");

  // Verifica se já temos dados em cache para este filtro
  const currentFilterKey = JSON.stringify(activeFilter);
  if (
    cachedDashboardData.cpiItems &&
    cachedDashboardData.lastFilter === currentFilterKey
  ) {
    renderPaginatedList(
      container,
      cachedDashboardData.cpiItems,
      "cpi",
      (item) => `
        <div class="item-main-text">${item.name}</div>
        <span class="item-sub-text">Anterior: ${formatCurrencyBRL(item.avgPrevious)} → Atual: ${formatCurrencyBRL(item.avgCurrent)}</span>
      `,
      (item) => `
        <strong style="color: ${item.color}">
          ${item.emoji} ${Math.abs(item.diff).toFixed(1)}%
        </strong>
      `,
    );
    return;
  }

  container.innerHTML = "";

  if (filteredLists.length === 0) {
    container.innerHTML = `<div class="empty-state-minor">Sem dados no período selecionado.</div>`;
    return;
  }

  const itemsData = extractRecurringData(filteredLists);

  const cpiItems = [];

  Object.keys(itemsData).forEach((name) => {
    const itemData = itemsData[name];

    // Verifica se o item aparece em pelo menos 2 listas diferentes
    if (itemData.listIds.size < 2) return;

    // Verifica se a última compra está dentro dos últimos 3 meses
    const dataLimite = getRecencyLimitDate();
    if (!itemData.lastPurchaseDate || itemData.lastPurchaseDate < dataLimite)
      return;

    // Ordena as ocorrências por data (mais recente primeiro)
    const sortedOccurrences = itemData.prices
      .map((o) => ({
        ...o,
        dateObj: parseDateLocal(o.date),
        valorNumerico: parseFloat(o.price.replace(/\./g, "").replace(",", ".")),
      }))
      .sort((a, b) => b.dateObj - a.dateObj);

    // Pega a última e a penúltima ocorrência (de listas diferentes)
    const lastOccurrence = sortedOccurrences[0];
    const penultimateOccurrence = sortedOccurrences.find(
      (o) => o.listId !== lastOccurrence.listId,
    );

    // Se não encontrou penúltima ocorrência em lista diferente, ignora
    if (!penultimateOccurrence) return;

    const avgCurrent = lastOccurrence.valorNumerico;
    const avgPrevious = penultimateOccurrence.valorNumerico;

    let diff = parseFloat(
      (((avgCurrent - avgPrevious) / avgPrevious) * 100).toFixed(10),
    );

    // Define o emoji e a cor baseada na variação
    let emoji = "📉";
    let color = "var(--accent-green)";

    if (diff > 0) {
      emoji = "📈";
      color = "var(--danger)";
    } else if (diff === 0) {
      emoji = "📉"; // Mantém o padrão da imagem para 0.0%
      color = "var(--accent-green)";
    }

    cpiItems.push({
      name: window.capitalize(itemData.name),
      avgPrevious,
      avgCurrent,
      diff,
      emoji,
      color,
      listCount: itemData.listIds.size,
      lastPurchaseDate: itemData.lastPurchaseDate,
    });
  });

  if (cpiItems.length === 0) {
    container.innerHTML = `<div class="empty-state-minor">Nenhum item recorrente encontrado nos últimos ${RECURRENCE_CONFIG.monthsLimit} meses.</div>`;
    return;
  }

  // Armazena em cache
  cachedDashboardData.cpiItems = cpiItems;
  cachedDashboardData.lastFilter = currentFilterKey;

  renderPaginatedList(
    container,
    cpiItems,
    "cpi",
    (item) => `
      <div class="item-main-text">${item.name}</div>
      <span class="item-sub-text">Anterior: ${formatCurrencyBRL(item.avgPrevious)} → Atual: ${formatCurrencyBRL(item.avgCurrent)}</span>
    `,
    (item) => `
      <strong style="color: ${item.color}">
        ${item.emoji} ${Math.abs(item.diff).toFixed(1)}%
      </strong>
    `,
  );
}

/**
 * Métrica 2.A: Índice de Fidelidade de Local
 *
 * Atualizado para exibir:
 * - Card pequeno: TOP local e quantidade de compras
 * - Lista completa: Top 3 locais mais visitados com última data de compra
 */
function calculateLocationFidelity(filteredLists) {
  const locationsData = {};

  // Agrega dados por local
  filteredLists.forEach((filteredList) => {
    const location = filteredList.location || "Não Informado";
    const listDate = parseDateLocal(filteredList.date);

    if (!locationsData[location]) {
      locationsData[location] = {
        name: location,
        count: 0,
        lastPurchaseDate: null,
      };
    }

    locationsData[location].count += 1;

    // Atualiza a última data de compra se for mais recente
    if (
      !locationsData[location].lastPurchaseDate ||
      listDate > locationsData[location].lastPurchaseDate
    ) {
      locationsData[location].lastPurchaseDate = listDate;
    }
  });

  // Converte para array e ordena por quantidade de compras (decrescente)
  const sortedLocations = Object.values(locationsData).sort(
    (locationA, locationB) => locationB.count - locationA.count,
  );

  // Atualiza o card pequeno com o TOP local
  const topLocation = sortedLocations.length > 0 ? sortedLocations[0] : null;
  document.getElementById("metric-top-local").innerText = topLocation
    ? topLocation.name
    : "--";
  document.getElementById("metric-local-freq").innerText = topLocation
    ? `${topLocation.count} compras`
    : "0 compras";

  // Renderiza a lista dos top 3 locais mais visitados
  const topLocationsContainer = document.getElementById(
    "top-locations-container",
  );

  // Verifica cache
  const currentFilterKey = JSON.stringify(activeFilter);
  if (
    cachedDashboardData.topLocationsItems &&
    cachedDashboardData.lastFilter === currentFilterKey
  ) {
    renderPaginatedList(
      topLocationsContainer,
      cachedDashboardData.topLocationsItems,
      "topLocations",
      (item) => `
        <div class="location-item-info">
          <div class="item-main-text">${item.name}</div>
          <span class="item-sub-text">Última compra: ${item.lastPurchaseDateFormatted}</span>
        </div>
      `,
      (item) => `
        <div class="location-count-badge">
          <div class="count-badge" style="background: ${item.badgeColor}">
            ${item.count}
          </div>
          <span class="item-sub-text">${item.count > 1 ? "compras" : "compra"}</span>
        </div>
      `,
    );
    return;
  }

  topLocationsContainer.innerHTML = "";

  if (sortedLocations.length === 0) {
    topLocationsContainer.innerHTML = `<div class="empty-state-minor">Nenhum local de compra registrado.</div>`;
    return;
  }

  // Pega apenas os 3 primeiros locais
  const topThreeLocations = sortedLocations.slice(0, 3);

  const topLocationsItems = topThreeLocations.map((location, index) => {
    // Define cor do badge baseado na posição
    let badgeColor = "rgba(36, 150, 137, 0.5)"; // Verde para 1º

    if (index === 1) {
      badgeColor = "rgba(52, 152, 219, 0.4)"; // Azul para 2º
    } else if (index === 2) {
      badgeColor = "rgba(235, 156, 29, 0.6)"; // Laranja para 3º
    }

    return {
      name: location.name,
      count: location.count,
      lastPurchaseDate: location.lastPurchaseDate,
      lastPurchaseDateFormatted: formatDateBRL(
        location.lastPurchaseDate.toISOString().split("T")[0],
      ),
      badgeColor: badgeColor,
      position: index + 1,
    };
  });

  // Armazena em cache
  cachedDashboardData.topLocationsItems = topLocationsItems;
  cachedDashboardData.lastFilter = currentFilterKey;

  renderPaginatedList(
    topLocationsContainer,
    topLocationsItems,
    "topLocations",
    (item) => `
      <div class="location-item-info">
        <div class="item-main-text">${item.name}</div>
        <span class="item-sub-text">Última compra: ${item.lastPurchaseDateFormatted}</span>
      </div>
    `,
    (item) => `
      <div class="location-count-badge">
        <div class="count-badge" style="background: ${item.badgeColor}">
          ${item.count}
        </div>
        <span class="item-sub-text">${item.count > 1 ? "compras" : "compra"}</span>
      </div>
    `,
  );
}

/**
 * Métrica 2.C: Itens Essenciais
 *
 * Considera TODAS as listas dos últimos 3 meses.
 * Item é essencial se aparecer em pelo menos 50% das listas.
 * Exibe: nome do item, porcentagem de aparição e quantidade total comprada.
 */
function calculateEssentialItems(allLists) {
  const container = document.getElementById("essentials-container");

  if (!container) return;

  // Verifica cache
  const currentFilterKey = JSON.stringify(activeFilter);
  if (
    cachedDashboardData.essentialsItems &&
    cachedDashboardData.lastFilter === currentFilterKey
  ) {
    renderPaginatedList(
      container,
      cachedDashboardData.essentialsItems,
      "essentials",
      (item) => `
        <div class="essential-item-info">
          <div class="item-main-text">${item.name}</div>
          <span class="item-sub-text">Qtd. total comprada: ${item.totalQuantity} unid.</span>
        </div>
      `,
      (item) => `
        <div class="essential-percentage">
          <div class="percentage-badge" style="background: ${item.percentageColor}">
            ${item.appearancePercentage.toFixed(0)}%
          </div>
          <span class="item-sub-text">${item.listsCount} de ${item.totalListsCount} listas</span>
        </div>
      `,
    );
    return;
  }

  container.innerHTML = "";

  // Filtra apenas listas dos últimos 3 meses
  const recentLists = allLists.filter((list) =>
    isWithinMonthsLimit(list.date, ESSENTIALS_CONFIG.monthsLimit),
  );

  if (recentLists.length === 0) {
    container.innerHTML = `<div class="empty-state-minor">Nenhuma lista nos últimos ${ESSENTIALS_CONFIG.monthsLimit} meses.</div>`;
    return;
  }

  // Extrai dados de todos os itens das listas recentes
  const itemsData = {};

  recentLists.forEach((list) => {
    (list.categories || []).forEach((category) => {
      category.items.forEach((item) => {
        if (!item.checked) return;

        const normalizedName = window.normalizeString(item.name);

        if (!itemsData[normalizedName]) {
          itemsData[normalizedName] = {
            name: item.name,
            listIds: new Set(),
            totalQuantity: 0,
          };
        }

        itemsData[normalizedName].listIds.add(list.id);
        itemsData[normalizedName].totalQuantity += item.quantity || 1;
      });
    });
  });

  const totalListsCount = recentLists.length;

  const essentialItems = [];

  Object.keys(itemsData).forEach((name) => {
    const itemData = itemsData[name];
    const listsCount = itemData.listIds.size;
    const appearancePercentage = (listsCount / totalListsCount) * 100;

    // Item é essencial se aparece em pelo menos 50% das listas
    if (appearancePercentage >= ESSENTIALS_CONFIG.minPercentage) {
      let percentageColor = "rgba(36, 150, 137, 0.6)"; // Verde forte para 90%+

      if (appearancePercentage <= 89 && appearancePercentage >= 70) {
        percentageColor = "rgba(76, 51, 230, 0.5)"; // Roxo para 70-89%
      } else if (appearancePercentage <= 69) {
        percentageColor = "rgba(52, 152, 219, 0.4)"; // Azul para 50-69%
      }

      essentialItems.push({
        name: window.capitalize(itemData.name),
        appearancePercentage: appearancePercentage,
        listsCount: listsCount,
        totalListsCount: totalListsCount,
        totalQuantity: itemData.totalQuantity,
        percentageColor: percentageColor,
      });
    }
  });

  // Ordena por porcentagem de aparição (maior primeiro)
  essentialItems.sort(
    (a, b) => b.appearancePercentage - a.appearancePercentage,
  );

  if (essentialItems.length === 0) {
    container.innerHTML = `<div class="empty-state-minor">Nenhum item essencial encontrado (aparece em mais de ${ESSENTIALS_CONFIG.minPercentage}% das listas).</div>`;
    return;
  }

  // Atualiza o contador no card superior
  document.getElementById("metric-essentials-count").innerText =
    essentialItems.length;

  // Armazena em cache
  cachedDashboardData.essentialsItems = essentialItems;
  cachedDashboardData.lastFilter = currentFilterKey;

  renderPaginatedList(
    container,
    essentialItems,
    "essentials",
    (item) => `
      <div class="essential-item-info">
        <div class="item-main-text">${item.name}</div>
        <span class="item-sub-text">Qtd. total comprada: ${item.totalQuantity} unid.</span>
      </div>
    `,
    (item) => `
      <div class="essential-percentage">
        <div class="percentage-badge" style="background: ${item.percentageColor}">
          ${item.appearancePercentage.toFixed(0)}%
        </div>
        <span class="item-sub-text">${item.listsCount} de ${item.totalListsCount} listas</span>
      </div>
    `,
  );
}

/**
 * Métrica 2.A e 2.B: Recorrência de Itens e Ciclo de Reposição
 *
 * REGRA DE RECORRÊNCIA: Exibe apenas itens que atendem aos critérios em RECURRENCE_CONFIG
 */
function calculateItemRecurrenceAndRestock(filteredLists) {
  const listCount = filteredLists.length;

  // Extrai dados de recorrência usando função utilitária
  const itemsData = extractRecurringData(filteredLists);

  // Filtra apenas itens que atendem aos critérios de recorrência
  const recurringData = {};
  Object.keys(itemsData).forEach((name) => {
    if (meetsRecurrenceCriteria(itemsData[name])) {
      recurringData[name] = itemsData[name];
    }
  });

  // EXIBIÇÃO DE RECORRÊNCIA (FREQUÊNCIA) ---
  const recurrenceContainer = document.getElementById("recurrence-itens-list");

  // Verifica cache
  const currentFilterKey = JSON.stringify(activeFilter);

  if (recurrenceContainer) {
    // Verifica se já temos dados em cache
    if (
      cachedDashboardData.recurrenceItems &&
      cachedDashboardData.lastFilter === currentFilterKey
    ) {
      renderPaginatedList(
        recurrenceContainer,
        cachedDashboardData.recurrenceItems,
        "recurrence",
        (item) => `
          <div>
            <span class="item-main-text">${item.name}</span>
            <span class="item-sub-text">Média: ${item.average} dias | ${item.purchases} compras</span>
          </div>
        `,
        (item) => `
          <strong style="color: var(--primary-light)">
            ${item.frequencyText}
          </strong>
        `,
      );
    } else {
      recurrenceContainer.innerHTML = "";

      const recurringItems = [];

      Object.keys(recurringData).forEach((name) => {
        const itemData = recurringData[name];
        const dates = [...new Set(itemData.dates)].sort();

        if (dates.length >= 2) {
          const intervalos = [];
          for (let i = 1; i < dates.length; i++) {
            const diffTime =
              parseDateLocal(dates[i]) - parseDateLocal(dates[i - 1]);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            if (diffDays > 0 && diffDays < 365) intervalos.push(diffDays);
          }

          if (intervalos.length > 0) {
            const averageDays =
              intervalos.reduce((a, b) => a + b, 0) / intervalos.length;
            let frequencyText = "";

            if (averageDays <= 8) frequencyText = "Semanal";
            else if (averageDays <= 16) frequencyText = "Quinzenal";
            else if (averageDays <= 35) frequencyText = "Mensal";
            else frequencyText = `A cada ${Math.round(averageDays)} dias`;

            recurringItems.push({
              name: window.capitalize(itemData.name),
              average: Math.round(averageDays),
              frequencyText: frequencyText,
              purchases: dates.length,
            });
          }
        }
      });

      recurringItems.sort(
        (recurringItemA, recurringItemB) =>
          recurringItemB.purchases - recurringItemA.purchases,
      );

      if (recurringItems.length === 0) {
        recurrenceContainer.innerHTML = `<div class="empty-state-minor">Nenhum item recorrente encontrado nos últimos ${RECURRENCE_CONFIG.monthsLimit} meses.</div>`;
      } else {
        // Armazena em cache
        cachedDashboardData.recurrenceItems = recurringItems;
        cachedDashboardData.lastFilter = currentFilterKey;

        renderPaginatedList(
          recurrenceContainer,
          recurringItems,
          "recurrence",
          (item) => `
            <div>
              <span class="item-main-text">${item.name}</span>
              <span class="item-sub-text">Média: ${item.average} dias | ${item.purchases} compras</span>
            </div>
          `,
          (item) => `
            <strong style="color: var(--primary-light)">
              ${item.frequencyText}
            </strong>
          `,
        );
      }
    }
  }

  // PREVISÃO DE REPOSIÇÃO ---
  const restockContainer = document.getElementById("restock-list");

  // Verifica cache para reposição
  if (
    cachedDashboardData.restockItems &&
    cachedDashboardData.lastFilter === currentFilterKey
  ) {
    renderPaginatedList(
      restockContainer,
      cachedDashboardData.restockItems,
      "restock",
      (item) => {
        let statusText = "";
        let statusColor = "var(--bg-card-light)";

        if (item.daysRemaining < 0) {
          statusText = `Atraso ${Math.abs(item.daysRemaining)}d`;
          statusColor = "var(--danger)";
        } else if (item.daysRemaining === 0) {
          statusText = "Hoje";
          statusColor = "var(--accent-green)";
        } else if (item.daysRemaining <= 3) {
          statusText = `Em ${item.daysRemaining}d`;
          statusColor = "var(--primary-light)";
        } else {
          statusText = `📅 ${formatDateBRL(item.nextDate.toISOString().split("T")[0])}`;
        }

        return `
          <div>
            <span class="item-main-text">${item.name}</span>
            <span class="item-sub-text">Ciclo: ${item.cycle}d | Última: ${item.lastDateStr}</span>
          </div>
        `;
      },
      (item) => {
        let statusText = "";
        let statusColor = "var(--bg-card-light)";

        if (item.daysRemaining < 0) {
          statusText = `Atraso ${Math.abs(item.daysRemaining)}d`;
          statusColor = "var(--danger)";
        } else if (item.daysRemaining === 0) {
          statusText = "Hoje";
          statusColor = "var(--accent-green)";
        } else if (item.daysRemaining <= 3) {
          statusText = `Em ${item.daysRemaining}d`;
          statusColor = "var(--primary-light)";
        } else {
          statusText = `📅 ${formatDateBRL(item.nextDate.toISOString().split("T")[0])}`;
        }

        return `
          <strong style="color: ${statusColor}">
            ${statusText}
          </strong>
        `;
      },
    );
    return;
  }

  restockContainer.innerHTML = "";

  if (listCount < 3) {
    restockContainer.innerHTML = `<div class="empty-state-minor">Gere mais listas para prever reposição.</div>`;
    return;
  }

  const predictionsRestocking = [];

  // Usa apenas dados de itens que atendem aos critérios de recorrência
  Object.keys(recurringData).forEach((name) => {
    const itemData = recurringData[name];
    const dates = [...new Set(itemData.dates)].sort();

    if (dates.length >= 2) {
      const intervalos = [];
      for (let i = 1; i < dates.length; i++) {
        const diffTime =
          parseDateLocal(dates[i]) - parseDateLocal(dates[i - 1]);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays > 0 && diffDays < 365) intervalos.push(diffDays);
      }

      if (intervalos.length > 0) {
        const averageDays =
          intervalos.reduce((a, b) => a + b, 0) / intervalos.length;

        const lastPurchase = parseDateLocal(dates[dates.length - 1]);
        const nextDate = new Date(lastPurchase);
        nextDate.setDate(lastPurchase.getDate() + Math.round(averageDays));

        // Só mostra previsões para datas futuras ou próximas
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const daysUntilPurchase = Math.ceil(
          (nextDate - today) / (1000 * 60 * 60 * 24),
        );

        if (daysUntilPurchase >= -7) {
          // Mostra se já passou até 7 dias (atraso) ou está no futuro
          predictionsRestocking.push({
            name: window.capitalize(itemData.name),
            cycle: Math.round(averageDays),
            nextDate: nextDate,
            lastDateStr: formatDateBRL(dates[dates.length - 1]),
            daysRemaining: daysUntilPurchase,
          });
        }
      }
    }
  });

  predictionsRestocking.sort((a, b) => a.nextDate - b.nextDate);

  if (predictionsRestocking.length === 0) {
    restockContainer.innerHTML = `<div class="empty-state-minor">Nenhum item recorrente encontrado nos últimos ${RECURRENCE_CONFIG.monthsLimit} meses.</div>`;
    return;
  }

  // Armazena em cache
  cachedDashboardData.restockItems = predictionsRestocking;
  cachedDashboardData.lastFilter = currentFilterKey;

  renderPaginatedList(
    restockContainer,
    predictionsRestocking,
    "restock",
    (item) => {
      let statusText = "";
      let statusColor = "var(--bg-card-light)";

      if (item.daysRemaining < 0) {
        statusText = `Atraso ${Math.abs(item.daysRemaining)}d`;
        statusColor = "var(--danger)";
      } else if (item.daysRemaining === 0) {
        statusText = "Hoje";
        statusColor = "var(--accent-green)";
      } else if (item.daysRemaining <= 3) {
        statusText = `Em ${item.daysRemaining}d`;
        statusColor = "var(--primary-light)";
      } else {
        statusText = `📅 ${formatDateBRL(item.nextDate.toISOString().split("T")[0])}`;
      }

      return `
        <div>
          <span class="item-main-text">${item.name}</span>
          <span class="item-sub-text">Ciclo: ${item.cycle}d | Última: ${item.lastDateStr}</span>
        </div>
      `;
    },
    (item) => {
      let statusText = "";
      let statusColor = "var(--bg-card-light)";

      if (item.daysRemaining < 0) {
        statusText = `Atraso ${Math.abs(item.daysRemaining)}d`;
        statusColor = "var(--danger)";
      } else if (item.daysRemaining === 0) {
        statusText = "Hoje";
        statusColor = "var(--accent-green)";
      } else if (item.daysRemaining <= 3) {
        statusText = `Em ${item.daysRemaining}d`;
        statusColor = "var(--primary-light)";
      } else {
        statusText = `📅 ${formatDateBRL(item.nextDate.toISOString().split("T")[0])}`;
      }

      return `
        <strong style="color: ${statusColor}">
          ${statusText}
        </strong>
      `;
    },
  );
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
    background: rgba(255, 255, 255, 0.03);
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.05);
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
    color: rgba(255, 255, 255, 0.8);
    min-width: 50px;
    text-align: center;
  `;

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

/**
 * Métrica 4.A: Ratio Ultraprocessados vs In Natura
 * Classificação baseado em padrões de categoria
 */
function calculateHealthRatio(categoryTotals) {
  // Sistema de classificação hierárquico
  const categoryClassification = {
    // In Natura / Saudáveis
    healthy: [
      "fruta",
      "legume",
      "verdura",
      "hortifruti",
      "carne",
      "peixe",
      "ovo",
      "leite",
      "natural",
      "saudavel",
      "graos",
      "cereais",
    ],
    // Ultraprocessados / Menos Saudáveis
    processed: [
      "bolacha",
      "biscoito",
      "refrigerante",
      "doce",
      "salgadinho",
      "congelado",
      "embutido",
      "salsicha",
      "presunto",
      "bebida alcoolica",
      "cerveja",
      "vinho",
    ],
  };

  let healthyTotal = 0;
  let processedTotal = 0;
  let othersTotal = 0;

  Object.keys(categoryTotals).forEach((categoryName) => {
    const normalizedCategory = window.normalizeString(categoryName);
    const value = categoryTotals[categoryName];

    const isHealthy = categoryClassification.healthy.some((keyword) =>
      normalizedCategory.includes(keyword),
    );
    const isProcessed = categoryClassification.processed.some((keyword) =>
      normalizedCategory.includes(keyword),
    );

    if (isHealthy) healthyTotal += value;
    else if (isProcessed) processedTotal += value;
    else othersTotal += value;
  });

  renderHealthRatioChart(healthyTotal, processedTotal, othersTotal);
}

/**
 * Métrica 4.B: Sazonalidade de Consumo
 */
function calculateSeasonality(filteredLists) {
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

  const categoryByMonth = {};

  filteredLists.forEach((list) => {
    const date = parseDateLocal(list.date);
    const month = date.getMonth();

    if (!categoryByMonth[month]) categoryByMonth[month] = {};

    (list.categories || []).forEach((category) => {
      categoryByMonth[month][category.name] =
        (categoryByMonth[month][category.name] || 0) + 1;
    });
  });

  const currentMonth = new Date().getMonth();
  const monthData = categoryByMonth[currentMonth];

  const metricSeasonalityText = document.getElementById(
    "metric-seasonality-text",
  );

  if (monthData) {
    let topCategory = "";
    let maxCount = 0;
    for (const category in monthData) {
      if (monthData[category] > maxCount) {
        maxCount = monthData[category];
        topCategory = category;
      }
    }
    metricSeasonalityText.innerText = `Neste mês de ${monthNames[currentMonth]}, sua categoria mais frequente é "${topCategory}".`;
  } else {
    metricSeasonalityText.innerText =
      "Continue registrando suas compras para identificar padrões sazonais.";
  }
}

/* ==========================================================================
   RENDERIZAÇÃO DE GRÁFICOS (CHART.JS)
   ========================================================================== */

function renderShareWalletChart(categoryTotals) {
  const ctx = document.getElementById("chart-share-wallet");
  if (!ctx) return;

  if (chartShareWallet) chartShareWallet.destroy();

  const labels = Object.keys(categoryTotals);
  const data = Object.values(categoryTotals);

  if (labels.length === 0) return;

  chartShareWallet = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: labels,
      datasets: [
        {
          data: data,
          backgroundColor: [
            "#4c33e6",
            "#249689",
            "#ff4757",
            "#ffa502",
            "#3498db",
            "#2ed573",
            "#eccc68",
          ],
          borderWidth: 0,
          hoverOffset: 10,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            color: "rgba(255,255,255,0.7)",
            font: { size: 10 },
            padding: 15,
          },
        },
      },
      cutout: "70%",
    },
  });
}

function renderVolumeItemsChart(filteredLists) {
  const ctx = document.getElementById("chart-volume-itens");
  if (!ctx) return;

  if (chartVolumeItens) chartVolumeItens.destroy();

  const labels = filteredLists.map((label) =>
    formatDateBRL(label.date).split("/").slice(0, 2).join("/"),
  );
  const data = filteredLists.map((list) => {
    let count = 0;
    (list.categories || []).forEach((category) => {
      category.items.forEach((item) => {
        if (item.checked) count += item.quantity || 1;
      });
    });
    return count;
  });

  chartVolumeItens = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Itens Comprados",
          data: data,
          backgroundColor: "rgba(76, 51, 230, 0.6)",
          borderColor: "#4c33e6",
          borderWidth: 1,
          borderRadius: 5,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: "rgba(255,255,255,0.05)" },
          ticks: { color: "rgba(255,255,255,0.5)" },
        },
        x: {
          grid: { display: false },
          ticks: { color: "rgba(255,255,255,0.5)" },
        },
      },
      plugins: { legend: { display: false } },
    },
  });
}

function renderHealthRatioChart(healthy, processed, others) {
  const ctx = document.getElementById("chart-perfil-saude");
  if (!ctx) return;

  if (chartHealthProfile) chartHealthProfile.destroy();

  chartHealthProfile = new Chart(ctx, {
    type: "pie",
    data: {
      labels: ["In Natura / Saudável", "Processados", "Outros"],
      datasets: [
        {
          data: [healthy, processed, others],
          backgroundColor: ["#249689", "#ff4757", "rgba(255,255,255,0.2)"],
          borderWidth: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "bottom",
          labels: { color: "rgba(255,255,255,0.7)", font: { size: 10 } },
        },
      },
    },
  });
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

  resetPagination();
  clearCache();

  updateFilterIndicator();
  updateFilterButtonVisualState();
  processDashboardData(window.marketListData);
  window.toggleFilterModal();
};

window.clearFilter = function () {
  activeFilter = { type: "geral", value: null };
  updateFilterChipsUI();
  document.getElementById("dynamic-filter-section").style.display = "none";

  resetPagination();
  clearCache();

  applyDashboardFilter();
};

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
