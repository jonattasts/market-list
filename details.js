/* ==========================================================================
   7. RENDERIZAÇÃO DE DETALHES COM BUSCA
   ========================================================================== */
function openListDetails(index) {
  currentListIndex = index;
  if (!marketListData[currentListIndex].categories) {
    const oldItems = marketListData[currentListIndex].items || [];
    marketListData[currentListIndex].categories = [
      { name: "Geral", items: oldItems },
    ];
    delete marketListData[currentListIndex].items;
    saveAndSync();
  }
  showScreen("market-list-screen-details");
  renderListDetails();
}

function exitDetailsScreen() {
  showScreen("market-lists-screen");
}

function renderListDetails() {
  listItemsContainer.innerHTML = "";
  const currentList = marketListData[currentListIndex];
  document.getElementById("main-list-title").innerText = currentList.listName;

  const term = itemSearchInput ? normalizeString(itemSearchInput.value) : "";

  currentList.categories.forEach((category, catIdx) => {
    const filteredItems = category.items.filter((item) => {
      const nameMatch = normalizeString(item.name).includes(term);
      const descMatch = normalizeString(item.desc).includes(term);
      const priceMatch = item.price.includes(term);
      return nameMatch || descMatch || priceMatch;
    });

    if (term !== "" && filteredItems.length === 0) return;

    const catSection = document.createElement("div");
    catSection.className = "category-section";
    catSection.innerHTML = `
        <div class="category-header">
            <span class="category-name">${category.name}</span>
            <div style="display: flex; gap: 15px; align-items: center;">
                <ion-icon name="create-outline" onclick="openEditCategoryForm(${catIdx})" style="color: var(--primary); font-size: 20px;"></ion-icon>
                <ion-icon name="trash-outline" onclick="deleteCategory(${catIdx})" style="color: var(--danger); font-size: 18px;"></ion-icon>
            </div>
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

        const actionButtons = document.createElement("div");
        actionButtons.className = "swipe-actions";
        actionButtons.innerHTML = `
                <button onclick="enterEditMode(${catIdx}, ${itemIdx})" style="background: var(--primary); width: 75px;">
                    <ion-icon name="create-outline" style="font-size: 20px;"></ion-icon> Editar
                </button>
                <button onclick="confirmDeleteItem(${catIdx}, ${itemIdx})" style="background: var(--danger); width: 75px;">
                    <ion-icon name="trash-outline" style="font-size: 20px;"></ion-icon> Apagar
                </button>
            `;

        const card = document.createElement("div");
        card.className = `item-card ${item.checked ? "checked" : ""}`;
        card.ontouchstart = handleTouchStart;
        card.ontouchmove = handleTouchMove;
        card.ontouchend = handleTouchEnd;

        const valorUnitario = parseFloat(
          item.price.replace(/\./g, "").replace(",", "."),
        );
        const qtd = item.quantity || 1;
        const totalItemExibido = (valorUnitario * qtd).toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL",
        });

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
    listItemsContainer.appendChild(catSection);
  });

  if (term !== "" && listItemsContainer.innerHTML === "") {
    listItemsContainer.innerHTML = `
        <div class="empty-state">
            <span class="empty-emoji">🔍</span>
            <p>Nenhum item encontrado para "${itemSearchInput.value}"</p>
        </div>
      `;
  }

  updateDashboard();
}

function updateDashboard() {
  const list = marketListData[currentListIndex];
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
}

function toggleItemStatus(catIdx, itemIdx) {
  marketListData[currentListIndex].categories[catIdx].items[itemIdx].checked =
    !marketListData[currentListIndex].categories[catIdx].items[itemIdx].checked;
  saveAndSync();
  renderListDetails();
}

function deleteCategory(catIdx) {
  const category = marketListData[currentListIndex].categories[catIdx];
  if (
    category.items.length > 0 &&
    !confirm(
      `A categoria "${category.name}" possui itens. Deseja excluir tudo?`,
    )
  )
    return;
  marketListData[currentListIndex].categories.splice(catIdx, 1);
  saveAndSync();
  renderListDetails();
}

function confirmDeleteItem(catIdx, itemIdx) {
  const item =
    marketListData[currentListIndex].categories[catIdx].items[itemIdx];
  if (confirm(`Deseja remover "${item.name}"?`)) {
    marketListData[currentListIndex].categories[catIdx].items.splice(
      itemIdx,
      1,
    );
    saveAndSync();
    renderListDetails();
    showToast("Removido!", "success");
  }
}
