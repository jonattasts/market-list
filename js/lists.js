/* ==========================================================================
   TELA: LISTAS DE COMPRAS
   ========================================================================== */

import { firebaseAuth } from "./firebase.js";

/* ==========================================================================
   SANITIZAÇÃO — DOMPARSER NATIVO
   ========================================================================== */

/**
 * Sanitiza uma string removendo tags HTML e scripts maliciosos.
 * Usa DOMParser nativo do browser para extrair apenas o texto em claro,
 * eliminando qualquer tentativa de injeção de HTML/XSS via dados do Firestore.
 *
 * @param {string} rawInput - Texto potencialmente inseguro vindo do banco de dados
 * @returns {string} Texto sanitizado sem tags HTML
 */
function sanitizeHtmlInput(rawInput) {
  if (!rawInput) return "";
  const documentParser = new DOMParser();
  const parsedDocument = documentParser.parseFromString(rawInput, "text/html");
  return parsedDocument.body.textContent || "";
}

// Flag de guard para evitar múltiplas chamadas simultâneas de exclusão de lista.
// Impede que um duplo clique no botão acione dois deleteDoc para o mesmo documento.
let isDeletingList = false;

/**
 * Exclui permanentemente uma lista do Firestore.
 * NÃO remove do array local - aguarda o onSnapshot atualizar automaticamente.
 */
window.confirmDeleteList = async function (listIndex) {
  // Guard contra duplo clique: impede exclusão simultânea da mesma lista
  if (isDeletingList) return;

  const listToDelete = window.marketListData[listIndex];
  const listName = listToDelete.listName;
  const listIdentifier = listToDelete.id;

  if (
    confirm(
      `Deseja excluir a "${listName}"? Esta ação não pode ser desfeita na nuvem.`,
    )
  ) {
    isDeletingList = true;

    try {
      // Importa ferramentas necessárias para deletar
      const { firestore, doc, deleteDoc } = await import("./firebase.js");

      // Remove do Firestore
      const listReference = doc(firestore, "lists", listIdentifier);
      await deleteDoc(listReference);

      // O onSnapshot no index.js atualizará o marketListData e chamará renderMarketLists()

      window.showToast("Lista removida com sucesso", "success");
    } catch (error) {
      console.error("Erro ao deletar:", error);
      window.showToast("Erro de conexão com o Servidor!", "danger");
    } finally {
      // Libera o guard independente de sucesso ou erro
      isDeletingList = false;
    }
  }
};

window.copyList = function (event, listIndex) {
  event.stopPropagation();
  window.isEditingListMode = false;
  window.isCopyingListMode = true;
  window.currentListIndex = listIndex;
  window.previousScreen = "market-lists-screen";

  const originalList = window.marketListData[listIndex];
  document.getElementById("form-title").innerText = "Copiar Lista";
  document.getElementById("button-save-list").innerText = "Confirmar Cópia";
  document.getElementById("new-list-name").value = originalList.listName;
  document.getElementById("new-list-location").value =
    originalList.location || "";
  document.getElementById("new-list-date").value = "";
  window.showScreen("new-list-screen");
};

window.handleEditListFromSwipe = function (listIndex) {
  window.currentListIndex = listIndex;
  window.previousScreen = "market-lists-screen";
  window.openEditListForm();
};

/* ==========================================================================
   SKELETON LOADING - FUNÇÕES DE CARREGAMENTO DA LISTA DE COMPRAS
   ========================================================================== */

/**
 * Retorna o HTML de um card skeleton que imita a estrutura do list-master-card
 */
function getListCardSkeletonTemplate() {
  return `
    <div class="skeleton-list-card-wrapper">
      <div class="skeleton-list skeleton-list-card-title"></div>
      <div class="skeleton-list skeleton-list-card-location"></div>
      <div class="skeleton-list skeleton-list-card-date"></div>
      <div class="skeleton-list skeleton-list-card-finance"></div>
      <div class="skeleton-list skeleton-list-card-status"></div>
      <div class="skeleton-list skeleton-list-card-progress"></div>
    </div>
  `;
}

/**
 * Exibe o skeleton de carregamento no container de listas
 * Renderiza N cards skeleton para simular o layout real enquanto os dados carregam
 *
 * @param {number} skeletonCardCount - Quantidade de cards skeleton a exibir (padrão: 4)
 */
