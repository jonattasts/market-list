import { firestore, collection, addDoc, serverTimestamp } from "./firebase.js";

/* ==========================================================================
   CRIAÇÃO E EDIÇÃO DE LISTA
   ========================================================================== */
window.openNewListForm = function () {
  const homeVisible = !document
    .getElementById("home-screen")
    .classList.contains("screen-hidden");
  window.previousScreen = homeVisible ? "home-screen" : "market-lists-screen";

  window.isEditingListMode = false;
  window.isCopyingListMode = false;
  document.getElementById("form-title").innerText = "Nova Lista";
  document.getElementById("button-save-list").innerText = "Salvar";
  document.getElementById("new-list-name").value = "";
  document.getElementById("new-list-location").value = "";
  const now = new Date();
  const year = now.getFullYear(),
    month = String(now.getMonth() + 1).padStart(2, "0"),
    day = String(now.getDate()).padStart(2, "0");
  document.getElementById("new-list-date").value = `${year}-${month}-${day}`;
  window.showScreen("new-list-screen");
};

window.openEditListForm = function () {
  window.isEditingListMode = true;
  window.isCopyingListMode = false;
  const list = window.marketListData[window.currentListIndex];
  document.getElementById("form-title").innerText = "Editar Lista";
  document.getElementById("button-save-list").innerText = "Atualizar";
  document.getElementById("new-list-name").value = list.listName;
  document.getElementById("new-list-location").value = list.location || "";
  document.getElementById("new-list-date").value = list.date;
  window.showScreen("new-list-screen");
};

window.handleSaveNewList = async function () {
  const name = window.capitalize(
    document.getElementById("new-list-name").value,
  );
  const location = window.capitalize(
    document.getElementById("new-list-location").value,
  );
  const date = document.getElementById("new-list-date").value;

  const currentUserName = localStorage.getItem("marketUserName");

  if (!name || !date) {
    window.showToast("Por favor, preencha os campos obrigatórios", "danger");
    return;
  }

  if (window.isEditingListMode) {
    window.marketListData[window.currentListIndex].listName = name;
    window.marketListData[window.currentListIndex].location = location;
    window.marketListData[window.currentListIndex].date = date;

    await window.saveAndSync();

    const detailsVisible = !document
      .getElementById("market-list-screen-details")
      .classList.contains("screen-hidden");

    if (detailsVisible) {
      window.renderListDetails();
    } else {
      window.showScreen("market-lists-screen");
    }
    window.showToast("Lista atualizada!", "success");
  } else if (window.isCopyingListMode) {
    const original = window.marketListData[window.currentListIndex];

    if (date === original.date) {
      window.showToast(
        "Por favor insira uma data diferente da lista copiada",
        "danger",
      );
      return;
    }

    const clonedCategories = original.categories.map((cat) => ({
      name: cat.name,
      items: cat.items.map((item) => ({ ...item, checked: false })),
    }));

    try {
      await addDoc(collection(firestore, "lists"), {
        listName: name,
        location,
        date,
        userName: currentUserName,
        categories: clonedCategories,
        createdAt: serverTimestamp(),
      });

      window.isCopyingListMode = false;
      window.showScreen("market-lists-screen");
      window.showToast("Lista copiada!", "success");
    } catch (e) {
      window.showToast("Erro ao copiar lista", "danger");
    }
  } else {
    try {
      await addDoc(collection(firestore, "lists"), {
        listName: name,
        location,
        date,
        userName: currentUserName,
        categories: [{ name: "Alimentação", items: [] }],
        createdAt: serverTimestamp(),
      });

      window.showScreen("market-lists-screen");
      window.showToast("Lista criada!", "success");
    } catch (e) {
      window.showToast("Erro ao criar lista", "danger");
    }
  }
};

/* ==========================================================================
   GESTÃO DE CATEGORIAS E ITENS
   ========================================================================== */

window.openNewCategoryForm = function () {
  window.editingCategoryIndex = null;
  document.getElementById("category-form-title").innerText = "Nova Categoria";
  document.getElementById("button-save-category").innerText = "Salvar";
  document.getElementById("new-category-name").value = "";
  window.showScreen("new-category-screen");
};

