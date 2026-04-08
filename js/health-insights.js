/* ==========================================================================
   MÓDULO: INSIGHTS DE SAÚDE - ANÁLISE DE PERFIL DE COMPRA E SAZONALIDADE
   ========================================================================= */

/**
 * Carrega e renderiza o módulo de Insights de Saúde.
 * Inclui:
 * - Ratio Industrializados vs Naturais (Gráfico)
 * - Cards de itens por categoria de saúde com paginação
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

  // Verifica se há pelo menos um item com healthProfile definido nas listas filtradas
  const hasAnyItemWithHealthProfile = filteredLists.some((list) =>
    (list.categories || []).some((category) =>
      category.items.some(
        (item) => item.healthProfile && item.healthProfile !== "",
      ),
    ),
  );

  if (!hasAnyItemWithHealthProfile) {
    // Exibe estado vazio animado orientando o usuário a categorizar seus itens
    renderHealthInsightsUncategorizedState();
    return;
  }

  // Processa dados de insights de saúde com base no campo healthProfile de cada item
  processHealthInsightsData(filteredLists);
};

/**
 * Processa e renderiza todos os dados de insights de saúde.
 *
 * @param {Array} filteredLists - Listas filtradas pelo filtro ativo do dashboard
 */
function processHealthInsightsData(filteredLists) {
  // Calcula e renderiza o gráfico de ratio de perfil de compra e os cards de categoria
  calculateHealthRatio(filteredLists);

  // Métrica 4.B: Sazonalidade de Consumo por categoria de lista
  calculateSeasonality(filteredLists);
}

/* ==========================================================================
   CHAVES DE PAGINAÇÃO DOS CARDS DE SAÚDE
   Registradas no paginationState do dashboard para controle independente
   de cada card de categoria de saúde.
   ========================================================================== */
const HEALTH_CATEGORY_PAGINATION_KEYS = {
  natural: "healthCategoryNatural",
  industrializado: "healthCategoryIndustrializado",
  outro: "healthCategoryOutro",
};

/**
 * Garante que as chaves de paginação dos cards de saúde estejam
 * registradas no paginationState global do dashboard.
 * Chamado antes de renderizar os cards para evitar erros de referência.
 */
function ensureHealthCategoryPaginationKeys() {
  Object.values(HEALTH_CATEGORY_PAGINATION_KEYS).forEach((paginationKey) => {
    if (!window.paginationState[paginationKey]) {
      window.paginationState[paginationKey] = {
        currentPage: 1,
        itemsPerPage: 6,
      };
    }
  });
}

/**
 * Configuração visual de cada categoria de saúde para os cards.
 * Define ícone, rótulo, cor de destaque e chave de paginação.
 */
const HEALTH_CATEGORY_CARD_CONFIG = {
  natural: {
    icon: "leaf-outline",
    label: "Naturais",
    colorClass: "health-category-card--healthy",
    paginationKey: HEALTH_CATEGORY_PAGINATION_KEYS.natural,
  },
  industrializado: {
    icon: "fast-food-outline",
    label: "Industrializados",
    colorClass: "health-category-card--processed",
    paginationKey: HEALTH_CATEGORY_PAGINATION_KEYS.industrializado,
  },
  outro: {
    icon: "grid-outline",
    label: "Outros",
    colorClass: "health-category-card--others",
    paginationKey: HEALTH_CATEGORY_PAGINATION_KEYS.outro,
  },
};

/* ==========================================================================
   MÉTRICA 4.A: RATIO NATURAIS vs INDUSTRIALIZADOS
   ========================================================================== */

/**
 * Calcula o ratio de gastos entre itens Naturais, Industrializados e Outros.
 *
 * Lê diretamente o campo `healthProfile` salvo em cada item
 * ("natural", "industrializado", "outro"), eliminando a necessidade do
 * motor de classificação automática por texto.
 *
 * Itens sem `healthProfile` definido são ignorados no gráfico.
 * Itens sem preço ou valor total cadastrado são ignorados no cálculo monetário.
 *
 * @param {Array} filteredLists - Listas filtradas pelo filtro ativo do dashboard
 */