window.showListsSkeleton = function (skeletonCardCount = 4) {
  const containerElement = window.listsMasterContainer;
  const paginationContainer = document.getElementById("pagination-container");

  if (!containerElement) return;

  if (paginationContainer) {
    paginationContainer.style.display = "none";
  }

  let skeletonHTML = "";
  for (let index = 0; index < skeletonCardCount; index++) {
    skeletonHTML += getListCardSkeletonTemplate();
  }

  containerElement.innerHTML = `<div style="padding: 0 20px 20px;">${skeletonHTML}</div>`;
};

/**
 * Remove o skeleton de carregamento e prepara o container para renderização real
 * Chamado após a validação de dependências ser concluída com sucesso
 */
window.hideListsSkeleton = function () {
  const containerElement = window.listsMasterContainer;
  if (!containerElement) return;

  // Limpa o conteúdo de skeleton, deixando pronto para renderização
  containerElement.innerHTML = "";
};

/* ==========================================================================
   SISTEMA DE ABAS — MINHAS LISTAS E COMPARTILHADAS
   ========================================================================== */

// Aba ativa no momento: "owned" = Minhas Listas | "shared" = Compartilhadas
let activeListsTab = "owned";

/**
 * Alterna a aba ativa da tela de listas e re-renderiza o conteúdo.
 * Reseta a paginação ao trocar de aba para evitar estado inválido.
 *
 * @param {string} tabIdentifier - "owned" ou "shared"
 */
window.switchListsTab = function (tabIdentifier) {
  if (activeListsTab === tabIdentifier) return;

  activeListsTab = tabIdentifier;

  // Reseta paginação ao trocar de aba
  initializePagination();

  // Atualiza aparência visual dos botões de aba
  const ownedTabButton = document.getElementById("tab-button-owned-lists");
  const sharedTabButton = document.getElementById("tab-button-shared-lists");

  if (ownedTabButton && sharedTabButton) {
    ownedTabButton.classList.toggle(
      "lists-tab-active",
      tabIdentifier === "owned",
    );
    sharedTabButton.classList.toggle(
      "lists-tab-active",
      tabIdentifier === "shared",
    );
  }

  window.renderMarketLists();
};

/**
 * Retorna o subconjunto de listas correspondente à aba atualmente ativa.
 * "owned"  → listas cujo userId é igual ao uid do usuário autenticado
 * "shared" → listas cujo userId é diferente do uid do usuário autenticado
 *
 * @returns {Array} Subconjunto filtrado do marketListData
 */
function getListsForActiveTab() {
  const currentUser = firebaseAuth.currentUser;
  const currentUserUid = currentUser ? currentUser.uid : null;

  if (activeListsTab === "owned") {
    return window.marketListData.filter(
      (list) => list.userId === currentUserUid,
    );
  }

  return window.marketListData.filter(
    (list) => list.userId !== currentUserUid,
  );
}

/* ==========================================================================
   VARIÁVEIS DE PAGINAÇÃO
   ========================================================================== */

// Quantidade de listas exibidas por página
const LISTS_PER_PAGE = 3;

// Página atual sendo exibida
let currentPageIndex = 1;

// Dados filtrados atualmente (usado para paginação)
let filteredListsData = [];

// Flag indicando se há uma busca ativa
let isSearchActive = false;

// Página salva antes da busca (para restaurar ao limpar)
let savedPageIndexBeforeSearch = 1;

/* ==========================================================================
   FUNÇÕES DE PAGINAÇÃO
   ========================================================================== */

/**
 * Inicializa o sistema de paginação
 * Configura variáveis e renderiza controles
 */
function initializePagination() {
  currentPageIndex = 1;
  filteredListsData = [];
  isSearchActive = false;
  savedPageIndexBeforeSearch = 1;
}

/**
 * Reseta a paginação para a primeira página.
 * Exposta globalmente para ser chamada pelo index.js ao navegar para a tela
 * de listas vindo de telas que não preservam o estado de paginação
 * (ex: home-screen, dashboard-screen).
 * Ao retornar da tela de detalhes, esta função NÃO deve ser chamada,
 * preservando a página em que o usuário estava.
 */
window.resetPaginationToFirstPage = function () {
  initializePagination();
};

/**
 * Calcula o número total de páginas baseado na quantidade de itens
 * @param {number} totalItems - Total de itens a serem paginados
 * @returns {number} Número total de páginas
 */
