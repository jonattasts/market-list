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

/**
 * Estado do toggle "Já foi pego" para novo item
 */
window.isItemPickedStatus = false;

/**
 * Atualiza visualmente o toggle e o estado interno
 */
window.toggleItemPickedStatus = function () {
  window.isItemPickedStatus = !window.isItemPickedStatus;
  const toggleElement = document.getElementById("item-picked-toggle");
  if (toggleElement) {
    toggleElement.classList.toggle("active", window.isItemPickedStatus);
  }
};

/**
 * Reseta o estado do toggle "Já foi pego"
 */
window.resetItemPickedToggle = function () {
  window.isItemPickedStatus = false;
  const toggleElement = document.getElementById("item-picked-toggle");
  if (toggleElement) {
    toggleElement.classList.remove("active");
  }
};

/**
 * Define o estado do toggle "Já foi pego" baseado em um valor booleano
 *
 * @param {boolean} isPicked - Estado desejado do toggle
 */
window.setItemPickedToggleState = function (isPicked) {
  window.isItemPickedStatus = isPicked;
  const toggleElement = document.getElementById("item-picked-toggle");
  if (toggleElement) {
    toggleElement.classList.toggle("active", isPicked);
  }
};

window.openNewItemForm = async function () {
  window.editingItemIndex = null;
  window.editingCategoryIndex = null;

  window.resetItemPickedToggle();

  document.getElementById("item-form-title").innerText = "Novo Item";
  window.itemNameInput.value = "";
  window.itemDescInput.value = "";
  window.itemPriceInput.value = "";
  window.itemQuantityInput.value = "1";

  const totalValueInput = document.getElementById("item-total-value-input");
  if (totalValueInput) {
    totalValueInput.value = "";
  }

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

  window.setItemPickedToggleState(item.checked || false);

  document.getElementById("item-form-title").innerText = "Editar Item";
  window.itemNameInput.value = item.name;
  window.itemDescInput.value = item.desc;
  window.itemPriceInput.value = item.price || "";
  window.itemQuantityInput.value = item.quantity || 1;

  const totalValueInput = document.getElementById("item-total-value-input");
  if (totalValueInput) {
    totalValueInput.value = item.totalValue || "";
  }

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

/**
 * Converte uma string de valor monetário formatado (BRL) para número
 * Remove pontos de milhar e substitui vírgula decimal por ponto
 *
 * @param {string} formattedValue - Valor formatado (ex: "1.234,56")
 * @returns {number} Valor numérico (ex: 1234.56)
 */
function parseFormattedCurrencyToNumber(formattedValue) {
  if (!formattedValue || formattedValue.trim() === "") {
    return 0;
  }
  const sanitizedValue = formattedValue.replace(/\./g, "").replace(",", ".");
  return parseFloat(sanitizedValue) || 0;
}

/**
 * Formata um número para string de moeda BRL
 *
 * @param {number} numericValue - Valor numérico
 * @returns {string} Valor formatado em BRL (ex: "1.234,56")
 */
function formatNumberToCurrencyString(numericValue) {
  return numericValue.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Verifica se uma string de valor monetário está preenchida e válida
 *
 * @param {string} value - Valor a ser verificado
 * @returns {boolean} True se o valor for válido e maior que zero
 */
function isValidCurrencyValue(value) {
  if (!value || value.trim() === "" || value === "0,00") {
    return false;
  }
  const numericValue = parseFormattedCurrencyToNumber(value);
  return numericValue > 0;
}

window.handleSaveItem = async function () {
  const name = window.capitalize(window.itemNameInput.value);
  let description = window.capitalize(window.itemDescInput.value);
  if (!description) description = "Unidade";

  const unitPriceRawInput = window.itemPriceInput.value.trim();
  const quantity = parseInt(window.itemQuantityInput.value) || 1;
  const categoryIndex = parseInt(window.itemCategorySelect.value);

  const totalValueInputElement = document.getElementById(
    "item-total-value-input",
  );
  const totalValueRawInput = totalValueInputElement
    ? totalValueInputElement.value.trim()
    : "";

  const isChecked = window.isItemPickedStatus;
  let unitPrice = null;
  let itemTotalValue = null;

  if (!name) {
    window.showToast("O nome do produto é obrigatório", "danger");
    return;
  }

  if (isValidCurrencyValue(unitPriceRawInput)) {
    unitPrice = unitPriceRawInput;
  }

  if (isValidCurrencyValue(totalValueRawInput)) {
    itemTotalValue = totalValueRawInput;
  }

  // Regras de cálculo entre preço unitário e valor total:
  // - Preço unitário informado, total vazio → calcula o total (unitário × quantidade)
  // - Total informado, preço unitário vazio → mantém total; preço unitário permanece null
  // - Ambos informados → mantém ambos como o usuário digitou
  // - Nenhum informado → ambos ficam null
  if (unitPrice && !itemTotalValue) {
    const unitPriceNumeric = parseFormattedCurrencyToNumber(unitPrice);
    const calculatedTotalValue = unitPriceNumeric * quantity;
    itemTotalValue = formatNumberToCurrencyString(calculatedTotalValue);
  }

  if (window.editingItemIndex !== null) {
    if (categoryIndex !== window.editingCategoryIndex) {
      const item = window.marketListData[window.currentListIndex].categories[
        window.editingCategoryIndex
      ].items.splice(window.editingItemIndex, 1)[0];

      item.name = name;
      item.desc = description;
      item.price = unitPrice;
      item.quantity = quantity;
      item.totalValue = itemTotalValue;
      item.checked = isChecked;
      window.marketListData[window.currentListIndex].categories[
        categoryIndex
      ].items.push(item);
    } else {
      const item =
        window.marketListData[window.currentListIndex].categories[categoryIndex]
          .items[window.editingItemIndex];
      item.name = name;
      item.desc = description;
      item.price = unitPrice;
      item.quantity = quantity;
      item.totalValue = itemTotalValue;
      item.checked = isChecked;
    }
    window.showToast("Item atualizado!", "success");
  } else {
    window.marketListData[window.currentListIndex].categories[
      categoryIndex
    ].items.push({
      name,
      desc: description,
      price: unitPrice,
      quantity,
      totalValue: itemTotalValue,
      checked: isChecked,
    });
    window.showToast("Item adicionado!", "success");
  }

  await window.saveAndSync();
  window.showScreen("market-list-screen-details");
  window.renderListDetails();
};
