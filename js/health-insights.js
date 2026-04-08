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

/* ==========================================================================
   MOTOR DE CLASSIFICAÇÃO DE SAÚDE — SISTEMA DE SCORE PONDERADO
   ========================================================================== */

/**
 * Regras de override com precedência ABSOLUTA.
 * Se qualquer token desta lista for encontrado no nome normalizado do item,
 * a categoria é definida imediatamente, sem passar pelo sistema de score.
 *
 * Ordem de verificação: nonFood → processed → healthy
 * Isso garante que itens de higiene/limpeza nunca sejam classificados como
 * saudáveis mesmo que contenham palavras como "aloe vera" ou "coco".
 */
const HEALTH_CLASSIFICATION_OVERRIDE_RULES = {
  // Itens não-alimentares: higiene, limpeza, descartáveis
  nonFood: [
    "absorvente",
    "barbeador",
    "detergente",
    "sabao",
    "sabonete",
    "shampoo",
    "condicionador",
    "desodorante",
    "pasta de dente",
    "creme dental",
    "fio dental",
    "escova de dente",
    "papel higienico",
    "papel toalha",
    "lenco umedecido",
    "lenco de papel",
    "guardanapo",
    "fralda",
    "cotonete",
    "algodao",
    "curativo",
    "band aid",
    "esponja",
    "bucha",
    "pano de prato",
    "pano multiuso",
    "vassoura",
    "rodo",
    "agua sanitaria",
    "hipoclorito",
    "desinfetante",
    "multiuso",
    "limpador",
    "amaciante",
    "alvejante",
    "tira manchas",
    "luva de borracha",
    "saco de lixo",
    "rolo de lixo",
    "isqueiro",
    "pilha",
    "lampada",
    "vela",
    "inseticida",
    "repelente",
    "aromatizador",
    "ar freshener",
    "perfume",
    "colonia",
    "maquiagem",
    "batom",
    "esmalte",
    "removedor de esmalte",
    "creme para cabelo",
    "mascara capilar",
    "tinta de cabelo",
    "aparelho de barbear",
    "la de aco",
  ],
  // Ultraprocessados com precedência sobre keywords saudáveis
  // Ex: "biscoito de polvilho com queijo" contém "polvilho" e "queijo" (healthy),
  // mas "biscoito" aqui garante a classificação correta como processado
  processed: [
    "biscoito",
    "bolacha",
    "wafer",
    "cream cracker",
    "salgadinho",
    "chips",
    "cheetos",
    "doritos",
    "ruffles",
    "fandangos",
    "barra de cereal",
    "barra cereal",
    "granola bar",
    "miojo",
    "lamen",
    "ramen",
    "macarrao instantaneo",
    "cup noodles",
    "lasanha congelada",
    "pizza congelada",
    "hamburguer",
    "burger",
    "nugget",
    "salsicha",
    "mortadela",
    "presunto",
    "linguica",
    "calabresa",
    "pepperoni",
    "salame",
    "bacon",
    "apresuntado",
    "copa fatiada",
    "pao de forma",
    "pao hot dog",
    "pao hamburguer",
    "bisnaguinha",
    "refrigerante",
    "energetico",
    "achocolatado",
    "nescau",
    "toddy",
    "ovomaltine",
    "sorvete",
    "gelatina",
    "pudim",
    "brigadeiro",
    "chocolate",
    "bombom",
    "bala",
    "pirulito",
    "drops",
    "chiclete",
    "margarina",
    "creme vegetal",
    "maionese",
    "ketchup",
    "mostarda",
    "molho shoyu",
    "sazon",
    "caldo knorr",
    "caldo de galinha",
    "tempero pronto",
    "maggi",
    "paçoca",
    "cocada",
    "goiabada",
    "geleia",
    "doce de leite",
    "bis",
    "kitkat",
    "snickers",
    "twix",
    "oreo",
    "negresco",
    "trakinas",
    "maizena biscoito",
    "charque",            // carne bovina salgada e desidratada — produto curado
    "carne seca",         // similar ao charque, curada com sal
    "carne de sol",       // carne salgada e seca ao sol — produto curado/salgado
    "barriga",       // corte gordo/curado: "barriga salgada", "barriga de porco"
    "toucinho",
    "banha",
    "torresmo",
    "churrasco misto",
    "costela de porco",
    "pernil",
    "copa lombo",
    "linguica toscana",
    "linguica calabresa",
    "calabresa defumada",
  ],
};