function calculateTotalPages(totalItems) {
  return Math.ceil(totalItems / LISTS_PER_PAGE);
}

/**
 * Obtém os itens da página atual baseado nos dados filtrados
 * @returns {Array} Array com os itens da página atual
 */
function getItemsForCurrentPage() {
  const startIndex = (currentPageIndex - 1) * LISTS_PER_PAGE;
  const endIndex = startIndex + LISTS_PER_PAGE;
  return filteredListsData.slice(startIndex, endIndex);
}

/**
 * Verifica se a página atual ficou vazia e ajusta para a página anterior se necessário
 * @returns {boolean} True se a página foi ajustada, false caso contrário
 */
function adjustPageIfEmpty() {
  const totalPages = calculateTotalPages(filteredListsData.length);

  // Se a página atual é maior que o total de páginas disponíveis, ajusta
  if (currentPageIndex > totalPages && totalPages > 0) {
    currentPageIndex = totalPages;
    return true;
  }

  // Se não há dados e estamos em uma página > 1, volta para página 1
  if (filteredListsData.length === 0 && currentPageIndex > 1) {
    currentPageIndex = 1;
    return true;
  }

  return false;
}

/**
 * Atualiza a interface dos controles de paginação
 * Renderiza números de página e atualiza estados dos botões
 */
function updatePaginationControls() {
  const paginationContainer = document.getElementById("pagination-container");
  const paginationNumbers = document.getElementById("pagination-numbers");
  const paginationIndicator = document.getElementById("pagination-indicator");
  const previousButton = document.getElementById("pagination-button-previous");
  const nextButton = document.getElementById("pagination-button-next");

  // Se não houver dados ou container não existir, esconde paginação
  if (!paginationContainer || filteredListsData.length === 0) {
    if (paginationContainer) {
      paginationContainer.style.display = "none";
    }
    return;
  }

  paginationContainer.style.display = "flex";

  const totalPages = calculateTotalPages(filteredListsData.length);

  // Atualiza indicador de página
  paginationIndicator.textContent = `Página ${currentPageIndex} de ${totalPages}`;

  // Limpa números de página anteriores
  paginationNumbers.innerHTML = "";

  // Renderiza números de página (máximo 2 visíveis por vez)
  const maxVisibleButtons = 2;

  let startPage = Math.max(
    1,
    currentPageIndex - Math.floor(maxVisibleButtons / 2),
  );
  let endPage = Math.min(totalPages, startPage + maxVisibleButtons - 1);

  // Ajusta se estiver próximo do final
  if (endPage - startPage + 1 < maxVisibleButtons) {
    startPage = Math.max(1, endPage - maxVisibleButtons + 1);
  }

  // Botão para primeira página (se não estiver visível)
  if (startPage > 1) {
    const firstButton = createPageNumberButton(1, false);
    paginationNumbers.appendChild(firstButton);

    // Ellipsis se houver gap
    if (startPage > 2) {
      const ellipsisElement = document.createElement("span");
      ellipsisElement.textContent = "...";
      ellipsisElement.style.color = "var(--text-secondary)";
      ellipsisElement.style.padding = "0 4px";
      paginationNumbers.appendChild(ellipsisElement);
    }
  }

  // Botões de página numerados
  for (let pageNumber = startPage; pageNumber <= endPage; pageNumber++) {
    const pageButton = createPageNumberButton(
      pageNumber,
      pageNumber === currentPageIndex,
    );
    paginationNumbers.appendChild(pageButton);
  }

  // Botão para última página (se não estiver visível)
  if (endPage < totalPages) {
    if (endPage < totalPages - 1) {
      const ellipsisElement = document.createElement("span");
      ellipsisElement.textContent = "...";
      ellipsisElement.style.color = "var(--text-secondary)";
      ellipsisElement.style.padding = "0 4px";
      paginationNumbers.appendChild(ellipsisElement);
    }

    const lastButton = createPageNumberButton(totalPages, false);
    paginationNumbers.appendChild(lastButton);
  }

  // Atualiza estados dos botões anterior/próximo
  if (previousButton) {
    previousButton.disabled = currentPageIndex <= 1;
  }

  if (nextButton) {
    nextButton.disabled = currentPageIndex >= totalPages;
  }
}

/**
 * Cria um botão de número de página para os controles de paginação
 * @param {number} pageNumber - Número da página
 * @param {boolean} isActive - Se é a página atual
 * @returns {HTMLElement} Botão de página criado
 */
