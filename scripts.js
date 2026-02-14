/* ==========================================================================
   1. SELETORES GERAIS DO DOM
   ========================================================================== */
const input = document.getElementById("item-input");
const listContainer = document.getElementById("list-container");
const progressBar = document.getElementById("progress-bar");
const checkedText = document.getElementById("checked-count");
const totalText = document.getElementById("total-qty");
const marketNameTitle = document.getElementById("market-name");
const mainListTitle = document.getElementById("main-list-title");

/* ==========================================================================
   2. GESTÃO DE ESTADO E PERSISTÊNCIA (STORAGE)
   ========================================================================== */

// Estrutura inicial de dados (Mock Data)
const defaultData = [
  {
    listName: "Supermercado Central",
    itemsLength: 7,
    itemsPurchasedLength: 3,
    items: [
      {
        name: "Leite integral",
        desc: "2 litros",
        price: "8,50",
        checked: true,
      },
      { name: "Pão de forma", desc: "1 pacote", price: "4,20", checked: true },
      { name: "Ovos", desc: "1 dúzia", price: "12,00", checked: true },
      { name: "Arroz", desc: "5 kg", price: "18,90", checked: false },
      { name: "Feijão preto", desc: "1 kg", price: "7,50", checked: false },
      { name: "Café torrado", desc: "500g", price: "14,30", checked: false },
      { name: "Açúcar refinado", desc: "1 kg", price: "4,15", checked: false },
    ],
  },
];

// Estado reativo da aplicação
let marketListData =
  JSON.parse(localStorage.getItem("marketList")) || defaultData;

/**
 * Sincroniza o estado atual com o LocalStorage e dispara a atualização da UI
 */
function saveAndUpdateUI() {
  const currentList = marketListData[0]; // Referência à lista ativa no índice 0

  // Recalcula metadados antes da persistência
  currentList.itemsLength = currentList.items.length;
  currentList.itemsPurchasedLength = currentList.items.filter(
    (i) => i.checked,
  ).length;

  localStorage.setItem("marketList", JSON.stringify(marketListData));
  renderListDetails();
}

/* ==========================================================================
   3. NAVEGAÇÃO ENTRE TELAS (SPA LOGIC)
   ========================================================================== */

/**
 * Gerencia a troca de contextos entre a Home e os Detalhes da Lista
 */
function showScreen(screenId) {
  const home = document.getElementById("home-screen");
  const details = document.getElementById("market-list-screen-details");

  if (screenId === "home-screen") {
    home.style.display = "flex";
    details.style.display = "none";
    updateHomeButton(); // Atualiza o texto toda vez que volta para a Home
  } else {
    home.style.display = "none";
    details.style.display = "flex";
    renderListDetails();
  }
}

/* ==========================================================================
   4. TELA: MARKET-LIST-SCREEN-DETAILS (LÓGICA ESPECÍFICA)
   ========================================================================== */

/**
 * Constrói a interface da lista detalhada e atualiza o dashboard de progresso
 */
/**
 * Constrói a interface da lista detalhada e atualiza o progresso.
 * Refatorado para exibir o nome da lista no Header.
 */
function renderListDetails() {
  // Verifica se os elementos essenciais existem para evitar erros no console
  if (!listContainer || !marketListData[0]) return;

  listContainer.innerHTML = "";
  const currentList = marketListData[0];

  // 1. Injeta o nome da lista no TÍTULO PRINCIPAL (Header)
  const mainListTitle = document.getElementById("main-list-title");
  if (mainListTitle) {
    mainListTitle.innerText = currentList.listName;
  }

  // 2. Renderização dinâmica dos cards de itens
  currentList.items.forEach((item, index) => {
    const card = document.createElement("div");
    card.className = `item-card ${item.checked ? "checked" : ""}`;
    card.innerHTML = `
            <div class="item-info">
                <div class="custom-check" onclick="toggleItemStatus(${index})"></div>
                <div class="text-group">
                    <span class="item-name">${item.name}</span>
                    <span class="item-desc">${item.desc}</span>
                </div>
            </div>
            <span class="item-price">R$ ${item.price}</span>
        `;
    listContainer.appendChild(card);
  });

  // 3. Atualização dos indicadores (Dashboard)
  if (totalText) totalText.innerText = `${currentList.itemsLength} itens`;
  if (checkedText)
    checkedText.innerText = `${currentList.itemsPurchasedLength} itens comprados`;

  // 4. Cálculo e atualização da barra de progresso
  if (progressBar) {
    const percent =
      currentList.itemsLength > 0
        ? (currentList.itemsPurchasedLength / currentList.itemsLength) * 100
        : 0;
    progressBar.style.width = percent + "%";
  }
}

/**
 * Captura entrada do teclado e adiciona novo item à lista detalhada
 */
input.addEventListener("keypress", (e) => {
  if (e.key === "Enter" && input.value.trim() !== "") {
    const [name, desc, price] = input.value
      .split(",")
      .map((part) => part.trim());

    const newItem = {
      name: name || "Novo Item",
      desc: desc || "1 unidade",
      price: price || "0,00",
      checked: false,
    };

    marketListData[0].items.push(newItem);
    input.value = "";
    saveAndUpdateUI();
  }
});

/**
 * Alterna a marcação de 'comprado' de um item específico
 */
function toggleItemStatus(index) {
  marketListData[0].items[index].checked =
    !marketListData[0].items[index].checked;
  saveAndUpdateUI();
}

/**
 * Aciona o foco no input para agilizar a digitação
 */
function focusInput() {
  input.focus();
}

function updateHomeButton() {
  const btnStart = document.querySelector(".btn-start");
  if (!btnStart) return;

  const currentList = marketListData[0];

  // Se a lista estiver vazia (0 itens), sugere criar. Caso contrário, sugere ver.
  if (currentList.items.length === 0) {
    btnStart.innerText = "Criar uma lista de compras";
  } else {
    btnStart.innerText = "Ver suas listas de compras";
  }
}

/* ==========================================================================
   5. BOOTSTRAP (INICIALIZAÇÃO)
   ========================================================================== */
updateHomeButton();
renderListDetails();