/* ==========================================================================
   TERCEIRA CAMADA — PREFIXOS CONTAMINANTES E CONTEXTO COMPOSTO
   ========================================================================== */

/**
 * Prefixos que "contaminam" o contexto de qualquer ingrediente que os segue,
 * sinalizando que o produto é industrializado independentemente do ingrediente.
 *
 * Exemplos de falsos positivos corrigidos por esta camada:
 *   "Molho de Tomate Heinz"  → "molho de" contamina "tomate" → Processado
 *   "Suco de Laranja Del Valle" → "suco de" contamina "laranja" → Processado
 *   "Extrato de Tomate" → "extrato de" contamina "tomate" → Processado
 *   "Caldo de Carne Knorr" → "caldo de" contamina "carne" → Processado
 *   "Creme de Milho" → "creme de" contamina "milho" → Processado
 *   "Doce de Leite" → "doce de" contamina "leite" → Processado
 *   "Leite Condensado" → "condensado" contamina todo o contexto → Processado
 *
 * A verificação é feita por `.includes()` sobre o nome completo normalizado,
 * então captura tanto "molho de tomate" quanto "molho tomate caseiro".
 */
const HEALTH_CLASSIFICATION_CONTAMINATING_PREFIXES = [
  "molho de",
  "molho para",
  "extrato de",
  "suco de",
  "suco em",
  "nectar de",
  "refresco de",
  "drink de",
  "caldo de",
  "creme de milho",
  "creme de cebola",
  "doce de",
  "geleia de",
  "compota de",
  "conserva de",
  "catchup de",
  "pure de",         // purê industrializado: "purê de batata instantâneo"
  "farofa de",       // farofa temperada/industrializada
  "sopao de",
  "sopa de",         // sopas em pó/caixinha industrializadas
  "mistura para",    // "mistura para bolo", "mistura para panqueca"
  "po para",         // "pó para pudim", "pó para gelatina"
  "tempero para",
  "base para",
  "condensado",      // leite condensado
  "em lata",
  "em caixa",
  "em po",
  "instantaneo",
  "instantanea",
  "pronto para",
  "pronta para",
  "semi pronto",
  "pre cozido",
  "pre frito",
  "defumado",        // qualquer defumado é processado/curado
  "curado",
  "em conserva",
  "fatiado",         // frios fatiados embalados
  "tipo hamburguer",
  "sabor",           // "biscoito sabor chocolate" — reforça contexto industrializado
];

/**
 * Regras de contexto composto: pares ou grupos de tokens que, quando encontrados
 * simultaneamente no nome do item, definem a categoria como "processed".
 *
 * Cada regra é um array de tokens — TODOS devem estar presentes no nome
 * normalizado para a regra disparar (operação AND entre os tokens).
 *
 * Exemplos de falsos positivos corrigidos:
 *   ["batata", "frita"]   → "Batata Frita Congelada Mc Cain" → Processado
 *   ["frango", "frito"]   → "Frango Frito Empanado" → Processado
 *   ["pao", "recheado"]   → "Pão Recheado de Queijo" → Processado
 *   ["leite", "achocolatado"] → Processado (achocolatado já tem override, mas reforça)
 *   ["tomate", "pelado"]  → tomate pelado em lata → Processado
 *   ["milho", "verde", "lata"] → milho verde em lata → Processado
 */
