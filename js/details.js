/* ==========================================================================
   RENDERIZAÇÃO DE DETALHES COM BUSCA
   ========================================================================== */

import {
  firestore,
  firebaseAuth,
  doc,
  onSnapshot,
} from "./firebase.js";

/* ==========================================================================
   LISTENER DE TEMPO REAL DA LISTA ABERTA
   ========================================================================== */

// Referência à função de cancelamento do listener ativo (onSnapshot)
// Mantida no escopo do módulo para garantir que apenas um listener esteja ativo por vez
let activeDetailsListenerUnsubscribe = null;

/**
 * Ativa o listener em tempo real do Firestore para a lista atualmente aberta.
 * O listener só é registrado se a lista for compartilhada (dono ou usuário compartilhado).
 * Garante que apenas um listener esteja ativo por vez, cancelando o anterior se existir.
 *
 * Comportamento ao receber atualização:
 * - Atualiza os dados locais (marketListData) com os dados mais recentes do Firestore
 * - Re-renderiza a tela de detalhes refletindo as mudanças em tempo real para AMBOS
 *   os lados: dono e usuário compartilhado recebem atualizações bidirecionais
 * - Detecta remoção do compartilhamento para o usuário logado e aciona o fluxo de saída
 *
 * @param {string} listIdentifier - ID do documento da lista no Firestore
 */
window.activateDetailsRealtimeListener = async function (listIdentifier) {
  // Cancela qualquer listener anterior antes de registrar um novo
  window.deactivateDetailsRealtimeListener();

  // Registra o identificador global da lista aberta para uso no share-window.js
  // Isso evita que o listener de listas compartilhadas sobrescreva os dados
  // da lista atualmente aberta em detalhes durante sincronizações
  if (window.setActiveDetailsListIdentifier) {
    window.setActiveDetailsListIdentifier(listIdentifier);
  }

  try {
    const listDocumentReference = doc(firestore, "lists", listIdentifier);

    // Registra o listener e armazena a função de cancelamento
    activeDetailsListenerUnsubscribe = onSnapshot(
      listDocumentReference,
      (documentSnapshot) => {
        // Se o documento foi deletado no Firestore, sai da tela de detalhes
        if (!documentSnapshot.exists()) {
          window.deactivateDetailsRealtimeListener();
          window.showScreen("market-lists-screen");
          return;
        }

        const updatedListData = {
          id: documentSnapshot.id,
          ...documentSnapshot.data(),
        };

        // Verifica a propriedade da lista pelo uid do Firebase Auth
        const authenticatedUser = firebaseAuth.currentUser;
        const currentUserUid = authenticatedUser ? authenticatedUser.uid : null;
        const isOwnerOfList = updatedListData.userId === currentUserUid;

        // Verifica se o usuário compartilhado foi removido do array sharedWith
        if (!isOwnerOfList) {
          const sharedUsersArray = updatedListData.sharedWith || [];

          const isStillSharedWithCurrentUser = sharedUsersArray.some(
            (sharedUser) => sharedUser.uid === currentUserUid,
          );

          if (!isStillSharedWithCurrentUser) {
            // Aciona o fluxo de remoção do compartilhamento para o usuário atual
            handleSharedAccessRevoked(listIdentifier);
            return;
          }
        }

        // Atualiza os dados locais com os dados mais recentes recebidos do Firestore.
        // Usa busca direta pelo listIdentifier para evitar race condition com o
        // initFirebaseListener do index.js que pode ter reordenado o marketListData
        // entre o disparo do onSnapshot e a execução deste callback.
        const existingListIndex = window.marketListData.findIndex(
          (existingList) => existingList.id === listIdentifier,
        );

        if (existingListIndex !== -1) {
          window.marketListData[existingListIndex] = updatedListData;

          window.currentListId = listIdentifier;
          window.currentListIndex = existingListIndex;
        } else {
          window.marketListData.push(updatedListData);
          window.currentListId = listIdentifier;
          window.currentListIndex = window.marketListData.length - 1;
        }

        const detailsScreenElement = document.getElementById(
          "market-list-screen-details",
        );
        if (
          detailsScreenElement &&
          !detailsScreenElement.classList.contains("screen-hidden")
        ) {
          window.renderListDetails();
        }
      },
      (listenerError) => {
        console.error("Erro no listener de detalhes:", listenerError);
      },
    );
  } catch (importError) {
    console.error("Erro ao ativar listener de detalhes:", importError);
  }
};

