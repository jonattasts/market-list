/* ==========================================================================
   MÓDULO: EFICIÊNCIA DA COMPRA - ANÁLISE DE PERFORMANCE DE COMPRA
   ========================================================================= */

/**
 * Carrega e renderiza o módulo de Eficiência da Compra
 * Inclui:
 * - Ticket Médio por Lista
 * - Gasto por Categoria (Gráfico)
 * - Taxa de Conversão dos Últimos 3 Meses
 * - Volume de Itens por Compra (Gráfico)
 *
 * Nota: O card de Economia Potencial foi movido para a aba de Inflação Pessoal
 * e agora é calculado e atualizado pelo módulo personal-inflation.js
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
 * Obtém o valor numérico do preço unitário de um item
 * Retorna null se o preço não estiver definido ou for inválido
 *
 * @param {Object} item - Objeto do item
 * @returns {number|null} Valor numérico do preço unitário ou null
 */
function getItemUnitPriceNumericValue(item) {
  if (!item.price || item.price === null || item.price.trim() === "") {
    return null;
  }
  const numericValue = parseFloat(
    item.price.replace(/\./g, "").replace(",", "."),
  );
  return isNaN(numericValue) ? null : numericValue;
}

/**
 * Obtém o valor numérico do valor total de um item
 * Retorna null se o valor total não estiver definido ou for inválido
 *
 * @param {Object} item - Objeto do item
 * @returns {number|null} Valor numérico do valor total ou null
 */
function getItemTotalValueNumericValue(item) {
  if (
    !item.totalValue ||
    item.totalValue === null ||
    item.totalValue.trim() === ""
  ) {
    return null;
  }
  const numericValue = parseFloat(
    item.totalValue.replace(/\./g, "").replace(",", "."),
  );
  return isNaN(numericValue) ? null : numericValue;
}

/**
 * Calcula o valor efetivo de um item para métricas financeiras
 * Prioriza o valor total informado, senão calcula (preço unitário × quantidade)
 * Se não houver preço unitário, usa o valor total como fallback
 *
 * @param {Object} item - Objeto do item
 * @returns {number} Valor efetivo do item para cálculos financeiros
 */
function calculateEffectiveItemValueForMetrics(item) {
  // Se valor total foi informado, usa ele diretamente
  const totalValueNumeric = getItemTotalValueNumericValue(item);
  if (totalValueNumeric !== null) {
    return totalValueNumeric;
  }

  // Se não há valor total mas há preço unitário, calcula
  const unitPriceNumeric = getItemUnitPriceNumericValue(item);
  const itemQuantity = item.quantity || 1;
  if (unitPriceNumeric !== null) {
    return unitPriceNumeric * itemQuantity;
  }

  // Se não há nenhum valor, retorna 0
  return 0;
}

/**
 * Renderiza gráfico de Gasto por Categoria (Pizza)
 * Exibe o tooltip formatado em BRL ao clicar em uma categoria.
 * Centralizado neste módulo pois o gráfico pertence à Aba 1 (Eficiência de Compra).
 *
 * @param {Object} categoryTotals - Objeto com totais por categoria
 */
function renderShareWalletChart(categoryTotals) {
  const ctx = document.getElementById("chart-share-wallet");
  if (!ctx) return;

  if (window.chartShareWallet) window.chartShareWallet.destroy();

  const labels = Object.keys(categoryTotals);
  const data = Object.values(categoryTotals);

  if (labels.length === 0) return;

  /* CORRIGIDO: Lê o tema atual do body no momento da criação do gráfico
     para garantir que a cor da legenda seja correta desde o início,
     independente de o tema dark ou light estar ativo */
  const isDark = document.body.getAttribute("data-theme") === "dark";
  const currentLegendColor = isDark
    ? "rgba(255,255,255,0.7)"
    : "rgba(20, 24, 27, 0.7)";

  window.chartShareWallet = new Chart(ctx, {
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
            color: currentLegendColor,
            font: { size: 10 },
            padding: 15,
          },
        },
        tooltip: {
          callbacks: {
            // Formata o valor do tooltip exibindo em BRL ao clicar na categoria
            label: function (tooltipItem) {
              const value = tooltipItem.raw;
              return " " + window.formatCurrencyBRL(value);
            },
          },
        },
      },
      cutout: "70%",
    },
  });
}

// Expõe globalmente para uso pelo theme.js ao atualizar as cores dos gráficos
window.renderShareWalletChart = renderShareWalletChart;

/**
 * Processa dados de eficiência de compra
 */