const HEALTH_CLASSIFICATION_COMPOSITE_RULES = [
  // Frituras e empanados
  ["batata", "frita"],
  ["batata", "palha"],
  ["batata", "chips"],
  ["frango", "frito"],
  ["frango", "empanado"],
  ["peixe", "empanado"],
  ["peixe", "frito"],
  // Pães recheados e industrializados
  ["pao", "recheado"],
  ["pao", "recheio"],
  ["pao", "doce"],
  // Laticínios industrializados
  ["leite", "condensado"],
  ["leite", "achocolatado"],
  ["leite", "fermentado"],     // bebidas lácteas com açúcar
  ["queijo", "processado"],
  ["queijo", "prato fatiado"],
  ["queijo", "coalho frito"],
  // Conservas e enlatados
  ["tomate", "pelado"],
  ["tomate", "extrato"],
  ["milho", "lata"],
  ["atum", "oleo"],            // atum em óleo (mais processado que ao natural)
  ["sardinha", "molho"],
  // Pratos prontos / ultraprocessados compostos
  ["arroz", "temperado"],
  ["arroz", "pronto"],
  ["feijao", "pronto"],
  ["feijao", "temperado"],
  ["macarrao", "molho"],
  ["frango", "temperado", "congelado"],
  // Bebidas compostas industrializadas
  ["agua", "saborizada"],
  ["agua", "coco", "caixinha"],
  ["leite", "caixinha", "sabor"],
];

/**
 * Dicionário de keywords ponderadas por categoria de saúde.
 * Cada entrada é um par [keyword, peso].
 * Peso positivo → contribui para "healthy"
 * Peso negativo → contribui para "processed"
 *
 * O score final de cada categoria é a soma dos pesos dos tokens encontrados.
 * A categoria com maior score vence.
 * Empate ou score zero → "others".
 */
