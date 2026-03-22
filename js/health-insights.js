/* ==========================================================================
   MÓDULO: INSIGHTS DE SAÚDE - ANÁLISE DE PERFIL DE COMPRA E SAZONALIDADE
   ========================================================================= */

/**
 * Carrega e renderiza o módulo de Insights de Saúde
 * Inclui:
 * - Ratio Ultraprocessados vs In Natura (Gráfico)
 * - Sazonalidade de Consumo
 */
window.loadHealthInsightsModule = function () {
  const data = window.marketListData;

  if (!data || data.length === 0) {
    renderHealthInsightsEmptyState();
    return;
  }

  const filteredLists = window.applyCurrentFilter(data);

  if (filteredLists.length === 0) {
    renderHealthInsightsEmptyState();
    return;
  }

  // Processa dados de insights de saúde
  processHealthInsightsData(filteredLists);
};

/**
 * Processa dados de insights de saúde
 */
function processHealthInsightsData(filteredLists) {
  // Agrega todos os itens e categorias das listas filtradas
  const categoryTotals = {};

  filteredLists.forEach((list) => {
    (list.categories || []).forEach((category) => {
      // Agregação para gasto por categoria
      if (!categoryTotals[category.name]) categoryTotals[category.name] = 0;

      category.items.forEach((item) => {
        const unitValue = parseFloat(
          item.price.replace(/\./g, "").replace(",", "."),
        );
        const quantity = item.quantity || 1;
        const valorTotalItem = unitValue * quantity;

        if (item.checked) {
          categoryTotals[category.name] += valorTotalItem;
        }
      });
    });
  });

  // Métrica 4.A: Ratio Ultraprocessados vs In Natura
  calculateHealthRatio(categoryTotals);

  // Métrica 4.B: Sazonalidade de Consumo
  calculateSeasonality(filteredLists);
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
 * Renderiza gráfico de Perfil de Saúde (Pizza)
 */
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
    const date = window.parseDateLocal(list.date);
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

/**
 * Renderiza estado vazio para o módulo de insights de saúde
 */
function renderHealthInsightsEmptyState() {
  const metricSeasonalityText = document.getElementById(
    "metric-seasonality-text",
  );

  if (metricSeasonalityText) {
    metricSeasonalityText.innerText =
      "Crie listas para ativar a análise de insights de saúde.";
  }
}
