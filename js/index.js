/* ==========================================================================
   ESTADO E CONFIGURAÇÕES
   ========================================================================== */
import {
  firestore,
  collection,
  doc,
  addDoc,
  updateDoc,
  serverTimestamp,
} from "./firebase.js";
import {
  query,
  orderBy,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

window.listItemsContainer = document.getElementById("list-items-container");
window.listsMasterContainer = document.getElementById("lists-master-container");
window.searchInput = document.getElementById("search-input");
window.itemSearchInput = document.getElementById("item-search-input");

window.itemNameInput = document.getElementById("item-name-input");
window.itemDescInput = document.getElementById("item-desc-input");
window.itemPriceInput = document.getElementById("item-price-input");
window.itemQuantityInput = document.getElementById("item-quantity-input");
window.itemCategorySelect = document.getElementById("item-category-select");

window.toast = document.getElementById("toast");
window.toastMessage = document.getElementById("toast-message");
window.toastIcon = document.getElementById("toast-icon");

// Expondo variáveis de controle ao escopo global para outros módulos
window.currentListIndex = 0;
window.editingItemIndex = null;
window.editingCategoryIndex = null;
window.isEditingListMode = false;
window.isCopyingListMode = false;
window.previousScreen = "home-screen";

// Estado do Swipe
window.touchStartX = 0;
window.activeSwipeCard = null;

window.marketListData = [];

// Variável de controle para primeira carga
let isFirstLoad = true;

/* ==========================================================================
   UTILITÁRIOS GLOBAIS
   ========================================================================== */
window.normalizeString = function (str) {
  if (!str) return "";
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
};

window.capitalize = function (str) {
  if (!str) return "";
  const trimmed = str.trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() + trimmed.slice(1) : "";
};

window.showToast = function (message, type = "danger") {
  window.toastMessage.innerText = message;
  window.toast.classList.remove("success", "danger", "show");
  window.toast.classList.add(type === "success" ? "success" : "danger");
  window.toastIcon.setAttribute(
    "name",
    type === "success" ? "checkmark-circle-outline" : "alert-circle-outline",
  );

  setTimeout(() => toast.classList.add("show"), 10);
  const autoHide = setTimeout(() => toast.classList.remove("show"), 3500);
  window.toast.onclick = () => {
    window.toast.classList.remove("show");
    clearTimeout(autoHide);
  };
};

window.formatDate = function (dateStr) {
  if (!dateStr) return "";
  const [year, month, day] = dateStr.split("-");
  return `${day}/${month}/${year}`;
};

window.formatCurrencyInput = function (input) {
  let value = input.value.replace(/\D/g, "");
  value = (value / 100).toFixed(2) + "";
  value = value.replace(".", ",").replace(/(\d)(?=(\d{3})+(?!\d))/g, "$1.");
  input.value = value;
};

/* ==========================================================================
   PERSISTÊNCIA FIREBASE
   ========================================================================== */
window.saveAndSync = async function () {
  const currentList = window.marketListData[window.currentListIndex];
  if (!currentList || !currentList.id) return;

  try {
    const listRef = doc(firestore, "lists", currentList.id);
    await updateDoc(listRef, {
      listName: currentList.listName,
      location: currentList.location,
      date: currentList.date,
      categories: currentList.categories,
      updatedAt: serverTimestamp(),
    });
  } catch (e) {
    console.error("Erro ao atualizar Firestore:", e);
    window.showToast("Erro ao sincronizar dados", "danger");
  }
};

/* --- LÓGICA DE MIGRAÇÃO (LOCALSTORAGE -> FIREBASE) --- */
async function migrateData() {
  const localData = localStorage.getItem("marketList");
  if (localData) {
    const parsedData = JSON.parse(localData);
    if (parsedData.length > 0) {
      window.showToast("Sincronizando dados locais...", "success");
      for (const list of parsedData) {
        await addDoc(collection(firestore, "lists"), {
          ...list,
          createdAt: serverTimestamp(),
        });
      }
    }
    localStorage.removeItem("marketList");
    console.log("Migração concluída e LocalStorage limpo.");
  }
}

/* ==========================================================================
   NAVEGAÇÃO E INICIALIZAÇÃO
   ========================================================================== */
window.showScreen = function (screenId) {
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
    if (el) {
      el.classList.toggle("screen-hidden", id !== screenId);
      el.style.display = id === screenId ? "flex" : "none";
    }
  });
  if (screenId === "market-lists-screen" && window.renderMarketLists)
    window.renderMarketLists();
};

window.handleBackFromForm = function () {
  window.showScreen(previousScreen);
};

async function initApp() {
  await migrateData();

  const q = query(collection(firestore, "lists"), orderBy("date", "desc"));
  onSnapshot(q, (snapshot) => {
    window.marketListData = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    // UX: Se estiver na tela de listagem ou detalhes, re-renderiza para refletir mudanças em tempo real
    if (
      !document
        .getElementById("market-lists-screen")
        .classList.contains("screen-hidden")
    ) {
      window.renderMarketLists();
    }
    if (
      !document
        .getElementById("market-list-screen-details")
        .classList.contains("screen-hidden")
    ) {
      window.renderListDetails();
    }

    // Apenas redireciona na primeira carga para não interromper a navegação do usuário
    if (isFirstLoad) {
      if (window.marketListData.length === 0) {
        window.showScreen("home-screen");
      } else {
        window.showScreen("market-lists-screen");
      }
      isFirstLoad = false;
    }
  });

  document
    .getElementById("search-input")
    ?.addEventListener("input", () => window.renderMarketLists());
  document
    .getElementById("item-search-input")
    ?.addEventListener("input", () => window.renderListDetails());
}

document.addEventListener("DOMContentLoaded", initApp);
