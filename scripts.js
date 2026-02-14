/* ==========================================================================
   1. ESTADO E CONFIGURAÇÕES
   ========================================================================== */
const listItemsContainer = document.getElementById("list-items-container");
const listsMasterContainer = document.getElementById("lists-master-container");
const searchInput = document.getElementById("search-input");
const itemInput = document.getElementById("item-input");

let currentListIndex = 0;
let pressTimer; // Timer para o clique longo

const defaultData = [
  {
    listName: "Supermercado Central",
    date: "2026-02-13",
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
   3. TELA: LISTAS DE COMPRAS E LÓGICA DE EXCLUSÃO
   ========================================================================== */
function confirmDeleteList(index) {
  const listName = marketListData[index].listName;
  const confirmacao = confirm(`Deseja excluir a lista "${listName}"?`);

  if (confirmacao) {
    marketListData.splice(index, 1);
    saveAndSync();
    renderMarketLists();
  }
}

function renderMarketLists() {
  listsMasterContainer.innerHTML = "";
  const term = searchInput.value.toLowerCase();

  if (marketListData.length === 0) {
    searchInput.disabled = true;
    searchInput.placeholder = "Crie uma lista para buscar...";
    listsMasterContainer.innerHTML = `
      <div class="empty-state">
        <span class="empty-emoji">📝</span>
        <p>Ainda não há listas de compras registradas.</p>
      </div>
    `;
    return;
  }

  searchInput.disabled = false;
  searchInput.placeholder = "Buscar lista pelo nome...";

  const filteredLists = marketListData.filter((list) =>
    list.listName.toLowerCase().includes(term),
  );

  if (filteredLists.length === 0 && term !== "") {
    listsMasterContainer.innerHTML = `<p class="no-results">Nenhuma lista encontrada com "${term}"</p>`;
    return;
  }

  filteredLists.forEach((list) => {
    const originalIndex = marketListData.indexOf(list);
    const totalItems = list.items.length;
    const purchased = list.items.filter((i) => i.checked).length;
    const percent = totalItems > 0 ? (purchased / totalItems) * 100 : 0;

    const card = document.createElement("div");
    card.className = "list-master-card";

    // Clique normal para abrir
    card.onclick = () => openListDetails(originalIndex);

    // Lógica para Clique Direito (Mouse)
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
                <span class="item-count">${totalItems} itens</span>
            </div>
            <div class="date-text">${formatDate(list.date)}</div>
            <div class="status-text">${purchased} comprado(s)</div>
            <div class="mini-progress-bg">
                <div class="mini-progress-bar" style="width: ${percent}%"></div>
            </div>
        `;
    listsMasterContainer.appendChild(card);
  });
}

/* ==========================================================================
   4. CRIAÇÃO DE NOVA LISTA
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
    alert("Por favor, insira um nome para a lista.");
    return;
  }

  if (!date) {
    alert("Por favor, insira uma data válida para a lista.");
    return;
  }

  marketListData.push({
    listName: name,
    date: date,
    items: [],
  });

  saveAndSync();
  showScreen("market-lists-screen");
}

/* ==========================================================================
   5. TELA: DETALHES E PERSISTÊNCIA
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
    `${purchased} comprado(s)`;
  document.getElementById("progress-bar").style.width = percent + "%";
}

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

function saveAndSync() {
  localStorage.setItem("marketList", JSON.stringify(marketListData));
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  const [year, month, day] = dateStr.split("-");
  return `${day}/${month}/${year}`;
}

// Inicialização
renderMarketLists();
