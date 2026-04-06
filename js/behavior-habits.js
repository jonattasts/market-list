/* ==========================================================================
   MÓDULO: COMPORTAMENTO E HÁBITO - ANÁLISE DE PADRÕES DE COMPRA
   ========================================================================= */

/* ==========================================================================
   UTILITÁRIO: CLASSIFICAÇÃO DE PERFORMANCE PARA RANKING DE LOCAIS
   ========================================================================== */

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

// Exporta globalmente para garantir compatibilidade com outros módulos que possam referenciar
window.getPerformanceClassForTopLocation = getPerformanceClassForTopLocation;

/**
 * Carrega e renderiza o módulo de Comportamento e Hábito
 * Inclui:
 * - Índice de Fidelidade de Local
 * - Recorrência de Itens (Frequência)
 * - Previsão de Reposição
 * - Itens Essenciais
 */
window.loadBehaviorHabitsModule = function () {
  const data = window.marketListData;

  if (!data || data.length === 0) {
    renderBehaviorHabitsEmptyState();
    return;
  }

  const filteredLists = window.applyCurrentFilter(data);

  if (filteredLists.length === 0) {
    renderBehaviorHabitsEmptyState();
    return;
  }

  // Processa dados de comportamento e hábito
  processBehaviorHabitsData(filteredLists, data);
};

/**
 * Processa dados de comportamento e hábito
 */
