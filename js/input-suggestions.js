/* ==========================================================================
   MÓDULO GENÉRICO DE SUGESTÕES DE AUTOCOMPLETE
   Baseado nos dados em cache (window.marketListData) do próprio usuário.
   Pode ser utilizado em qualquer tela passando os parâmetros corretos.
   ========================================================================== */

/* ==========================================================================
   CONTROLE INTERNO DE ESTADO
   ========================================================================== */

// Mapa de timers de debounce por campo de input — evita múltiplos disparos simultâneos
const debounceTimerMap = new Map();

// Mapa de referências de dropdown aberto por campo de input — permite fechar o anterior
const activeDropdownMap = new Map();

/* ==========================================================================
   SIMILARIDADE DE STRINGS — ALGORITMO DE JARO-WINKLER
   ========================================================================== */

/**
 * Calcula a similaridade de Jaro entre duas strings normalizadas.
 * Retorna um valor entre 0 (totalmente diferentes) e 1 (idênticas).
 *
 * @param {string} firstString - Primeira string para comparação
 * @param {string} secondString - Segunda string para comparação
 * @returns {number} Similaridade entre 0 e 1
 */
function calculateJaroSimilarity(firstString, secondString) {
  if (firstString === secondString) return 1;
  if (firstString.length === 0 || secondString.length === 0) return 0;

  // Janela de correspondência: metade do maior comprimento menos 1
  const matchWindow =
    Math.floor(Math.max(firstString.length, secondString.length) / 2) - 1;
  if (matchWindow < 0) return 0;

  const firstMatches = new Array(firstString.length).fill(false);
  const secondMatches = new Array(secondString.length).fill(false);

  let matchCount = 0;
  let transpositionCount = 0;

  // Conta correspondências dentro da janela
  for (let firstIndex = 0; firstIndex < firstString.length; firstIndex++) {
    const startIndex = Math.max(0, firstIndex - matchWindow);
    const endIndex = Math.min(
      secondString.length - 1,
      firstIndex + matchWindow,
    );

    for (let secondIndex = startIndex; secondIndex <= endIndex; secondIndex++) {
      if (
        secondMatches[secondIndex] ||
        firstString[firstIndex] !== secondString[secondIndex]
      )
        continue;
      firstMatches[firstIndex] = true;
      secondMatches[secondIndex] = true;
      matchCount++;
      break;
    }
  }

  if (matchCount === 0) return 0;

  // Conta transposições entre as correspondências encontradas
  let secondPointer = 0;
  for (let firstIndex = 0; firstIndex < firstString.length; firstIndex++) {
    if (!firstMatches[firstIndex]) continue;
    while (!secondMatches[secondPointer]) secondPointer++;
    if (firstString[firstIndex] !== secondString[secondPointer])
      transpositionCount++;
    secondPointer++;
  }

  return (
    (matchCount / firstString.length +
      matchCount / secondString.length +
      (matchCount - transpositionCount / 2) / matchCount) /
    3
  );
}

/**
 * Calcula a similaridade de Jaro-Winkler entre duas strings.
 * Dá peso extra para prefixos comuns (até 4 caracteres iniciais iguais),
 * tornando o algoritmo mais adequado para nomes de produtos com prefixo similar.
 *
 * @param {string} firstString - Primeira string para comparação
 * @param {string} secondString - Segunda string para comparação
 * @returns {number} Similaridade entre 0 e 1
 */
function calculateJaroWinklerSimilarity(firstString, secondString) {
  const jaroScore = calculateJaroSimilarity(firstString, secondString);

  // Calcula o comprimento do prefixo comum (máximo 4 caracteres)
  let commonPrefixLength = 0;
  const maxPrefixLength = Math.min(
    4,
    Math.min(firstString.length, secondString.length),
  );
  while (
    commonPrefixLength < maxPrefixLength &&
    firstString[commonPrefixLength] === secondString[commonPrefixLength]
  ) {
    commonPrefixLength++;
  }

  // Fator de escala padrão do Jaro-Winkler: 0.1
  return jaroScore + commonPrefixLength * 0.1 * (1 - jaroScore);
}

