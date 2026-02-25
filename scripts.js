/* ==========================================================================
   1. ESTADO E CONFIGURAÇÕES
   ========================================================================== */
const listItemsContainer = document.getElementById("list-items-container");
const listsMasterContainer = document.getElementById("lists-master-container");
const searchInput = document.getElementById("search-input");

const itemNameInput = document.getElementById("item-name-input");
const itemDescInput = document.getElementById("item-desc-input");
const itemPriceInput = document.getElementById("item-price-input");
const itemCategorySelect = document.getElementById("item-category-select");

const toast = document.getElementById("toast");
const toastMessage = document.getElementById("toast-message");
const toastIcon = document.getElementById("toast-icon");

let currentListIndex = 0;
let editingItemIndex = null;
let editingCategoryIndex = null;
let isEditingListMode = false;
let isCopyingListMode = false;

// Estado do Swipe
let touchStartX = 0;
let activeSwipeCard = null;

let marketListData = JSON.parse(localStorage.getItem("marketList")) || [];

/* ==========================================================================
   2. UTILITÁRIOS: TOAST E NORMALIZAÇÃO
   ========================================================================== */
function normalizeString(str) {
  if (!str) return "";
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function showToast(message, type = "danger") {
  toastMessage.innerText = message;
  toast.classList.remove("success", "danger", "show");

  if (type === "success") {
    toast.classList.add("success");
    toastIcon.setAttribute("name", "checkmark-circle-outline");
  } else {
    toast.classList.add("danger");
    toastIcon.setAttribute("name", "alert-circle-outline");
  }

  setTimeout(() => {
    toast.classList.add("show");
  }, 10);

  const autoHide = setTimeout(() => {
    toast.classList.remove("show");
  }, 3500);

  toast.onclick = () => {
    toast.classList.remove("show");
    clearTimeout(autoHide);
  };
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  const [year, month, day] = dateStr.split("-");
  return `${day}/${month}/${year}`;
}

function saveAndSync() {
  localStorage.setItem("marketList", JSON.stringify(marketListData));
}

function formatCurrencyInput(input) {
  let value = input.value.replace(/\D/g, "");
  value = (value / 100).toFixed(2) + "";
  value = value.replace(".", ",");
  value = value.replace(/(\d)(?=(\d{3})+(?!\d))/g, "$1.");
  input.value = value;
}

/* ==========================================================================
   3. NAVEGAÇÃO
   ========================================================================== */
function showScreen(screenId) {
  const screens = [
    "home-screen",
    "market-lists-screen",
    "market-list-screen-details",
    "new-list-screen",
    "new-category-screen",
    "new-item-screen",
  ];
  screens.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = id === screenId ? "flex" : "none";
  });
  if (screenId === "market-lists-screen") renderMarketLists();
}

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

function handleBackFromForm() {
  if (isEditingListMode) {
    showScreen("market-list-screen-details");
  } else {
    showScreen("market-lists-screen");
  }
}

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
  }
}

