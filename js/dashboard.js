/* ==========================================================================
   DASHBOARD & DATA ANALYTICS MODULE
   ========================================================================= */

// Utilitário local para formatação de moeda
const formatBRL = (val) =>
  val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Estado dos Gráficos (para destruí-los antes de recriar)
let chartShareWallet = null;
let chartVolumeItens = null;
let chartPerfilSaude = null;

// Filtro Ativo Padrão (Geral)
let activeFilter = { type: "geral", value: null };

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

  // REFACTOR: Reinicia o filtro para o padrão "geral" ao abrir a página
  activeFilter = { type: "geral", value: null };

  // Limpa campos visuais do modal de filtro para refletir o reset
  updateFilterChipsUI();
  const dynamicSection = document.getElementById("dynamic-filter-section");
  if (dynamicSection) dynamicSection.style.display = "none";

  updateFilterIndicator();
  processDashboardData(data);
};

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
      // Agregação para Share of Wallet
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
    formatBRL(ticketMedio);

  // B. Economia Potencial (Desejado - Comprado)
  const economia = forecastTotal - totalSpentInPeriod;
  document.getElementById("metric-economia").innerText = formatBRL(economia);

  // C. Share of Wallet (Gráfico Pizza)
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
 * Agora compara o período filtrado com o período imediatamente anterior
 */
function calculateCPI(filteredLists, allLists) {
  const container = document.getElementById("cpi-container");
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
    const prevMonthStr = String(prevMonth.getMonth() + 1).padStart(2, "0");

    previousLists = allLists.filter((list) => {
      const d = new Date(list.date);
      return (
        d.getFullYear() === prevYearStr &&
        d.getMonth() + 1 === parseInt(prevMonthStr)
      );
    });
  } else if (activeFilter.type === "periodo") {
    // Se filtrou por período, pega período de mesma duração imediatamente anterior
    const start = new Date(activeFilter.value.start);
    const end = new Date(activeFilter.value.end);
    const duration = end - start;

    const prevEnd = new Date(start);
    prevEnd.setDate(prevEnd.getDate() - 1);
    const prevStart = new Date(prevEnd);
    prevStart.setTime(prevStart.getTime() - duration);

    previousLists = allLists.filter((list) => {
      const d = new Date(list.date);
      return d >= prevStart && d <= prevEnd;
    });
  } else {
    // Para "geral" ou "local", compara com metade anterior do histórico
    const sortedAll = [...allLists].sort(
      (a, b) => new Date(a.date) - new Date(b.date),
    );
    const midPoint = Math.floor(sortedAll.length / 2);
    const filteredIds = new Set(filteredLists.map((l) => l.id));

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

  // Encontra itens recorrentes (aparecem em ambos os períodos)
  const recorrentes = Object.keys(currentPrices).filter((name) => {
    return previousPrices[name] && currentPrices[name].count >= 1;
  });

  if (recorrentes.length === 0) {
    container.innerHTML = `<div class="empty-state-minor">Sem itens recorrentes entre os períodos.</div>`;
    return;
  }

  let hasComparison = false;
  recorrentes.slice(0, 5).forEach((name) => {
    const priceCurr = currentPrices[name].total / currentPrices[name].count;
    const pricePrev = previousPrices[name].total / previousPrices[name].count;

    const variacao = ((priceCurr - pricePrev) / pricePrev) * 100;
    const classe = variacao > 0 ? "up" : "down";
    const icone = variacao > 0 ? "📈" : "📉";

    hasComparison = true;
    const div = document.createElement("div");
    div.className = `cpi-item ${classe}`;
    div.innerHTML = `
      <div>
        <span class="item-main-text">${window.capitalize(currentPrices[name].name)}</span>
        <span class="item-sub-text">Ant: ${formatBRL(pricePrev)} → Atual: ${formatBRL(priceCurr)}</span>
      </div>
      <strong style="color: ${variacao > 0 ? "var(--danger)" : "var(--accent-green)"}">
        ${icone} ${Math.abs(variacao).toFixed(1)}%
      </strong>
    `;
    container.appendChild(div);
  });

  if (!hasComparison) {
    container.innerHTML = `<div class="empty-state-minor">Não foi possível comparar preços.</div>`;
  }
}

