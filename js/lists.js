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

window.renderMarketLists = function () {
  window.listsMasterContainer.innerHTML = "";
  const term = window.normalizeString(window.searchInput.value);

  if (window.marketListData.length === 0) {
    window.searchInput.disabled = true;
    window.listsMasterContainer.innerHTML = `<div class="empty-state"><span class="empty-emoji">📝</span><p>Ainda não há listas.</p></div>`;
    return;
  }

  window.searchInput.disabled = false;

  // Ordenação por data (descendente)
  const sortedListData = [...window.marketListData].sort((a, b) => {
    return new Date(b.date) - new Date(a.date);
  });

  const filtered = sortedListData.filter((list) => {
    const nameMatch = window.normalizeString(list.listName).includes(term);
    const locationMatch = list.location
      ? window.normalizeString(list.location).includes(term)
      : false;
    const dateMatch = window.formatDate(list.date).includes(term);
    return nameMatch || locationMatch || dateMatch;
  });

  filtered.forEach((list) => {
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
    window.listsMasterContainer.appendChild(swipeContainer);
  });
};

/* ==========================================================================
   LOGICA DE SWIPE
   ========================================================================== */
window.handleTouchStart = function (e) {
  window.touchStartX = e.touches[0].clientX;
  const card = e.currentTarget;
  if (window.activeSwipeCard && window.activeSwipeCard !== card)
    window.activeSwipeCard.style.transform = "translateX(0)";
};

window.handleTouchMove = function (e) {
  const touchX = e.touches[0].clientX;
  const diff = touchX - window.touchStartX;
  const card = e.currentTarget;
  if (diff < 0 && diff > -160) card.style.transform = `translateX(${diff}px)`;
};

window.handleTouchEnd = function (e) {
  const card = e.currentTarget;
  const touchEndX = e.changedTouches[0].clientX;
  const diff = touchEndX - window.touchStartX;
  if (diff < -80) {
    card.style.transform = "translateX(-150px)";
    window.activeSwipeCard = card;
  } else {
    card.style.transform = "translateX(0)";
    window.activeSwipeCard = null;
  }
};