function calculateHealthRatio(filteredLists) {
  let naturalTotal = 0;
  let industrializadoTotal = 0;
  let outroTotal = 0;

  // Agrupa os nomes dos itens comprados por categoria de saúde para exibição nos cards
  const itemNamesByHealthCategory = {
    natural: new Set(),
    industrializado: new Set(),
    outro: new Set(),
  };

  const listsForCategoryCards = getListsWithinOneMonthWindow(filteredLists);

  // Itera em cada item comprado das listas filtradas para acumular o valor por perfil (gráfico)
  filteredLists.forEach((list) => {
    (list.categories || []).forEach((category) => {
      category.items.forEach((item) => {
        // Considera apenas itens efetivamente comprados e com perfil de saúde definido
        if (!item.checked || !item.healthProfile) return;

        // Exige valor monetário válido para o acúmulo no gráfico
        if (!item.price && !item.totalValue) return;

        let priceRaw = item.price || item.totalValue;
        const parsedPrice = parseFloat(
          priceRaw.replace(/\./g, "").replace(",", "."),
        );

        // Ignora valores que não puderam ser convertidos para número válido
        if (isNaN(parsedPrice)) return;

        const quantity = item.quantity || 1;
        const totalItemValue = parsedPrice * quantity;

        if (item.healthProfile === "natural") naturalTotal += totalItemValue;
        else if (item.healthProfile === "industrializado")
          industrializadoTotal += totalItemValue;
        else outroTotal += totalItemValue;
      });
    });
  });

  // Coleta itens comprados (checked) com healthProfile da janela de 1 mês para os cards
  listsForCategoryCards.forEach((list) => {
    (list.categories || []).forEach((category) => {
      category.items.forEach((item) => {
        // Coleta apenas itens marcados como comprados e com perfil definido
        if (!item.checked || !item.healthProfile) return;

        const displayName = window.sanitizeHtmlInput
          ? window.sanitizeHtmlInput(item.name)
          : item.name;

        if (item.healthProfile === "natural") {
          itemNamesByHealthCategory.natural.add(displayName);
        } else if (item.healthProfile === "industrializado") {
          itemNamesByHealthCategory.industrializado.add(displayName);
        } else {
          itemNamesByHealthCategory.outro.add(displayName);
        }
      });
    });
  });

  renderHealthRatioChart(naturalTotal, industrializadoTotal, outroTotal);

  // Renderiza os cards de itens por categoria de saúde após o gráfico
  renderHealthCategoryCards(
    itemNamesByHealthCategory,
    listsForCategoryCards.length === 0,
  );
}

/**
 * Retorna as listas a considerar para os cards de categoria de saúde.
 *
 * Regra de janela temporal:
 * - Se o filtro ativo é "mes" ou "periodo": usa as próprias listas já filtradas,
 *   pois o usuário definiu explicitamente um intervalo de tempo.
 * - Se o filtro ativo é "geral" ou "local": aplica uma janela de 1 mês a partir
 *   da data atual para exibir apenas compras recentes, independente de quantas
 *   listas existam no histórico total.
 *
 * @param {Array} filteredLists - Listas já filtradas pelo filtro ativo do dashboard
 * @returns {Array} Listas dentro da janela temporal para os cards de categoria
 */
function getListsWithinOneMonthWindow(filteredLists) {
  const activeFilterType = window.activeFilter
    ? window.activeFilter.type
    : "geral";

  // Se há filtro de tempo explícito do usuário, respeita a seleção dele
  if (activeFilterType === "mes" || activeFilterType === "periodo") {
    return filteredLists;
  }

  // Filtro geral ou local: limita à janela de 1 mês a partir de hoje
  const today = new Date();
  const oneMonthAgoDate = new Date(
    today.getFullYear(),
    today.getMonth() - 1,
    today.getDate(),
    12,
    0,
    0,
  );

  return filteredLists.filter((list) => {
    const listDate = window.parseDateLocal(list.date);
    return listDate >= oneMonthAgoDate;
  });
}