const HEALTH_CLASSIFICATION_WEIGHTED_KEYWORDS = {
  // Saudáveis / Minimamente processados
  healthy: [
    // Grãos e leguminosas — alto peso: base da dieta saudável
    ["feijao", 10],
    ["arroz", 10],
    ["lentilha", 10],
    ["grao de bico", 10],
    ["ervilha", 10],
    ["amendoim", 8],
    ["aveia", 10],
    ["quinoa", 10],
    ["chia", 10],
    ["linhaca", 10],
    ["milho", 8],
    ["trigo integral", 9],
    ["cevada", 9],
    // Farinhas e amidos básicos — peso médio: podem ser saudáveis ou base neutra
    ["farinha de trigo", 6],
    ["farinha integral", 8],
    ["farinha de arroz", 7],
    ["farinha de milho", 7],
    ["amido de milho", 5],
    ["fuba", 7],
    ["polvilho", 5],
    ["tapioca", 7],
    ["beiju", 7],
    // Massas simples — peso baixo: carboidrato básico, não ultraprocessado
    ["macarrao", 5],
    ["espaguete", 5],
    ["parafuso", 5],
    ["penne", 5],
    ["lasanha", 4],
    ["talharim", 5],
    ["fusilli", 5],
    // Proteínas saudáveis — peso alto
    ["frango", 9],
    ["peixe", 10],
    ["file de peixe", 10],
    ["file de frango", 10],
    ["peito de frango", 10],
    ["coxa de frango", 9],
    ["asa de frango", 8],
    ["patinho", 9],
    ["musculo", 9],
    ["alcatra", 9],
    ["coxao mole", 9],
    ["coxao duro", 9],
    ["contra file", 8],
    ["picanha", 9],
    ["acem", 7],
    // Cortes bovinos — adicionados para corrigir falso negativo em "carne moida", "chupa molho" etc.
    ["carne", 8],           // genérico: captura "carne moída", "carne bovina", "carne de sol"
    ["carne moida", 9],     // moída não é processada — é proteína in natura
    ["carne bovina", 9],    // explícito para nomes mais descritivos
    ["maminha", 9],         // corte traseiro bovino, magro
    ["fraldinha", 9],       // corte dianteiro bovino, levemente gorduroso mas não processado
    ["file mignon", 10],    // corte nobre, proteína magra
    ["lagarto", 9],         // corte bovino traseiro, magro
    ["acougue", 8],         // contexto de açougue sinaliza produto in natura
    ["costela bovina", 9],  // diferencia de "costela de porco" (override processed)
    ["chupa", 7],           // captura "chupa molho" — corte bovino de costela
    ["cupim", 7],           // corte bovino, diferente de cupim processado/curado
    ["paleta", 8],          // corte dianteiro bovino, versátil e in natura
    ["sardinha", 10],
    ["atum", 9],
    ["camarao", 10],
    ["tilapia", 10],
    ["bacalhau", 9],
    ["salmao", 10],
    // Peixes regionais — peso alto: proteínas in natura frequentes no mercado brasileiro
    ["linguado", 10],
    ["cacao", 10],          // peixe de água doce comum no nordeste
    ["dourado", 10],        // peixe de rio, proteína magra
    ["pirarucu", 10],       // peixe amazônico, alta proteína
    ["tambaqui", 10],       // peixe de rio, muito consumido no norte/nordeste
    ["pintado", 10],        // peixe de rio, proteína magra
    ["truta", 10],          // peixe de água fria, rica em ômega-3
    ["corvina", 10],        // peixe marinho comum no sul/sudeste
    ["robalo", 10],         // peixe marinho nobre
    ["badejo", 10],         // peixe marinho, proteína magra
    // Frutos do mar — peso alto: proteínas in natura de origem marinha
    ["lula", 10],
    ["polvo", 10],
    ["marisco", 10],
    ["ostra", 10],
    ["mexilhao", 10],
    ["vieira", 10],
    ["lagosta", 10],
    ["siri", 10],
    ["ovo", 9],
    ["ovos", 9],
    ["placa de ovos", 9],
    // Laticínios básicos — peso médio/alto
    ["leite", 8],
    ["iogurte", 8],
    ["iogurte natural", 9],
    ["queijo minas", 9],
    ["queijo frescal", 9],
    ["ricota", 10],
    ["cottage", 9],
    ["coalhada", 9],
    ["requeijao", 6],
    ["manteiga", 6],
    ["creme de leite", 5],
    // Frutas — peso alto
    ["banana", 9],
    ["maca", 9],
    ["pera", 9],
    ["uva", 9],
    ["laranja", 9],
    ["limao", 9],
    ["abacaxi", 9],
    ["mamao", 9],
    ["melancia", 9],
    ["melao", 9],
    ["manga", 9],
    ["morango", 9],
    ["acerola", 9],
    ["goiaba", 9],
    ["maracuja", 9],
    ["abacate", 9],
    ["caju", 9],
    ["coco", 8],
    ["kiwi", 9],
    ["pessego", 9],
    ["ameixa", 9],
    ["fruta", 8],
    // Verduras e legumes — peso alto
    ["alface", 10],
    ["rucula", 10],
    ["espinafre", 10],
    ["couve", 10],
    ["brocolis", 10],
    ["repolho", 10],
    ["cenoura", 10],
    ["beterraba", 10],
    ["batata", 8],
    ["batata doce", 10],
    ["mandioca", 9],
    ["aipim", 9],
    ["macaxeira", 9],
    ["inhame", 9],
    ["chuchu", 10],
    ["abobrinha", 10],
    ["pepino", 10],
    ["tomate", 10],
    ["cebola", 9],
    ["alho", 9],
    ["pimentao", 10],
    ["berinjela", 10],
    ["quiabo", 10],
    ["jilo", 10],
    ["abobora", 10],
    ["milho verde", 9],
    ["couve flor", 10],
    ["acelga", 10],
    ["agriao", 10],
    ["salsa", 9],
    ["cebolinha", 9],
    ["verdura", 9],
    ["legume", 9],
    ["hortalica", 9],
    ["hortifruti", 9],
    // Óleos naturais e temperos básicos — peso médio
    ["azeite", 9],
    ["azeite de oliva", 10],
    ["oleo de coco", 7],
    ["vinagre", 7],
    ["sal", 4],
    ["pimenta", 6],
    ["oregano", 7],
    ["alecrim", 7],
    ["manjericao", 7],
    ["canela", 6],
    ["gengibre", 8],
    ["curcuma", 8],
    ["colorau", 6],
    ["cominho", 7],
    ["louro", 7],
    ["pimenta do reino", 7],
    // Açúcar básico e adoçantes naturais — peso baixo
    ["acucar", 4],
    ["mel", 7],
    ["rapadura", 6],
    ["stevia", 8],
    ["eritritol", 8],
  ],
  // Ultraprocessados / Menos saudáveis — confirmam a classificação como "processed"
  // quando não há override absoluto mas o contexto aponta para processado
  processed: [
    // Biscoitos e salgadinhos (fallback — os principais estão nos overrides)
    ["biscoito", 10],
    ["bolacha", 10],
    ["salgadinho", 10],
    ["chips", 10],
    // Bebidas industrializadas
    ["refrigerante", 10],
    ["coca cola", 10],
    ["pepsi", 10],
    ["guarana", 9],
    ["fanta", 10],
    ["sprite", 10],
    ["suco de caixa", 9],
    ["suco integral caixa", 7],
    ["energetico", 10],
    ["red bull", 10],
    ["cerveja", 8],
    ["vinho", 7],
    ["whisky", 9],
    ["vodka", 9],
    ["cachaca", 9],
    ["bebida alcoolica", 10],
    ["isotonico", 7],
    ["nescau", 9],
    ["achocolatado", 9],
    // Embutidos e frios (fallback)
    ["salsicha", 10],
    ["presunto", 9],
    ["mortadela", 10],
    ["linguica", 9],
    ["calabresa", 9],
    ["bacon", 10],
    ["pepperoni", 10],
    ["salame", 10],
    ["nugget", 10],
    ["hamburguer", 10],
    ["embutido", 10],
    // Doces e sobremesas industrializadas
    ["chocolate", 8],
    ["bombom", 10],
    ["bala", 10],
    ["pirulito", 10],
    ["sorvete", 9],
    ["gelatina", 8],
    ["pudim", 9],
    ["doce", 7],
    ["brigadeiro", 9],
    ["bis", 9],
    ["kitkat", 10],
    ["snickers", 10],
    ["paçoca", 8],
    ["cocada", 8],
    ["goiabada", 8],
    ["geleia", 7],
    // Comidas congeladas e prontas
    ["congelado", 9],
    ["miojo", 10],
    ["lamen", 10],
    ["macarrao instantaneo", 10],
    ["cup noodles", 10],
    // Molhos e temperos industrializados
    ["ketchup", 9],
    ["maionese", 9],
    ["mostarda", 7],
    ["molho shoyu", 8],
    ["caldo knorr", 10],
    ["sazon", 10],
    ["tempero pronto", 10],
    ["maggi", 10],
    // Pães industrializados
    ["pao de forma", 9],
    ["bisnaguinha", 9],
    // Gorduras industrializadas
    ["margarina", 10],
    ["creme vegetal", 10],
  ],
};