/**
 * Métrica 2.A: Índice de Fidelidade de Local
 */
function calculateLocationFidelity(filteredLists) {
  const localMap = {};
  filteredLists.forEach((list) => {
    const local = list.location || "Não Informado";
    if (!localMap[local]) localMap[local] = 0;
    localMap[local]++;
  });

  let topLocal = "--";
  let maxFreq = 0;
  for (const [local, freq] of Object.entries(localMap)) {
    if (freq > maxFreq) {
      maxFreq = freq;
      topLocal = local;
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
    (a, b) => new Date(a.date) - new Date(b.date),
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

  const repoContainer = document.getElementById("reposicao-list");
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
        const diffTime = new Date(dates[i]) - new Date(dates[i - 1]);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays > 0 && diffDays < 365) intervalos.push(diffDays); // Ignora intervalos absurdos
      }

      if (intervalos.length > 0) {
        const mediaDias =
          intervalos.reduce((a, b) => a + b, 0) / intervalos.length;

        const lastPurchase = new Date(dates[dates.length - 1]);
        const nextDate = new Date(lastPurchase);
        nextDate.setDate(lastPurchase.getDate() + Math.round(mediaDias));

        // Só mostra previsões para datas futuras ou próximas
        const hoje = new Date();
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

  previsoes.slice(0, 5).forEach((prev) => {
    const div = document.createElement("div");
    div.className = "data-item";

    let statusText = "";
    let statusColor = "var(--toast-bg)";

    if (prev.diasRestantes < 0) {
      statusText = `Atraso ${Math.abs(prev.diasRestantes)}d`;
      statusColor = "var(--danger)";
    } else if (prev.diasRestantes === 0) {
      statusText = "Hoje";
      statusColor = "var(--accent-green)";
    } else if (prev.diasRestantes <= 3) {
      statusText = `Em ${prev.diasRestantes}d`;
      statusColor = "var(--primary)";
    } else {
      statusText = `📅 ${formatDateBRL(prev.nextDate.toISOString().split("T")[0])}`;
    }

    div.innerHTML = `
      <div>
        <span class="item-main-text">${prev.name}</span>
        <span class="item-sub-text">Ciclo: ${prev.ciclo}d | Última: ${prev.lastDateStr}</span>
      </div>
      <strong style="color: ${statusColor}">
        ${statusText}
      </strong>
    `;
    repoContainer.appendChild(div);
  });
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
 * Usa classificação inteligente baseada em padrões de categoria
 */
function calculateHealthRatio(categoryTotals) {
  // Sistema de classificação hierárquico
  const categoryClassification = {
    // In Natura / Saudáveis
    healthy: [
      "hortifruti",
      "fruta",
      "legume",
      "verdura",
      "acougue",
      "açougue",
      "peixaria",
      "natural",
      "orgânico",
      "organico",
      "feira",
      "ovos",
      "leite",
      "iogurte",
      "queijo",
      "frios",
      "embutidos",
      "carne",
      "peixe",
      "frango",
      "pescado",
      "grãos",
      "graos",
      "cereal",
      "aveia",
      "granola",
      "nuts",
      "castanha",
      "semente",
    ],
    // Ultraprocessados / Menos saudáveis
    unhealthy: [
      "snack",
      "biscoito",
      "bolacha",
      "congelado",
      "refrigerante",
      "doce",
      "processado",
      "salgadinho",
      "chocolate",
      "balas",
      "sorvete",
      "fast food",
      "lanche",
      "pizza",
      "hamburguer",
      "nuggets",
      "lasanha congelada",
      "pão de queijo congelado",
      "batata frita",
      "suco em pó",
      "refresco",
      "energético",
      "cerveja",
      "vodka",
      "whisky",
      "vinho",
      "bebida alcoólica",
    ],
    // Neutros (não entram no cálculo ou são proporcionalmente distribuídos)
    neutral: [
      "mercearia",
      "padaria",
      "açougue",
      "açougue",
      "limpeza",
      "higiene",
      "perfumaria",
      "utensílios",
      "papelaria",
      "pet",
    ],
  };

  let healthySpent = 0;
  let unhealthySpent = 0;
  let neutralSpent = 0;
  let unclassifiedSpent = 0;

  Object.keys(categoryTotals).forEach((catName) => {
    const normName = window.normalizeString(catName);
    const valor = categoryTotals[catName];

    const isHealthy = categoryClassification.healthy.some(
      (key) => normName.includes(key) || key.includes(normName),
    );
    const isUnhealthy = categoryClassification.unhealthy.some(
      (key) => normName.includes(key) || key.includes(normName),
    );
    const isNeutral = categoryClassification.neutral.some(
      (key) => normName.includes(key) || key.includes(normName),
    );

    if (isHealthy && !isUnhealthy) {
      healthySpent += valor;
    } else if (isUnhealthy && !isHealthy) {
      unhealthySpent += valor;
    } else if (isNeutral) {
      neutralSpent += valor;
    } else {
      // Se não conseguiu classificar, distribui proporcionalmente
      unclassifiedSpent += valor;
    }
  });

  // Distribui gastos não classificados proporcionalmente
  const totalClassified = healthySpent + unhealthySpent;
  if (totalClassified > 0 && unclassifiedSpent > 0) {
    const healthyRatio = healthySpent / totalClassified;
    healthySpent += unclassifiedSpent * healthyRatio;
    unhealthySpent += unclassifiedSpent * (1 - healthyRatio);
  } else if (unclassifiedSpent > 0) {
    // Se não há classificados, joga tudo em neutro
    neutralSpent += unclassifiedSpent;
  }

  const totalMapeado = healthySpent + unhealthySpent;
  renderHealthRatioChart(healthySpent, unhealthySpent, totalMapeado);
}

/**
 * Métrica 4.B: Sazonalidade de Consumo
 */
function calculateSazonalidade(filteredLists) {
  const sazonalidadeEl = document.getElementById("metric-sazonalidade-text");
  const catMonthSpend = {};

  filteredLists.forEach((list) => {
    const month = new Date(list.date).getMonth();

    (list.categories || []).forEach((cat) => {
      cat.items.forEach((item) => {
        if (!item.checked) return;

        const valorUnitario = parseFloat(
          item.price.replace(/\./g, "").replace(",", "."),
        );
        const qtd = item.quantity || 1;
        const valorTotalItem = valorUnitario * qtd;

        if (!catMonthSpend[cat.name]) catMonthSpend[cat.name] = {};
        if (!catMonthSpend[cat.name][month]) catMonthSpend[cat.name][month] = 0;

        catMonthSpend[cat.name][month] += valorTotalItem;
      });
    });
  });

  const insights = [];
  const monthNames = [
    "Jan",
    "Fev",
    "Mar",
    "Abr",
    "Mai",
    "Jun",
    "Jul",
    "Ago",
    "Set",
    "Out",
    "Nov",
    "Dez",
  ];

  // Analisa cada categoria para picos de consumo
  Object.keys(catMonthSpend).forEach((catName) => {
    const meses = catMonthSpend[catName];
    const monthValues = Object.entries(meses).map(([m, v]) => ({
      month: parseInt(m),
      value: v,
    }));

    if (monthValues.length >= 2) {
      const avg =
        monthValues.reduce((sum, mv) => sum + mv.value, 0) / monthValues.length;
      const max = Math.max(...monthValues.map((mv) => mv.value));
      const maxMonth = monthValues.find((mv) => mv.value === max);

      // Detecta pico se for 50% acima da média
      if (max > avg * 1.5 && maxMonth.value > 0) {
        insights.push({
          cat: catName,
          month: maxMonth.month,
          text: `Alto consumo de "${catName}" em ${monthNames[maxMonth.month]}`,
        });
      }
    }
  });

  // Ordena por valor e pega os top 3
  insights.sort((a, b) => b.value - a.value);

  if (insights.length > 0) {
    sazonalidadeEl.innerText =
      insights[0].text +
      (insights.length > 1 ? ` e mais ${insights.length - 1} padrões` : "");
  } else if (filteredLists.length < 4) {
    sazonalidadeEl.innerText =
      "Histórico de compras insuficiente para análise sazonal precisa.";
  } else {
    sazonalidadeEl.innerText =
      "Padrão de consumo estável. Nenhuma sazonalidade significativa detectada.";
  }
}

/* ==========================================================================
   RENDERIZAÇÃO DE GRÁFICOS (Chart.js)
   ========================================================================== */

function renderShareWalletChart(categoryTotals) {
  const canvas = document.getElementById("chart-share-wallet");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  if (chartShareWallet) chartShareWallet.destroy();

  const labels = Object.keys(categoryTotals).filter(
    (cat) => categoryTotals[cat] > 0,
  );
  const data = labels.map((cat) => categoryTotals[cat]);

  if (labels.length === 0) {
    showEmptyChartText("chart-share-wallet", "Sem gastos registrados");
    return;
  }

  chartShareWallet = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: labels,
      datasets: [
        {
          data: data,
          backgroundColor: [
            "rgba(76, 51, 230, 0.7)",
            "rgba(36, 150, 137, 0.7)",
            "rgba(255, 71, 87, 0.7)",
            "#f1c40f",
            "#3498db",
            "#9b59b6",
            "#e67e22",
          ],
          borderColor: "#fff",
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function (context) {
              const label = context.label || "";
              const value = context.parsed;
              const total = context.dataset.data.reduce((a, b) => a + b, 0);
              const percentage =
                total > 0 ? ((value / total) * 100).toFixed(0) : 0;
              return `${label}: ${formatBRL(value)} (${percentage}%)`;
            },
          },
        },
      },
      cutout: "60%",
    },
  });
}