/* ==========================================================================
   GRÁFICO DE PERFIL DE SAÚDE
   ========================================================================== */

/**
 * Renderiza o gráfico de pizza do Perfil de Saúde (Naturais vs Industrializados vs Outros).
 *
 * @param {number} natural - Total gasto em itens naturais
 * @param {number} industrializado - Total gasto em itens industrializados
 * @param {number} outro - Total gasto em itens classificados como outros
 */
function renderHealthRatioChart(natural, industrializado, outro) {
  const ctx = document.getElementById("chart-perfil-saude");
  if (!ctx) return;

  const dashboardChartHealthInsights = document.getElementById(
    "dashboard-chart-perfil-saude",
  );

  dashboardChartHealthInsights.classList.remove("screen-hidden");

  if (window.chartHealthProfile) window.chartHealthProfile.destroy();

  /* CORRIGIDO: Lê o tema atual do body no momento da criação do gráfico
     para garantir que a cor da legenda seja correta desde o início,
     independente de o tema dark ou light estar ativo */
  const isDark = document.body.getAttribute("data-theme") === "dark";
  const currentLegendColor = isDark
    ? "rgba(255,255,255,0.7)"
    : "rgba(20, 24, 27, 0.7)";

  /* CORRIGIDO: Cor de "Outros" alterada de rgba(20, 24, 27, 0.3) — invisível no dark —
     para uma cor neutra visível nos dois temas (cinza médio com boa opacidade) */
  const othersSliceColor = isDark
    ? "rgba(180, 180, 195, 0.5)"
    : "rgba(120, 120, 140, 0.4)";

  window.chartHealthProfile = new Chart(ctx, {
    type: "pie",
    data: {
      labels: ["Naturais", "Industrializados", "Outros"],
      datasets: [
        {
          data: [natural, industrializado, outro],
          backgroundColor: ["#249689", "#ff4757", othersSliceColor],
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
          labels: {
            color: currentLegendColor,
            font: { size: 10 },
          },
        },
        tooltip: {
          callbacks: {
            // Formata o valor do tooltip exibindo em BRL ao clicar na fatia
            label: function (tooltipItem) {
              const value = tooltipItem.raw;
              return " " + window.formatCurrencyBRL(value);
            },
          },
        },
      },
    },
  });
}

/* ==========================================================================
   CARDS DE ITENS POR CATEGORIA DE SAÚDE
   ========================================================================== */

/**
 * Renderiza os cards de itens classificados por categoria de saúde
 * logo após o gráfico de perfil de compra.
 *
 * Cada card exibe:
 * - Ícone e rótulo da categoria
 * - Lista paginada dos itens encontrados
 * - Mensagem vazia caso não haja itens no período analisado
 *
 * @param {Object} itemNamesByHealthCategory - Sets de nomes de itens por categoria { natural, industrializado, outro }
 * @param {boolean} hasNoListsInWindow - true quando nenhuma lista foi encontrada na janela temporal
 */
