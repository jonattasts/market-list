/* ==========================================================================
   1. ESTADO E CONFIGURAÇÕES
   ========================================================================== */
const listItemsContainer = document.getElementById("list-items-container");
const listsMasterContainer = document.getElementById("lists-master-container");
const searchInput = document.getElementById("search-input");
const itemInput = document.getElementById("item-input");
const toast = document.getElementById("toast");
const toastMessage = document.getElementById("toast-message");
const toastIcon = document.getElementById("toast-icon");

let currentListIndex = 0;
let pressTimer;
let editingItemIndex = null;
let isEditingListMode = false;
let isCopyingListMode = false;

let marketListData = JSON.parse(localStorage.getItem("marketList")) || [];

/* ==========================================================================
   2. UTILITÁRIOS: TOAST E NORMALIZAÇÃO
   ========================================================================== */

/**
 * Normaliza uma string removendo acentos e convertendo para minúsculas
 */
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

  // Timeout para garantir que a remoção da classe 'show' seja processada antes de re-adicionar
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

/* ==========================================================================
   3. NAVEGAÇÃO
   ========================================================================== */
function showScreen(screenId) {
  const screens = [
    "home-screen",
    "market-lists-screen",
    "market-list-screen-details",
    "new-list-screen",
  ];
  screens.forEach((id) => {
    document.getElementById(id).style.display =
      id === screenId ? "flex" : "none";
  });
  if (screenId === "market-lists-screen") renderMarketLists();
}

function openListDetails(index) {
  currentListIndex = index;
  showScreen("market-list-screen-details");
  renderListDetails();
}