window.openEditCategoryForm = function (catIdx) {
  window.editingCategoryIndex = catIdx;
  const category =
    window.marketListData[window.currentListIndex].categories[catIdx];
  document.getElementById("category-form-title").innerText = "Editar Categoria";
  document.getElementById("button-save-category").innerText = "Atualizar";
  document.getElementById("new-category-name").value = category.name;
  window.showScreen("new-category-screen");
};

window.handleSaveCategory = async function () {
  const input = document.getElementById("new-category-name");
  const name = window.capitalize(input.value);

  if (!name) {
    window.showToast("Digite o nome da categoria", "danger");
    return;
  }

  if (window.editingCategoryIndex !== null) {
    window.marketListData[window.currentListIndex].categories[
      window.editingCategoryIndex
    ].name = name;
    window.showToast("Categoria atualizada!", "success");
  } else {
    window.marketListData[window.currentListIndex].categories.push({
      name: name,
      items: [],
    });
    window.showToast("Categoria criada!", "success");
  }

  await window.saveAndSync();
  input.value = "";
  window.showScreen("market-list-screen-details");
  window.renderListDetails();
};

window.openNewItemForm = async function () {
  window.editingItemIndex = null;
  window.editingCategoryIndex = null;

  document.getElementById("item-form-title").innerText = "Novo Item";
  window.itemNameInput.value = "";
  window.itemDescInput.value = "";
  window.itemPriceInput.value = "";
  window.itemQuantityInput.value = "1";
  window.itemCategorySelect.innerHTML = "";

  const categories = window.marketListData[window.currentListIndex].categories;

  if (categories.length === 0) {
    window.marketListData[window.currentListIndex].categories.push({
      name: "Alimentação",
      items: [],
    });
    await window.saveAndSync();
  }

  window.marketListData[window.currentListIndex].categories.forEach(
    (cat, idx) => {
      const option = document.createElement("option");
      option.value = idx;
      option.text = cat.name;
      window.itemCategorySelect.appendChild(option);
    },
  );

  window.showScreen("new-item-screen");
};

window.enterEditMode = function (catIdx, itemIdx) {
  const item =
    window.marketListData[window.currentListIndex].categories[catIdx].items[
      itemIdx
    ];
  window.editingItemIndex = itemIdx;
  window.editingCategoryIndex = catIdx;

  document.getElementById("item-form-title").innerText = "Editar Item";
  window.itemNameInput.value = item.name;
  window.itemDescInput.value = item.desc;
  window.itemPriceInput.value = item.price;
  window.itemQuantityInput.value = item.quantity || 1;
  window.itemCategorySelect.innerHTML = "";

  window.marketListData[window.currentListIndex].categories.forEach(
    (cat, idx) => {
      const option = document.createElement("option");
      option.value = idx;
      option.text = cat.name;
      if (idx === catIdx) option.selected = true;
      window.itemCategorySelect.appendChild(option);
    },
  );

  window.showScreen("new-item-screen");
};

window.handleSaveItem = async function () {
  const name = window.capitalize(window.itemNameInput.value);
  let desc = window.capitalize(window.itemDescInput.value);
  if (!desc) desc = "Unidade";

  const price = window.itemPriceInput.value.trim() || "0,00";
  const quantity = parseInt(window.itemQuantityInput.value) || 1;
  const catIdx = parseInt(window.itemCategorySelect.value);

  if (!name) {
    window.showToast("O nome do produto é obrigatório", "danger");
    return;
  }

  if (window.editingItemIndex !== null) {
    if (catIdx !== window.editingCategoryIndex) {
      const item = window.marketListData[window.currentListIndex].categories[
        window.editingCategoryIndex
      ].items.splice(window.editingItemIndex, 1)[0];

      item.name = name;
      item.desc = desc;
      item.price = price;
      item.quantity = quantity;
      window.marketListData[window.currentListIndex].categories[
        catIdx
      ].items.push(item);
    } else {
      const item =
        window.marketListData[window.currentListIndex].categories[catIdx].items[
          window.editingItemIndex
        ];
      item.name = name;
      item.desc = desc;
      item.price = price;
      item.quantity = quantity;
    }
    window.showToast("Item atualizado!", "success");
  } else {
    window.marketListData[window.currentListIndex].categories[
      catIdx
    ].items.push({
      name,
      desc,
      price,
      quantity,
      checked: false,
    });
    window.showToast("Item adicionado!", "success");
  }

  await window.saveAndSync();
  window.showScreen("market-list-screen-details");
  window.renderListDetails();
};
