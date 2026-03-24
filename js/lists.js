/* ==========================================================================
   TELA: LISTAS DE COMPRAS
   ========================================================================== */

/**
 * Exclui permanentemente uma lista do Firestore.
 */
window.confirmDeleteList = async function (index) {
  const list = window.marketListData[index];
  const listName = list.listName;

  if (
    confirm(
      `Deseja excluir a "${listName}"? Esta ação não pode ser desfeita na nuvem.`,
    )
  ) {
    try {
      // Importa ferramentas necessárias para deletar
      const { firestore, doc, deleteDoc } = await import("./firebase.js");

      // Remove do Firestore
      const listRef = doc(firestore, "lists", list.id);
      await deleteDoc(listRef);

      // O onSnapshot no index.js cuidará de atualizar o marketListData e re-renderizar,
      // mas removemos localmente para feedback instantâneo se necessário
      window.marketListData.splice(index, 1);

      window.renderMarketLists();
      window.showToast("Lista removida com sucesso", "success");
    } catch (e) {
      console.error("Erro ao deletar:", e);
      window.showToast("Erro ao excluir lista", "danger");
    }
  }
};

window.copyList = function (event, index) {
  event.stopPropagation();
  window.isEditingListMode = false;
  window.isCopyingListMode = true;
  window.currentListIndex = index;
  window.previousScreen = "market-lists-screen";

  const originalList = window.marketListData[index];
  document.getElementById("form-title").innerText = "Copiar Lista";
  document.getElementById("button-save-list").innerText = "Confirmar Cópia";
  document.getElementById("new-list-name").value = originalList.listName;
  document.getElementById("new-list-location").value =
    originalList.location || "";
  document.getElementById("new-list-date").value = "";
  window.showScreen("new-list-screen");
};

window.handleEditListFromSwipe = function (index) {
  window.currentListIndex = index;
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
 * @param {number} cardCount - Quantidade de cards skeleton a exibir (padrão: 4)
 */
window.showListsSkeleton = function (cardCount = 4) {
  const container = window.listsMasterContainer;
  if (!container) return;

  let skeletonHTML = "";
  for (let i = 0; i < cardCount; i++) {
    skeletonHTML += getListCardSkeletonTemplate();
  }

  container.innerHTML = `<div style="padding: 0 20px 20px;">${skeletonHTML}</div>`;
};

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

  // Mostra o container de paginação
  paginationContainer.style.display = "flex";

  const totalPages = calculateTotalPages(filteredListsData.length);

  // Atualiza indicador de página
  paginationIndicator.textContent = `Página ${currentPageIndex} de ${totalPages}`;

  // Limpa números de página anteriores
  paginationNumbers.innerHTML = "";

  // Renderiza números de página (máximo 5 visíveis por vez)
  const maxVisibleButtons = 5;
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
      const ellipsis = document.createElement("span");
      ellipsis.textContent = "...";
      ellipsis.style.color = "var(--text-secondary)";
      ellipsis.style.padding = "0 4px";
      paginationNumbers.appendChild(ellipsis);
    }
  }

  // Botões de página numerados
  for (let pageNumber = startPage; pageNumber <= endPage; pageNumber++) {
    const isActive = pageNumber === currentPageIndex;
    const button = createPageNumberButton(pageNumber, isActive);
    paginationNumbers.appendChild(button);
  }

  // Botão para última página (se não estiver visível)
  if (endPage < totalPages) {
    // Ellipsis se houver gap
    if (endPage < totalPages - 1) {
      const ellipsis = document.createElement("span");
      ellipsis.textContent = "...";
      ellipsis.style.color = "var(--text-secondary)";
      ellipsis.style.padding = "0 4px";
      paginationNumbers.appendChild(ellipsis);
    }

    const lastButton = createPageNumberButton(totalPages, false);
    paginationNumbers.appendChild(lastButton);
  }

  // Atualiza estado dos botões de navegação
  previousButton.disabled = currentPageIndex === 1;
  nextButton.disabled = currentPageIndex === totalPages || totalPages === 0;
}

/**
 * Cria um botão de número de página
 * @param {number} pageNumber - Número da página
 * @param {boolean} isActive - Se o botão está ativo
 * @returns {HTMLElement} Elemento button configurado
 */
