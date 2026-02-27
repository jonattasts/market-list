/* ==========================================================================
   4. TELA: LISTAS DE COMPRAS
   ========================================================================== */
function confirmDeleteList(index) {
  const listName = marketListData[index].listName;
  if (confirm(`Deseja excluir a "${listName}"?`)) {
    marketListData.splice(index, 1);
    saveAndSync();
    renderMarketLists();
    showToast("Lista removida com sucesso", "success");

    if (marketListData.length === 0) {
      showScreen("home-screen");
    }
  }
}

function copyList(event, index) {
  event.stopPropagation();
  isEditingListMode = false;
  isCopyingListMode = true;
  currentListIndex = index;
  previousScreen = "market-lists-screen";

  const originalList = marketListData[index];
  document.getElementById("form-title").innerText = "Copiar Lista";
  document.getElementById("btn-save-list").innerText = "Confirmar Cópia";
  document.getElementById("new-list-name").value = originalList.listName;
  document.getElementById("new-list-location").value =
    originalList.location || "";
  document.getElementById("new-list-date").value = "";
  showScreen("new-list-screen");
}

function handleEditListFromSwipe(index) {
  currentListIndex = index;
  previousScreen = "market-lists-screen";
  openEditListForm();
}

function renderMarketLists() {
  listsMasterContainer.innerHTML = "";
  const term = normalizeString(searchInput.value);

  if (marketListData.length === 0) {
    searchInput.disabled = true;
    listsMasterContainer.innerHTML = `<div class="empty-state"><span class="empty-emoji">📝</span><p>Ainda não há listas.</p></div>`;
    return;
  }

  searchInput.disabled = false;

  const sortedListData = [...marketListData].sort((a, b) => {
    return new Date(b.date) - new Date(a.date);
  });

  const filtered = sortedListData.filter((list) => {
    const nameMatch = normalizeString(list.listName).includes(term);
    const locationMatch = list.location
      ? normalizeString(list.location).includes(term)
      : false;
    const dateMatch = formatDate(list.date).includes(term);
    return nameMatch || locationMatch || dateMatch;
  });

  filtered.forEach((list) => {
    const originalIndex = marketListData.findIndex(
      (original) => original === list,
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
    card.onclick = () => openListDetails(originalIndex);

    card.ontouchstart = handleTouchStart;
    card.ontouchmove = handleTouchMove;
    card.ontouchend = handleTouchEnd;

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
            ${formatDate(list.date)}
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
    listsMasterContainer.appendChild(swipeContainer);
  });
}

/* --- LOGICA DE SWIPE --- */
function handleTouchStart(e) {
  touchStartX = e.touches[0].clientX;
  const card = e.currentTarget;
  if (activeSwipeCard && activeSwipeCard !== card)
    activeSwipeCard.style.transform = "translateX(0)";
}

function handleTouchMove(e) {
  const touchX = e.touches[0].clientX;
  const diff = touchX - touchStartX;
  const card = e.currentTarget;
  if (diff < 0 && diff > -160) card.style.transform = `translateX(${diff}px)`;
}

function handleTouchEnd(e) {
  const card = e.currentTarget;
  const touchEndX = e.changedTouches[0].clientX;
  const diff = touchEndX - touchStartX;
  if (diff < -80) {
    card.style.transform = "translateX(-150px)";
    activeSwipeCard = card;
  } else {
    card.style.transform = "translateX(0)";
    activeSwipeCard = null;
  }
}