function processPurchaseEfficiencyData(filteredLists, allLists) {
  // Agrega todos os itens e categorias das listas filtradas
  const allFlattenedItems = [];
  const categoryTotals = {};
  let totalSpentInPeriod = 0;

  /* Contagem de itens únicos (linhas de produto) e não soma de quantidades.
     Cada linha de produto conta como 1 item adicionado/comprado, independente da quantidade.
  */
  let totalItemsAdded = 0;
  let totalItemsChecked = 0;

  filteredLists.forEach((list) => {
    (list.categories || []).forEach((category) => {
      // Agregação para gasto por categoria
      if (!categoryTotals[category.name]) categoryTotals[category.name] = 0;

      category.items.forEach((item) => {
        allFlattenedItems.push(item);

        // Conta 1 por linha de produto (não pela quantidade)
        totalItemsAdded += 1;

        const effectiveItemValue = calculateEffectiveItemValueForMetrics(item);
        const itemQuantity = item.quantity || 1;

        if (item.checked && effectiveItemValue > 0) {
          // Conta 1 por linha de produto marcado (não pela quantidade)
          totalItemsChecked += 1;
          categoryTotals[category.name] += effectiveItemValue;
          totalSpentInPeriod += effectiveItemValue;
        }
      });
    });
  });

  // Métrica 1.A: Ticket Médio por Lista
  const averageTicket = totalSpentInPeriod / filteredLists.length;
  document.getElementById("metric-ticket-medio").innerText =
    window.formatCurrencyBRL(averageTicket);

  // Métrica 1.C: Gasto por Categoria (Gráfico Pizza)
  renderShareWalletChart(categoryTotals);

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
      window.cachedDashboardData.conversionRateItems,
      "conversionRate",
      (item) => `
        <div class="purchase-efficiency-conversion-month-info">
          <div class="dashboard-item-main-text">${item.monthPeriod}</div>
          <span class="dashboard-item-sub-text">${item.totalLists} lista(s) | ${item.totalItemsAdded} item(ns)</span>
        </div>
      `,
      (item) => `
        <div class="purchase-efficiency-conversion-rate-badge-container">
          <div class="purchase-efficiency-conversion-rate-badge ${item.performanceClass}">
            ${item.conversionRateFormatted}
          </div>
          <span class="dashboard-item-sub-text">${item.totalItemsChecked} de ${item.totalItemsAdded} comprados</span>
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
    container.innerHTML = `<div class="dashboard-empty-state-minor">Sem dados suficientes para calcular a taxa de conversão.</div>`;
    return;
  }

  const conversionRateItems = [];

  sortedMonths.forEach((yearMonth) => {
    const monthData = listsByMonth[yearMonth];
    const monthPeriod = window.formatMonthPeriod(
      monthData.year,
      monthData.month,
    );

    /* CORRIGIDO: Contagem de itens únicos (linhas de produto) e não soma de quantidades.
       Cada linha de produto conta como 1 item adicionado/comprado por mês,
       mantendo consistência com a contagem exibida nos demais cards do módulo. */
    let totalItemsAdded = 0;
    let totalItemsChecked = 0;

    // Agrega dados de todas as listas do mês
    monthData.lists.forEach((list) => {
      (list.categories || []).forEach((category) => {
        category.items.forEach((item) => {
          // Conta 1 por linha de produto (não pela quantidade)
          totalItemsAdded += 1;

          if (item.checked) {
            // Conta 1 por linha de produto marcado (não pela quantidade)
            totalItemsChecked += 1;
          }
        });
      });
    });

    const conversionRate =
      totalItemsAdded > 0 ? (totalItemsChecked / totalItemsAdded) * 100 : 0;

    const performanceClass =
      window.getPerformanceClassByPercentage(conversionRate);

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
      <div class="purchase-efficiency-conversion-month-info">
        <div class="dashboard-item-main-text">${item.monthPeriod}</div>
        <span class="dashboard-item-sub-text">${item.totalLists} lista(s) | ${item.totalItemsAdded} item(ns)</span>
      </div>
    `,
    (item) => `
      <div class="purchase-efficiency-conversion-rate-badge-container">
        <div class="purchase-efficiency-conversion-rate-badge ${item.performanceClass}">
          ${item.conversionRateFormatted}
        </div>
        <span class="dashboard-item-sub-text">${item.totalItemsChecked} de ${item.totalItemsAdded} comprados</span>
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

  /* CORRIGIDO: Contagem de itens únicos marcados (linhas de produto) por lista.
     Cada linha de produto conta como 1 no gráfico, independente da quantidade,
     garantindo que o valor exibido no gráfico bata com o total mostrado no card. */
  const data = filteredLists.map((list) => {
    let uniqueCheckedItemCount = 0;
    (list.categories || []).forEach((category) => {
      category.items.forEach((item) => {
        if (item.checked) uniqueCheckedItemCount += 1;
      });
    });
    return uniqueCheckedItemCount;
  });

  /* CORRIGIDO: Lê o tema atual do body no momento da criação do gráfico
     para garantir que as cores dos ticks e grid sejam corretas desde o início,
     independente de o tema dark ou light estar ativo */
  const isDark = document.body.getAttribute("data-theme") === "dark";
  const currentTickColor = isDark
    ? "rgba(255,255,255,0.6)"
    : "rgba(20, 24, 27, 0.6)";
  const currentGridColor = isDark
    ? "rgba(76, 51, 230, 0.08)"
    : "rgba(76, 51, 230, 0.1)";

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
          grid: { color: currentGridColor },
          ticks: { color: currentTickColor },
        },
        x: {
          grid: { display: false },
          ticks: { color: currentTickColor },
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
  const containers = ["conversion-rate-container"];

  containers.forEach((containerId) => {
    const container = document.getElementById(containerId);
    if (container) {
      container.innerHTML = `<div class="dashboard-empty-state-minor">Crie listas para ativar a análise de eficiência.</div>`;
    }
  });
}
