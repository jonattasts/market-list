/* ==========================================================================
   MÓDULO: INSIGHTS DE SAÚDE - ANÁLISE DE PERFIL DE COMPRA E SAZONALIDADE
   ========================================================================= */

/**
 * Carrega e renderiza o módulo de Insights de Saúde
 * Inclui:
 * - Ratio Ultraprocessados vs Saudáveis (Gráfico)
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

  // Processa dados de insights de saúde
  processHealthInsightsData(filteredLists);
};

/**
 * Processa dados de insights de saúde
 */
function processHealthInsightsData(filteredLists) {
  // Analisa individualmente cada item comprado das listas filtradas
  // em vez de usar o nome da categoria como base de classificação
  calculateHealthRatio(filteredLists);

  // Métrica 4.B: Sazonalidade de Consumo
  calculateSeasonality(filteredLists);
}

/**
 * Palavras-chave para classificação individual de itens por perfil de saúde.
 * Exportado como constante global para permitir reuso em outros módulos.
 */
const HEALTH_ITEM_CLASSIFICATION = {
  // Saudáveis / Minimamente processados
  healthy: [
    // Grãos e cereais básicos
    "feijao",
    "arroz",
    "lentilha",
    "grao de bico",
    "ervilha",
    "amendoim",
    "aveia",
    "quinoa",
    "chia",
    "linhaça",
    "milho",
    "trigo",
    "cevada",
    // Farinhas e derivados básicos
    "farinha",
    "amido",
    "fuba",
    "polvilho",
    "tapioca",
    // Massas simples
    "macarrao",
    "espaguete",
    "parafuso",
    "penne",
    "lasanha",
    "talharim",
    // Proteínas saudáveis
    "carne",
    "frango",
    "peixe",
    "file",
    "peito",
    "coxa",
    "asa",
    "costela",
    "alcatra",
    "patinho",
    "musculo",
    "contra file",
    "picanha",
    "coxao",
    "sardinha",
    "atum",
    "camarao",
    "tilapia",
    "bacalhau",
    "salmao",
    "ovo",
    "ovos",
    "placa de ovos",
    // Laticínios básicos
    "leite",
    "iogurte",
    "queijo",
    "ricota",
    "cottage",
    "coalhada",
    "requeijao",
    "manteiga",
    "creme de leite",
    // Frutas
    "banana",
    "maca",
    "pera",
    "uva",
    "laranja",
    "limao",
    "abacaxi",
    "mamao",
    "melancia",
    "melao",
    "manga",
    "morango",
    "acerola",
    "goiaba",
    "maracuja",
    "abacate",
    "caju",
    "coco",
    "kiwi",
    "pessego",
    "ameixa",
    "fruta",
    // Verduras e legumes
    "alface",
    "rucula",
    "espinafre",
    "couve",
    "brocolis",
    "repolho",
    "cenoura",
    "beterraba",
    "batata",
    "mandioca",
    "aipim",
    "inhame",
    "chuchu",
    "abobrinha",
    "pepino",
    "tomate",
    "cebola",
    "alho",
    "pimentao",
    "berinjela",
    "quiabo",
    "jiló",
    "abobora",
    "milho verde",
    "brocoli",
    "couve flor",
    "acelga",
    "agriao",
    "salsa",
    "cebolinha",
    "verdura",
    "legume",
    "hortalica",
    "hortifruti",
    // Óleos naturais e temperos básicos
    "azeite",
    "oleo de coco",
    "vinagre",
    "sal",
    "pimenta",
    "oregano",
    "alecrim",
    "manjericao",
    "canela",
    "gengibre",
    "curcuma",
    "colorau",
    // Açúcar básico e adoçantes naturais
    "acucar",
    "mel",
    "rapadura",
  ],
  // Ultraprocessados / Menos saudáveis
  processed: [
    // Biscoitos e salgadinhos
    "bolacha",
    "biscoito",
    "wafer",
    "cream cracker",
    "maria",
    "maisena",
    "salgadinho",
    "chips",
    "cheetos",
    "doritos",
    "ruffles",
    "batata frita",
    // Bebidas industrializadas
    "refrigerante",
    "coca",
    "pepsi",
    "guarana",
    "fanta",
    "sprite",
    "suco de caixa",
    "suco de lata",
    "energetico",
    "red bull",
    "cerveja",
    "vinho",
    "whisky",
    "vodka",
    "cachaca",
    "bebida alcoolica",
    "isotônico",
    "nescau",
    "achocolatado",
    // Embutidos e frios
    "salsicha",
    "presunto",
    "mortadela",
    "linguica",
    "calabresa",
    "bacon",
    "pepperoni",
    "salame",
    "copa",
    "apresuntado",
    "nugget",
    "hamburguer",
    "burger",
    "embutido",
    // Doces e sobremesas industrializadas
    "chocolate",
    "bombom",
    "bala",
    "pirulito",
    "sorvete",
    "gelatina",
    "pudim",
    "doce",
    "brigadeiro",
    "bis",
    "kitkat",
    "snickers",
    "paçoca",
    "cocada",
    "goiabada",
    "geleia",
    // Comidas congeladas e prontas
    "lasanha congelada",
    "pizza congelada",
    "congelado",
    "pronto",
    "miojo",
    "lamen",
    "macarrao instantaneo",
    "cup noodles",
    // Molhos e temperos industrializados
    "ketchup",
    "maionese",
    "mostarda",
    "molho shoyu",
    "molho inglês",
    "caldo knorr",
    "sazon",
    "tempero pronto",
    "maggi",
    // Pães industrializados
    "pao de forma",
    "pao hot dog",
    "pao hamburguer",
    "bisnaguinha",
    // Outros ultraprocessados
    "margarina",
    "creme vegetal",
  ],
};