window.HEALTH_ITEM_CLASSIFICATION = HEALTH_CLASSIFICATION_WEIGHTED_KEYWORDS;

/**
 * Classifica um item de mercado em uma categoria de saúde usando o motor
 * de quatro etapas em ordem de precedência decrescente.
 *
 * Etapas da classificação:
 *  1. Overrides absolutos (nonFood → processed):
 *     Token único que define a categoria imediatamente.
 *     Ex: "biscoito", "absorvente", "mortadela".
 *
 *  2. Prefixos contaminantes → sempre "processed":
 *     Prefixos que indicam industrialização independente do ingrediente seguinte.
 *     Ex: "molho de tomate", "suco de laranja", "caldo de carne", "defumado".
 *
 *  3. Contexto composto → sempre "processed":
 *     Combinação de dois ou mais tokens que juntos indicam ultraprocessado.
 *     Ex: ["batata","frita"], ["leite","condensado"], ["arroz","pronto"].
 *     Todos os tokens da regra devem estar presentes no nome (operação AND).
 *
 *  4. Score ponderado:
 *     Soma dos pesos de cada keyword encontrada por categoria.
 *     A categoria com maior score acumulado vence.
 *     Empate ou score zero → "others".
 *
 * @param {string} normalizedItemName - Nome do item já normalizado (sem acentos, minúsculas)
 * @returns {"healthy"|"processed"|"others"} Categoria de saúde classificada
 */
