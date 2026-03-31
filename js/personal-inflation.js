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
 * Considera apenas itens que possuem preço unitário.
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
 * Calcula o valor monetário economizado (ou gasto a mais) em um item recorrente.
 * O cálculo é feito multiplicando a diferença de preço pela quantidade da última compra.
 *
 * Valor positivo = economia (preço atual menor que o anterior)
 * Valor negativo = gasto a mais (preço atual maior que o anterior)
 *
 * @param {number} previousPrice - Preço da penúltima ocorrência
 * @param {number} currentPrice - Preço da última ocorrência
 * @param {number} quantity - Quantidade comprada na última ocorrência
 * @returns {number} Valor monetário da variação (positivo = economia, negativo = custo maior)
 */
function calculateRecurringItemSavings(previousPrice, currentPrice, quantity) {
  return (previousPrice - currentPrice) * quantity;
}

/**
 *
 * Atualiza o card de Economia nos Recorrentes na aba de Inflação Pessoal.
 * O valor exibido é a soma das variações monetárias de todos os itens recorrentes.
 *
 * @param {Array} cpiItems - Lista de itens de inflação pessoal já processados
 */
function updateInflationEconomyCard(cpiItems) {
  const economyElement = document.getElementById("metric-economy-inflation");

  if (!economyElement) return;

  // Soma as economias (positivas) e gastos a mais (negativos) de todos os recorrentes
  const totalSavings = cpiItems.reduce((accumulator, item) => {
    // avgPrevious - avgCurrent: positivo se preço caiu, negativo se subiu
    const savingsPerItem = item.avgPrevious - item.avgCurrent;
    return accumulator + savingsPerItem;
  }, 0);

  economyElement.innerText = `${totalSavings < 0 ? "-" : ""}${window.formatCurrencyBRL(Math.abs(totalSavings))}`;

  const economyCard = economyElement.closest(".inflation-economy-card");
  if (economyCard) {
    economyCard.classList.remove("economy-positive", "economy-negative");
    if (totalSavings >= 0) {
      economyCard.classList.add("economy-positive");
    } else {
      economyCard.classList.add("economy-negative");
    }
  }
}

/**
 * Obtém o valor numérico do preço unitário de uma ocorrência de item
 * Retorna null se o preço não estiver definido ou for inválido
 *
 * @param {Object} occurrence - Objeto da ocorrência do item
 * @returns {number|null} Valor numérico do preço ou null
 */
function getOccurrenceUnitPriceNumericValue(occurrence) {
  if (
    !occurrence.price ||
    occurrence.price === null ||
    occurrence.price.trim() === ""
  ) {
    return null;
  }
  const numericValue = parseFloat(
    occurrence.price.replace(/\./g, "").replace(",", "."),
  );
  return isNaN(numericValue) ? null : numericValue;
}

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
    // Reutiliza cache e atualiza o card de economia
    updateInflationEconomyCard(window.cachedDashboardData.cpiItems);

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
      .map((occurrence) => ({
        ...occurrence,
        dateObj: window.parseDateLocal(occurrence.date),
        valorNumerico: getOccurrenceUnitPriceNumericValue(occurrence),
      }))
      .filter((occurrence) => occurrence.valorNumerico !== null)
      .sort(
        (occurrenceA, occurrenceB) => occurrenceB.dateObj - occurrenceA.dateObj,
      );

    // Se não há ocorrências com preço unitário válido, ignora o item
    if (sortedOccurrences.length < 2) return;

    // Pega a última e a penúltima ocorrência (de listas diferentes)
    const lastOccurrence = sortedOccurrences[0];
    const penultimateOccurrence = sortedOccurrences.find(
      (occurrence) => occurrence.listId !== lastOccurrence.listId,
    );

    // Se não encontrou penúltima ocorrência em lista diferente, ignora
    if (!penultimateOccurrence) return;

    const avgCurrent = lastOccurrence.valorNumerico;
    const avgPrevious = penultimateOccurrence.valorNumerico;

    // Quantidade da última compra usada para calcular a economia monetária real
    const lastQuantity = lastOccurrence.quantity || 1;

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
      lastQuantity,
      diff,
      emoji,
      performanceClass: performanceClass,
      listCount: itemData.listIds.size,
      lastPurchaseDate: itemData.lastPurchaseDate,
    });
  });

  if (cpiItems.length === 0) {
    container.innerHTML = `<div class="empty-state-minor">Nenhum item recorrente com preço unitário encontrado nos últimos ${window.RECURRENCE_CONFIG.monthsLimit} meses.</div>`;
    return;
  }

  // Armazena em cache
  window.cachedDashboardData.cpiItems = cpiItems;
  window.cachedDashboardData.lastFilter = currentFilterKey;

  // Atualiza o card de economia acumulada dos recorrentes
  updateInflationEconomyCard(cpiItems);

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