function copyList(event, index) {
  event.stopPropagation();
  isEditingListMode = false;
  isCopyingListMode = true;
  currentListIndex = index;

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
  const filtered = marketListData.filter((list) => {
    const nameMatch = normalizeString(list.listName).includes(term);
    const locationMatch = list.location
      ? normalizeString(list.location).includes(term)
      : false;
    const dateMatch = formatDate(list.date).includes(term);
    return nameMatch || locationMatch || dateMatch;
  });

  filtered.forEach((list) => {
    const originalIndex = marketListData.indexOf(list);
    let totalItemsCount = 0,
      purchased = 0,
      subtotalValue = 0,
      totalValue = 0;

    (list.categories || []).forEach((cat) => {
      cat.items.forEach((item) => {
        totalItemsCount++;
        if (item.checked) purchased++;
        const valor = parseFloat(
          item.price.replace(/\./g, "").replace(",", "."),
        );
        if (!isNaN(valor)) {
          subtotalValue += valor;
          if (item.checked) totalValue += valor;
        }
      });
    });

    const percent =
      totalItemsCount > 0 ? (purchased / totalItemsCount) * 100 : 0;
    const format = (val) =>
      val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

    // Implementação do Swipe na Lista Geral
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

    // Adicionando eventos de Swipe
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

/* ==========================================================================
   5. CRIAÇÃO E EDIÇÃO DE LISTA
   ========================================================================== */
function openNewListForm() {
  isEditingListMode = false;
  isCopyingListMode = false;
  document.getElementById("form-title").innerText = "Nova Lista";
  document.getElementById("btn-save-list").innerText = "Salvar";
  document.getElementById("new-list-name").value = "";
  document.getElementById("new-list-location").value = "";
  const now = new Date();
  const year = now.getFullYear(),
    month = String(now.getMonth() + 1).padStart(2, "0"),
    day = String(now.getDate()).padStart(2, "0");
  document.getElementById("new-list-date").value = `${year}-${month}-${day}`;
  showScreen("new-list-screen");
}

function openEditListForm() {
  isEditingListMode = true;
  isCopyingListMode = false;
  const list = marketListData[currentListIndex];
  document.getElementById("form-title").innerText = "Editar Lista";
  document.getElementById("btn-save-list").innerText = "Atualizar";
  document.getElementById("new-list-name").value = list.listName;
  document.getElementById("new-list-location").value = list.location || "";
  document.getElementById("new-list-date").value = list.date;
  showScreen("new-list-screen");
}

function handleSaveNewList() {
  const name = document.getElementById("new-list-name").value.trim();
  const location = document.getElementById("new-list-location").value.trim();
  const date = document.getElementById("new-list-date").value;

  if (!name || !date) {
    showToast("Por favor, preencha os campos obrigatórios", "danger");
    return;
  }

  if (isEditingListMode) {
    marketListData[currentListIndex].listName = name;
    marketListData[currentListIndex].location = location;
    marketListData[currentListIndex].date = date;
    saveAndSync();

    const detailsVisible =
      document.getElementById("market-list-screen-details").style.display ===
      "flex";
    if (detailsVisible) {
      renderListDetails();
    } else {
      showScreen("market-lists-screen");
    }
    showToast("Lista atualizada!", "success");
  } else if (isCopyingListMode) {
    const original = marketListData[currentListIndex];

    if (date === original.date) {
      showToast(
        "Por favor insira uma data diferente da lista copiada",
        "danger",
      );
      return;
    }

    const clonedCategories = original.categories.map((cat) => ({
      name: cat.name,
      items: cat.items.map((item) => ({ ...item, checked: false })),
    }));
    marketListData.push({
      listName: name,
      location,
      date,
      categories: clonedCategories,
    });
    saveAndSync();
    isCopyingListMode = false;
    showScreen("market-lists-screen");
    showToast("Lista copiada!", "success");
  } else {
    marketListData.push({
      listName: name,
      location,
      date,
      categories: [{ name: "Geral", items: [] }],
    });
    saveAndSync();
    showScreen("market-lists-screen");
    showToast("Lista criada!", "success");
  }
}

/* ==========================================================================
   6. GESTÃO DE CATEGORIAS E ITENS (REFATORADO PARA TELAS)
   ========================================================================== */
function openNewCategoryForm() {
  editingCategoryIndex = null;
  document.getElementById("category-form-title").innerText = "Nova Categoria";
  document.getElementById("btn-save-category").innerText = "Salvar";
  document.getElementById("new-category-name").value = "";
  showScreen("new-category-screen");
}

function openEditCategoryForm(catIdx) {
  editingCategoryIndex = catIdx;
  const category = marketListData[currentListIndex].categories[catIdx];
  document.getElementById("category-form-title").innerText = "Editar Categoria";
  document.getElementById("btn-save-category").innerText = "Atualizar";
  document.getElementById("new-category-name").value = category.name;
  showScreen("new-category-screen");
}

function handleSaveCategory() {
  const input = document.getElementById("new-category-name");
  const name = input.value.trim();

  if (!name) {
    showToast("Digite o nome da categoria", "danger");
    return;
  }

  if (editingCategoryIndex !== null) {
    marketListData[currentListIndex].categories[editingCategoryIndex].name =
      name;
    showToast("Categoria atualizada!", "success");
  } else {
    marketListData[currentListIndex].categories.push({ name: name, items: [] });
    showToast("Categoria criada!", "success");
  }

  saveAndSync();
  input.value = "";
  showScreen("market-list-screen-details");
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

function openNewItemForm() {
  editingItemIndex = null;
  editingCategoryIndex = null;

  document.getElementById("item-form-title").innerText = "Novo Item";
  itemNameInput.value = "";
  itemDescInput.value = "";
  itemPriceInput.value = "";

  // Popula o select de categorias
  itemCategorySelect.innerHTML = "";
  const categories = marketListData[currentListIndex].categories;

  if (categories.length === 0) {
    marketListData[currentListIndex].categories.push({
      name: "Geral",
      items: [],
    });
    saveAndSync();
  }

  marketListData[currentListIndex].categories.forEach((cat, idx) => {
    const option = document.createElement("option");
    option.value = idx;
    option.text = cat.name;
    itemCategorySelect.appendChild(option);
  });

  showScreen("new-item-screen");
}

function enterEditMode(catIdx, itemIdx) {
  const item =
    marketListData[currentListIndex].categories[catIdx].items[itemIdx];
  editingItemIndex = itemIdx;
  editingCategoryIndex = catIdx;

  document.getElementById("item-form-title").innerText = "Editar Item";
  itemNameInput.value = item.name;
  itemDescInput.value = item.desc;
  itemPriceInput.value = item.price;

  // Popula select e marca a categoria atual
  itemCategorySelect.innerHTML = "";
  marketListData[currentListIndex].categories.forEach((cat, idx) => {
    const option = document.createElement("option");
    option.value = idx;
    option.text = cat.name;
    if (idx === catIdx) option.selected = true;
    itemCategorySelect.appendChild(option);
  });

  showScreen("new-item-screen");
}

// Salva o item (Novo ou Editado)
function handleSaveItem() {
  const name = itemNameInput.value.trim();
  const desc = itemDescInput.value.trim();
  const price = itemPriceInput.value.trim() || "0,00";
  const catIdx = parseInt(itemCategorySelect.value);

  if (!name) {
    showToast("O nome do produto é obrigatório", "danger");
    return;
  }

  if (editingItemIndex !== null) {
    // Se a categoria mudou na edição, remove do antigo e coloca no novo
    if (catIdx !== editingCategoryIndex) {
      const item = marketListData[currentListIndex].categories[
        editingCategoryIndex
      ].items.splice(editingItemIndex, 1)[0];
      item.name = name;
      item.desc = desc;
      item.price = price;
      marketListData[currentListIndex].categories[catIdx].items.push(item);
    } else {
      const item =
        marketListData[currentListIndex].categories[catIdx].items[
          editingItemIndex
        ];
      item.name = name;
      item.desc = desc;
      item.price = price;
    }
    showToast("Item atualizado!", "success");
  } else {
    marketListData[currentListIndex].categories[catIdx].items.push({
      name,
      desc,
      price,
      checked: false,
    });
    showToast("Item adicionado!", "success");
  }

  saveAndSync();
  showScreen("market-list-screen-details");
  renderListDetails();
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

function renderListDetails() {
  listItemsContainer.innerHTML = "";
  const currentList = marketListData[currentListIndex];
  document.getElementById("main-list-title").innerText = currentList.listName;

  currentList.categories.forEach((category, catIdx) => {
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
    category.items.forEach((item, itemIdx) => {
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

      card.innerHTML = `
            <div class="item-info">
                <div class="custom-check" onclick="toggleItemStatus(${catIdx}, ${itemIdx})"></div>
                <div class="text-group">
                    <span class="item-name">${item.name}</span>
                    <span class="item-desc">${item.desc}</span>
                </div>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
                <span class="item-price">R$ ${item.price}</span>
            </div>
        `;
      swipeContainer.appendChild(actionButtons);
      swipeContainer.appendChild(card);
      itemsList.appendChild(swipeContainer);
    });
    listItemsContainer.appendChild(catSection);
  });
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
      const valor = parseFloat(item.price.replace(/\./g, "").replace(",", "."));
      if (!isNaN(valor)) {
        subtotalGeral += valor;
        if (item.checked) totalMarcado += valor;
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

renderMarketLists();