function createPageNumberButton(pageNumber, isActive) {
  const pageButton = document.createElement("button");
  pageButton.textContent = pageNumber;
  pageButton.className = `pagination-number-button ${isActive ? "active" : ""}`;
  pageButton.onclick = () => navigateToPage(pageNumber);
  return pageButton;
}

/**
 * Navega para uma página específica
 * @param {number} targetPage - Número da página de destino
 */
function navigateToPage(targetPage) {
  const totalPages = calculateTotalPages(filteredListsData.length);

  if (targetPage < 1 || targetPage > totalPages) return;

  currentPageIndex = targetPage;
  updatePaginationControls();
  renderListsForCurrentPage();
}

/**
 * Navega para a página anterior
 */
window.navigateToPreviousPage = function () {
  if (currentPageIndex > 1) {
    navigateToPage(currentPageIndex - 1);
  }
};

/**
 * Navega para a próxima página
 */
window.navigateToNextPage = function () {
  const totalPages = calculateTotalPages(filteredListsData.length);
  if (currentPageIndex < totalPages) {
    navigateToPage(currentPageIndex + 1);
  }
};

/* ==========================================================================
   RENDERIZAÇÃO DE LISTAS
   ========================================================================== */

/**
 * Formata um número para moeda BRL
 * @param {number} value - Valor a formatar
 * @returns {string} Valor formatado
 */
function formatCurrency(value) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * Renderiza as listas da página atual no container principal
 */
