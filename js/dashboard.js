/* ==========================================================================
   DASHBOARD & DATA ANALYTICS MODULE
   ========================================================================= */

// Utilitário local para formatação de moeda
const formatCurrencyBRL = (val) =>
  val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Estado dos Gráficos (para destruí-los antes de recriar)
let chartShareWallet = null;
let chartVolumeItens = null;
let chartPerfilSaude = null;

// Filtro Ativo Padrão (Geral)
let activeFilter = { type: "geral", value: null };

/* ==========================================================================
   ESTADO DE PAGINAÇÃO DAS LISTAS
   ========================================================================== */
const paginationState = {
  cpi: { currentPage: 1, itemsPerPage: 4 },
  recorrencia: { currentPage: 1, itemsPerPage: 4 },
  reposicao: { currentPage: 1, itemsPerPage: 4 },
};

// Cache dos dados calculados para evitar re-processamento desnecessário
let cachedDashboardData = {
  cpiItems: null,
  recorrenciaItems: null,
  reposicaoItems: null,
  lastFilter: null,
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
  paginationState.recorrencia.currentPage = 1;
  paginationState.reposicao.currentPage = 1;
}

function clearCache() {
  cachedDashboardData = {
    cpiItems: null,
    recorrenciaItems: null,
    reposicaoItems: null,
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
    (list.categories || []).forEach((cat) => {
      // Agregação para gasto por categoria
      if (!categoryTotals[cat.name]) categoryTotals[cat.name] = 0;

      cat.items.forEach((item) => {
        allFlattenedItems.push(item);
        totalItemsAdded += item.quantity || 1;

        const valorUnitario = parseFloat(
          item.price.replace(/\./g, "").replace(",", "."),
        );
        const qtd = item.quantity || 1;
        const valorTotalItem = valorUnitario * qtd;

        forecastTotal += valorTotalItem;

        if (item.checked) {
          totalItemsChecked += item.quantity || 1;
          categoryTotals[cat.name] += valorTotalItem;
          totalSpentInPeriod += valorTotalItem;
        }
      });
    });
  });

  // ---------------------------------------------------------
  // 1. MÉTRICAS DE PERFORMANCE FINANCEIRA
  // ---------------------------------------------------------

  // A. Ticket Médio por Lista
  const ticketMedio = totalSpentInPeriod / filteredLists.length;
  document.getElementById("metric-ticket-medio").innerText =
    formatCurrencyBRL(ticketMedio);

  // B. Economia Potencial (Desejado - Comprado)
  const economia = forecastTotal - totalSpentInPeriod;
  document.getElementById("metric-economia").innerText =
    formatCurrencyBRL(economia);

  // C. Gasto por Categoria (Gráfico Pizza)
  renderShareWalletChart(categoryTotals);

  // D. Inflação Pessoal (CPI) - CORRIGIDO: Compara com período anterior
  calculateCPI(filteredLists, allLists);

  // ---------------------------------------------------------
  // 2. MÉTRICAS DE COMPORTAMENTO E HÁBITO
  // ---------------------------------------------------------

  // A. Índice de Fidelidade de Local
  calculateLocationFidelity(filteredLists);

  // B. Recorrência de Itens e Ciclo de Reposição
  calculateItemRecurrenceAndRepo(filteredLists);

  // ---------------------------------------------------------
  // 3. MÉTRICAS DE EFICIÊNCIA DA COMPRA
  // ---------------------------------------------------------

  // A. Volume de Itens por Lista (Gráfico Coluna)
  renderVolumeItensChart(filteredLists);

  // B. Taxa de Conversão da Lista
  const taxaConversao =
    totalItemsAdded > 0 ? (totalItemsChecked / totalItemsAdded) * 100 : 0;
  document.getElementById("metric-conversao").innerText =
    `${taxaConversao.toFixed(0)}%`;

  // C. Variabilidade de Preço por Local
  calculatePriceVariability(filteredLists);

  // ---------------------------------------------------------
  // 4. INSIGHTS DE SAÚDE E NUTRIÇÃO
  // ---------------------------------------------------------

  // A. Ratio Ultraprocessados vs In Natura (Gráfico Pizza) - CORRIGIDO
  calculateHealthRatio(categoryTotals);

  // B. Sazonalidade de Consumo
  calculateSazonalidade(filteredLists);
}

