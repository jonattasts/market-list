/* ==========================================================================
   MÓDULO: INSIGHTS DE SAÚDE - ANÁLISE DE PERFIL DE COMPRA E SAZONALIDADE
   ========================================================================= */

/**
 * Carrega e renderiza o módulo de Insights de Saúde
 * Inclui:
 * - Ratio Ultraprocessados vs Saudáveis (Gráfico)
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
 * Métrica 4.A: Ratio Ultraprocessados vs Saudáveis
 *
 * Classifica cada item individualmente pelo seu nome usando palavras-chave.
 * Soma o valor total gasto (preço x quantidade) de itens comprados (checked)
 * em cada categoria de saúde: saudável, processado e outros.
 *
 * @param {Array} filteredLists - Listas filtradas pelo filtro ativo
 */
function calculateHealthRatio(filteredLists) {
  // Palavras-chave para classificação individual de itens
  const itemClassification = {
    // Saudáveis / Minimamente processados / Saudáveis
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

  let healthyTotal = 0;
  let processedTotal = 0;
  let othersTotal = 0;

  // Itera individualmente em cada item comprado de cada lista
  filteredLists.forEach((list) => {
    (list.categories || []).forEach((category) => {
      category.items.forEach((item) => {
        // Considera apenas itens efetivamente comprados (checked)
        if (!item.checked) return;

        const normalizedItemName = window.normalizeString(item.name);
        const unitValue = parseFloat(
          item.price.replace(/\./g, "").replace(",", "."),
        );
        const quantity = item.quantity || 1;
        const totalItemValue = unitValue * quantity;

        // Classifica o item pelo seu nome individualmente
        const isHealthy = itemClassification.healthy.some((keyword) =>
          normalizedItemName.includes(window.normalizeString(keyword)),
        );
        const isProcessed = itemClassification.processed.some((keyword) =>
          normalizedItemName.includes(window.normalizeString(keyword)),
        );

        if (isHealthy) healthyTotal += totalItemValue;
        else if (isProcessed) processedTotal += totalItemValue;
        else othersTotal += totalItemValue;
      });
    });
  });

  renderHealthRatioChart(healthyTotal, processedTotal, othersTotal);
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
  const currentLegendColor = isDark ? "rgba(255,255,255,0.7)" : "rgba(20, 24, 27, 0.7)";

  /* CORRIGIDO: Cor de "Outros" alterada de rgba(20, 24, 27, 0.3) — invisível no dark —
     para uma cor neutra visível nos dois temas (cinza médio com boa opacidade) */
  const othersSliceColor = isDark ? "rgba(180, 180, 195, 0.5)" : "rgba(120, 120, 140, 0.4)";

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
