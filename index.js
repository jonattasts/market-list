/* ==========================================================================
   1. ESTADO E CONFIGURAÇÕES
   ========================================================================== */
const listItemsContainer = document.getElementById("list-items-container");
const listsMasterContainer = document.getElementById("lists-master-container");
const searchInput = document.getElementById("search-input");
const itemSearchInput = document.getElementById("item-search-input");

const itemNameInput = document.getElementById("item-name-input");
const itemDescInput = document.getElementById("item-desc-input");
const itemPriceInput = document.getElementById("item-price-input");
const itemQuantityInput = document.getElementById("item-quantity-input");
const itemCategorySelect = document.getElementById("item-category-select");

const toast = document.getElementById("toast");
const toastMessage = document.getElementById("toast-message");
const toastIcon = document.getElementById("toast-icon");

let currentListIndex = 0;
let editingItemIndex = null;
let editingCategoryIndex = null;
let isEditingListMode = false;
let isCopyingListMode = false;
let previousScreen = "home-screen";

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

function capitalize(str) {
  if (!str) return "";
  const trimmed = str.trim();
  if (!trimmed) return "";
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
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
    if (el) {
      if (id === screenId) {
        el.classList.remove("screen-hidden");
        el.style.display = "flex";
      } else {
        el.classList.add("screen-hidden");
        el.style.display = "none";
      }
    }
  });
  if (screenId === "market-lists-screen") {
    renderMarketLists();
  }
  if (screenId === "market-list-screen-details" && itemSearchInput) {
    itemSearchInput.value = "";
  }
}

function handleBackFromForm() {
  showScreen(previousScreen);
}

/* ==========================================================================
   8. INICIALIZAÇÃO DO APP
   ========================================================================== */
function initApp() {
  if (marketListData.length === 0) {
    showScreen("home-screen");
  } else {
    showScreen("market-lists-screen");
  }

  if (searchInput) {
    searchInput.addEventListener("input", renderMarketLists);
  }

  if (itemSearchInput) {
    itemSearchInput.addEventListener("input", renderListDetails);
  }
}

document.addEventListener("DOMContentLoaded", initApp);