function exitDetailsScreen() {
  cancelEditMode();
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
   4. TELA: LISTAS DE COMPRAS (BUSCA POR NOME, DATA OU LOCAL)
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
  event.stopPropagation(); // Não abre detalhes da lista ao clicar no ícone
  isEditingListMode = false;
  isCopyingListMode = true;
  currentListIndex = index;

  const originalList = marketListData[index];

  document.getElementById("form-title").innerText = "Copiar Lista";
  document.getElementById("btn-save-list").innerText = "Confirmar Cópia";

  document.getElementById("new-list-name").value = originalList.listName;
  document.getElementById("new-list-location").value =
    originalList.location || "";
  // Deixa a data vazia para obrigar o usuário a escolher uma nova
  document.getElementById("new-list-date").value = "";

  showScreen("new-list-screen");
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

  // LÓGICA DE PESQUISA: Ignora acentos no Nome e no Local
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
    const totalItemsCount = list.items.length;
    const purchased = list.items.filter((i) => i.checked).length;
    const percent =
      totalItemsCount > 0 ? (purchased / totalItemsCount) * 100 : 0;

    // Cálculo dos valores monetários para o card
    let subtotalValue = 0;
    let totalValue = 0;
    list.items.forEach((item) => {
      const valor = parseFloat(item.price.replace(/\./g, "").replace(",", "."));
      if (!isNaN(valor)) {
        subtotalValue += valor;
        if (item.checked) totalValue += valor;
      }
    });

    const format = (val) =>
      val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

    const card = document.createElement("div");
    card.className = "list-master-card";
    card.onclick = () => openListDetails(originalIndex);
    card.oncontextmenu = (e) => {
      e.preventDefault();
      confirmDeleteList(originalIndex);
    };

    // Lógica para Clique Longo (Touch e Mouse)
    const startPress = () => {
      pressTimer = setTimeout(() => {
        confirmDeleteList(originalIndex);
      }, 2000);
    };

    const cancelPress = () => {
      clearTimeout(pressTimer);
    };

    card.onmousedown = startPress;
    card.onmouseup = cancelPress;
    card.onmouseleave = cancelPress;

    // Suporte para Mobile (Touch)
    card.ontouchstart = startPress;
    card.ontouchend = cancelPress;

    card.innerHTML = `
            <div class="list-master-header dashboard-header">
                <span class="list-master-title">${list.listName}</span>
                <div style="display: flex; gap: 8px; align-items: center;">
                    <ion-icon name="copy-outline" onclick="copyList(event, ${originalIndex})" style="color: var(--primary); font-size: 20px;"></ion-icon>
                <span class="item-count">${totalItemsCount} itens</span>
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
    listsMasterContainer.appendChild(card);
  });
}

/* ==========================================================================
   5. CRIAÇÃO E EDIÇÃO DE LISTA
   ========================================================================== */
function openNewListForm() {
  isEditingListMode = false;
  isCopyingListMode = false;
  document.getElementById("form-title").innerText = "Nova Lista";
  document.getElementById("btn-save-list").innerText = "Salvar Lista";

  document.getElementById("new-list-name").value = "";
  document.getElementById("new-list-location").value = "";

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  document.getElementById("new-list-date").value = `${year}-${month}-${day}`;

  showScreen("new-list-screen");
}

function openEditListForm() {
  isEditingListMode = true;
  isCopyingListMode = false;
  const list = marketListData[currentListIndex];

  document.getElementById("form-title").innerText = "Editar Lista";
  document.getElementById("btn-save-list").innerText = "Atualizar Lista";

  document.getElementById("new-list-name").value = list.listName;
  document.getElementById("new-list-location").value = list.location || "";
  document.getElementById("new-list-date").value = list.date;

  showScreen("new-list-screen");
}

function handleSaveNewList() {
  const name = document.getElementById("new-list-name").value.trim();
  const location = document.getElementById("new-list-location").value.trim();
  const date = document.getElementById("new-list-date").value;

  if (!name) {
    showToast("Por favor, insira um nome para a lista", "danger");
    return;
  }

  if (!date) {
    showToast("Por favor, insira uma data válida para a lista", "danger");
    return;
  }

  if (isEditingListMode) {
    marketListData[currentListIndex].listName = name;
    marketListData[currentListIndex].location = location;
    marketListData[currentListIndex].date = date;

    saveAndSync();
    showScreen("market-list-screen-details");
    renderListDetails();
    showToast("Lista atualizada com sucesso!", "success");
  } else if (isCopyingListMode) {
    const original = marketListData[currentListIndex];

    if (date === original.date) {
      showToast(
        "Por favor insira uma data diferente da lista copiada",
        "danger",
      );
      return;
    }

    const clonedItems = original.items.map((item) => {
      return { ...item, checked: false };
    });

    marketListData.push({
      listName: name,
      location: location,
      date: date,
      items: clonedItems,
    });

    saveAndSync();
    isCopyingListMode = false;
    showScreen("market-lists-screen");
    showToast("Lista copiada com sucesso!", "success");
  } else {
    marketListData.push({
      listName: name,
      location: location,
      date: date,
      items: [],
    });

    saveAndSync();
    showScreen("market-lists-screen");
    showToast("Lista criada com sucesso!", "success");
  }
}

function confirmDeleteItem(itemIdx) {
  const itemName = marketListData[currentListIndex].items[itemIdx].name;
  if (confirm(`Deseja remover "${itemName}" da lista?`)) {
    marketListData[currentListIndex].items.splice(itemIdx, 1);
    saveAndSync();
    renderListDetails();
    showToast(`${itemName} removido!`, "success");
    if (editingItemIndex === itemIdx) cancelEditMode();
  }
}

function enterEditMode(idx) {
  const item = marketListData[currentListIndex].items[idx];
  editingItemIndex = idx;
  itemInput.value = `${item.name}; ${item.desc}; ${item.price}`;
  itemInput.focus();

  document.getElementById("item-input-group").style.borderColor =
    "var(--primary)";
  document.getElementById("input-mode-icon").innerText = "✏️";
}

function cancelEditMode() {
  editingItemIndex = null;
  itemInput.value = "";
  document.getElementById("item-input-group").style.borderColor =
    "var(--border-color)";
  document.getElementById("input-mode-icon").innerText = "🛒";
  itemInput.placeholder = "Adicione novo item (Ex: Arroz; 5kg; 18,90)";
}

function renderListDetails() {
  listItemsContainer.innerHTML = "";
  const currentList = marketListData[currentListIndex];
  document.getElementById("main-list-title").innerText = currentList.listName;

  currentList.items.forEach((item, idx) => {
    const card = document.createElement("div");
    card.className = `item-card ${item.checked ? "checked" : ""}`;

    const startPressItem = () => {
      pressTimer = setTimeout(() => {
        confirmDeleteItem(idx);
      }, 2000);
    };

    const cancelPressItem = () => {
      clearTimeout(pressTimer);
    };

    card.onmousedown = startPressItem;
    card.onmouseup = cancelPressItem;
    card.onmouseleave = cancelPressItem;
    card.ontouchstart = startPressItem;
    card.ontouchend = cancelPressItem;

    card.oncontextmenu = (e) => {
      e.preventDefault();
      confirmDeleteItem(idx);
    };

    card.innerHTML = `
            <div class="item-info">
                <div class="custom-check" onclick="toggleItemStatus(${idx})"></div>
                <div class="text-group" onclick="enterEditMode(${idx})" style="cursor: pointer;">
                    <span class="item-name">${item.name}</span>
                    <span class="item-desc">${item.desc}</span>
                </div>
            </div>
            <span class="item-price">R$ ${item.price}</span>
        `;
    listItemsContainer.appendChild(card);
  });
  updateDashboard();
}

function updateDashboard() {
  const list = marketListData[currentListIndex];
  const totalItems = list.items.length;
  const purchasedItems = list.items.filter((i) => i.checked).length;
  const percent = totalItems > 0 ? (purchasedItems / totalItems) * 100 : 0;

  // Atualização Elementos do Header
  document.getElementById("total-qty").innerText = `${totalItems} itens`;
  document.getElementById("checked-count").innerText =
    `${purchasedItems} comprado(s)`;
  document.getElementById("progress-bar").style.width = percent + "%";

  // Lógica de Cálculo de Totais Monetários
  let subtotalGeral = 0;
  let totalMarcado = 0;

  list.items.forEach((item) => {
    // Converte "1.250,50" -> 1250.50
    const valorNumerico = parseFloat(
      item.price.replace(/\./g, "").replace(",", "."),
    );

    if (!isNaN(valorNumerico)) {
      subtotalGeral += valorNumerico;
      if (item.checked) {
        totalMarcado += valorNumerico;
      }
    }
  });

  // Formatação para Moeda Brasileira
  const formatCurrency = (val) =>
    val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  // Atualização dos elementos fixos no Footer
  document.getElementById("subtotal-all").innerText =
    formatCurrency(subtotalGeral);
  document.getElementById("total-checked").innerText =
    formatCurrency(totalMarcado);
}

function toggleItemStatus(itemIdx) {
  marketListData[currentListIndex].items[itemIdx].checked =
    !marketListData[currentListIndex].items[itemIdx].checked;
  saveAndSync();
  renderListDetails();
}

/* VALIDAÇÃO COM REGEX */
itemInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter" && itemInput.value.trim() !== "") {
    /* REGEX:
       ^([^;]+)       -> 1º grupo: Nome (qualquer caractere exceto ;)
       ;              -> Obrigatório o uso de ponto e vírgula
       ([^;]+)        -> 2º grupo: Descrição (qualquer caractere exceto ;)
       ;              -> Obrigatório o uso de ponto e vírgula
       \s* -> Espaços opcionais antes do preço
       (              -> 3º grupo (Preço):
         \d{1,3}      -> Começa com 1 a 3 dígitos (ex: 1 ou 100)
         (\.?\d{3})* -> Opcional: separador de milhar (ponto) e 3 dígitos
         (,\d{1,2})?  -> Opcional: vírgula decimal e até 2 dígitos
         |            -> OU
         \d+          -> Apenas números simples (ex: 10)
         (,\d{1,2})?  -> Opcional: vírgula decimal
       )
       \s*$           -> Fim da linha
    */
    const regex =
      /^([^;]+);([^;]+);\s*(\d{1,3}(\.?\d{3})*(,\d{1,2})?|\d+(,\d{1,2})?)\s*$/;

    if (!regex.test(itemInput.value)) {
      showToast("Padrão incorreto! (Ex: Arroz; 5kg; 18,90)", "danger");
      return;
    }

    const [name, desc, priceRaw] = itemInput.value
      .split(";")
      .map((p) => p.trim());

    const cleanPrice = priceRaw.replace(/\./g, "").replace(",", ".");
    const numPrice = parseFloat(cleanPrice);

    const formattedPrice = isNaN(numPrice)
      ? "0,00"
      : numPrice.toFixed(2).replace(".", ",");

    if (editingItemIndex !== null) {
      const item = marketListData[currentListIndex].items[editingItemIndex];
      item.name = name;
      item.desc = desc;
      item.price = formattedPrice;
      showToast(`${name} atualizado!`, "success");
      cancelEditMode();
    } else {
      marketListData[currentListIndex].items.push({
        name: name,
        desc: desc,
        price: formattedPrice,
        checked: false,
      });
      showToast(`${name} adicionado com sucesso!`, "success");
    }

    itemInput.value = "";
    saveAndSync();
    renderListDetails();
  }
});

renderMarketLists();