function renderHealthCategoryCards(
  itemNamesByHealthCategory,
  hasNoListsInWindow,
) {
  const cardsContainerElement = document.getElementById(
    "health-category-cards-container",
  );
  if (!cardsContainerElement) return;

  cardsContainerElement.innerHTML = "";

  // Garante que as chaves de paginação estejam registradas antes de renderizar
  ensureHealthCategoryPaginationKeys();

  // Reseta a paginação dos cards de categoria ao recarregar o módulo
  Object.values(HEALTH_CATEGORY_PAGINATION_KEYS).forEach((paginationKey) => {
    window.paginationState[paginationKey].currentPage = 1;
  });

  // Determina o texto de contexto temporal exibido no título da seção
  const sectionTitle = buildHealthCategorySectionTitle();

  const sectionTitleElement = document.createElement("h3");
  sectionTitleElement.className = "health-category-section-title";
  sectionTitleElement.textContent = sectionTitle;
  cardsContainerElement.appendChild(sectionTitleElement);

  // Renderiza um card para cada categoria de saúde
  ["natural", "industrializado", "outro"].forEach((categoryKey) => {
    const categoryConfig = HEALTH_CATEGORY_CARD_CONFIG[categoryKey];
    const itemNamesSet = itemNamesByHealthCategory[categoryKey];
    const itemNamesArray = Array.from(itemNamesSet).sort();

    const cardElement = document.createElement("div");
    cardElement.className = `health-category-card ${categoryConfig.colorClass}`;
    cardElement.id = `health-category-card-${categoryKey}`;

    // Cabeçalho do card com ícone e rótulo
    const cardHeaderElement = document.createElement("div");
    cardHeaderElement.className = "health-category-card__header";
    cardHeaderElement.innerHTML = `
      <ion-icon name="${categoryConfig.icon}" class="health-category-card__icon"></ion-icon>
      <span class="health-category-card__label">${categoryConfig.label}</span>
      <span class="health-category-card__count">${itemNamesArray.length} item(ns)</span>
    `;
    cardElement.appendChild(cardHeaderElement);

    // Corpo do card com lista paginada ou mensagem vazia
    const cardBodyElement = document.createElement("div");
    cardBodyElement.className = "health-category-card__body";
    cardBodyElement.id = `health-category-card-body-${categoryKey}`;

    if (hasNoListsInWindow || itemNamesArray.length === 0) {
      // Mensagem vazia: sem compras no período de análise
      cardBodyElement.innerHTML = `
        <p class="health-category-card__empty">
          ${
            hasNoListsInWindow
              ? "Nenhuma compra encontrada no período de análise."
              : "Nenhum item desta categoria no período."
          }
        </p>
      `;
    } else {
      // Renderiza lista paginada de itens da categoria
      renderHealthCategoryItemList(
        cardBodyElement,
        itemNamesArray,
        categoryConfig.paginationKey,
      );
    }

    cardElement.appendChild(cardBodyElement);
    cardsContainerElement.appendChild(cardElement);
  });
}

/**
 * Monta o título da seção de cards de saúde com base no filtro ativo.
 * Informa ao usuário qual período está sendo analisado nos cards.
 *
 * @returns {string} Texto descritivo do período de análise
 */
function buildHealthCategorySectionTitle() {
  const activeFilterType = window.activeFilter
    ? window.activeFilter.type
    : "geral";

  if (activeFilterType === "mes" && window.activeFilter.value) {
    const [filterYear, filterMonth] = window.activeFilter.value.split("-");
    return `Itens por Categoria — ${filterMonth}/${filterYear}`;
  }

  if (activeFilterType === "periodo" && window.activeFilter.value) {
    const startFormatted = window.formatDateBRL(
      window.activeFilter.value.start,
    );
    const endFormatted = window.formatDateBRL(window.activeFilter.value.end);
    return `Itens por Categoria — ${startFormatted} a ${endFormatted}`;
  }

  // Geral ou local: exibe janela de 1 mês retroativa
  return "Itens por Categoria — Últimos 30 dias";
}

/**
 * Renderiza a lista paginada de itens dentro de um card de categoria de saúde.
 * Reutiliza a lógica de paginação do dashboard adaptada para chips de item.
 *
 * @param {HTMLElement} bodyElement - Elemento do corpo do card onde a lista será inserida
 * @param {Array<string>} itemNamesArray - Array de nomes de itens ordenados alfabeticamente
 * @param {string} paginationKey - Chave de paginação registrada no paginationState
 */