/**
 * Desativa o listener em tempo real da lista aberta.
 * Deve ser chamado sempre que o usuário sair da tela de detalhes,
 * independentemente do destino (voltar, navegar para outra tela, etc.).
 * Evita consumo desnecessário de recursos e conexões abertas no Firestore.
 */
window.deactivateDetailsRealtimeListener = function () {
  if (activeDetailsListenerUnsubscribe) {
    activeDetailsListenerUnsubscribe();
    activeDetailsListenerUnsubscribe = null;
  }

  // Limpa o identificador global da lista aberta para permitir que o
  // listener de listas compartilhadas gerencie normalmente os dados
  if (window.setActiveDetailsListIdentifier) {
    window.setActiveDetailsListIdentifier(null);
  }
};

/**
 * Trata o cenário em que o compartilhamento da lista foi revogado enquanto
 * o usuário compartilhado estava com a lista aberta ou na aba de listas compartilhadas.
 *
 * Fluxo corrigido:
 * 1. Cancela o listener de tempo real imediatamente para evitar re-disparos
 * 2. Remove a lista do marketListData local do usuário compartilhado
 * 3. Navega diretamente para a tela de listas via executeScreenNavigation,
 *    evitando o ciclo de validação do showScreen que causava o sumiço dos elementos
 * 4. Exibe o toast informativo APÓS a navegação e renderização estarem concluídas,
 *    garantindo que a aba "Compartilhadas" reflita o estado correto sem aparecer vazia
 *
 * @param {string} listIdentifier - ID do documento da lista que teve o acesso revogado
 */
function handleSharedAccessRevoked(listIdentifier) {
  window.deactivateDetailsRealtimeListener();

  // Remove a lista do cache local do usuário compartilhado
  window.marketListData = window.marketListData.filter(
    (existingList) => existingList.id !== listIdentifier,
  );

  // Verifica se o usuário está na tela de detalhes da lista revogada
  const detailsScreenElement = document.getElementById(
    "market-list-screen-details",
  );
  const isOnDetailsScreen =
    detailsScreenElement &&
    !detailsScreenElement.classList.contains("screen-hidden");

  // Verifica se o usuário está na aba de listas compartilhadas
  const listsScreenElement = document.getElementById("market-lists-screen");
  const isOnListsScreen =
    listsScreenElement &&
    !listsScreenElement.classList.contains("screen-hidden");

  if (isOnDetailsScreen || isOnListsScreen) {
    // Navega imediatamente para a tela de listas sem validação
    const allScreenIdentifiers = [
      "onboarding-screen",
      "home-screen",
      "market-lists-screen",
      "market-list-screen-details",
      "new-list-screen",
      "new-category-screen",
      "new-item-screen",
      "dashboard-screen",
    ];

    allScreenIdentifiers.forEach((screenId) => {
      const screenElement = document.getElementById(screenId);
      if (screenElement) {
        screenElement.classList.remove("screen-fade-out");
        screenElement.classList.toggle(
          "screen-hidden",
          screenId !== "market-lists-screen",
        );
        screenElement.style.display =
          screenId === "market-lists-screen" ? "flex" : "none";
      }
    });

    if (window.searchInput) {
      window.searchInput.value = "";
    }

    if (window.renderMarketLists) {
      window.renderMarketLists();
    }

    // Exibe o toast após a renderização para garantir que o usuário veja
    // a tela de listas já atualizada ao receber a notificação
    window.showToast(
      "Esta lista não está mais disponível para você.",
      "danger",
    );
  }
}

/* ==========================================================================
   ABERTURA E SAÍDA DA TELA DE DETALHES
   ========================================================================== */