/* ==========================================================================
   EXTRAÇÃO E DEDUPLICAÇÃO DE NOMES DO CACHE
   ========================================================================== */

/**
 * Normaliza uma string para comparação semântica:
 * remove acentos, converte para minúsculas e elimina espaços extras.
 *
 * @param {string} rawString - String original
 * @returns {string} String normalizada
 */
function normalizeSuggestionString(rawString) {
  if (!rawString) return "";
  return rawString
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/**
 * Extrai todos os nomes de itens únicos de todas as listas em cache,
 * aplicando deduplicação por similaridade >= 90% (Jaro-Winkler).
 * Em caso de duplicata, mantém o nome com maior frequência de aparição.
 *
 * @returns {Array<{ name: string, frequency: number }>} Nomes deduplicados com frequência
 */
function extractDeduplicatedItemNamesFromCache() {
  if (!window.marketListData || window.marketListData.length === 0) return [];

  // Acumula frequência de cada nome encontrado no cache
  const nameFrequencyMap = new Map();

  window.marketListData.forEach((list) => {
    (list.categories || []).forEach((category) => {
      (category.items || []).forEach((item) => {
        if (!item.name || item.name.trim() === "") return;
        const cleanName = item.name.trim();
        nameFrequencyMap.set(
          cleanName,
          (nameFrequencyMap.get(cleanName) || 0) + 1,
        );
      });
    });
  });

  // Converte o mapa para array para aplicar deduplicação por similaridade
  const nameFrequencyEntries = Array.from(nameFrequencyMap.entries()).map(
    ([name, frequency]) => ({ name, frequency }),
  );

  // Deduplicação por similaridade >= 90%: agrupa nomes similares, mantendo o mais frequente
  const deduplicatedNames = [];

  nameFrequencyEntries.forEach((currentEntry) => {
    const normalizedCurrent = normalizeSuggestionString(currentEntry.name);

    // Verifica se já existe um nome similar no resultado deduplicado
    const similarIndex = deduplicatedNames.findIndex((existingEntry) => {
      const normalizedExisting = normalizeSuggestionString(existingEntry.name);
      const similarity = calculateJaroWinklerSimilarity(
        normalizedCurrent,
        normalizedExisting,
      );
      return similarity >= 0.9;
    });

    if (similarIndex === -1) {
      // Não encontrou similar: insere o nome como novo entry
      deduplicatedNames.push({ ...currentEntry });
    } else {
      // Encontrou similar: mantém o de maior frequência (ou o existente em empate)
      if (currentEntry.frequency > deduplicatedNames[similarIndex].frequency) {
        deduplicatedNames[similarIndex] = { ...currentEntry };
      }
    }
  });

  return deduplicatedNames;
}

/**
 * Extrai todos os nomes de categorias únicos de todas as listas em cache.
 * Aplica deduplicação por similaridade >= 90%.
 *
 * @returns {Array<{ name: string, frequency: number }>} Nomes deduplicados com frequência
 */
function extractDeduplicatedCategoryNamesFromCache() {
  if (!window.marketListData || window.marketListData.length === 0) return [];

  const nameFrequencyMap = new Map();

  window.marketListData.forEach((list) => {
    (list.categories || []).forEach((category) => {
      if (!category.name || category.name.trim() === "") return;
      const cleanName = category.name.trim();
      nameFrequencyMap.set(
        cleanName,
        (nameFrequencyMap.get(cleanName) || 0) + 1,
      );
    });
  });

  const nameFrequencyEntries = Array.from(nameFrequencyMap.entries()).map(
    ([name, frequency]) => ({ name, frequency }),
  );

  const deduplicatedNames = [];

  nameFrequencyEntries.forEach((currentEntry) => {
    const normalizedCurrent = normalizeSuggestionString(currentEntry.name);

    const similarIndex = deduplicatedNames.findIndex((existingEntry) => {
      const normalizedExisting = normalizeSuggestionString(existingEntry.name);
      const similarity = calculateJaroWinklerSimilarity(
        normalizedCurrent,
        normalizedExisting,
      );
      return similarity >= 0.9;
    });

    if (similarIndex === -1) {
      deduplicatedNames.push({ ...currentEntry });
    } else {
      if (currentEntry.frequency > deduplicatedNames[similarIndex].frequency) {
        deduplicatedNames[similarIndex] = { ...currentEntry };
      }
    }
  });

  return deduplicatedNames;
}

/**
 * Extrai todos os locais de compra únicos de todas as listas em cache.
 * Aplica deduplicação por similaridade >= 90% — útil para variações como
 * "Assaí" e "Assai Atacadista" ou "Carrefour" e "Carrefour Express".
 *
 * @returns {Array<{ name: string, frequency: number }>} Locais deduplicados com frequência
 */
function extractDeduplicatedLocationNamesFromCache() {
  if (!window.marketListData || window.marketListData.length === 0) return [];

  const nameFrequencyMap = new Map();

  window.marketListData.forEach((list) => {
    if (!list.location || list.location.trim() === "") return;
    const cleanName = list.location.trim();
    nameFrequencyMap.set(cleanName, (nameFrequencyMap.get(cleanName) || 0) + 1);
  });

  const nameFrequencyEntries = Array.from(nameFrequencyMap.entries()).map(
    ([name, frequency]) => ({ name, frequency }),
  );

  const deduplicatedNames = [];

  nameFrequencyEntries.forEach((currentEntry) => {
    const normalizedCurrent = normalizeSuggestionString(currentEntry.name);

    const similarIndex = deduplicatedNames.findIndex((existingEntry) => {
      const normalizedExisting = normalizeSuggestionString(existingEntry.name);
      const similarity = calculateJaroWinklerSimilarity(
        normalizedCurrent,
        normalizedExisting,
      );
      return similarity >= 0.9;
    });

    if (similarIndex === -1) {
      deduplicatedNames.push({ ...currentEntry });
    } else {
      // Mantém o local com maior frequência de uso
      if (currentEntry.frequency > deduplicatedNames[similarIndex].frequency) {
        deduplicatedNames[similarIndex] = { ...currentEntry };
      }
    }
  });

  return deduplicatedNames;
}

/**
 * Extrai todos os nomes de listas únicos de todas as listas em cache.
 * Aplica deduplicação por similaridade >= 90%.
 *
 * @returns {Array<{ name: string, frequency: number }>} Nomes deduplicados com frequência
 */
function extractDeduplicatedListNamesFromCache() {
  if (!window.marketListData || window.marketListData.length === 0) return [];

  const nameFrequencyMap = new Map();

  window.marketListData.forEach((list) => {
    if (!list.listName || list.listName.trim() === "") return;
    const cleanName = list.listName.trim();
    nameFrequencyMap.set(cleanName, (nameFrequencyMap.get(cleanName) || 0) + 1);
  });

  const nameFrequencyEntries = Array.from(nameFrequencyMap.entries()).map(
    ([name, frequency]) => ({ name, frequency }),
  );

  const deduplicatedNames = [];

  nameFrequencyEntries.forEach((currentEntry) => {
    const normalizedCurrent = normalizeSuggestionString(currentEntry.name);

    const similarIndex = deduplicatedNames.findIndex((existingEntry) => {
      const normalizedExisting = normalizeSuggestionString(existingEntry.name);
      const similarity = calculateJaroWinklerSimilarity(
        normalizedCurrent,
        normalizedExisting,
      );
      return similarity >= 0.9;
    });

    if (similarIndex === -1) {
      deduplicatedNames.push({ ...currentEntry });
    } else {
      if (currentEntry.frequency > deduplicatedNames[similarIndex].frequency) {
        deduplicatedNames[similarIndex] = { ...currentEntry };
      }
    }
  });

  return deduplicatedNames;
}

/* ==========================================================================
   FILTRAGEM DE SUGESTÕES PARA O CAMPO DIGITADO
   ========================================================================== */

/**
 * Filtra e ordena os candidatos de sugestão com base no texto digitado.
 * Prioriza correspondência por prefixo, depois por substring, depois por similaridade >= 60%.
 * Retorna no máximo os 3 primeiros resultados mais relevantes.
 *
 * @param {string} inputText - Texto atual do campo de input
 * @param {Array<{ name: string, frequency: number }>} candidateNames - Nomes disponíveis para sugestão
 * @returns {Array<string>} Até 3 sugestões ordenadas por relevância
 */
function filterSuggestionCandidates(inputText, candidateNames) {
  if (!inputText || inputText.trim().length < 2) return [];

  const normalizedInput = normalizeSuggestionString(inputText);

  const scoredCandidates = candidateNames
    .map((candidate) => {
      const normalizedCandidate = normalizeSuggestionString(candidate.name);

      // Pontuação de relevância: prefixo > substring > similaridade
      let relevanceScore = 0;

      if (normalizedCandidate.startsWith(normalizedInput)) {
        // Correspondência de prefixo: máxima prioridade
        relevanceScore = 3 + candidate.frequency * 0.01;
      } else if (normalizedCandidate.includes(normalizedInput)) {
        // Correspondência por substring: prioridade média
        relevanceScore = 2 + candidate.frequency * 0.01;
      } else {
        // Verifica similaridade fonética para capturar variações (ex: biscoito → biscoitos)
        const similarity = calculateJaroWinklerSimilarity(
          normalizedInput,
          normalizedCandidate,
        );
        if (similarity >= 0.6) {
          relevanceScore = similarity + candidate.frequency * 0.01;
        }
      }

      return { name: candidate.name, relevanceScore };
    })
    .filter((candidate) => candidate.relevanceScore > 0)
    .sort(
      (candidateA, candidateB) =>
        candidateB.relevanceScore - candidateA.relevanceScore,
    );

  // Retorna apenas os 3 nomes mais relevantes
  return scoredCandidates.slice(0, 3).map((candidate) => candidate.name);
}

/* ==========================================================================
   RENDERIZAÇÃO DO DROPDOWN DE SUGESTÕES
   ========================================================================== */

/**
 * Fecha e remove o dropdown de sugestões associado a um campo de input.
 * Não interfere em outros dropdowns ativos em outros campos.
 *
 * @param {HTMLElement} inputElement - Campo de input cujo dropdown deve ser fechado
 */
function closeSuggestionDropdown(inputElement) {
  const existingDropdown = activeDropdownMap.get(inputElement);
  if (existingDropdown && existingDropdown.parentNode) {
    existingDropdown.parentNode.removeChild(existingDropdown);
  }
  activeDropdownMap.delete(inputElement);
}

/**
 * Renderiza o dropdown de sugestões abaixo do campo de input.
 * Ao clicar em uma sugestão, preenche o campo e fecha o dropdown.
 *
 * @param {HTMLElement} inputElement - Campo de input que recebe o valor da sugestão
 * @param {Array<string>} suggestionNames - Lista de nomes a exibir como sugestões
 * @param {Function|null} onSelectCallback - Callback opcional chamado após seleção
 */
function renderSuggestionDropdown(
  inputElement,
  suggestionNames,
  onSelectCallback,
) {
  // Remove dropdown anterior deste campo antes de criar um novo
  closeSuggestionDropdown(inputElement);

  if (suggestionNames.length === 0) return;

  const dropdownElement = document.createElement("ul");
  dropdownElement.className = "suggestion-dropdown";

  // Posiciona o dropdown logo abaixo do campo de input
  const inputRect = inputElement.getBoundingClientRect();
  const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
  const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

  dropdownElement.style.position = "absolute";
  dropdownElement.style.top = `${inputRect.bottom + scrollTop}px`;
  dropdownElement.style.left = `${inputRect.left + scrollLeft}px`;
  dropdownElement.style.width = `${inputRect.width}px`;
  dropdownElement.style.zIndex = "9999";

  suggestionNames.forEach((suggestionName) => {
    const listItem = document.createElement("li");
    listItem.className = "suggestion-dropdown__item";
    listItem.textContent = suggestionName;

    // Usa mousedown em vez de click para disparar antes do blur do input
    listItem.addEventListener("mousedown", (event) => {
      event.preventDefault();
      inputElement.value = suggestionName;
      closeSuggestionDropdown(inputElement);
      if (typeof onSelectCallback === "function") {
        onSelectCallback(suggestionName);
      }
    });

    dropdownElement.appendChild(listItem);
  });

  document.body.appendChild(dropdownElement);
  activeDropdownMap.set(inputElement, dropdownElement);
}

/* ==========================================================================
   API PÚBLICA — INICIALIZAÇÃO DE SUGESTÕES EM UM CAMPO
   ========================================================================== */

/**
 * Tipos de fonte de dados disponíveis para as sugestões.
 * Passados como parâmetro sourceType em initInputSuggestions.
 */
const SUGGESTION_SOURCE_TYPES = {
  ITEM_NAME: "item",
  CATEGORY_NAME: "category",
  LIST_NAME: "list",
  LOCATION: "location",
};

/**
 * Inicializa o sistema de sugestões em um campo de input.
 * Genérico: funciona em qualquer tela passando o elemento e o tipo de fonte.
 *
 * Comportamento:
 * - Aguarda 300ms após a última digitação antes de buscar sugestões (debounce)
 * - Fecha o dropdown ao perder o foco (blur)
 * - Fecha automaticamente ao clicar fora do dropdown ou do campo
 * - Exibe no máximo 3 sugestões baseadas nos dados em cache do usuário
 *
 * @param {HTMLElement} inputElement - Campo de input alvo
 * @param {string} sourceType - Tipo de fonte: "item" | "category" | "list"
 * @param {Function|null} onSelectCallback - Callback chamado ao selecionar uma sugestão (opcional)
 */
window.initInputSuggestions = function (
  inputElement,
  sourceType,
  onSelectCallback = null,
) {
  if (!inputElement) return;

  // Handler de digitação com debounce de 300ms
  inputElement.addEventListener("input", () => {
    // Cancela o timer anterior para evitar buscas em cada tecla
    if (debounceTimerMap.has(inputElement)) {
      clearTimeout(debounceTimerMap.get(inputElement));
    }

    const debounceTimer = setTimeout(() => {
      const currentInputValue = inputElement.value;

      if (currentInputValue.trim().length < 2) {
        closeSuggestionDropdown(inputElement);
        return;
      }

      // Seleciona a fonte de dados correta baseada no tipo
      let candidateNames = [];
      if (sourceType === SUGGESTION_SOURCE_TYPES.ITEM_NAME) {
        candidateNames = extractDeduplicatedItemNamesFromCache();
      } else if (sourceType === SUGGESTION_SOURCE_TYPES.CATEGORY_NAME) {
        candidateNames = extractDeduplicatedCategoryNamesFromCache();
      } else if (sourceType === SUGGESTION_SOURCE_TYPES.LIST_NAME) {
        candidateNames = extractDeduplicatedListNamesFromCache();
      } else if (sourceType === SUGGESTION_SOURCE_TYPES.LOCATION) {
        candidateNames = extractDeduplicatedLocationNamesFromCache();
      }

      const filteredSuggestions = filterSuggestionCandidates(
        currentInputValue,
        candidateNames,
      );
      renderSuggestionDropdown(
        inputElement,
        filteredSuggestions,
        onSelectCallback,
      );
    }, 300);

    debounceTimerMap.set(inputElement, debounceTimer);
  });

  // Fecha o dropdown ao perder o foco (com pequeno atraso para permitir o mousedown da sugestão)
  inputElement.addEventListener("blur", () => {
    setTimeout(() => closeSuggestionDropdown(inputElement), 150);
  });
};

/**
 * Fecha manualmente o dropdown de sugestões de um campo de input.
 * Útil para fechar programaticamente ao salvar ou cancelar um formulário.
 *
 * @param {HTMLElement} inputElement - Campo de input cujo dropdown deve ser fechado
 */
window.closeSuggestionDropdownForInput = function (inputElement) {
  if (!inputElement) return;
  closeSuggestionDropdown(inputElement);
};

/**
 * Expõe os tipos de fonte de dados para uso externo nos módulos que chamam initInputSuggestions.
 */
window.SUGGESTION_SOURCE_TYPES = SUGGESTION_SOURCE_TYPES;
