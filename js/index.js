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
  setDoc,
  getDoc,
} from "./firebase.js";
import {
  query,
  orderBy,
  onSnapshot,
  where,
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
      userName: localStorage.getItem("marketUserName"),
    });
  } catch (e) {
    console.error("Erro ao atualizar Firestore:", e);
    window.showToast("Erro ao sincronizar dados", "danger");
  }
};

/* --- LÓGICA DE CONFIGURAÇÃO COM UI DE ANIMAÇÃO --- */
async function runSetupAnimation(userName) {
  const overlay = document.getElementById("sync-overlay");
  const progressBar = document.getElementById("sync-progress-bar");
  const syncText = document.querySelector(".sync-text");
  const syncSubtext = document.querySelector(".sync-subtext"); // Ativa a Overlay Visual

  if (overlay) {
    overlay.style.display = "flex";
    await new Promise((r) => setTimeout(r, 50));
    overlay.classList.add("active");
  }

  if (syncText) syncText.innerText = "Configurando seu espaço...";
  if (syncSubtext)
    syncSubtext.innerText =
      "Preparando sua nuvem e organizando as prateleiras.";

  for (let i = 1; i <= 3; i++) {
    await new Promise((r) => setTimeout(r, 700));
    if (progressBar) {
      progressBar.style.width = `${(i / 3) * 100}%`;
    }
  }

  await new Promise((r) => setTimeout(r, 800));
  if (overlay) {
    overlay.classList.remove("active");
    setTimeout(() => (overlay.style.display = "none"), 500);
  }
  return true;
}

/* ==========================================================================
   IDENTIFICAÇÃO DE USUÁRIO
   ========================================================================== */
window.handleUserIdentification = async function () {
  const nameInput = document.getElementById("user-name-input");
  const buttonStart = document.querySelector(".button-start");
  const onboardingScreen = document.getElementById("onboarding-screen");

  const name = window.capitalize(nameInput.value);
  const userId = name.toLowerCase().replace(/\s/g, "");

  if (!name || name.length < 3) {
    window.showToast("O nome deve ter pelo menos 3 caracteres", "danger");
    return;
  }

  if (buttonStart) buttonStart.classList.add("is-loading");

  try {
    const userRef = doc(firestore, "users", userId);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      const savedLocalName = localStorage.getItem("marketUserName");
      if (savedLocalName !== name) {
        if (buttonStart) buttonStart.classList.remove("is-loading");
        window.showToast("Este nome já está em uso!", "danger");
        return;
      }
    }

    localStorage.setItem("marketUserName", name);
    await setDoc(
      userRef,
      { name: name, lastLogin: serverTimestamp() },
      { merge: true },
    );

    if (onboardingScreen) {
      onboardingScreen.classList.add("screen-hidden");
      onboardingScreen.style.display = "none";
    }

    await runSetupAnimation(name);

    setTimeout(() => {
      isFirstLoad = true;
      initFirebaseListener(name);
    }, 100);
  } catch (error) {
    if (buttonStart) buttonStart.classList.remove("is-loading");
    console.error("Erro identificação:", error);
    window.showToast("Erro de conexão", "danger");
  }
};

/* ==========================================================================
   NAVEGAÇÃO E INICIALIZAÇÃO
   ========================================================================== */
window.showScreen = function (screenId) {
  const screens = [
    "onboarding-screen",
    "home-screen",
    "market-lists-screen",
    "market-list-screen-details",
    "new-list-screen",
    "new-category-screen",
    "new-item-screen",
    "dashboard-screen",
  ];
  screens.forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.classList.remove("screen-fade-out");
      el.classList.toggle("screen-hidden", id !== screenId);
      el.style.display =
        id === screenId
          ? id === "onboarding-screen"
            ? "block"
            : "flex"
          : "none";
    }
  });

  window.closePopover();

  if (screenId === "market-lists-screen") {
    // Exibe skeleton imediatamente ao abrir a tela
    if (window.showListsSkeleton) window.showListsSkeleton();
    // Timer mínimo para garantir que o skeleton seja visível antes dos dados renderizarem
    setTimeout(() => {
      if (window.renderMarketLists) window.renderMarketLists();
    }, 2000);
  }

  if (screenId === "dashboard-screen" && window.initDashboardAnalisys)
    window.initDashboardAnalisys();
};

window.handleBackFromForm = function () {
  window.showScreen(previousScreen);
};