window.openListDetails = function (index) {
  // Armazena o ID estável da lista ao abrir, evitando que reordenações
  // posteriores do onSnapshot causem perda de referência durante a navegação
  window.currentListId = window.marketListData[index].id;
  window.currentListIndex = index;

  if (!window.marketListData[window.currentListIndex].categories) {
    const oldItems = window.marketListData[window.currentListIndex].items || [];
    window.marketListData[window.currentListIndex].categories = [
      { name: "Alimentação", items: oldItems },
    ];
    delete window.marketListData[window.currentListIndex].items;
    saveAndSync();
  }

  window.showScreen("market-list-screen-details");
  window.renderListDetails();

  const currentList = window.marketListData[index];
  const isSharedList =
    (currentList.sharedWith && currentList.sharedWith.length > 0) ||
    currentList.userName !== localStorage.getItem("marketUserName");

  if (isSharedList) {
    window.activateDetailsRealtimeListener(currentList.id);
  }
};

window.exitDetailsScreen = function () {
  window.deactivateDetailsRealtimeListener();
  window.showScreen("market-lists-screen");
};

/**
 * Obtém o valor numérico do preço unitário de um item
 * Retorna null se o preço não estiver definido ou for inválido
 *
 * @param {Object} item - Objeto do item
 * @returns {number|null} Valor numérico do preço unitário ou null
 */
function getUnitPriceNumericValue(item) {
  if (!item.price || item.price === null || item.price.trim() === "") {
    return null;
  }
  const numericValue = parseFloat(
    item.price.replace(/\./g, "").replace(",", "."),
  );
  return isNaN(numericValue) ? null : numericValue;
}

/**
 * Obtém o valor numérico do valor total de um item
 * Retorna null se o valor total não estiver definido ou for inválido
 *
 * @param {Object} item - Objeto do item
 * @returns {number|null} Valor numérico do valor total ou null
 */
function getTotalValueNumericValue(item) {
  if (
    !item.totalValue ||
    item.totalValue === null ||
    item.totalValue.trim() === ""
  ) {
    return null;
  }
  const numericValue = parseFloat(
    item.totalValue.replace(/\./g, "").replace(",", "."),
  );
  return isNaN(numericValue) ? null : numericValue;
}

/**
 * Calcula o valor total efetivo de um item para exibição e métricas
 * Prioriza o valor total informado, senão calcula (preço unitário × quantidade)
 * Se não houver preço unitário, usa o valor total como fallback
 *
 * @param {Object} item - Objeto do item
 * @returns {number} Valor total efetivo do item
 */
function calculateEffectiveItemTotalValue(item) {
  const itemQuantity = item.quantity || 1;

  // Se valor total foi informado, usa ele diretamente
  const totalValueNumeric = getTotalValueNumericValue(item);
  if (totalValueNumeric !== null) {
    return totalValueNumeric;
  }

  // Se não há valor total mas há preço unitário, calcula
  const unitPriceNumeric = getUnitPriceNumericValue(item);
  if (unitPriceNumeric !== null) {
    return unitPriceNumeric * itemQuantity;
  }

  // Se não há nenhum valor, retorna 0
  return 0;
}