function createPageNumberButton(pageNumber, isActive) {
  const button = document.createElement("button");
  button.className = "pagination-number-button";
  button.textContent = pageNumber;
  button.setAttribute("data-page", pageNumber);

  if (isActive) {
    button.classList.add("active");
  }

  button.onclick = function () {
    navigateToPage(pageNumber);
  };

  return button;
}

/**
 * Navega para uma página específica
 * @param {number} pageNumber - Número da página destino
 */
function navigateToPage(pageNumber) {
  const totalPages = calculateTotalPages(filteredListsData.length);

  if (pageNumber < 1 || pageNumber > totalPages) {
    return;
  }

  currentPageIndex = pageNumber;
  renderListsForCurrentPage();
  updatePaginationControls();

  // Scroll para o topo da lista
  const contentWrapper = document.querySelector(".lists-content-wrapper");
  if (contentWrapper) {
    contentWrapper.scrollTop = 0;
  }
}

/**
 * Navega para a página anterior
 */
window.navigateToPreviousPage = function () {
  navigateToPage(currentPageIndex - 1);
};

/**
 * Navega para a próxima página
 */
window.navigateToNextPage = function () {
  navigateToPage(currentPageIndex + 1);
};

/* ==========================================================================
   FUNÇÕES DE RENDERIZAÇÃO
   ========================================================================== */

/**
 * Renderiza as listas da página atual no container
 * Utiliza os dados já filtrados e paginados
 */
