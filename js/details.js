/* ==========================================================================
   RENDERIZAÇÃO DE DETALHES COM BUSCA
   ========================================================================== */
window.openListDetails = function (index) {
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
};

window.exitDetailsScreen = function () {
  window.showScreen("market-lists-screen");
};

window.renderListDetails = function () {
  window.listItemsContainer.innerHTML = "";
  const currentList = window.marketListData[window.currentListIndex];
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

  currentList.categories.forEach((category, catIdx) => {
    const filteredItems = category.items.filter((item) => {
      const nameMatch = window.normalizeString(item.name).includes(term);
      const descMatch = window.normalizeString(item.desc).includes(term);
      const priceMatch = item.price.includes(term);
      return nameMatch || descMatch || priceMatch;
    });

    if (term !== "" && filteredItems.length === 0) return;

    const catSection = document.createElement("div");
    catSection.className = "category-section";

    // Ícones de edição e exclusão de categoria apenas para quem pode editar
    const categoryActionsHTML = userPermissions.canEdit
      ? `
        <div style="display: flex; gap: 15px; align-items: center;">
          <ion-icon name="create-outline" onclick="openEditCategoryForm(${catIdx})" style="color: var(--primary); font-size: 20px;"></ion-icon>
          <ion-icon name="trash-outline" onclick="deleteCategory(${catIdx})" style="color: var(--danger); font-size: 18px;"></ion-icon>
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
                <button onclick="enterEditMode(${catIdx}, ${itemIdx})" style="background: var(--primary); width: 75px;">
                    <ion-icon name="create-outline" style="font-size: 20px;"></ion-icon> Editar
                </button>
                <button onclick="confirmDeleteItem(${catIdx}, ${itemIdx})" style="background: var(--danger); width: 75px;">
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

        const valorUnitario = parseFloat(
          item.price.replace(/\./g, "").replace(",", "."),
        );
        const qtd = item.quantity || 1;
        const totalItemExibido = (valorUnitario * qtd).toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL",
        });

        // Checkbox de marcação disponível para todos (dono e compartilhados podem marcar)
        card.innerHTML = `
                <div class="item-info">
                    <div class="custom-check" onclick="toggleItemStatus(${catIdx}, ${itemIdx})"></div>
                    <div class="text-group">
                        <span class="item-name">${item.name} <span style="font-size: 11px; color: var(--text-secondary);">(x${qtd})</span></span>
                        <span class="item-desc">${item.desc}</span>
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span class="item-price">${totalItemExibido}</span>
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
  const detailsOptionsButton = document.getElementById("button-options-details");
  if (detailsOptionsButton) {
    // Apenas o dono pode acessar as opções de compartilhamento e edição da lista
    detailsOptionsButton.style.display = userPermissions.isOwner ? "flex" : "none";
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
  const list = window.marketListData[window.currentListIndex];
  let totalItems = 0,
    purchasedItems = 0,
    subtotalGeral = 0,
    totalMarcado = 0;

  (list.categories || []).forEach((cat) => {
    cat.items.forEach((item) => {
      totalItems++;
      if (item.checked) purchasedItems++;
      const valorUnitario = parseFloat(
        item.price.replace(/\./g, "").replace(",", "."),
      );
      const qtd = item.quantity || 1;

      if (!isNaN(valorUnitario)) {
        const valorTotalItem = valorUnitario * qtd;
        subtotalGeral += valorTotalItem;
        if (item.checked) totalMarcado += valorTotalItem;
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

window.toggleItemStatus = async function (catIdx, itemIdx) {
  // Altera o estado local primeiro para feedback instantâneo
  const item =
    window.marketListData[window.currentListIndex].categories[catIdx].items[
      itemIdx
    ];
  item.checked = !item.checked;

  // Sincroniza a alteração com o Firebase
  await window.saveAndSync();

  // Re-renderiza para atualizar o Dashboard e os estilos do card
  window.renderListDetails();
};

window.deleteCategory = async function (catIdx) {
  const category =
    window.marketListData[window.currentListIndex].categories[catIdx];

  // UX: Validação de segurança para não apagar dados por erro
  if (
    category.items.length > 0 &&
    !confirm(
      `A categoria "${category.name}" possui itens. Deseja excluir tudo permanentemente na nuvem?`,
    )
  ) {
    return;
  }

  // Remove do array local
  window.marketListData[window.currentListIndex].categories.splice(catIdx, 1);

  // Persiste a exclusão no Firestore
  await window.saveAndSync();

  // Atualiza a tela
  window.renderListDetails();
  window.showToast("Categoria removida", "success");
};

window.confirmDeleteItem = async function (catIdx, itemIdx) {
  const item =
    window.marketListData[window.currentListIndex].categories[catIdx].items[
      itemIdx
    ];

  if (confirm(`Deseja remover "${item.name}" definitivamente?`)) {
    // Remove o item específico da categoria
    window.marketListData[window.currentListIndex].categories[
      catIdx
    ].items.splice(itemIdx, 1);

    // Sincroniza com o Firebase
    await window.saveAndSync();

    // Feedback visual e atualização da lista/dashboard
    window.renderListDetails();
    window.showToast("Item removido!", "success");
  }
};