window.renderListDetails = function () {
  // Resolve o índice pelo ID estável antes de renderizar,
  // garantindo que o onSnapshot não cause perda de referência da lista aberta
  const resolvedIndex = window.resolveCurrentListIndex
    ? window.resolveCurrentListIndex()
    : window.currentListIndex;

  window.listItemsContainer.innerHTML = "";
  const currentList = window.marketListData[resolvedIndex];

  // Se a lista não for encontrada pelo ID, aborta a renderização
  if (!currentList) return;

  document.getElementById("main-list-title").innerText = currentList.listName;

  // Obtém as permissões do usuário atual para esta lista
  const userPermissions = window.getCurrentUserPermissions
    ? window.getCurrentUserPermissions(currentList)
    : { isOwner: true, canEdit: true };

  // Atualiza a visibilidade dos botões de ação com base nas permissões
  applyPermissionsToDetailsHeader(userPermissions);

  const term = window.itemSearchInput
    ? window.normalizeString(window.itemSearchInput.value)
    : "";

  // Cria uma cópia das categorias preservando o índice real de cada uma no array original.
  const categoriesWithOriginalIndexes = currentList.categories.map(
    (category, originalCategoryIndex) => ({
      category,
      originalCategoryIndex,
    }),
  );

  // Ordena alfabeticamente pelo nome da categoria apenas para exibição visual
  const sortedCategoriesWithIndexes = [...categoriesWithOriginalIndexes].sort(
    (categoryEntryA, categoryEntryB) =>
      categoryEntryA.category.name.localeCompare(
        categoryEntryB.category.name,
        "pt-BR",
        { sensitivity: "base" },
      ),
  );

  sortedCategoriesWithIndexes.forEach(({ category, originalCategoryIndex }) => {
    const filteredItems = category.items.filter((item) => {
      const nameMatch = window.normalizeString(item.name).includes(term);
      const descMatch = window.normalizeString(item.desc).includes(term);
      const priceMatch = item.price ? item.price.includes(term) : false;
      const totalValueMatch = item.totalValue
        ? item.totalValue.includes(term)
        : false;
      return nameMatch || descMatch || priceMatch || totalValueMatch;
    });

    if (term !== "" && filteredItems.length === 0) return;

    const catSection = document.createElement("div");
    catSection.className = "category-section";

    // Ícones de edição e exclusão de categoria apenas para quem pode editar
    const categoryActionsHTML = userPermissions.canEdit
      ? `
        <div style="display: flex; gap: 15px; align-items: center;">
          <ion-icon name="create-outline" onclick="openEditCategoryForm(${originalCategoryIndex})" style="color: var(--primary); font-size: 20px;"></ion-icon>
          <ion-icon name="trash-outline" onclick="deleteCategory(${originalCategoryIndex})" style="color: var(--danger); font-size: 18px;"></ion-icon>
        </div>
      `
      : "";

    catSection.innerHTML = `
        <div class="category-header">
            <span class="category-name">${category.name}</span>
            ${categoryActionsHTML}
        </div>
        <div class="category-items-list"></div>
    `;

    const itemsList = catSection.querySelector(".category-items-list");

    if (category.items.length === 0 && term === "") {
      itemsList.innerHTML = `
        <div style="padding: 10px 16px; color: var(--text-secondary); font-size: 13px; font-style: italic; text-align: center;">
            Não há itens cadastrados para essa categoria
        </div>
      `;
    } else {
      filteredItems.forEach((item) => {
        const itemIdx = category.items.indexOf(item);

        const swipeContainer = document.createElement("div");
        swipeContainer.className = "swipe-container";
        swipeContainer.style.marginBottom = "12px";

        // Botões de swipe apenas para quem pode editar
        const actionButtons = document.createElement("div");
        actionButtons.className = "swipe-actions";

        if (userPermissions.canEdit) {
          actionButtons.innerHTML = `
                <button onclick="enterEditMode(${originalCategoryIndex}, ${itemIdx})" style="background: var(--primary); width: 75px;">
                    <ion-icon name="create-outline" style="font-size: 20px;"></ion-icon> Editar
                </button>
                <button onclick="confirmDeleteItem(${originalCategoryIndex}, ${itemIdx})" style="background: var(--danger); width: 75px;">
                    <ion-icon name="trash-outline" style="font-size: 20px;"></ion-icon> Apagar
                </button>
              `;
        }

        const card = document.createElement("div");
        card.className = `item-card ${item.checked ? "checked" : ""}`;

        // Swipe gestures apenas para quem pode editar
        if (userPermissions.canEdit) {
          card.ontouchstart = window.handleTouchStart;
          card.ontouchmove = window.handleTouchMove;
          card.ontouchend = window.handleTouchEnd;
        }

        const displayTotalValue = calculateEffectiveItemTotalValue(item);
        const itemQuantity = item.quantity || 1;

        const formattedTotalValue = displayTotalValue.toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL",
        });

        const checkboxOnClickAttribute = userPermissions.canEdit
          ? `onclick="toggleItemStatus(${originalCategoryIndex}, ${itemIdx})"`
          : "";
        const checkboxCursorStyle = userPermissions.canEdit
          ? ""
          : "cursor: default; opacity: 0.6;";

        card.innerHTML = `
                <div class="item-info">
                    <div class="custom-check" ${checkboxOnClickAttribute} style="${checkboxCursorStyle}"></div>
                    <div class="text-group">
                        <span class="item-name">${item.name} <span style="font-size: 11px; color: var(--text-secondary);">(x${itemQuantity})</span></span>
                        <span class="item-desc">${item.desc}</span>
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span class="item-price">${formattedTotalValue}</span>
                </div>
            `;
        swipeContainer.appendChild(actionButtons);
        swipeContainer.appendChild(card);
        itemsList.appendChild(swipeContainer);
      });
    }
    window.listItemsContainer.appendChild(catSection);
  });

  if (term !== "" && listItemsContainer.innerHTML === "") {
    listItemsContainer.innerHTML = `
        <div class="empty-state">
            <span class="empty-emoji">🔍</span>
            <p>Nenhum item encontrado para "${window.itemSearchInput.value}"</p>
        </div>
      `;
  }

  // Atualiza os botões de ação (Nova Categoria / Adicionar Item) conforme permissão
  applyPermissionsToActionButtons(userPermissions);

  updateDashboard();
};

