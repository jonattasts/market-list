/* ==========================================================================
   MÓDULO: EFICIÊNCIA DA COMPRA - ANÁLISE DE PERFORMANCE DE COMPRA
   ========================================================================= */

/**
 * Carrega e renderiza o módulo de Eficiência da Compra
 * Inclui:
 * - Ticket Médio por Lista
 * - Economia Potencial
 * - Gasto por Categoria (Gráfico)
 * - Taxa de Conversão dos Últimos 3 Meses
 * - Volume de Itens por Compra (Gráfico)
 */
window.loadPurchaseEfficiencyModule = function () {
  const data = window.marketListData;

  if (!data || data.length === 0) {
    renderPurchaseEfficiencyEmptyState();
    return;
  }

  const filteredLists = window.applyCurrentFilter(data);

  if (filteredLists.length === 0) {
    renderPurchaseEfficiencyEmptyState();
    return;
  }

  // Processa dados de eficiência de compra
  processPurchaseEfficiencyData(filteredLists, data);
};

/**
 * Processa dados de eficiência de compra
 */
function processPurchaseEfficiencyData(filteredLists, allLists) {
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

  // Métrica 1.A: Ticket Médio por Lista
  const averageTicket = totalSpentInPeriod / filteredLists.length;
  document.getElementById("metric-ticket-medio").innerText =
    window.formatCurrencyBRL(averageTicket);

  // Métrica 1.B: Economia Potencial (Desejado - Comprado)
  const economy = forecastTotal - totalSpentInPeriod;
  document.getElementById("metric-economy").innerText =
    window.formatCurrencyBRL(economy);

  // Métrica 1.C: Gasto por Categoria (Gráfico Pizza) — renderizado pelo personal-inflation.js
  window.renderShareWalletChart(categoryTotals);

  // Métrica 3.B: Taxa de Conversão dos Últimos 3 Meses
  calculateMonthlyConversionRate(allLists);

  // Métrica 3.A: Volume de Itens por Lista (Gráfico Coluna)
  renderVolumeItemsChart(filteredLists);
}

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

  const currentFilterKey = JSON.stringify(window.activeFilter);
  if (
    window.cachedDashboardData.conversionRateItems &&
    window.cachedDashboardData.lastFilter === currentFilterKey
  ) {
    window.renderPaginatedList(
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
    const date = window.parseDateLocal(list.date);
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
    .slice(0, window.CONVERSION_RATE_CONFIG.monthsToShow);

  if (sortedMonths.length === 0) {
    container.innerHTML = `<div class="empty-state-minor">Sem dados suficientes para calcular a taxa de conversão.</div>`;
    return;
  }

  const conversionRateItems = [];

  sortedMonths.forEach((yearMonth) => {
    const monthData = listsByMonth[yearMonth];
    const monthPeriod = window.formatMonthPeriod(monthData.year, monthData.month);

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

    const performanceClass = window.getPerformanceClassByPercentage(conversionRate);

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

  window.cachedDashboardData.conversionRateItems = conversionRateItems;
  window.cachedDashboardData.lastFilter = currentFilterKey;

  window.renderPaginatedList(
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
 * Renderiza gráfico de Volume de Itens por Compra (Coluna)
 */
function renderVolumeItemsChart(filteredLists) {
  const ctx = document.getElementById("chart-volume-itens");
  if (!ctx) return;

  if (window.chartVolumeItens) window.chartVolumeItens.destroy();

  const labels = filteredLists.map((label) =>
    window.formatDateBRL(label.date).split("/").slice(0, 2).join("/"),
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

  window.chartVolumeItens = new Chart(ctx, {
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

/**
 * Renderiza estado vazio para o módulo de eficiência de compra
 */
function renderPurchaseEfficiencyEmptyState() {
  const containers = [
    "conversion-rate-container",
  ];

  containers.forEach((containerId) => {
    const container = document.getElementById(containerId);
    if (container) {
      container.innerHTML = `<div class="empty-state-minor">Crie listas para ativar a análise de eficiência.</div>`;
    }
  });
}
