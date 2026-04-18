/* ==========================================================================
   MÓDULO: INSIGHTS DE SAÚDE - ANÁLISE DE PERFIL DE COMPRA E SAZONALIDADE
   ========================================================================= */

/**
 * Carrega e renderiza o módulo de Insights de Saúde.
 * Inclui:
 * - Ratio Industrializados vs Saudáveis (Gráfico — exclui "Não se aplica")
 * - Cards de itens por categoria de saúde com paginação (inclui "Não se aplica")
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
  saudavel: "healthCategoryHealthy",
  industrializado: "healthCategoryProcessed",
  naoSeAplica: "healthCategoryOthers",
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
  saudavel: {
    icon: "leaf-outline",
    label: "Saudáveis",
    colorClass: "health-category-card--healthy",
    paginationKey: HEALTH_CATEGORY_PAGINATION_KEYS.saudavel,
  },
  industrializado: {
    icon: "fast-food-outline",
    label: "Industrializados",
    colorClass: "health-category-card--processed",
    paginationKey: HEALTH_CATEGORY_PAGINATION_KEYS.industrializado,
  },
  naoSeAplica: {
    icon: "grid-outline",
    label: "Outros",
    colorClass: "health-category-card--others",
    paginationKey: HEALTH_CATEGORY_PAGINATION_KEYS.naoSeAplica,
  },
};

/* ==========================================================================
   DEDUPLICAÇÃO DE NOMES DE ITENS NOS CARDS DE SAÚDE
   Evita exibição de nomes duplicados ou muito similares (>= 90% de similaridade)
   nos cards de categoria de saúde quando o usuário possui itens repetidos
   em múltiplas listas dentro do mesmo período analisado.
   ========================================================================== */

/**
 * Normaliza uma string para comparação semântica:
 * remove acentos, converte para minúsculas e elimina espaços extras.
 *
 * @param {string} rawString - String original
 * @returns {string} String normalizada para comparação
 */