/* ==========================================================================
   UX NOVA: LÓGICA DO POPOVER DE OPÇÕES
   ========================================================================== */
window.toggleMenuOptions = function (event) {
  if (event) event.stopPropagation();

  const popover = document.getElementById("options-popover");
  if (!popover) return;

  const isHidden = popover.classList.contains("popover-hidden");

  if (isHidden) {
    popover.classList.remove("popover-hidden");
    popover.classList.add("popover-visible");

    if (popover.showPopover) {
      try {
        popover.showPopover();
      } catch (e) {
        console.log("Manual trigger active");
      }
    }
  } else {
    window.closePopover();
  }
};

window.closePopover = function () {
  const popover = document.getElementById("options-popover");
  if (popover) {
    popover.classList.add("popover-hidden");
    popover.classList.remove("popover-visible");
    if (popover.hidePopover) {
      try {
        popover.hidePopover();
      } catch (e) {}
    }
  }
};

window.handlePopoverAction = function (action) {
  window.closePopover();
  if (action === "new-list") {
    if (window.openNewListForm) window.openNewListForm();
  } else if (action === "dashboard") {
    window.showScreen("dashboard-screen");
  }
};

// Listener global para fechar ao clicar fora
document.addEventListener("click", function (event) {
  const popover = document.getElementById("options-popover");
  const button = document.getElementById("button-options-list");

  if (
    popover &&
    !popover.contains(event.target) &&
    button &&
    !button.contains(event.target)
  ) {
    window.closePopover();
  }
});

/* ==========================================================================
   FIREBASE LISTENER E PERSISTÊNCIA
   ========================================================================== */
function initFirebaseListener(userName) {
  const q = query(
    collection(firestore, "lists"),
    where("userName", "==", userName),
    orderBy("date", "desc"),
  );

  onSnapshot(
    q,
    (snapshot) => {
      window.marketListData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      if (isFirstLoad) {
        if (window.marketListData.length === 0) {
          window.showScreen("home-screen");
        } else {
          // Exibe skeleton antes da primeira renderização ao carregar do Firestore
          if (window.showListsSkeleton) window.showListsSkeleton();
          window.showScreen("market-lists-screen");
          // Timer mínimo para garantir visibilidade do skeleton na primeira carga
          setTimeout(() => {
            if (window.renderMarketLists) window.renderMarketLists();
          }, 400);
        }
        isFirstLoad = false;
      } else {
        if (
          !document
            .getElementById("market-lists-screen")
            .classList.contains("screen-hidden")
        ) {
          // Exibe skeleton antes de re-renderizar ao receber atualizações do Firestore
          if (window.showListsSkeleton) window.showListsSkeleton();
          // Timer mínimo para garantir visibilidade do skeleton na atualização
          setTimeout(() => {
            window.renderMarketLists();
          }, 400);
        }
        if (
          !document
            .getElementById("market-list-screen-details")
            .classList.contains("screen-hidden")
        ) {
          window.renderListDetails();
        }
      }
    },
    (error) => {
      console.error("Erro listener:", error);
      if (isFirstLoad) {
        window.showScreen("home-screen");
        isFirstLoad = false;
      }
    },
  );
}

async function validateUserPersistence(savedName) {
  try {
    const userId = savedName.toLowerCase().replace(/\s/g, "");
    const userRef = doc(firestore, "users", userId);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      localStorage.removeItem("marketUserName");
      window.showScreen("onboarding-screen");
      window.showToast("Sessão expirada ou usuário removido.", "danger");
      return;
    }

    initFirebaseListener(savedName);
  } catch (error) {
    console.error("Erro ao validar persistência:", error);
    initFirebaseListener(savedName);
  }
}

async function initApp() {
  const savedName = localStorage.getItem("marketUserName");

  if (!savedName) {
    window.showScreen("onboarding-screen");
  } else {
    await validateUserPersistence(savedName);
  }

  const searchInputEl = document.getElementById("search-input");
  if (searchInputEl) {
    searchInputEl.addEventListener("input", () => {
      if (window.renderMarketLists) window.renderMarketLists();
    });
  }

  const itemSearchInputEl = document.getElementById("item-search-input");
  if (itemSearchInputEl) {
    itemSearchInputEl.addEventListener("input", () => {
      if (window.renderListDetails) window.renderListDetails();
    });
  }
}

document.addEventListener("DOMContentLoaded", initApp);