/**
 * Aplica as restrições de permissão ao header da tela de detalhes.
 * Oculta o botão de opções (compartilhar, editar lista) para usuários sem posse.
 *
 * @param {{ isOwner: boolean, canEdit: boolean }} userPermissions - Permissões do usuário atual
 */
function applyPermissionsToDetailsHeader(userPermissions) {
  const detailsOptionsButton = document.getElementById(
    "button-options-details",
  );
  if (detailsOptionsButton) {
    // Apenas o dono pode acessar as opções de compartilhamento e edição da lista
    detailsOptionsButton.style.display = userPermissions.isOwner
      ? "flex"
      : "none";
  }
}

/**
 * Aplica as restrições de permissão aos botões de ação da área de itens.
 * Oculta "Nova Categoria" e "Adicionar Item" para usuários sem permissão de edição.
 *
 * @param {{ isOwner: boolean, canEdit: boolean }} userPermissions - Permissões do usuário atual
 */
function applyPermissionsToActionButtons(userPermissions) {
  const addCategoryButton = document.querySelector(".button-add-cat");
  const addItemButton = document.querySelector(".button-add-item");

  if (addCategoryButton) {
    addCategoryButton.style.display = userPermissions.canEdit ? "" : "none";
  }

  if (addItemButton) {
    addItemButton.style.display = userPermissions.canEdit ? "" : "none";
  }
}

window.updateDashboard = function () {
  const resolvedIndex = window.resolveCurrentListIndex
    ? window.resolveCurrentListIndex()
    : window.currentListIndex;

  const list = window.marketListData[resolvedIndex];
  if (!list) return;

  let totalItems = 0,
    purchasedItems = 0,
    subtotalGeral = 0,
    totalMarcado = 0;

  (list.categories || []).forEach((cat) => {
    cat.items.forEach((item) => {
      totalItems++;
      if (item.checked) purchasedItems++;

      const itemTotalValue = calculateEffectiveItemTotalValue(item);

      if (!isNaN(itemTotalValue) && itemTotalValue > 0) {
        subtotalGeral += itemTotalValue;
        if (item.checked) totalMarcado += itemTotalValue;
      }
    });
  });

  const percent = totalItems > 0 ? (purchasedItems / totalItems) * 100 : 0;
  document.getElementById("total-qty").innerText =
    `${totalItems} ${totalItems === 1 ? "item" : "itens"}`;
  document.getElementById("checked-count").innerText =
    `${purchasedItems} comprado(s)`;
  document.getElementById("progress-bar").style.width = percent + "%";
  const format = (val) =>
    val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  document.getElementById("subtotal-all").innerText = format(subtotalGeral);
  document.getElementById("total-checked").innerText = format(totalMarcado);
};

// Flag de guard para evitar toggles simultâneos no mesmo item antes do saveAndSync terminar.
// Chave: "catIdx-itemIdx", valor: true enquanto a operação estiver em andamento.
const itemToggleInProgressMap = {};