function normalizeHealthItemName(rawString) {
  if (!rawString) return "";
  return rawString
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/**
 * Calcula a similaridade de Jaro entre duas strings normalizadas.
 * Retorna valor entre 0 (totalmente diferentes) e 1 (idênticas).
 *
 * @param {string} firstString - Primeira string
 * @param {string} secondString - Segunda string
 * @returns {number} Similaridade Jaro entre 0 e 1
 */
function calculateSimilarityForHealth(firstString, secondString) {
  if (firstString === secondString) return 1;
  if (firstString.length === 0 || secondString.length === 0) return 0;

  const matchWindow = Math.floor(Math.max(firstString.length, secondString.length) / 2) - 1;
  if (matchWindow < 0) return 0;

  const firstMatches = new Array(firstString.length).fill(false);
  const secondMatches = new Array(secondString.length).fill(false);

  let matchCount = 0;
  let transpositionCount = 0;

  for (let firstIndex = 0; firstIndex < firstString.length; firstIndex++) {
    const startIndex = Math.max(0, firstIndex - matchWindow);
    const endIndex = Math.min(secondString.length - 1, firstIndex + matchWindow);

    for (let secondIndex = startIndex; secondIndex <= endIndex; secondIndex++) {
      if (secondMatches[secondIndex] || firstString[firstIndex] !== secondString[secondIndex]) continue;
      firstMatches[firstIndex] = true;
      secondMatches[secondIndex] = true;
      matchCount++;
      break;
    }
  }

  if (matchCount === 0) return 0;

  let secondPointer = 0;
  for (let firstIndex = 0; firstIndex < firstString.length; firstIndex++) {
    if (!firstMatches[firstIndex]) continue;
    while (!secondMatches[secondPointer]) secondPointer++;
    if (firstString[firstIndex] !== secondString[secondPointer]) transpositionCount++;
    secondPointer++;
  }

  return (
    matchCount / firstString.length +
    matchCount / secondString.length +
    (matchCount - transpositionCount / 2) / matchCount
  ) / 3;
}

/**
 * Calcula a similaridade de Jaro-Winkler entre duas strings.
 * Aplica bônus para prefixos comuns (até 4 caracteres),
 * Exemplos de comportamento esperado:
 *   "biscoito" ↔ "biscoitos" → >= 0.90 (duplicata)
 *   "farinha de aveia" ↔ "farinha" → < 0.90 (diferentes)
 *   "achocolatado" ↔ "chocolate" → < 0.90 (diferentes)
 *   "arroz" ↔ "Arroz" → 1.0 após normalização (duplicata)
 *
 * @param {string} firstString - Primeira string normalizada
 * @param {string} secondString - Segunda string normalizada
 * @returns {number} Similaridade Jaro-Winkler entre 0 e 1
 */
function calculateJaroWinklerSimilarityForHealth(firstString, secondString) {
  const jaroScore = calculateSimilarityForHealth(firstString, secondString);

  let commonPrefixLength = 0;
  const maxPrefixLength = Math.min(4, Math.min(firstString.length, secondString.length));
  while (
    commonPrefixLength < maxPrefixLength &&
    firstString[commonPrefixLength] === secondString[commonPrefixLength]
  ) {
    commonPrefixLength++;
  }

  return jaroScore + commonPrefixLength * 0.1 * (1 - jaroScore);
}

/**
 * Deduplica um conjunto de nomes de itens de saúde aplicando o limiar de
 * similaridade de 90% (Jaro-Winkler). Quando dois nomes são similares,
 * mantém o que aparece primeiro no conjunto original (ordem alfabética).
 *
 * @param {Set<string>} itemNamesSet - Conjunto de nomes de itens a deduplicar
 * @returns {Array<string>} Array de nomes únicos após deduplicação
 */
function deduplicateHealthItemNames(itemNamesSet) {
  // Converte o Set para array e ordena para garantir resultado determinístico
  const sortedNames = Array.from(itemNamesSet).sort((nameA, nameB) =>
    normalizeHealthItemName(nameA).localeCompare(normalizeHealthItemName(nameB))
  );

  const deduplicatedNames = [];

  sortedNames.forEach((currentName) => {
    const normalizedCurrent = normalizeHealthItemName(currentName);

    const hasSimilarName = deduplicatedNames.some((existingName) => {
      const normalizedExisting = normalizeHealthItemName(existingName);
      const similarity = calculateJaroWinklerSimilarityForHealth(
        normalizedCurrent,
        normalizedExisting,
      );
      return similarity >= 0.9;
    });

    if (!hasSimilarName) {
      deduplicatedNames.push(currentName);
    }
  });

  return deduplicatedNames;
}

/* ==========================================================================
   MÉTRICA 4.A: RATIO SAUDÁVEIS vs INDUSTRIALIZADOS
   ========================================================================== */

/**
 * Calcula o ratio de gastos entre itens Saudáveis e Industrializados para o gráfico.
 * Itens classificados como "Não se aplica" são acumulados apenas para os cards de categoria
 * e não são incluídos no gráfico de pizza.
 *
 * Lê diretamente o campo `healthProfile` salvo em cada item
 * ("saudavel", "industrializado", "nao-se-aplica")
 *
 * Itens sem `healthProfile` definido são ignorados no gráfico.
 * Itens sem preço ou valor total cadastrado são ignorados no cálculo monetário.
 *
 * @param {Array} filteredLists - Listas filtradas pelo filtro ativo do dashboard
 */
function calculateHealthRatio(filteredLists) {
  // Acumula valor monetário apenas para Saudável e Industrializado (usados no gráfico)
  let healthyTotal = 0;
  let processedTotal = 0;

  // Agrupa os nomes dos itens comprados por categoria de saúde para exibição nos cards
  // A categoria "Não se aplica" é incluída nos cards mas não no gráfico
  const itemNamesByHealthCategory = {
    saudavel: new Set(),
    industrializado: new Set(),
    naoSeAplica: new Set(),
  };

  const listsForCategoryCards = getListsWithinOneMonthWindow(filteredLists);

  // Itera em cada item comprado das listas filtradas para acumular o valor por perfil (gráfico)
  filteredLists.forEach((list) => {
    (list.categories || []).forEach((category) => {
      category.items.forEach((item) => {
        // Considera apenas itens efetivamente comprados e com perfil de saúde definido
        if (!item.checked || !item.healthProfile) return;

        if (item.healthProfile === "nao-se-aplica") return;

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

        if (item.healthProfile === "saudavel") healthyTotal += totalItemValue;
        else if (item.healthProfile === "industrializado")
          processedTotal += totalItemValue;
      });
    });
  });

  // Coleta itens comprados (checked) com healthProfile da janela de 1 mês para os cards
  listsForCategoryCards.forEach((list) => {
    (list.categories || []).forEach((category) => {
      category.items.forEach((item) => {
        // Coleta itens marcados como comprados e com perfil definido
        if (!item.checked || !item.healthProfile) return;

        const displayName = window.sanitizeHtmlInput
          ? window.sanitizeHtmlInput(item.name)
          : item.name;

        if (item.healthProfile === "saudavel") {
          itemNamesByHealthCategory.saudavel.add(displayName);
        } else if (item.healthProfile === "industrializado") {
          itemNamesByHealthCategory.industrializado.add(displayName);
        } else {
          itemNamesByHealthCategory.naoSeAplica.add(displayName);
        }
      });
    });
  });

  // Passa apenas os totais de Saudável e Industrializado para o gráfico
  renderHealthRatioChart(healthyTotal, processedTotal);

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
 * Renderiza o gráfico de pizza do Perfil de Saúde considerando apenas
 * Saudáveis vs Industrializados. Itens classificados como "Não se aplica" aparecem apenas nos cards de categoria.
 * Os labels do gráfico exibem a porcentagem de cada categoria (ex: "Saudáveis (68%)").
 *
 * @param {number} healthyTotal - Total gasto em itens saudáveis (healthProfile === "saudavel")
 * @param {number} processedTotal - Total gasto em itens industrializados
 */
function renderHealthRatioChart(healthyTotal, processedTotal) {
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

  // Calcula o total combinado para obter a porcentagem de cada categoria
  const combinedTotal = healthyTotal + processedTotal;

  // Gera o percentual formatado de cada categoria
  // Exibe "0%" quando o total for zero para evitar NaN no label
  const healthyPercentage =
    combinedTotal > 0
      ? Math.round((healthyTotal / combinedTotal) * 100)
      : 0;
  const processedPercentage =
    combinedTotal > 0
      ? Math.round((processedTotal / combinedTotal) * 100)
      : 0;

  // Labels dinâmicos com porcentagem exibida ao lado do nome da categoria
  const chartLabels = [
    `Saudáveis (${healthyPercentage}%)`,
    `Industrializados (${processedPercentage}%)`,
  ];

  window.chartHealthProfile = new Chart(ctx, {
    type: "pie",
    data: {
      labels: chartLabels,
      datasets: [
        {
          data: [healthyTotal, processedTotal],
          backgroundColor: ["#249689", "#ff4757"],
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
 * - Lista paginada dos itens encontrados (deduplicados por similaridade >= 90%)
 * - Mensagem vazia caso não haja itens no período analisado
 *
 * Os cards incluem todas as categorias (Saudável, Industrializado e Não se aplica),
 * diferente do gráfico que exibe apenas Saudável e Industrializado.
 *
 * @param {Object} itemNamesByHealthCategory - Sets de nomes de itens por categoria { saudavel, industrializado, naoSeAplica }
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

  // Renderiza um card para cada categoria
  ["saudavel", "industrializado", "nao-se-aplica"].forEach((categoryKey) => {
    const configKey = categoryKey === "nao-se-aplica" ? "naoSeAplica" : categoryKey;
    const categoryConfig = HEALTH_CATEGORY_CARD_CONFIG[configKey];
    const itemNamesSet = itemNamesByHealthCategory[configKey];

    const itemNamesArray = deduplicateHealthItemNames(itemNamesSet);

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
 * @param {Array<string>} itemNamesArray - Array de nomes de itens deduplicados e ordenados
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
        um é <strong>Saudável</strong>, <strong>Industrializado</strong> ou
        <strong>Não se aplica</strong>.
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