function renderVolumeItensChart(filteredLists) {
  const canvas = document.getElementById("chart-volume-itens");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (chartVolumeItens) chartVolumeItens.destroy();

  const sorted = [...filteredLists].sort(
    (a, b) => new Date(a.date) - new Date(b.date),
  );
  const lastLists = sorted.slice(-5);

  const labels = lastLists.map((list) => formatDateBRLMini(list.date));
  const data = lastLists.map((list) => {
    let count = 0;
    (list.categories || []).forEach((cat) => {
      count += cat.items.reduce((sum, item) => sum + (item.quantity || 1), 0);
    });
    return count;
  });

  chartVolumeItens = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Qtd. Itens",
          data: data,
          backgroundColor: "rgba(76, 51, 230, 0.6)",
          borderRadius: 8,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: {
          beginAtZero: true,
          grid: { display: false },
          ticks: { stepSize: 10 },
        },
        x: { grid: { display: false } },
      },
    },
  });
}

function renderHealthRatioChart(healthy, unhealthy, totalMapeado) {
  const canvas = document.getElementById("chart-perfil-saude");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (chartPerfilSaude) chartPerfilSaude.destroy();

  if (totalMapeado === 0) {
    showEmptyChartText("chart-perfil-saude", "Categorias não mapeadas.");
    return;
  }

  chartPerfilSaude = new Chart(ctx, {
    type: "pie",
    data: {
      labels: ["In Natura / Saudável", "Processados / Industrializados"],
      datasets: [
        {
          data: [healthy, unhealthy],
          backgroundColor: [
            "rgba(36, 150, 137, 0.7)",
            "rgba(255, 71, 87, 0.7)",
          ],
          borderColor: "#fff",
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "bottom",
          labels: { boxWidth: 12, font: { size: 11 } },
        },
        tooltip: {
          callbacks: {
            label: function (context) {
              const value = context.parsed;
              const percentage =
                totalMapeado > 0
                  ? ((value / totalMapeado) * 100).toFixed(0)
                  : 0;
              return `${percentage}% (${formatBRL(value)})`;
            },
          },
        },
      },
    },
  });
}