function renderHealthCategoryItemList(
  bodyElement,
  itemNamesArray,
  paginationKey,
) {
  const paginationStateEntry = window.paginationState[paginationKey];
  const totalPages = Math.ceil(
    itemNamesArray.length / paginationStateEntry.itemsPerPage,
  );

  // Garante que a página atual é válida após filtros
  if (paginationStateEntry.currentPage > totalPages) {
    paginationStateEntry.currentPage = totalPages || 1;
  }

  const startIndex =
    (paginationStateEntry.currentPage - 1) * paginationStateEntry.itemsPerPage;
  const endIndex = startIndex + paginationStateEntry.itemsPerPage;
  const paginatedItemNames = itemNamesArray.slice(startIndex, endIndex);

  bodyElement.innerHTML = "";

  // Renderiza chips para cada item da página atual
  const chipsWrapperElement = document.createElement("div");
  chipsWrapperElement.className = "health-category-card__chips";

  paginatedItemNames.forEach((itemName) => {
    const chipElement = document.createElement("span");
    chipElement.className = "health-category-card__chip";
    chipElement.textContent = itemName;
    chipsWrapperElement.appendChild(chipElement);
  });

  bodyElement.appendChild(chipsWrapperElement);

  // Renderiza controles de paginação se houver mais de uma página
  if (totalPages > 1) {
    const paginationControlsElement = buildHealthCategoryPaginationControls(
      paginationStateEntry.currentPage,
      totalPages,
      paginationKey,
      itemNamesArray,
      bodyElement,
    );
    bodyElement.appendChild(paginationControlsElement);
  }
}

/**
 * Constrói os controles de paginação para um card de categoria de saúde.
 * Navegação entre páginas re-renderiza apenas o corpo do card afetado.
 *
 * @param {number} currentPage - Página atual
 * @param {number} totalPages - Total de páginas
 * @param {string} paginationKey - Chave de paginação no paginationState
 * @param {Array<string>} itemNamesArray - Lista completa de nomes de itens
 * @param {HTMLElement} bodyElement - Elemento do corpo do card a re-renderizar
 * @returns {HTMLElement} Elemento com os controles de paginação
 */
function buildHealthCategoryPaginationControls(
  currentPage,
  totalPages,
  paginationKey,
  itemNamesArray,
  bodyElement,
) {
  const controlsElement = document.createElement("div");
  controlsElement.className = "health-category-card__pagination";

  const previousButton = document.createElement("button");
  previousButton.className = "dashboard-pagination-button";
  previousButton.innerHTML =
    '<ion-icon name="chevron-back-outline"></ion-icon>';
  previousButton.disabled = currentPage === 1;

  if (!previousButton.disabled) {
    previousButton.onclick = () => {
      window.paginationState[paginationKey].currentPage--;
      renderHealthCategoryItemList(bodyElement, itemNamesArray, paginationKey);
    };
  } else {
    previousButton.style.opacity = "0.3";
    previousButton.style.cursor = "not-allowed";
  }

  const pageIndicatorElement = document.createElement("span");
  pageIndicatorElement.className = "health-category-card__page-indicator";
  pageIndicatorElement.style.color = "var(--text-main)";
  pageIndicatorElement.textContent = `${currentPage} / ${totalPages}`;

  const nextButton = document.createElement("button");
  nextButton.className = "dashboard-pagination-button";
  nextButton.innerHTML = '<ion-icon name="chevron-forward-outline"></ion-icon>';
  nextButton.disabled = currentPage === totalPages;

  if (!nextButton.disabled) {
    nextButton.onclick = () => {
      window.paginationState[paginationKey].currentPage++;
      renderHealthCategoryItemList(bodyElement, itemNamesArray, paginationKey);
    };
  } else {
    nextButton.style.opacity = "0.3";
    nextButton.style.cursor = "not-allowed";
  }

  controlsElement.appendChild(previousButton);
  controlsElement.appendChild(pageIndicatorElement);
  controlsElement.appendChild(nextButton);

  return controlsElement;
}

