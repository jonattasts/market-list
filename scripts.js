/* ==========================================================================
   1. ESTADO E CONFIGURAÇÕES
   ========================================================================== */
const listItemsContainer = document.getElementById("list-items-container");
const listsMasterContainer = document.getElementById("lists-master-container");
const searchInput = document.getElementById("search-input");
const itemInput = document.getElementById("item-input");

let currentListIndex = 0; // Controla qual lista estamos editando

// Dados iniciais caso o storage esteja vazio
const defaultData = [
  {
    listName: "Supermercado Central",
    items: [
      {
        name: "Leite integral",
        desc: "2 litros",
        price: "8,50",
        checked: true,
      },
      { name: "Arroz", desc: "5 kg", price: "18,90", checked: false },
    ],
  },
  {
    listName: "Hortifruti Semanal",
    items: [
      { name: "Bananas", desc: "1 dúzia", price: "6,00", checked: false },
    ],
  },
];

let marketListData =
  JSON.parse(localStorage.getItem("marketList")) || defaultData;

/* ==========================================================================
   2. NAVEGAÇÃO ENTRE TELAS
   ========================================================================== */
function showScreen(screenId) {
  const screens = [
    "home-screen",
    "market-lists-screen",
    "market-list-screen-details",
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
   3. TELA: LISTAS DE COMPRAS (MASTER)
   ========================================================================== */
function renderMarketLists() {
  listsMasterContainer.innerHTML = "";
  const term = searchInput.value.toLowerCase();

  marketListData.forEach((list, index) => {
    if (!list.listName.toLowerCase().includes(term)) return;

    const totalItems = list.items.length;
    const purchased = list.items.filter((i) => i.checked).length;
    const percent = totalItems > 0 ? (purchased / totalItems) * 100 : 0;

    const card = document.createElement("div");
    card.className = "list-master-card";
    card.onclick = () => openListDetails(index);

    card.innerHTML = `
            <div class="list-master-header dashboard-header">
                <span class="list-master-title">${list.listName}</span>
                <span class="item-count">${totalItems} itens</span>
            </div>
            <div class="status-text">${purchased} itens comprados</div>
            <div class="mini-progress-bg">
                <div class="mini-progress-bar" style="width: ${percent}%"></div>
            </div>
        `;
    listsMasterContainer.appendChild(card);
  });
}

/* ==========================================================================
   4. TELA: DETALHES DA LISTA
   ========================================================================== */
function renderListDetails() {
  listItemsContainer.innerHTML = "";
  const currentList = marketListData[currentListIndex];

  document.getElementById("main-list-title").innerText = currentList.listName;

  currentList.items.forEach((item, idx) => {
    const card = document.createElement("div");
    card.className = `item-card ${item.checked ? "checked" : ""}`;
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
    `${purchased} itens comprados`;
  document.getElementById("progress-bar").style.width = percent + "%";
}

/* ==========================================================================
   5. PERSISTÊNCIA E INTERAÇÕES
   ========================================================================== */
function toggleItemStatus(itemIdx) {
  marketListData[currentListIndex].items[itemIdx].checked =
    !marketListData[currentListIndex].items[itemIdx].checked;
  saveAndSync();
  renderListDetails();
}

itemInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter" && itemInput.value.trim() !== "") {
    const [name, desc, price] = itemInput.value.split(";").map((p) => p.trim());
    marketListData[currentListIndex].items.push({
      name: name || "Novo Item",
      desc: desc || "1 un",
      price: price || "0,00",
      checked: false,
    });
    itemInput.value = "";
    saveAndSync();
    renderListDetails();
  }
});

function addNewList() {
  const name = prompt("Digite o nome da nova lista:");
  if (name) {
    marketListData.push({ listName: name, items: [] });
    saveAndSync();
    renderMarketLists();
  }
}

function saveAndSync() {
  localStorage.setItem("marketList", JSON.stringify(marketListData));
}

function focusInput() {
  itemInput.focus();
}

// Inicialização
renderMarketLists();