function renderListsForCurrentPage() {
  const container = window.listsMasterContainer;
  if (!container) return;

  container.innerHTML = "";

  const pageItems = getItemsForCurrentPage();

  if (pageItems.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-emoji">📝</span>
        <p>Nenhuma lista encontrada.</p>
      </div>
    `;
    return;
  }

  pageItems.forEach((list) => {
    const originalIndex = window.marketListData.findIndex(
      (original) => original.id === list.id,
    );

    let totalItemsCount = 0,
      purchased = 0,
      subtotalValue = 0,
      totalValue = 0;

    (list.categories || []).forEach((cat) => {
      cat.items.forEach((item) => {
        totalItemsCount++;
        if (item.checked) purchased++;
        const valorUnitario = parseFloat(
          item.price.replace(/\./g, "").replace(",", "."),
        );
        const qtd = item.quantity || 1;
        if (!isNaN(valorUnitario)) {
          const valorTotalItem = valorUnitario * qtd;
          subtotalValue += valorTotalItem;
          if (item.checked) totalValue += valorTotalItem;
        }
      });
    });

    const percent =
      totalItemsCount > 0 ? (purchased / totalItemsCount) * 100 : 0;
    const format = (val) =>
      val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

    const swipeContainer = document.createElement("div");
    swipeContainer.className = "swipe-container";
    swipeContainer.style.marginBottom = "15px";

    const actionButtons = document.createElement("div");
    actionButtons.className = "swipe-actions";
    actionButtons.innerHTML = `
            <button onclick="handleEditListFromSwipe(${originalIndex})" style="background: var(--primary); width: 75px;">
                <ion-icon name="create-outline" style="font-size: 20px;"></ion-icon> Editar
            </button>
            <button onclick="confirmDeleteList(${originalIndex})" style="background: var(--danger); width: 75px;">
                <ion-icon name="trash-outline" style="font-size: 20px;"></ion-icon> Apagar
            </button>
        `;

    const card = document.createElement("div");
    card.className = "list-master-card";
    card.onclick = () => window.openListDetails(originalIndex);

    card.ontouchstart = window.handleTouchStart;
    card.ontouchmove = window.handleTouchMove;
    card.ontouchend = window.handleTouchEnd;

    card.innerHTML = `
        <div class="list-master-header dashboard-header">
            <span class="list-master-title">${list.listName}</span>
            <div style="display: flex; gap: 8px; align-items: center;">
                <ion-icon name="copy-outline" onclick="copyList(event, ${originalIndex})" style="color: var(--primary); font-size: 20px;"></ion-icon>
            <span class="item-count">${totalItemsCount} ${totalItemsCount === 1 ? "item" : "itens"}</span>
            </div>
        </div>
        <div class="location-text" style="font-size: 13px; color: var(--primary); font-weight: 600; margin-top: 2px;">
            <ion-icon name="location-outline" style="color: var(--primary); font-size: 14px; vertical-align: middle;"></ion-icon> 
            ${list.location || "Local não informado"}
        </div>
        <div class="date-text" style="margin-top: 4px;">
            <ion-icon name="calendar-outline" style="color: var(--text-secondary); font-size: 14px; vertical-align: middle; margin-top: -4px;"></ion-icon> 
            ${window.formatDate(list.date)}
        </div>
        <div class="card-financial-info" style="margin-top: 10px; display: flex; justify-content: space-between; align-items: center; border-top: 1px dashed var(--border-color); padding-top: 10px;">
            <div style="display: flex; flex-direction: column;">
                <span style="font-size: 11px; color: var(--text-secondary);">Subtotal</span>
                <span style="font-size: 13px; font-weight: 600; color: var(--toast-bg);">${format(subtotalValue)}</span>
            </div>
            <div style="display: flex; flex-direction: column; text-align: right;">
                <span style="font-size: 11px; color: var(--text-secondary);">Total Marcado</span>
                <span style="font-size: 15px; font-weight: 700; color: var(--danger);">${format(totalValue)}</span>
            </div>
        </div>
        <div class="status-text" style="margin-top: 8px;">${purchased} comprado(s)</div>
        <div class="mini-progress-bg"><div class="mini-progress-bar" style="width: ${percent}%"></div></div>
    `;

    swipeContainer.appendChild(actionButtons);
    swipeContainer.appendChild(card);
    container.appendChild(swipeContainer);
  });
}

/**
 * Função principal de renderização das listas
 * Aplica filtros de busca, ordenação e configura paginação
 */
window.renderMarketLists = function () {
  const searchInput = document.getElementById("search-input");
  const searchTerm = searchInput
    ? window.normalizeString(searchInput.value)
    : "";

  // Se não houver dados, mostra estado vazio e desabilita busca
  if (window.marketListData.length === 0) {
    if (searchInput) {
      searchInput.disabled = true;
    }
    const container = window.listsMasterContainer;
    if (container) {
      container.innerHTML = `<div class="empty-state"><span class="empty-emoji">📝</span><p>Ainda não há listas.</p></div>`;
    }
    // Esconde paginação
    const paginationContainer = document.getElementById("pagination-container");
    if (paginationContainer) {
      paginationContainer.style.display = "none";
    }
    return;
  }

  if (searchInput) {
    searchInput.disabled = false;
  }

  // Ordenação por data (descendente)
  const sortedListData = [...window.marketListData].sort(
    (firstList, secondList) => {
      return new Date(secondList.date) - new Date(firstList.date);
    },
  );

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

  // Atualiza controles e renderiza
  updatePaginationControls();
  renderListsForCurrentPage();
};

/**
 * Handler para input de busca
 * Gerencia a interação entre busca e paginação
 */
window.handleSearchInput = function () {
  const searchInput = document.getElementById("search-input");
  const searchTerm = searchInput ? searchInput.value.trim() : "";

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

  // Re-renderiza com os novos filtros e paginação
  window.renderMarketLists();
};

/* ==========================================================================
   LOGICA DE SWIPE
   ========================================================================== */
window.handleTouchStart = function (event) {
  window.touchStartX = event.touches[0].clientX;
  const card = event.currentTarget;
  if (window.activeSwipeCard && window.activeSwipeCard !== card)
    window.activeSwipeCard.style.transform = "translateX(0)";
};

window.handleTouchMove = function (event) {
  const touchX = event.touches[0].clientX;
  const diff = touchX - window.touchStartX;
  const card = event.currentTarget;
  if (diff < 0 && diff > -160) card.style.transform = `translateX(${diff}px)`;
};

window.handleTouchEnd = function (event) {
  const card = event.currentTarget;
  const touchEndX = event.changedTouches[0].clientX;
  const diff = touchEndX - window.touchStartX;
  if (diff < -80) {
    card.style.transform = "translateX(-150px)";
    window.activeSwipeCard = card;
  } else {
    card.style.transform = "translateX(0)";
    window.activeSwipeCard = null;
  }
};

/* ==========================================================================
   INICIALIZAÇÃO
   ========================================================================== */

// Inicializa paginação quando o script carrega
initializePagination();