/* ==========================================================================
   SISTEMA DE FILTROS E MODAL
   ========================================================================== */

/**
 * Abre/Fecha o modal de filtros com animação suave
 */
window.toggleFilterModal = function () {
  const modal = document.getElementById("filter-modal");
  const isVisible = modal.classList.contains("modal-visible");

  if (!isVisible) {
    // Abrir modal
    modal.classList.remove("modal-hidden");
    modal.classList.add("modal-visible");

    // Resetar visual dos chips para o filtro atual
    updateFilterChipsUI();

    // Renderizar inputs dinâmicos se necessário
    if (activeFilter.type !== "geral") {
      const dynamicSection = document.getElementById("dynamic-filter-section");
      if (dynamicSection) dynamicSection.style.display = "flex";
      renderDynamicInputs(activeFilter.type);
    }
  } else {
    // Fechar modal
    modal.classList.remove("modal-visible");
    modal.classList.add("modal-hidden");
  }
};

/**
 * Seleciona o tipo de filtro via chips
 */
window.selectFilterType = function (type) {
  activeFilter.type = type;
  activeFilter.value = null;

  // Atualizar UI dos chips
  updateFilterChipsUI();

  // Mostrar/esconder seção dinâmica
  const dynamicSection = document.getElementById("dynamic-filter-section");

  if (type === "geral") {
    if (dynamicSection) dynamicSection.style.display = "none";
  } else {
    if (dynamicSection) dynamicSection.style.display = "flex";
    renderDynamicInputs(type);
  }
};