function processBehaviorHabitsData(filteredLists, allLists) {
  // Métrica 2.A: Índice de Fidelidade de Local
  calculateLocationFidelity(filteredLists);

  // Métrica 2.C: Itens Essenciais
  calculateEssentialItems(allLists);

  // Métrica 2.A e 2.B: Recorrência de Itens e Ciclo de Reposição
  calculateItemRecurrenceAndRestock(filteredLists);
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
    const listDate = window.parseDateLocal(filteredList.date);

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

  const totalPurchases = sortedLocations.reduce(
    (sum, location) => sum + location.count,
    0,
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

  const currentFilterKey = JSON.stringify(window.activeFilter);
  if (
    window.cachedDashboardData.topLocationsItems &&
    window.cachedDashboardData.lastFilter === currentFilterKey
  ) {
    window.renderPaginatedList(
      topLocationsContainer,
      window.cachedDashboardData.topLocationsItems,
      "topLocations",
      (item) => `
        <div class="behavior-habits-location-item-info">
          <div class="dashboard-item-main-text">${item.name}</div>
          <span class="dashboard-item-sub-text">Última compra: ${item.lastPurchaseDateFormatted}</span>
        </div>
      `,
      (item) => `
        <div class="behavior-habits-location-count-badge">
          <div class="behavior-habits-count-badge ${item.performanceClass}">
            ${item.count}
          </div>
          <span class="dashboard-item-sub-text">${item.percentageFormatted} das compras</span>
        </div>
      `,
    );
    return;
  }

  topLocationsContainer.innerHTML = "";

  if (sortedLocations.length === 0) {
    topLocationsContainer.innerHTML = `<div class="dashboard-empty-state-minor">Nenhum local de compra registrado.</div>`;
    return;
  }

  // Pega apenas os 3 primeiros locais
  const topThreeLocations = sortedLocations.slice(0, 3);

  const topLocationsItems = topThreeLocations.map((location, index) => {
    const percentage = (location.count / totalPurchases) * 100;

    // Define a classe de performance baseada na posição (1º, 2º, 3º)
    // 1º lugar = excellent, 2º lugar = good, 3º lugar = average
    const performanceClass = getPerformanceClassForTopLocation(index + 1);

    return {
      name: window.sanitizeHtmlInput(location.name),
      count: location.count,
      percentage: percentage,
      percentageFormatted: `${percentage.toFixed(0)}%`,
      lastPurchaseDate: location.lastPurchaseDate,
      lastPurchaseDateFormatted: window.formatDateBRL(
        location.lastPurchaseDate.toISOString().split("T")[0],
      ),
      performanceClass: performanceClass,
      position: index + 1,
    };
  });

  // Armazena em cache
  window.cachedDashboardData.topLocationsItems = topLocationsItems;
  window.cachedDashboardData.lastFilter = currentFilterKey;

  window.renderPaginatedList(
    topLocationsContainer,
    topLocationsItems,
    "topLocations",
    (item) => `
      <div class="behavior-habits-location-item-info">
        <div class="dashboard-item-main-text">${item.name}</div>
        <span class="dashboard-item-sub-text">Última compra: ${item.lastPurchaseDateFormatted}</span>
      </div>
    `,
    (item) => `
      <div class="behavior-habits-location-count-badge">
        <div class="behavior-habits-count-badge ${item.performanceClass}">
          ${item.count}
        </div>
        <span class="dashboard-item-sub-text">${item.percentageFormatted} das compras</span>
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

  const currentFilterKey = JSON.stringify(window.activeFilter);
  if (
    window.cachedDashboardData.essentialsItems &&
    window.cachedDashboardData.lastFilter === currentFilterKey
  ) {
    window.renderPaginatedList(
      container,
      window.cachedDashboardData.essentialsItems,
      "essentials",
      (item) => `
        <div class="behavior-habits-essential-item-info">
          <div class="dashboard-item-main-text">${item.name}</div>
          <span class="dashboard-item-sub-text">Qtd. total comprada: ${item.totalQuantity} unid.</span>
        </div>
      `,
      (item) => `
        <div class="behavior-habits-essential-percentage">
          <div class="behavior-habits-percentage-badge ${item.performanceClass}">
            ${item.appearancePercentageFormatted}
          </div>
          <span class="dashboard-item-sub-text">${item.listsCount} de ${item.totalListsCount} listas</span>
        </div>
      `,
    );
    return;
  }

  container.innerHTML = "";

  // Filtra apenas listas dos últimos 3 meses
  const recentLists = allLists.filter((list) =>
    window.isWithinMonthsLimit(list.date, window.ESSENTIALS_CONFIG.monthsLimit),
  );

  if (recentLists.length === 0) {
    container.innerHTML = `<div class="dashboard-empty-state-minor">Nenhuma lista nos últimos ${window.ESSENTIALS_CONFIG.monthsLimit} meses.</div>`;
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
    if (appearancePercentage >= window.ESSENTIALS_CONFIG.minPercentage) {
      const performanceClass =
        window.getPerformanceClassByPercentage(appearancePercentage);

      essentialItems.push({
        name: window.sanitizeHtmlInput(window.capitalize(itemData.name)),
        appearancePercentage: appearancePercentage,
        appearancePercentageFormatted: `${appearancePercentage.toFixed(0)}%`,
        listsCount: listsCount,
        totalListsCount: totalListsCount,
        totalQuantity: itemData.totalQuantity,
        performanceClass: performanceClass,
      });
    }
  });

  // Ordena por porcentagem de aparição (maior primeiro)
  essentialItems.sort(
    (a, b) => b.appearancePercentage - a.appearancePercentage,
  );

  if (essentialItems.length === 0) {
    container.innerHTML = `<div class="dashboard-empty-state-minor">Nenhum item essencial encontrado (aparece em mais de ${window.ESSENTIALS_CONFIG.minPercentage}% das listas).</div>`;
    return;
  }

  // Atualiza o contador no card superior
  document.getElementById("metric-essentials-count").innerText =
    essentialItems.length;

  // Armazena em cache
  window.cachedDashboardData.essentialsItems = essentialItems;
  window.cachedDashboardData.lastFilter = currentFilterKey;

  window.renderPaginatedList(
    container,
    essentialItems,
    "essentials",
    (item) => `
      <div class="behavior-habits-essential-item-info">
        <div class="dashboard-item-main-text">${item.name}</div>
        <span class="dashboard-item-sub-text">Qtd. total comprada: ${item.totalQuantity} unid.</span>
      </div>
    `,
    (item) => `
      <div class="behavior-habits-essential-percentage">
        <div class="behavior-habits-percentage-badge ${item.performanceClass}">
          ${item.appearancePercentageFormatted}
        </div>
        <span class="dashboard-item-sub-text">${item.listsCount} de ${item.totalListsCount} listas</span>
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
  const itemsData = window.extractRecurringData(filteredLists);

  // Filtra apenas itens que atendem aos critérios de recorrência
  const recurringData = {};
  Object.keys(itemsData).forEach((name) => {
    if (window.meetsRecurrenceCriteria(itemsData[name])) {
      recurringData[name] = itemsData[name];
    }
  });

  // EXIBIÇÃO DE RECORRÊNCIA (FREQUÊNCIA) ---
  const recurrenceContainer = document.getElementById("recurrence-itens-list");

  const currentFilterKey = JSON.stringify(window.activeFilter);

  if (recurrenceContainer) {
    // Verifica se já temos dados em cache
    if (
      window.cachedDashboardData.recurrenceItems &&
      window.cachedDashboardData.lastFilter === currentFilterKey
    ) {
      window.renderPaginatedList(
        recurrenceContainer,
        window.cachedDashboardData.recurrenceItems,
        "recurrence",
        (item) => `
          <div>
            <span class="dashboard-item-main-text">${item.name}</span>
            <span class="dashboard-item-sub-text">Média: ${item.average} dias | ${item.purchases} compras</span>
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
              window.parseDateLocal(dates[i]) -
              window.parseDateLocal(dates[i - 1]);
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
              name: window.sanitizeHtmlInput(window.capitalize(itemData.name)),
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
        recurrenceContainer.innerHTML = `<div class="dashboard-empty-state-minor">Nenhum item recorrente encontrado nos últimos ${window.RECURRENCE_CONFIG.monthsLimit} meses.</div>`;
      } else {
        // Armazena em cache
        window.cachedDashboardData.recurrenceItems = recurringItems;
        window.cachedDashboardData.lastFilter = currentFilterKey;

        window.renderPaginatedList(
          recurrenceContainer,
          recurringItems,
          "recurrence",
          (item) => `
            <div>
              <span class="dashboard-item-main-text">${item.name}</span>
              <span class="dashboard-item-sub-text">Média: ${item.average} dias | ${item.purchases} compras</span>
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

  if (
    window.cachedDashboardData.restockItems &&
    window.cachedDashboardData.lastFilter === currentFilterKey
  ) {
    window.renderPaginatedList(
      restockContainer,
      window.cachedDashboardData.restockItems,
      "restock",
      (item) => {
        let statusText = "";
        let performanceClass = "average";

        if (item.daysRemaining < 0) {
          statusText = `Atraso ${Math.abs(item.daysRemaining)}d`;
          performanceClass = "low";
        } else if (item.daysRemaining === 0) {
          statusText = "Hoje";
          performanceClass = "excellent";
        } else if (item.daysRemaining <= 3) {
          statusText = `Em ${item.daysRemaining}d`;
          performanceClass = "good";
        } else {
          statusText = `📅 ${window.formatDateBRL(item.nextDate.toISOString().split("T")[0])}`;
          performanceClass = "average";
        }

        return `
          <div>
            <span class="dashboard-item-main-text">${item.name}</span>
            <span class="dashboard-item-sub-text">Ciclo: ${item.cycle}d | Última: ${item.lastDateStr}</span>
          </div>
        `;
      },
      (item) => {
        let statusText = "";
        let performanceClass = "average";

        if (item.daysRemaining < 0) {
          statusText = `Atraso ${Math.abs(item.daysRemaining)}d`;
          performanceClass = "low";
        } else if (item.daysRemaining === 0) {
          statusText = "Hoje";
          performanceClass = "excellent";
        } else if (item.daysRemaining <= 3) {
          statusText = `Em ${item.daysRemaining}d`;
          performanceClass = "good";
        } else {
          statusText = `📅 ${window.formatDateBRL(item.nextDate.toISOString().split("T")[0])}`;
          performanceClass = "average";
        }

        return `
          <div class="behavior-habits-restock-badge ${performanceClass}">
            ${statusText}
          </div>
        `;
      },
    );
    return;
  }

  restockContainer.innerHTML = "";

  if (listCount < 3) {
    restockContainer.innerHTML = `<div class="dashboard-empty-state-minor">Gere mais listas para prever reposição.</div>`;
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
          window.parseDateLocal(dates[i]) - window.parseDateLocal(dates[i - 1]);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays > 0 && diffDays < 365) intervalos.push(diffDays);
      }

      if (intervalos.length > 0) {
        const averageDays =
          intervalos.reduce((a, b) => a + b, 0) / intervalos.length;

        const lastPurchase = window.parseDateLocal(dates[dates.length - 1]);
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
            name: window.sanitizeHtmlInput(window.capitalize(itemData.name)),
            cycle: Math.round(averageDays),
            nextDate: nextDate,
            lastDateStr: window.formatDateBRL(dates[dates.length - 1]),
            daysRemaining: daysUntilPurchase,
          });
        }
      }
    }
  });

  predictionsRestocking.sort((a, b) => a.nextDate - b.nextDate);

  if (predictionsRestocking.length === 0) {
    restockContainer.innerHTML = `<div class="dashboard-empty-state-minor">Nenhum item recorrente encontrado nos últimos ${window.RECURRENCE_CONFIG.monthsLimit} meses.</div>`;
    return;
  }

  // Armazena em cache
  window.cachedDashboardData.restockItems = predictionsRestocking;
  window.cachedDashboardData.lastFilter = currentFilterKey;

  window.renderPaginatedList(
    restockContainer,
    predictionsRestocking,
    "restock",
    (item) => {
      let statusText = "";
      let performanceClass = "average";

      if (item.daysRemaining < 0) {
        statusText = `Atraso ${Math.abs(item.daysRemaining)}d`;
        performanceClass = "low";
      } else if (item.daysRemaining === 0) {
        statusText = "Hoje";
        performanceClass = "excellent";
      } else if (item.daysRemaining <= 3) {
        statusText = `Em ${item.daysRemaining}d`;
        performanceClass = "good";
      } else {
        statusText = `📅 ${window.formatDateBRL(item.nextDate.toISOString().split("T")[0])}`;
        performanceClass = "average";
      }

      return `
        <div>
          <span class="dashboard-item-main-text">${item.name}</span>
          <span class="dashboard-item-sub-text">Ciclo: ${item.cycle}d | Última: ${item.lastDateStr}</span>
        </div>
      `;
    },
    (item) => {
      let statusText = "";
      let performanceClass = "average";

      if (item.daysRemaining < 0) {
        statusText = `Atraso ${Math.abs(item.daysRemaining)}d`;
        performanceClass = "low";
      } else if (item.daysRemaining === 0) {
        statusText = "Hoje";
        performanceClass = "excellent";
      } else if (item.daysRemaining <= 3) {
        statusText = `Em ${item.daysRemaining}d`;
        performanceClass = "good";
      } else {
        statusText = `📅 ${window.formatDateBRL(item.nextDate.toISOString().split("T")[0])}`;
        performanceClass = "average";
      }

      return `
        <div class="behavior-habits-restock-badge ${performanceClass}">
          ${statusText}
        </div>
      `;
    },
  );
}

/**
 * Renderiza estado vazio para o módulo de comportamento e hábito
 */
function renderBehaviorHabitsEmptyState() {
  const containers = [
    "top-locations-container",
    "essentials-container",
    "recurrence-itens-list",
    "restock-list",
  ];

  containers.forEach((containerId) => {
    const container = document.getElementById(containerId);
    if (container) {
      container.innerHTML = `<div class="dashboard-empty-state-minor">Crie listas para ativar a análise de comportamento.</div>`;
    }
  });
}