/* ==========================================================================
   MÉTRICA 4.B: SAZONALIDADE DE CONSUMO
   ========================================================================== */

/**
 * Métrica 4.B: Sazonalidade de Consumo por categoria de lista.
 *
 * @param {Array} filteredLists - Listas filtradas pelo filtro ativo do dashboard
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

/* ==========================================================================
   ESTADOS VAZIOS
   ========================================================================== */

/**
 * Renderiza o estado vazio padrão do módulo de insights de saúde
 * quando não há nenhuma lista cadastrada.
 */
function renderHealthInsightsEmptyState() {
  const metricSeasonalityText = document.getElementById(
    "metric-seasonality-text",
  );

  if (metricSeasonalityText) {
    metricSeasonalityText.innerText =
      "Crie listas para ativar a análise de insights de saúde.";
  }

  // Limpa os cards de categoria em estado vazio
  const cardsContainerElement = document.getElementById(
    "health-category-cards-container",
  );
  if (cardsContainerElement) {
    cardsContainerElement.innerHTML = "";
  }
}

/**
 * Renderiza o estado vazio animado quando há listas/itens cadastrados mas
 * nenhum item possui o campo `healthProfile` definido (itens de listas antigas).
 *
 * Orienta o usuário a editar seus itens e categorizar o Perfil de Saúde
 * para que os insights passem a funcionar corretamente.
 */
function renderHealthInsightsUncategorizedState() {
  const metricSeasonalityText = document.getElementById(
    "metric-seasonality-text",
  );

  const dashboardChartHealthInsights = document.getElementById(
    "dashboard-chart-perfil-saude",
  );

  if (metricSeasonalityText) {
    metricSeasonalityText.innerText =
      "Categorize seus itens para ver a análise de sazonalidade.";
  }

  const cardsContainerElement = document.getElementById(
    "health-category-cards-container",
  );

  if (!cardsContainerElement) return;

  dashboardChartHealthInsights.classList.add("screen-hidden");

  // Destrói o gráfico de perfil de saúde se existir — evita dados fantasma
  if (window.chartHealthProfile) {
    window.chartHealthProfile.destroy();
    window.chartHealthProfile = null;
  }

  // Limpa o canvas do gráfico visualmente
  const chartCanvas = document.getElementById("chart-perfil-saude");
  if (chartCanvas) {
    const chartContext = chartCanvas.getContext("2d");
    chartContext.clearRect(0, 0, chartCanvas.width, chartCanvas.height);
  }

  cardsContainerElement.innerHTML = `
    <div class="health-insights-uncategorized-state">
      <div class="health-insights-uncategorized-icon">🥦</div>
      <h3 class="health-insights-uncategorized-title">
        Nenhum item categorizado ainda
      </h3>
      <p class="health-insights-uncategorized-description">
        Para ver seu perfil de saúde, edite seus itens e selecione se cada
        um é <strong>Natural</strong>, <strong>Industrializado</strong> ou
        <strong>Outro</strong>.
      </p>
      <div class="health-insights-uncategorized-steps">
        <div class="health-insights-uncategorized-step">
          <span class="health-insights-uncategorized-step-number">1</span>
          <span>Abra uma lista de compras</span>
        </div>
        <div class="health-insights-uncategorized-step">
          <span class="health-insights-uncategorized-step-number">2</span>
          <span>Edite um item existente ou adicione um novo</span>
        </div>
        <div class="health-insights-uncategorized-step">
          <span class="health-insights-uncategorized-step-number">3</span>
          <span>Selecione o <strong>Perfil de Saúde</strong> do item</span>
        </div>
      </div>
      <p class="health-insights-uncategorized-hint">
        ✨ Novos itens já pedem o perfil de saúde no cadastro!
      </p>
    </div>
  `;
}