window.HEALTH_ITEM_CLASSIFICATION = HEALTH_ITEM_CLASSIFICATION;

/* ==========================================================================
   CHAVES DE PAGINAÇÃO DOS CARDS DE SAÚDE
   Registradas no paginationState do dashboard para controle independente
   de cada card de categoria de saúde.
   ========================================================================== */
const HEALTH_CATEGORY_PAGINATION_KEYS = {
  healthy: "healthCategoryHealthy",
  processed: "healthCategoryProcessed",
  others: "healthCategoryOthers",
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
 * Métrica 4.A: Ratio Ultraprocessados vs Saudáveis
 *
 * Classifica cada item individualmente pelo seu nome usando palavras-chave.
 * Soma o valor total gasto (preço x quantidade) de itens comprados (checked)
 * em cada categoria de saúde: saudável, processado e outros.
 *
 * Itens sem preço ou valor total cadastrado (null/undefined/vazio) são ignorados
 * no cálculo de valor monetário.
 *
 * Após o gráfico, renderiza os cards de itens por categoria de saúde
 * considerando apenas compras do último mês (ou do período filtrado).
 *
 * @param {Array} filteredLists - Listas filtradas pelo filtro ativo
 */
function calculateHealthRatio(filteredLists) {
  let healthyTotal = 0;
  let processedTotal = 0;
  let othersTotal = 0;

  // Agrupa os nomes dos itens comprados por categoria de saúde para exibição nos cards
  const itemNamesByHealthCategory = {
    healthy: new Set(),
    processed: new Set(),
    others: new Set(),
  };

  const listsForCategoryCards = getListsWithinOneMonthWindow(filteredLists);

  // Itera individualmente em cada item comprado de cada lista para o gráfico (listas filtradas)
  filteredLists.forEach((list) => {
    (list.categories || []).forEach((category) => {
      category.items.forEach((item) => {
        // Considera apenas itens efetivamente comprados (checked) e com valor monetário válido (preço ou valor total)
        if (!item.checked || (!item.price && !item.totalValue)) return;

        const normalizedItemName = window.normalizeString(item.name);
        let price = item.price || item.totalValue;

        price = parseFloat(price.replace(/\./g, "").replace(",", "."));

        // Ignora valores que não puderam ser convertidos para número válido
        if (isNaN(price)) return;

        const quantity = item.quantity || 1;
        const totalItemValue = price * quantity;

        // Classifica o item pelo seu nome individualmente
        const isHealthy = HEALTH_ITEM_CLASSIFICATION.healthy.some((keyword) =>
          normalizedItemName.includes(window.normalizeString(keyword)),
        );
        const isProcessed = HEALTH_ITEM_CLASSIFICATION.processed.some(
          (keyword) =>
            normalizedItemName.includes(window.normalizeString(keyword)),
        );

        if (isHealthy) healthyTotal += totalItemValue;
        else if (isProcessed) processedTotal += totalItemValue;
        else othersTotal += totalItemValue;
      });
    });
  });

  // Coleta itens comprados (checked) da janela de 1 mês para os cards de categoria
  listsForCategoryCards.forEach((list) => {
    (list.categories || []).forEach((category) => {
      category.items.forEach((item) => {
        // Coleta apenas itens marcados como comprados para os cards de categoria
        if (!item.checked) return;

        const normalizedItemName = window.normalizeString(item.name);
        const displayName = window.sanitizeHtmlInput
          ? window.sanitizeHtmlInput(item.name)
          : item.name;

        const isHealthy = HEALTH_ITEM_CLASSIFICATION.healthy.some((keyword) =>
          normalizedItemName.includes(window.normalizeString(keyword)),
        );
        const isProcessed = HEALTH_ITEM_CLASSIFICATION.processed.some(
          (keyword) =>
            normalizedItemName.includes(window.normalizeString(keyword)),
        );

        if (isHealthy) itemNamesByHealthCategory.healthy.add(displayName);
        else if (isProcessed)
          itemNamesByHealthCategory.processed.add(displayName);
        else itemNamesByHealthCategory.others.add(displayName);
      });
    });
  });

  renderHealthRatioChart(healthyTotal, processedTotal, othersTotal);

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
  const activeFilterType = window.activeFilter ? window.activeFilter.type : "geral";

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

/**
 * Renderiza gráfico de Perfil de Saúde (Pizza)
 */
function renderHealthRatioChart(healthy, processed, others) {
  const ctx = document.getElementById("chart-perfil-saude");
  if (!ctx) return;

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
      labels: ["Saudável", "Processados", "Outros"],
      datasets: [
        {
          data: [healthy, processed, others],
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
 * Configuração visual de cada categoria de saúde para os cards.
 * Define ícone, rótulo, cor de destaque e chave de paginação.
 */
const HEALTH_CATEGORY_CARD_CONFIG = {
  healthy: {
    icon: "leaf-outline",
    label: "Saudáveis",
    colorClass: "health-category-card--healthy",
    paginationKey: HEALTH_CATEGORY_PAGINATION_KEYS.healthy,
  },
  processed: {
    icon: "fast-food-outline",
    label: "Processados",
    colorClass: "health-category-card--processed",
    paginationKey: HEALTH_CATEGORY_PAGINATION_KEYS.processed,
  },
  others: {
    icon: "grid-outline",
    label: "Outros",
    colorClass: "health-category-card--others",
    paginationKey: HEALTH_CATEGORY_PAGINATION_KEYS.others,
  },
};

/**
 * Renderiza os cards de itens classificados por categoria de saúde
 * logo após o gráfico de perfil de compra.
 *
 * Cada card exibe:
 * - Ícone e rótulo da categoria
 * - Lista paginada dos itens encontrados
 * - Mensagem vazia caso não haja itens no período analisado
 *
 * @param {Object} itemNamesByHealthCategory - Sets de nomes de itens por categoria { healthy, processed, others }
 * @param {boolean} hasNoListsInWindow - true quando nenhuma lista foi encontrada na janela temporal
 */
function renderHealthCategoryCards(itemNamesByHealthCategory, hasNoListsInWindow) {
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
  ["healthy", "processed", "others"].forEach((categoryKey) => {
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
          ${hasNoListsInWindow
            ? "Nenhuma compra encontrada no período de análise."
            : "Nenhum item desta categoria no período."}
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
  const activeFilterType = window.activeFilter ? window.activeFilter.type : "geral";

  if (activeFilterType === "mes" && window.activeFilter.value) {
    const [filterYear, filterMonth] = window.activeFilter.value.split("-");
    return `Itens por Categoria — ${filterMonth}/${filterYear}`;
  }

  if (activeFilterType === "periodo" && window.activeFilter.value) {
    const startFormatted = window.formatDateBRL(window.activeFilter.value.start);
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
function renderHealthCategoryItemList(bodyElement, itemNamesArray, paginationKey) {
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
 * Navegação entre páginas rerrenderiza apenas o corpo do card afetado.
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
  previousButton.innerHTML = '<ion-icon name="chevron-back-outline"></ion-icon>';
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

  // Limpa os cards de categoria em estado vazio
  const cardsContainerElement = document.getElementById(
    "health-category-cards-container",
  );
  if (cardsContainerElement) {
    cardsContainerElement.innerHTML = "";
  }
}