function classifyItemByHealthProfile(normalizedItemName) {
  // ETAPA 1: Verifica overrides absolutos por ordem de precedência
  const overrideCategories = ["nonFood", "processed"];
  for (const overrideCategory of overrideCategories) {
    const overrideTokenList = HEALTH_CLASSIFICATION_OVERRIDE_RULES[overrideCategory];
    const hasOverrideMatch = overrideTokenList.some((overrideToken) =>
      normalizedItemName.includes(window.normalizeString(overrideToken)),
    );
    if (hasOverrideMatch) {
      // nonFood é mapeado para "others" na interface de exibição
      return overrideCategory === "nonFood" ? "others" : "processed";
    }
  }

  // ETAPA 2: Verifica prefixos contaminantes — indicam industrialização do produto
  const hasContaminatingPrefix = HEALTH_CLASSIFICATION_CONTAMINATING_PREFIXES.some(
    (contaminatingPrefix) =>
      normalizedItemName.includes(window.normalizeString(contaminatingPrefix)),
  );
  if (hasContaminatingPrefix) return "processed";

  // ETAPA 3: Verifica regras de contexto composto (operação AND entre tokens)
  // Todos os tokens de uma regra devem estar presentes no nome para ela disparar
  const hasCompositeRuleMatch = HEALTH_CLASSIFICATION_COMPOSITE_RULES.some(
    (compositeTokenGroup) =>
      compositeTokenGroup.every((compositeToken) =>
        normalizedItemName.includes(window.normalizeString(compositeToken)),
      ),
  );
  if (hasCompositeRuleMatch) return "processed";

  // ETAPA 4: Calcula score ponderado para cada categoria
  let healthyAccumulatedScore = 0;
  let processedAccumulatedScore = 0;

  HEALTH_CLASSIFICATION_WEIGHTED_KEYWORDS.healthy.forEach(([keyword, weight]) => {
    if (normalizedItemName.includes(window.normalizeString(keyword))) {
      healthyAccumulatedScore += weight;
    }
  });

  HEALTH_CLASSIFICATION_WEIGHTED_KEYWORDS.processed.forEach(([keyword, weight]) => {
    if (normalizedItemName.includes(window.normalizeString(keyword))) {
      processedAccumulatedScore += weight;
    }
  });

  // Retorna a categoria vencedora pelo maior score acumulado
  if (healthyAccumulatedScore > 0 || processedAccumulatedScore > 0) {
    if (healthyAccumulatedScore > processedAccumulatedScore) return "healthy";
    if (processedAccumulatedScore > healthyAccumulatedScore) return "processed";
    // Empate exato entre os dois scores → "others" por segurança
    return "others";
  }

  // Nenhum token reconhecido em nenhuma etapa → categoria indefinida
  return "others";
}

// Exporta globalmente para reuso em outros módulos (ex: price chart)
window.classifyItemByHealthProfile = classifyItemByHealthProfile;

/**
 * Verifica se um item normalizado pertence à categoria nonFood (higiene, limpeza, descartáveis).
 * Utilizado para excluir esses itens tanto do gráfico de perfil de compra quanto
 * dos cards de categoria, evitando que produtos de higiene apareçam como "Outros".
 *
 * @param {string} normalizedItemName - Nome do item já normalizado (sem acentos, minúsculas)
 * @returns {boolean} true se o item for classificado como nonFood
 */
function isNonFoodItem(normalizedItemName) {
  return HEALTH_CLASSIFICATION_OVERRIDE_RULES.nonFood.some((nonFoodToken) =>
    normalizedItemName.includes(window.normalizeString(nonFoodToken)),
  );
}

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
 * Classifica cada item individualmente pelo seu nome usando o motor de
 * score ponderado com overrides absolutos (classifyItemByHealthProfile).
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

        // Exclui itens não-alimentares (higiene, limpeza) do gráfico de perfil de compra
        if (isNonFoodItem(normalizedItemName)) return;

        let price = item.price || item.totalValue;

        price = parseFloat(price.replace(/\./g, "").replace(",", "."));

        // Ignora valores que não puderam ser convertidos para número válido
        if (isNaN(price)) return;

        const quantity = item.quantity || 1;
        const totalItemValue = price * quantity;

        // Classifica o item pelo motor de score ponderado com overrides absolutos
        const healthCategory = classifyItemByHealthProfile(normalizedItemName);

        if (healthCategory === "healthy") healthyTotal += totalItemValue;
        else if (healthCategory === "processed") processedTotal += totalItemValue;
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

        // Exclui itens não-alimentares (higiene, limpeza) dos cards de categoria
        if (isNonFoodItem(normalizedItemName)) return;

        const displayName = window.sanitizeHtmlInput
          ? window.sanitizeHtmlInput(item.name)
          : item.name;

        // Classifica o item pelo motor de score ponderado com overrides absolutos
        const healthCategory = classifyItemByHealthProfile(normalizedItemName);

        itemNamesByHealthCategory[healthCategory].add(displayName);
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