/* ==========================================================================
   CÁLCULOS ESPECÍFICOS E LÓGICA DE DADOS
   ========================================================================== */

/**
 * Métrica 1.D: Inflação Pessoal (CPI)
 * Compara o período filtrado com o período imediatamente anterior
 */
function calculateCPI(filteredLists, allLists) {
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
        <span class="item-sub-text">Ant: ${formatCurrencyBRL(item.avgPrev)} → Atual: ${formatCurrencyBRL(item.avgCurrent)}</span>
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

  // Encontra o período anterior baseado no tipo de filtro
  let previousLists = [];

  if (activeFilter.type === "mes") {
    // Se filtrou por mês específico, pega o mês anterior
    const [year, month] = activeFilter.value.split("-");
    const currentDate = new Date(parseInt(year), parseInt(month) - 1, 1);
    const prevMonth = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth() - 1,
      1,
    );
    const prevYearStr = prevMonth.getFullYear();
    const prevMonthStr = prevMonth.getMonth() + 1;

    previousLists = allLists.filter((list) => {
      const listDate = getYearMonth(list.date);
      return listDate.year === prevYearStr && listDate.month === prevMonthStr;
    });
  } else if (activeFilter.type === "periodo") {
    // Se filtrou por período, pega período de mesma duração imediatamente anterior
    const start = parseDateLocal(activeFilter.value.start);
    const end = parseDateLocal(activeFilter.value.end);
    const duration = end - start;

    const prevEnd = new Date(start);
    prevEnd.setDate(prevEnd.getDate() - 1);
    const prevStart = new Date(prevEnd);
    prevStart.setTime(prevStart.getTime() - duration);

    previousLists = allLists.filter((list) => {
      const listDate = parseDateLocal(list.date);
      return listDate >= prevStart && listDate <= prevEnd;
    });
  } else {
    // Para "geral" ou "local", compara com metade anterior do histórico
    const sortedAll = [...allLists].sort(
      (a, b) => parseDateLocal(a.date) - parseDateLocal(b.date),
    );
    const midPoint = Math.floor(sortedAll.length / 2);

    // Se está na segunda metade, compara com primeira metade
    const isSecondHalf = filteredLists.some((l) => {
      const idx = sortedAll.findIndex((sl) => sl.id === l.id);
      return idx >= midPoint;
    });

    if (isSecondHalf) {
      previousLists = sortedAll.slice(0, midPoint);
    } else {
      container.innerHTML = `<div class="empty-state-minor">Período anterior insuficiente para comparação.</div>`;
      return;
    }
  }

  if (previousLists.length === 0) {
    container.innerHTML = `<div class="empty-state-minor">Período anterior insuficiente para comparação.</div>`;
    return;
  }

  // Calcula preços médios no período atual (filtrado)
  const currentPrices = {};
  filteredLists.forEach((list) => {
    (list.categories || []).forEach((cat) => {
      cat.items.forEach((item) => {
        if (!item.checked) return;
        const normalizedName = window.normalizeString(item.name);
        if (!currentPrices[normalizedName]) {
          currentPrices[normalizedName] = {
            total: 0,
            count: 0,
            name: item.name,
          };
        }
        const valorUnitario = parseFloat(
          item.price.replace(/\./g, "").replace(",", "."),
        );
        currentPrices[normalizedName].total += valorUnitario;
        currentPrices[normalizedName].count++;
      });
    });
  });

  // Calcula preços médios no período anterior
  const previousPrices = {};
  previousLists.forEach((list) => {
    (list.categories || []).forEach((cat) => {
      cat.items.forEach((item) => {
        if (!item.checked) return;
        const normalizedName = window.normalizeString(item.name);
        if (!previousPrices[normalizedName]) {
          previousPrices[normalizedName] = { total: 0, count: 0 };
        }
        const valorUnitario = parseFloat(
          item.price.replace(/\./g, "").replace(",", "."),
        );
        previousPrices[normalizedName].total += valorUnitario;
        previousPrices[normalizedName].count++;
      });
    });
  });

  // Compara e renderiza
  const cpiItems = [];
  Object.keys(currentPrices).forEach((name) => {
    if (previousPrices[name]) {
      const avgCurrent = currentPrices[name].total / currentPrices[name].count;
      const avgPrev = previousPrices[name].total / previousPrices[name].count;
      const diff = ((avgCurrent - avgPrev) / avgPrev) * 100;

      // Renderiza mesmo se a diferença for 0, conforme a imagem do usuário
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
        name: window.capitalize(currentPrices[name].name),
        avgPrev,
        avgCurrent,
        diff,
        emoji,
        color,
      });
    }
  });

  if (cpiItems.length === 0) {
    container.innerHTML = `<div class="empty-state-minor">Itens recorrentes não encontrados para comparação.</div>`;
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
      <span class="item-sub-text">Ant: ${formatCurrencyBRL(item.avgPrev)} → Atual: ${formatCurrencyBRL(item.avgCurrent)}</span>
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
 */
function calculateLocationFidelity(filteredLists) {
  const localFreq = {};
  filteredLists.forEach((l) => {
    const loc = l.location || "Não Informado";
    localFreq[loc] = (localFreq[loc] || 0) + 1;
  });

  let topLocal = "--";
  let maxFreq = 0;

  for (const loc in localFreq) {
    if (localFreq[loc] > maxFreq) {
      maxFreq = localFreq[loc];
      topLocal = loc;
    }
  }

  document.getElementById("metric-top-local").innerText = topLocal;
  document.getElementById("metric-local-freq").innerText = `${maxFreq} compras`;
}

/**
 * Métrica 2.A e 2.B: Recorrência de Itens e Ciclo de Reposição
 */
function calculateItemRecurrenceAndRepo(filteredLists) {
  const listCount = filteredLists.length;
  const itemMap = {};

  // Ordena listas por data para cálculo correto do ciclo
  const sortedLists = [...filteredLists].sort(
    (a, b) => parseDateLocal(a.date) - parseDateLocal(b.date),
  );

  sortedLists.forEach((list) => {
    (list.categories || []).forEach((cat) => {
      cat.items.forEach((item) => {
        if (!item.checked) return;
        const normalizedName = window.normalizeString(item.name);
        if (!itemMap[normalizedName])
          itemMap[normalizedName] = { dates: [], name: item.name };
        itemMap[normalizedName].dates.push(list.date);
      });
    });
  });

  // Itens Essenciais: aparecem em 100% das listas
  const essenciais = Object.keys(itemMap).filter((name) => {
    const uniqueDates = new Set(itemMap[name].dates);
    return uniqueDates.size === listCount;
  });
  document.getElementById("metric-essenciais-count").innerText =
    essenciais.length;

  // EXIBIÇÃO DE RECORRÊNCIA (FREQUÊNCIA) ---
  const recorrenciaContainer = document.getElementById(
    "recorrencia-itens-list",
  );

  // Verifica cache
  const currentFilterKey = JSON.stringify(activeFilter);

  if (recorrenciaContainer) {
    // Verifica se já temos dados em cache
    if (
      cachedDashboardData.recorrenciaItems &&
      cachedDashboardData.lastFilter === currentFilterKey
    ) {
      renderPaginatedList(
        recorrenciaContainer,
        cachedDashboardData.recorrenciaItems,
        "recorrencia",
        (item) => `
          <div>
            <span class="item-main-text">${item.name}</span>
            <span class="item-sub-text">Média: ${item.media} dias | ${item.compras} compras</span>
          </div>
        `,
        (item) => `
          <strong style="color: var(--primary-light)">
            ${item.texto}
          </strong>
        `,
      );
    } else {
      recorrenciaContainer.innerHTML = "";

      const itensRecorrentes = [];

      Object.keys(itemMap).forEach((name) => {
        const dates = [...new Set(itemMap[name].dates)].sort();
        if (dates.length >= 2) {
          const intervalos = [];
          for (let i = 1; i < dates.length; i++) {
            const diffTime =
              parseDateLocal(dates[i]) - parseDateLocal(dates[i - 1]);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            if (diffDays > 0 && diffDays < 365) intervalos.push(diffDays);
          }

          if (intervalos.length > 0) {
            const mediaDias =
              intervalos.reduce((a, b) => a + b, 0) / intervalos.length;
            let frequenciaTexto = "";

            if (mediaDias <= 8) frequenciaTexto = "Semanal";
            else if (mediaDias <= 16) frequenciaTexto = "Quinzenal";
            else if (mediaDias <= 35) frequenciaTexto = "Mensal";
            else frequenciaTexto = `A cada ${Math.round(mediaDias)} dias`;

            itensRecorrentes.push({
              name: window.capitalize(itemMap[name].name),
              media: Math.round(mediaDias),
              texto: frequenciaTexto,
              compras: dates.length,
            });
          }
        }
      });

      itensRecorrentes.sort((a, b) => b.compras - a.compras);

      if (itensRecorrentes.length === 0) {
        recorrenciaContainer.innerHTML = `<div class="empty-state-minor">Gere mais listas para ver a frequência.</div>`;
      } else {
        // Armazena em cache
        cachedDashboardData.recorrenciaItems = itensRecorrentes;
        cachedDashboardData.lastFilter = currentFilterKey;

        renderPaginatedList(
          recorrenciaContainer,
          itensRecorrentes,
          "recorrencia",
          (item) => `
            <div>
              <span class="item-main-text">${item.name}</span>
              <span class="item-sub-text">Média: ${item.media} dias | ${item.compras} compras</span>
            </div>
          `,
          (item) => `
            <strong style="color: var(--primary-light)">
              ${item.texto}
            </strong>
          `,
        );
      }
    }
  }

  const repoContainer = document.getElementById("reposicao-list");

  // Verifica cache para reposição
  if (
    cachedDashboardData.reposicaoItems &&
    cachedDashboardData.lastFilter === currentFilterKey
  ) {
    renderPaginatedList(
      repoContainer,
      cachedDashboardData.reposicaoItems,
      "reposicao",
      (item) => {
        let statusText = "";
        let statusColor = "var(--bg-card-light)";

        if (item.diasRestantes < 0) {
          statusText = `Atraso ${Math.abs(item.diasRestantes)}d`;
          statusColor = "var(--danger)";
        } else if (item.diasRestantes === 0) {
          statusText = "Hoje";
          statusColor = "var(--accent-green)";
        } else if (item.diasRestantes <= 3) {
          statusText = `Em ${item.diasRestantes}d`;
          statusColor = "var(--primary-light)";
        } else {
          statusText = `📅 ${formatDateBRL(item.nextDate.toISOString().split("T")[0])}`;
        }

        return `
          <div>
            <span class="item-main-text">${item.name}</span>
            <span class="item-sub-text">Ciclo: ${item.ciclo}d | Última: ${item.lastDateStr}</span>
          </div>
        `;
      },
      (item) => {
        let statusText = "";
        let statusColor = "var(--bg-card-light)";

        if (item.diasRestantes < 0) {
          statusText = `Atraso ${Math.abs(item.diasRestantes)}d`;
          statusColor = "var(--danger)";
        } else if (item.diasRestantes === 0) {
          statusText = "Hoje";
          statusColor = "var(--accent-green)";
        } else if (item.diasRestantes <= 3) {
          statusText = `Em ${item.diasRestantes}d`;
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

  repoContainer.innerHTML = "";

  if (listCount < 3) {
    repoContainer.innerHTML = `<div class="empty-state-minor">Gere mais listas para prever reposição.</div>`;
    return;
  }

  const previsoes = [];

  Object.keys(itemMap).forEach((name) => {
    const dates = [...new Set(itemMap[name].dates)].sort(); // Remove duplicatas e ordena
    if (dates.length >= 2) {
      const intervalos = [];
      for (let i = 1; i < dates.length; i++) {
        const diffTime =
          parseDateLocal(dates[i]) - parseDateLocal(dates[i - 1]);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays > 0 && diffDays < 365) intervalos.push(diffDays); // Ignora intervalos absurdos
      }

      if (intervalos.length > 0) {
        const mediaDias =
          intervalos.reduce((a, b) => a + b, 0) / intervalos.length;

        const lastPurchase = parseDateLocal(dates[dates.length - 1]);
        const nextDate = new Date(lastPurchase);
        nextDate.setDate(lastPurchase.getDate() + Math.round(mediaDias));

        // Só mostra previsões para datas futuras ou próximas
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        const diasAteCompra = Math.ceil(
          (nextDate - hoje) / (1000 * 60 * 60 * 24),
        );

        if (diasAteCompra >= -7) {
          // Mostra se já passou até 7 dias (atraso) ou está no futuro
          previsoes.push({
            name: window.capitalize(itemMap[name].name),
            ciclo: Math.round(mediaDias),
            nextDate: nextDate,
            lastDateStr: formatDateBRL(dates[dates.length - 1]),
            diasRestantes: diasAteCompra,
          });
        }
      }
    }
  });

  previsoes.sort((a, b) => a.nextDate - b.nextDate);

  if (previsoes.length === 0) {
    repoContainer.innerHTML = `<div class="empty-state-minor">Padrão de compra não identificado.</div>`;
    return;
  }

  // Armazena em cache
  cachedDashboardData.reposicaoItems = previsoes;
  cachedDashboardData.lastFilter = currentFilterKey;

  renderPaginatedList(
    repoContainer,
    previsoes,
    "reposicao",
    (item) => {
      let statusText = "";
      let statusColor = "var(--bg-card-light)";

      if (item.diasRestantes < 0) {
        statusText = `Atraso ${Math.abs(item.diasRestantes)}d`;
        statusColor = "var(--danger)";
      } else if (item.diasRestantes === 0) {
        statusText = "Hoje";
        statusColor = "var(--accent-green)";
      } else if (item.diasRestantes <= 3) {
        statusText = `Em ${item.diasRestantes}d`;
        statusColor = "var(--primary-light)";
      } else {
        statusText = `📅 ${formatDateBRL(item.nextDate.toISOString().split("T")[0])}`;
      }

      return `
        <div>
          <span class="item-main-text">${item.name}</span>
          <span class="item-sub-text">Ciclo: ${item.ciclo}d | Última: ${item.lastDateStr}</span>
        </div>
      `;
    },
    (item) => {
      let statusText = "";
      let statusColor = "var(--bg-card-light)";

      if (item.diasRestantes < 0) {
        statusText = `Atraso ${Math.abs(item.diasRestantes)}d`;
        statusColor = "var(--danger)";
      } else if (item.diasRestantes === 0) {
        statusText = "Hoje";
        statusColor = "var(--accent-green)";
      } else if (item.diasRestantes <= 3) {
        statusText = `Em ${item.diasRestantes}d`;
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
 * @param {string} paginationKey - Chave do estado de paginação ('cpi', 'recorrencia', 'reposicao')
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
      items, // Passa os items para re-renderização direta sem recalcular tudo
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
  prevBtn.className = "pagination-btn";
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
  nextBtn.className = "pagination-btn";
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
 * Métrica 3.C: Variabilidade de Preço por Local
 */
function calculatePriceVariability(filteredLists) {
  const itemPricesByLocal = {};

  filteredLists.forEach((list) => {
    const local = list.location || "Não Informado";
    (list.categories || []).forEach((cat) => {
      cat.items.forEach((item) => {
        if (!item.checked) return;
        const normalizedName = window.normalizeString(item.name);
        if (!itemPricesByLocal[normalizedName])
          itemPricesByLocal[normalizedName] = {};

        const valorUnitario = parseFloat(
          item.price.replace(/\./g, "").replace(",", "."),
        );

        // Mantém o menor preço encontrado em cada local
        if (
          !itemPricesByLocal[normalizedName][local] ||
          valorUnitario < itemPricesByLocal[normalizedName][local]
        ) {
          itemPricesByLocal[normalizedName][local] = valorUnitario;
        }
      });
    });
  });

  let variacaoDetectada = false;
  let totalVariacoes = 0;
  let maiorVariacao = 0;

  Object.keys(itemPricesByLocal).forEach((name) => {
    const locais = itemPricesByLocal[name];
    const precos = Object.values(locais);

    if (precos.length >= 2) {
      const maxPrice = Math.max(...precos);
      const minPrice = Math.min(...precos);

      if (minPrice > 0) {
        const variacaoPercent = ((maxPrice - minPrice) / minPrice) * 100;
        if (variacaoPercent > 15) {
          variacaoDetectada = true;
          totalVariacoes++;
          if (variacaoPercent > maiorVariacao) maiorVariacao = variacaoPercent;
        }
      }
    }
  });

  const el = document.getElementById("metric-alerta-preco");
  if (variacaoDetectada) {
    el.innerText = `${totalVariacoes} itens`;
    el.style.color = "var(--danger)";
  } else {
    el.innerText = `Ok`;
    el.style.color = "var(--accent-green)";
  }
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

  Object.keys(categoryTotals).forEach((catName) => {
    const normalizedCat = window.normalizeString(catName);
    const value = categoryTotals[catName];

    const isHealthy = categoryClassification.healthy.some((keyword) =>
      normalizedCat.includes(keyword),
    );
    const isProcessed = categoryClassification.processed.some((keyword) =>
      normalizedCat.includes(keyword),
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
function calculateSazonalidade(filteredLists) {
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

    (list.categories || []).forEach((cat) => {
      categoryByMonth[month][cat.name] =
        (categoryByMonth[month][cat.name] || 0) + 1;
    });
  });

  const currentMonth = new Date().getMonth();
  const monthData = categoryByMonth[currentMonth];

  const el = document.getElementById("metric-sazonalidade-text");

  if (monthData) {
    let topCat = "";
    let maxCount = 0;
    for (const cat in monthData) {
      if (monthData[cat] > maxCount) {
        maxCount = monthData[cat];
        topCat = cat;
      }
    }
    el.innerText = `Neste mês de ${monthNames[currentMonth]}, sua categoria mais frequente é "${topCat}".`;
  } else {
    el.innerText =
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

function renderVolumeItensChart(filteredLists) {
  const ctx = document.getElementById("chart-volume-itens");
  if (!ctx) return;

  if (chartVolumeItens) chartVolumeItens.destroy();

  const labels = filteredLists.map((l) =>
    formatDateBRL(l.date).split("/").slice(0, 2).join("/"),
  );
  const data = filteredLists.map((l) => {
    let count = 0;
    (l.categories || []).forEach((c) => {
      c.items.forEach((i) => {
        if (i.checked) count += i.quantity || 1;
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

  if (chartPerfilSaude) chartPerfilSaude.destroy();

  chartPerfilSaude = new Chart(ctx, {
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
    const months = [
      ...new Set(window.marketListData.map((l) => l.date.substring(0, 7))),
    ]
      .sort()
      .reverse();

    const select = document.createElement("select");
    select.id = "filter-month-select";
    select.className = "filter-select";

    months.forEach((m) => {
      const [y, mon] = m.split("-");
      const opt = document.createElement("option");
      opt.value = m;
      opt.innerText = `${mon}/${y}`;
      select.appendChild(opt);
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
    const locals = [
      ...new Set(
        window.marketListData.map((l) => l.location || "Não Informado"),
      ),
    ].sort();

    const select = document.createElement("select");
    select.id = "filter-local-select";
    select.className = "filter-select";

    locals.forEach((l) => {
      const opt = document.createElement("option");
      opt.value = l;
      opt.innerText = l;
      select.appendChild(opt);
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
    activeFilter.value = document.getElementById("filter-local-select").value;
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
  const btn = document.querySelector(".icon-filter");
  if (activeFilter.type !== "geral") {
    btn.style.color = "var(--accent-green)";
    btn.style.filter = "drop-shadow(0 0 5px var(--accent-green))";
  } else {
    btn.style.color = "";
    btn.style.filter = "";
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
      <button class="btn-filter-apply mt-20" onclick="clearFilter()">Limpar Filtros</button>
    `;
  }
}

function formatDateBRL(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}