function renderListsForCurrentPage() {
  const containerElement = window.listsMasterContainer;
  const paginationContainer = document.getElementById("pagination-container");

  if (!containerElement) return;

  containerElement.innerHTML = "";

  const pageItems = getItemsForCurrentPage();

  const currentUser = firebaseAuth.currentUser;
  const currentUserUid = currentUser ? currentUser.uid : null;

  pageItems.forEach((list) => {
    // Determina o índice original da lista no array global para manter compatibilidade
    // com funções que usam índice (openListDetails, confirmDeleteList, etc.)
    const originalIndex = window.marketListData.findIndex(
      (marketList) => marketList.id === list.id,
    );

    const isOwnerOfThisList = list.userId === currentUserUid;

    // Calcula totais financeiros e de progresso para exibição no card
    let subtotalValue = 0;
    let totalCheckedValue = 0;
    let totalItemsCount = 0;
    let purchasedItemsCount = 0;

    (list.categories || []).forEach((category) => {
      category.items.forEach((item) => {
        totalItemsCount++;
        if (item.checked) purchasedItemsCount++;

        let itemEffectiveTotalValue = 0;

        if (item.totalValue) {
          itemEffectiveTotalValue =
            parseFloat(item.totalValue.replace(/\./g, "").replace(",", ".")) ||
            0;
        } else if (item.price) {
          const unitPriceNumeric =
            parseFloat(item.price.replace(/\./g, "").replace(",", ".")) || 0;
          itemEffectiveTotalValue = unitPriceNumeric * (item.quantity || 1);
        }

        subtotalValue += itemEffectiveTotalValue;
        if (item.checked) totalCheckedValue += itemEffectiveTotalValue;
      });
    });

    const percentageComplete =
      totalItemsCount > 0
        ? (purchasedItemsCount / totalItemsCount) * 100
        : 0;

    const swipeContainer = document.createElement("div");
    swipeContainer.className = "swipe-container";

    // Botões de swipe para editar e excluir (apenas para o dono da lista)
    const actionButtons = document.createElement("div");
    actionButtons.className = "swipe-actions";

    if (isOwnerOfThisList) {
      actionButtons.innerHTML = `
        <button onclick="handleEditListFromSwipe(${originalIndex})" style="background: var(--primary); width: 75px;">
          <ion-icon name="create-outline" style="font-size: 20px;"></ion-icon> Editar
        </button>
        <button onclick="confirmDeleteList(${originalIndex})" style="background: var(--danger); width: 75px;">
          <ion-icon name="trash-outline" style="font-size: 20px;"></ion-icon> Apagar
        </button>
      `;
    }

    const cardElement = document.createElement("div");
    cardElement.className = "list-master-card";
    cardElement.onclick = () => window.openListDetails(originalIndex);

    // Swipe gestures apenas para o dono
    if (isOwnerOfThisList) {
      cardElement.ontouchstart = window.handleTouchStart;
      cardElement.ontouchmove = window.handleTouchMove;
      cardElement.ontouchend = window.handleTouchEnd;
    }

    // Sanitiza dados do Firestore antes de injetar no DOM
    const safeListName = sanitizeHtmlInput(list.listName);
    const safeLocation = sanitizeHtmlInput(list.location || "");
    const safeOwnerName = sanitizeHtmlInput(list.ownerDisplayName || "");

    // Badge de compartilhamento exibido em listas da aba "Compartilhadas"
    // Exibe o displayName do dono (salvo no campo ownerDisplayName) em vez do uid
    const sharedByBadgeHTML = !isOwnerOfThisList
      ? `<div class="shared-by-badge">
            <ion-icon name="people-outline"></ion-icon>
            <span>De: ${safeOwnerName || "Usuário"}</span>
           </div>`
      : "";

    cardElement.innerHTML = `
        <div class="list-master-header dashboard-header">
            <span class="list-master-title">${safeListName}</span>
            <div style="display: flex; gap: 8px; align-items: center;">
                ${isOwnerOfThisList ? `<ion-icon name="copy-outline" onclick="copyList(event, ${originalIndex})" style="color: var(--primary); font-size: 20px;"></ion-icon>` : ""}
            <span class="item-count">${totalItemsCount} ${totalItemsCount === 1 ? "item" : "itens"}</span>
            </div>
        </div>
        ${sharedByBadgeHTML}
        <div class="location-text" style="font-size: 13px; color: var(--primary); font-weight: 600; margin-top: 2px;">
            <ion-icon name="location-outline" style="color: var(--primary); font-size: 14px; vertical-align: middle;"></ion-icon> 
            ${safeLocation || "Local não informado"}
        </div>
        <div class="date-text" style="margin-top: 4px;">
            <ion-icon name="calendar-outline" style="color: var(--text-secondary); font-size: 14px; vertical-align: middle; margin-top: -4px;"></ion-icon> 
            ${window.formatDate(list.date)}
        </div>
        <div class="card-financial-info" style="margin-top: 10px; display: flex; justify-content: space-between; align-items: center; border-top: 1px dashed var(--border-color); padding-top: 10px;">
            <div style="display: flex; flex-direction: column;">
                <span style="font-size: 11px; color: var(--text-secondary);">Subtotal</span>
                <span style="font-size: 13px; font-weight: 600; color: var(--text-secondary);">${formatCurrency(subtotalValue)}</span>
            </div>
            <div style="display: flex; flex-direction: column; text-align: right;">
                <span style="font-size: 11px; color: var(--text-secondary);">Total Marcado</span>
                <span style="font-size: 15px; font-weight: 700; color: var(--danger);">${formatCurrency(totalCheckedValue)}</span>
            </div>
        </div>
        <div class="status-text" style="margin-top: 8px;">${purchasedItemsCount} comprado(s)</div>
        <div class="mini-progress-bg"><div class="mini-progress-bar" style="width: ${percentageComplete}%"></div></div>
    `;

    swipeContainer.appendChild(actionButtons);
    swipeContainer.appendChild(cardElement);
    containerElement.appendChild(swipeContainer);
  });

  if (paginationContainer && pageItems.length > 0) {
    paginationContainer.style.display = "flex";
  }
}

/**
 * Função principal de renderização das listas
 * Aplica filtros de busca, ordenação, aba ativa e configura paginação
 */