/**
 * Atualiza a aparência dos chips de filtro
 */
function updateFilterChipsUI() {
  const chips = document.querySelectorAll(".filter-chip");
  chips.forEach((chip) => {
    if (chip.dataset.value === activeFilter.type) {
      chip.classList.add("active");
    } else {
      chip.classList.remove("active");
    }
  });
}

/**
 * Renderiza os inputs dinâmicos baseados no tipo de filtro
 */
function renderDynamicInputs(type) {
  const container = document.getElementById("dynamic-filter-inputs");
  const label = document.getElementById("dynamic-filter-label");
  if (!container) return;

  container.innerHTML = "";

  if (type === "mes") {
    if (label) label.textContent = "Selecione o Mês";
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");

    container.innerHTML = `
      <input type="month" 
             id="filter-mes-input" 
             class="filter-input"
             value="${year}-${month}" />
    `;
  } else if (type === "periodo") {
    if (label) label.textContent = "Período de Análise";
    container.innerHTML = `
      <div class="date-range-inputs">
        <input type="date" 
               id="filter-date-start" 
               class="filter-input"
               placeholder="Data Início" />
        <input type="date" 
               id="filter-date-end" 
               class="filter-input"
               placeholder="Data Fim" />
      </div>
    `;
  } else if (type === "local") {
    if (label) label.textContent = "Local de Compra";
    const locais = new Set();
    window.marketListData.forEach((list) => {
      if (list.location) locais.add(list.location);
    });

    if (locais.size === 0) {
      container.innerHTML = `<div class="empty-state-minor">Nenhum local cadastrado</div>`;
      return;
    }

    let optionsHtml = Array.from(locais)
      .map((l) => `<option value="${l}">${l}</option>`)
      .join("");

    container.innerHTML = `
      <select id="filter-local-select" class="filter-select">
        ${optionsHtml}
      </select>
    `;
  }
}

/**
 * Limpa o filtro e volta para "Geral"
 */
window.clearFilter = function () {
  activeFilter = { type: "geral", value: null };
  updateFilterChipsUI();
  const dynamicSection = document.getElementById("dynamic-filter-section");
  if (dynamicSection) dynamicSection.style.display = "none";
  applyDashboardFilter();
  toggleFilterModal();
};

/**
 * Aplica o filtro selecionado
 */
window.applyDashboardFilter = function () {
  const type = activeFilter.type;
  let value = null;

  if (type === "mes") {
    const input = document.getElementById("filter-mes-input");
    value = input ? input.value : null;
    if (!value) {
      window.showToast("Selecione o mês", "warning");
      return;
    }
  } else if (type === "periodo") {
    const start = document.getElementById("filter-date-start")?.value;
    const end = document.getElementById("filter-date-end")?.value;
    if (!start || !end) {
      window.showToast("Preencha as datas", "warning");
      return;
    }
    if (new Date(start) > new Date(end)) {
      window.showToast("Data inválida", "warning");
      return;
    }
    value = { start, end };
  } else if (type === "local") {
    const select = document.getElementById("filter-local-select");
    value = select ? select.value : null;
    if (!value) {
      window.showToast("Selecione um local", "warning");
      return;
    }
  }

  activeFilter.value = value;
  toggleFilterModal();
  updateFilterIndicator();
  processDashboardData(window.marketListData);
};

