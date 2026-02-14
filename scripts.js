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

let marketListData = JSON.parse(localStorage.getItem("marketList")) || [];

/* ==========================================================================
   2. UTILITÁRIOS: TOAST REFATORADO
   ========================================================================== */
/**
 * Exibe um toast customizado
 * @param {string} message - Texto do toast
 * @param {string} type - 'success' ou 'danger'
 */
function showToast(message, type = "danger") {
  toastMessage.innerText = message;

  // Limpa classes anteriores
  toast.classList.remove("success", "danger", "show");

  // Define o ícone e a cor baseada no tipo
  if (type === "success") {
    toast.classList.add("success");
    toastIcon.setAttribute("name", "checkmark-circle-outline");
  } else {
    toast.classList.add("danger");
    toastIcon.setAttribute("name", "alert-circle-outline");
  }

  // Pequeno timeout para garantir que a remoção da classe 'show' seja processada antes de re-adicionar
  setTimeout(() => {
    toast.classList.add("show");
  }, 10);

  setTimeout(() => {
    toast.classList.remove("show");
  }, 3500);
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

function renderMarketLists() {
  listsMasterContainer.innerHTML = "";
  const term = searchInput.value.toLowerCase();

  if (marketListData.length === 0) {
    searchInput.disabled = true;
    listsMasterContainer.innerHTML = `<div class="empty-state"><span class="empty-emoji">📝</span><p>Ainda não há listas.</p></div>`;
    return;
  }

  searchInput.disabled = false;
  const filtered = marketListData.filter((list) =>
    list.listName.toLowerCase().includes(term),
  );

  filtered.forEach((list) => {
    const originalIndex = marketListData.indexOf(list);
    const total = list.items.length;
    const purchased = list.items.filter((i) => i.checked).length;
    const percent = total > 0 ? (purchased / total) * 100 : 0;

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
      }, 2000); // 2 segundos
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
                <span class="item-count">${total} itens</span>
            </div>
            <div class="date-text">${formatDate(list.date)}</div>
            <div class="status-text">${purchased} comprado(s)</div>
            <div class="mini-progress-bg"><div class="mini-progress-bar" style="width: ${percent}%"></div></div>
        `;
    listsMasterContainer.appendChild(card);
  });
}

/* ==========================================================================
   5. CRIAÇÃO DE LISTA
   ========================================================================== */
function openNewListForm() {
  document.getElementById("new-list-name").value = "";

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  document.getElementById("new-list-date").value = `${year}-${month}-${day}`;

  showScreen("new-list-screen");
}

function handleSaveNewList() {
  const name = document.getElementById("new-list-name").value.trim();
  const date = document.getElementById("new-list-date").value;

  if (!name) {
    showToast("Por favor, insira um nome para a lista", "danger");
    return;
  }

  if (!date) {
    showToast("Por favor, insira uma data válida para a lista", "danger");
    return;
  }
  marketListData.push({ listName: name, date: date, items: [] });
  saveAndSync();
  showScreen("market-lists-screen");
  showToast("Lista criada com sucesso!", "success");
}

/* REMOÇÃO DE ITEM INDIVIDUAL */
function confirmDeleteItem(itemIdx) {
  const itemName = marketListData[currentListIndex].items[itemIdx].name;
  if (confirm(`Deseja remover "${itemName}" da lista?`)) {
    marketListData[currentListIndex].items.splice(itemIdx, 1);
    saveAndSync();
    renderListDetails();
    showToast(`${itemName} removido!`, "success");
  }
}

function renderListDetails() {
  listItemsContainer.innerHTML = "";
  const currentList = marketListData[currentListIndex];
  document.getElementById("main-list-title").innerText = currentList.listName;

  currentList.items.forEach((item, idx) => {
    const card = document.createElement("div");
    card.className = `item-card ${item.checked ? "checked" : ""}`;

    // Lógica para Clique Longo no Item para Remover
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

    // Clique com botão direito (Desktop)
    card.oncontextmenu = (e) => {
      e.preventDefault();
      confirmDeleteItem(idx);
    };

    card.innerHTML = `
            <div class="item-info">
                <div class="custom-check" onclick="toggleItemStatus(${idx})"></div>
                <div class="text-group">
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
  const total = list.items.length;
  const purchased = list.items.filter((i) => i.checked).length;
  const percent = total > 0 ? (purchased / total) * 100 : 0;
  document.getElementById("total-qty").innerText = `${total} itens`;
  document.getElementById("checked-count").innerText =
    `${purchased} comprado(s)`;
  document.getElementById("progress-bar").style.width = percent + "%";
}

function toggleItemStatus(itemIdx) {
  marketListData[currentListIndex].items[itemIdx].checked =
    !marketListData[currentListIndex].items[itemIdx].checked;
  saveAndSync();
  renderListDetails();
}

/* VALIDAÇÃO COM REGEX E TOAST DE SUCESSO */
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

    marketListData[currentListIndex].items.push({
      name: name,
      desc: desc,
      price: formattedPrice,
      checked: false,
    });

    itemInput.value = "";
    saveAndSync();
    renderListDetails();

    showToast(`${name} adicionado com sucesso!`, "success");
  }
});

renderMarketLists();