window.renderMarketLists = function () {
  const searchInputElement = document.getElementById("search-input");
  const searchTerm = searchInputElement
    ? window.normalizeString(searchInputElement.value)
    : "";

  // Obtém apenas as listas da aba ativa (próprias ou compartilhadas)
  const tabFilteredLists = getListsForActiveTab();

  // Se não houver dados na aba ativa, mostra estado vazio e desabilita busca
  if (tabFilteredLists.length === 0) {
    if (searchInputElement) {
      searchInputElement.disabled = true;
    }
    const containerElement = window.listsMasterContainer;
    const paginationContainer = document.getElementById("pagination-container");

    if (containerElement) {
      // Mensagem diferenciada por aba
      if (activeListsTab === "shared") {
        containerElement.innerHTML = `
          <div class="empty-state">
            <span class="empty-emoji">🤝</span>
            <p>Nenhuma lista foi compartilhada com você ainda.</p>
          </div>`;
      } else {
        containerElement.innerHTML = `<div class="empty-state"><span class="empty-emoji">📝</span><p>Ainda não há listas.</p></div>`;
      }
    }

    if (paginationContainer) {
      paginationContainer.style.display = "none";
    }
    return;
  }

  if (searchInputElement) {
    searchInputElement.disabled = false;
  }

  // Ordenação por data (descendente)
  const sortedListData = [...tabFilteredLists].sort((firstList, secondList) => {
    return new Date(secondList.date) - new Date(firstList.date);
  });

  // Aplica filtro de busca
  filteredListsData = sortedListData.filter((list) => {
    const nameMatch = window
      .normalizeString(list.listName)
      .includes(searchTerm);
    const locationMatch = list.location
      ? window.normalizeString(list.location).includes(searchTerm)
      : false;
    const dateMatch = window.formatDate(list.date).includes(searchTerm);
    return nameMatch || locationMatch || dateMatch;
  });

  // Verifica se a página atual ficou vazia após exclusão e ajusta para página anterior
  const pageWasAdjusted = adjustPageIfEmpty();

  // Atualiza controles de paginação (mas só mostra após renderizar as listas)
  updatePaginationControls();

  renderListsForCurrentPage();

  // Se a página foi ajustada, re-renderiza os controles de paginação com a nova página
  if (pageWasAdjusted) {
    updatePaginationControls();
  }
};

/**
 * Exibe o botão apenas quando o campo possui conteúdo digitado.
 */
function updateListsSearchClearButtonVisibility() {
  const searchInputElement = document.getElementById("search-input");
  const clearButtonElement = document.getElementById("search-clear-button");

  if (!searchInputElement || !clearButtonElement) return;

  const hasContent = searchInputElement.value.length > 0;
  clearButtonElement.classList.toggle("screen-hidden", !hasContent);
}

/**
 * Handler para input de busca
 * Gerencia a interação entre busca e paginação
 */
window.handleSearchInput = function () {
  const searchInputElement = document.getElementById("search-input");
  const searchTerm = searchInputElement ? searchInputElement.value.trim() : "";

  // Se começou a digitar (busca ativa)
  if (searchTerm.length > 0 && !isSearchActive) {
    isSearchActive = true;
    savedPageIndexBeforeSearch = currentPageIndex;
    currentPageIndex = 1; // Vai para primeira página ao buscar
  }
  // Se limpou o campo (busca inativa)
  else if (searchTerm.length === 0 && isSearchActive) {
    isSearchActive = false;
    // Restaura página anterior ou mantém na 1 se não houver página salva
    currentPageIndex = savedPageIndexBeforeSearch || 1;
  }

  updateListsSearchClearButtonVisibility();

  // Re-renderiza com os novos filtros e paginação
  window.renderMarketLists();
};

/**
 * Limpa o campo de busca da tela de listas e re-renderiza as listas.
 */
window.clearListsSearch = function () {
  const searchInputElement = document.getElementById("search-input");

  if (!searchInputElement) return;

  searchInputElement.value = "";

  // Aciona o handler de input para restaurar a paginação e re-renderizar
  window.handleSearchInput();
};

/* ==========================================================================
   LOGICA DE SWIPE
   ========================================================================== */
window.handleTouchStart = function (event) {
  window.touchStartX = event.touches[0].clientX;
  const cardElement = event.currentTarget;
  if (window.activeSwipeCard && window.activeSwipeCard !== cardElement)
    window.activeSwipeCard.style.transform = "translateX(0)";
};

window.handleTouchMove = function (event) {
  const touchX = event.touches[0].clientX;
  const difference = touchX - window.touchStartX;
  const cardElement = event.currentTarget;
  if (difference < 0 && difference > -160)
    cardElement.style.transform = `translateX(${difference}px)`;
};

window.handleTouchEnd = function (event) {
  const cardElement = event.currentTarget;
  const touchEndX = event.changedTouches[0].clientX;
  const difference = touchEndX - window.touchStartX;
  if (difference < -80) {
    cardElement.style.transform = "translateX(-150px)";
    window.activeSwipeCard = cardElement;
  } else {
    cardElement.style.transform = "translateX(0)";
    window.activeSwipeCard = null;
  }
};

/* ==========================================================================
   INICIALIZAÇÃO
   ========================================================================== */

// Inicializa paginação quando o script carrega
initializePagination();
