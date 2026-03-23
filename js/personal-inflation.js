/* ==========================================================================
   MÓDULO: INFLAÇÃO PESSOAL (CPI) - ANÁLISE DE VARIAÇÃO DE PREÇOS
   ========================================================================= */

/**
 * Carrega e renderiza o módulo de Inflação Pessoal
 * Métrica 1.D: Inflação Pessoal (CPI)
 *
 * Busca em TODAS as listas (até 3 meses atrás) e exibe o item
 * quando encontrar pelo menos 2 ocorrências em listas diferentes.
 * Compara sempre a última ocorrência com a penúltima ocorrência do item.
 */
window.loadPersonalInflationModule = function () {
  const data = window.marketListData;

  if (!data || data.length === 0) {
    renderPersonalInflationEmptyState();
    return;
  }

  // Usa a função global applyCurrentFilter do dashboard.js
  const filteredLists = window.applyCurrentFilter(data);

  if (filteredLists.length === 0) {
    renderPersonalInflationEmptyState();
    return;
  }

  // Processa dados de inflação pessoal
  processPersonalInflationData(filteredLists);
};

/**
 * Processa dados de inflação pessoal e renderiza a interface
 */
function processPersonalInflationData(filteredLists) {
  const container = document.getElementById("cpi-container");

  if (!container) return;

  // Verifica se já temos dados em cache para este filtro
  const currentFilterKey = JSON.stringify(window.activeFilter);
  if (
    window.cachedDashboardData.cpiItems &&
    window.cachedDashboardData.lastFilter === currentFilterKey
  ) {
    window.renderPaginatedList(
      container,
      window.cachedDashboardData.cpiItems,
      "cpi",
      (item) => `
        <div class="item-main-text">${item.name}</div>
        <span class="item-sub-text">Anterior: ${window.formatCurrencyBRL(item.avgPrevious)} → Atual: ${window.formatCurrencyBRL(item.avgCurrent)}</span>
      `,
      (item) => `
        <div class="percentage-badge ${item.performanceClass}">
          ${item.emoji} ${Math.abs(item.diff).toFixed(1)}%
        </div>
      `,
    );
    return;
  }

  container.innerHTML = "";

  if (filteredLists.length === 0) {
    container.innerHTML = `<div class="empty-state-minor">Sem dados no período selecionado.</div>`;
    return;
  }

  // Usa a função global extractRecurringData do dashboard.js
  const itemsData = window.extractRecurringData(filteredLists);

  const cpiItems = [];

  Object.keys(itemsData).forEach((name) => {
    const itemData = itemsData[name];

    // Verifica se o item aparece em pelo menos 2 listas diferentes
    if (itemData.listIds.size < 2) return;

    // Verifica se a última compra está dentro dos últimos 3 meses
    const dataLimite = window.getRecencyLimitDate();
    if (!itemData.lastPurchaseDate || itemData.lastPurchaseDate < dataLimite)
      return;

    // Ordena as ocorrências por data (mais recente primeiro)
    const sortedOccurrences = itemData.prices
      .map((o) => ({
        ...o,
        dateObj: window.parseDateLocal(o.date),
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

    // Define o emoji baseado na variação
    let emoji = "📉";
    if (diff > 0) {
      emoji = "📈";
    }

    // Define a classe de performance do badge:
    // excellent = redução de valor, good = sem alteração, low = aumento de valor
    let performanceClass = "good";
    if (diff < 0) performanceClass = "excellent";
    else if (diff > 0) performanceClass = "low";

    cpiItems.push({
      name: window.capitalize(itemData.name),
      avgPrevious,
      avgCurrent,
      diff,
      emoji,
      performanceClass: performanceClass,
      listCount: itemData.listIds.size,
      lastPurchaseDate: itemData.lastPurchaseDate,
    });
  });

  if (cpiItems.length === 0) {
    container.innerHTML = `<div class="empty-state-minor">Nenhum item recorrente encontrado nos últimos ${window.RECURRENCE_CONFIG.monthsLimit} meses.</div>`;
    return;
  }

  // Armazena em cache
  window.cachedDashboardData.cpiItems = cpiItems;
  window.cachedDashboardData.lastFilter = currentFilterKey;

  window.renderPaginatedList(
    container,
    cpiItems,
    "cpi",
    (item) => `
      <div class="item-main-text">${item.name}</div>
      <span class="item-sub-text">Anterior: ${window.formatCurrencyBRL(item.avgPrevious)} → Atual: ${window.formatCurrencyBRL(item.avgCurrent)}</span>
    `,
    (item) => `
      <div class="percentage-badge ${item.performanceClass}">
        ${item.emoji} ${Math.abs(item.diff).toFixed(1)}%
      </div>
    `,
  );
}

/**
 * Renderiza gráfico de Gasto por Categoria (Pizza)
 * Exibe o tooltip formatado em BRL ao clicar em uma categoria
 */
function renderShareWalletChart(categoryTotals) {
  const ctx = document.getElementById("chart-share-wallet");
  if (!ctx) return;

  if (window.chartShareWallet) window.chartShareWallet.destroy();

  const labels = Object.keys(categoryTotals);
  const data = Object.values(categoryTotals);

  if (labels.length === 0) return;

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
            /* CORRIGIDO: Alterada cor de rgba(255,255,255,0.7) para cor escura visível em fundo claro */
            color: "rgba(20, 24, 27, 0.7)",
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

// Expõe globalmente para ser chamado pelo purchase-efficiency.js
window.renderShareWalletChart = renderShareWalletChart;

/**
 * Renderiza estado vazio para o módulo de inflação pessoal
 */
function renderPersonalInflationEmptyState() {
  const container = document.getElementById("cpi-container");
  if (container) {
    container.innerHTML = `<div class="empty-state-minor">Crie listas para ativar a análise de inflação pessoal.</div>`;
  }
}