window.toggleItemStatus = async function (catIdx, itemIdx) {
  const itemKey = `${catIdx}-${itemIdx}`;
  if (itemToggleInProgressMap[itemKey]) return;
  itemToggleInProgressMap[itemKey] = true;

  const resolvedIndex = window.resolveCurrentListIndex
    ? window.resolveCurrentListIndex()
    : window.currentListIndex;

  // Altera o estado local primeiro para feedback instantâneo
  const item =
    window.marketListData[resolvedIndex].categories[catIdx].items[itemIdx];
  item.checked = !item.checked;

  // Sincroniza a alteração com o Firebase
  await window.saveAndSync();

  // Libera o guard após a sincronização
  delete itemToggleInProgressMap[itemKey];

  // Re-renderiza para atualizar o Dashboard e os estilos do card
  window.renderListDetails();
};

// Flag de guard para evitar múltiplas exclusões simultâneas de categoria
let isDeletingCategory = false;

window.deleteCategory = async function (catIdx) {
  // Guard contra duplo clique: impede exclusão simultânea de categoria
  if (isDeletingCategory) return;

  const resolvedIndex = window.resolveCurrentListIndex
    ? window.resolveCurrentListIndex()
    : window.currentListIndex;

  const category = window.marketListData[resolvedIndex].categories[catIdx];

  // UX: Validação de segurança para não apagar dados por erro
  if (
    category.items.length > 0 &&
    !confirm(
      `A categoria "${category.name}" possui itens. Deseja excluir tudo permanentemente na nuvem?`,
    )
  ) {
    return;
  }

  isDeletingCategory = true;

  // Remove do array local
  window.marketListData[resolvedIndex].categories.splice(catIdx, 1);

  // Persiste a exclusão no Firestore
  await window.saveAndSync();

  // Libera o guard após a sincronização
  isDeletingCategory = false;

  // Atualiza a tela
  window.renderListDetails();
  window.showToast("Categoria removida", "success");
};

// Flag de guard para evitar múltiplas exclusões simultâneas de item
let isDeletingItem = false;

window.confirmDeleteItem = async function (catIdx, itemIdx) {
  // Guard contra duplo clique: impede exclusão simultânea de item
  if (isDeletingItem) return;

  const resolvedIndex = window.resolveCurrentListIndex
    ? window.resolveCurrentListIndex()
    : window.currentListIndex;

  const item =
    window.marketListData[resolvedIndex].categories[catIdx].items[itemIdx];

  if (confirm(`Deseja remover "${item.name}" definitivamente?`)) {
    isDeletingItem = true;

    // Remove o item específico da categoria
    window.marketListData[resolvedIndex].categories[catIdx].items.splice(
      itemIdx,
      1,
    );

    // Sincroniza com o Firebase
    await window.saveAndSync();

    // Libera o guard após a sincronização
    isDeletingItem = false;

    // Feedback visual e atualização da lista/dashboard
    window.renderListDetails();
    window.showToast("Item removido!", "success");
  }
};

/* ==========================================================================
   BUSCA DE ITENS — BOTÃO DE LIMPAR
   ========================================================================== */

/**
 * Atualiza a visibilidade do botão de limpar busca da tela de detalhes.
 * Exibe o botão apenas quando o campo de busca de itens possui conteúdo digitado.
 */
function updateItemSearchClearButtonVisibility() {
  const itemSearchInputElement = document.getElementById("item-search-input");
  const clearButtonElement = document.getElementById(
    "item-search-clear-button",
  );

  if (!itemSearchInputElement || !clearButtonElement) return;

  const hasContent = itemSearchInputElement.value.length > 0;
  clearButtonElement.classList.toggle("screen-hidden", !hasContent);
}

window.handleItemSearchInput = function () {
  updateItemSearchClearButtonVisibility();

  window.renderListDetails();
};

/**
 * Limpa o campo de busca de itens e re-renderiza os detalhes da lista.
 * Exposto globalmente para ser chamado pelo botão de limpar no HTML.
 */
window.clearItemSearch = function () {
  const itemSearchInputElement = document.getElementById("item-search-input");

  if (!itemSearchInputElement) return;

  itemSearchInputElement.value = "";

  // Aciona o handler para ocultar o botão e re-renderizar
  window.handleItemSearchInput();
};