function applyCurrentFilter(data) {
  if (activeFilter.type === "geral") return data;
  if (activeFilter.type === "mes") {
    const [year, month] = activeFilter.value.split("-");
    return data.filter((list) => {
      const d = new Date(list.date);
      return (
        d.getFullYear() === parseInt(year) &&
        d.getMonth() + 1 === parseInt(month)
      );
    });
  }
  if (activeFilter.type === "periodo") {
    const s = new Date(activeFilter.value.start);
    const e = new Date(activeFilter.value.end);
    return data.filter((list) => {
      const d = new Date(list.date);
      return d >= s && d <= e;
    });
  }
  if (activeFilter.type === "local") {
    return data.filter((list) => list.location === activeFilter.value);
  }
  return data;
}

function updateFilterIndicator() {
  const indicator = document.getElementById("active-filter-indicator");
  const textEl = document.getElementById("filter-text-display");

  if (!indicator || !textEl) return;

  let text = "";
  if (activeFilter.type === "geral") {
    text = "Geral (Tudo)";
    indicator.style.display = "none";
  } else {
    indicator.style.display = "flex";
    if (activeFilter.type === "mes") {
      const [year, month] = activeFilter.value.split("-");
      const d = new Date(parseInt(year), parseInt(month) - 1, 1);
      text = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    } else if (activeFilter.type === "periodo") {
      text = `${formatDateBRL(activeFilter.value.start)} - ${formatDateBRL(activeFilter.value.end)}`;
    } else if (activeFilter.type === "local") {
      text = activeFilter.value;
    }
  }

  textEl.innerText = text;
}

/* ==========================================================================
   UTILITÁRIOS INTERNOS DE UI E DATA
   ========================================================================== */

function showEmptyChartText(canvasId, text) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (canvasId === "chart-share-wallet" && chartShareWallet)
    chartShareWallet.destroy();
  if (canvasId === "chart-perfil-saude" && chartPerfilSaude)
    chartPerfilSaude.destroy();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#57636c";
  ctx.font = "italic 13px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
}

/**
 * Lógica: Exibe um estado vazio com imagem quando não há dados para o filtro aplicado.
 */
function renderEmptyState() {
  const dashboardContent = document.querySelector(".dashboard-content");
  const emptyStateContainer = document.getElementById("dashboard-empty-state");

  // Oculta o conteúdo principal
  if (dashboardContent) dashboardContent.style.display = "none";

  // Exibe o container de estado vazio com imagem e mensagem
  if (emptyStateContainer) {
    emptyStateContainer.style.display = "flex";
    emptyStateContainer.innerHTML = `
      <img src="assets/no-results.png" alt="Nenhum resultado" onerror="this.src='https://cdn-icons-png.flaticon.com/512/6134/6134065.png'">
      <h3>Nenhuma compra encontrada</h3>
      <p>Não encontramos registros para o filtro aplicado. Tente selecionar outro período ou local.</p>
    `;
  }
}

const formatDateBRL = (dateStr) => {
  if (!dateStr) return "";
  const [year, month, day] = dateStr.split("-");
  return `${day}/${month}`;
};

const formatDateBRLMini = (dateStr) => {
  if (!dateStr) return "";
  const [year, month, day] = dateStr.split("-");
  return `${day}/${month}`;
};

// Fechar modal ao clicar no backdrop
document.addEventListener("click", function (event) {
  const modal = document.getElementById("filter-modal");
  const backdrop = document.querySelector(".modal-backdrop");

  if (
    event.target === backdrop &&
    modal &&
    modal.classList.contains("modal-visible")
  ) {
    toggleFilterModal();
  }
});
