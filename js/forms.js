import {
  firestore,
  firebaseAuth,
  collection,
  addDoc,
  serverTimestamp,
} from "./firebase.js";

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

  // Resolve o índice pelo ID estável antes de acessar os dados da lista
  const resolvedIndex = window.resolveCurrentListIndex();
  const list = window.marketListData[resolvedIndex];

  document.getElementById("form-title").innerText = "Editar Lista";
  document.getElementById("button-save-list").innerText = "Atualizar";
  document.getElementById("new-list-name").value = list.listName;
  document.getElementById("new-list-location").value = list.location || "";
  document.getElementById("new-list-date").value = list.date;
  window.showScreen("new-list-screen");
};

window.handleSaveNewList = async function () {
  const saveListButton = document.getElementById("button-save-list");

  // Guard contra duplo clique: impede nova submissão enquanto a operação está em andamento
  if (saveListButton && saveListButton.classList.contains("is-loading")) return;

  const name = window.capitalize(
    document.getElementById("new-list-name").value,
  );
  const location = window.capitalize(
    document.getElementById("new-list-location").value,
  );
  const date = document.getElementById("new-list-date").value;

  // Usa o uid do usuário autenticado como identificador no Firestore
  const currentUser = firebaseAuth.currentUser;
  const currentUserUid = currentUser ? currentUser.uid : null;

  if (!name || !date) {
    window.showToast("Por favor, preencha os campos obrigatórios", "danger");
    return;
  }

  if (!currentUserUid) {
    window.showToast("Usuário não autenticado.", "danger");
    return;
  }

  // Ativa o estado de loading no botão para bloquear cliques duplicados
  if (saveListButton) saveListButton.classList.add("is-loading");

  if (window.isEditingListMode) {
    // Resolve o índice pelo ID estável antes de modificar os dados
    const resolvedIndex = window.resolveCurrentListIndex();

    window.marketListData[resolvedIndex].listName = name;
    window.marketListData[resolvedIndex].location = location;
    window.marketListData[resolvedIndex].date = date;

    await window.saveAndSync();

    // Remove o estado de loading antes de navegar
    if (saveListButton) saveListButton.classList.remove("is-loading");

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
    // Resolve o índice pelo ID estável antes de acessar a lista original
    const resolvedIndex = window.resolveCurrentListIndex();
    const original = window.marketListData[resolvedIndex];

    if (date === original.date) {
      // Remove o loading antes de exibir o toast de validação
      if (saveListButton) saveListButton.classList.remove("is-loading");
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
        userId: currentUserUid,
        categories: clonedCategories,
        sharedWith: [],
        createdAt: serverTimestamp(),
      });

      if (saveListButton) saveListButton.classList.remove("is-loading");
      window.isCopyingListMode = false;
      window.showScreen("market-lists-screen");
      window.showToast("Lista copiada!", "success");
    } catch (e) {
      if (saveListButton) saveListButton.classList.remove("is-loading");
      window.showToast("Erro ao copiar lista", "danger");
    }
  } else {
    try {
      await addDoc(collection(firestore, "lists"), {
        listName: name,
        location,
        date,
        userId: currentUserUid,
        categories: [{ name: "Alimentação", items: [] }],
        sharedWith: [],
        createdAt: serverTimestamp(),
      });

      if (saveListButton) saveListButton.classList.remove("is-loading");
      window.showScreen("market-lists-screen");
      window.showToast("Lista criada!", "success");
    } catch (e) {
      if (saveListButton) saveListButton.classList.remove("is-loading");
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

window.openEditCategoryForm = function (categoryIndex) {
  window.editingCategoryIndex = categoryIndex;

  // Resolve o índice pelo ID estável antes de acessar os dados da categoria
  const resolvedIndex = window.resolveCurrentListIndex();
  const category =
    window.marketListData[resolvedIndex].categories[categoryIndex];

  document.getElementById("category-form-title").innerText = "Editar Categoria";
  document.getElementById("button-save-category").innerText = "Atualizar";
  document.getElementById("new-category-name").value = category.name;
  window.showScreen("new-category-screen");
};

window.handleSaveCategory = async function () {
  const saveCategoryButton = document.getElementById("button-save-category");

  // Guard contra duplo clique: impede nova submissão enquanto a operação está em andamento
  if (saveCategoryButton && saveCategoryButton.classList.contains("is-loading")) return;

  const input = document.getElementById("new-category-name");
  const name = window.capitalize(input.value);

  if (!name) {
    window.showToast("Digite o nome da categoria", "danger");
    return;
  }

  // Ativa o estado de loading no botão para bloquear cliques duplicados
  if (saveCategoryButton) saveCategoryButton.classList.add("is-loading");

  // Resolve o índice pelo ID estável antes de modificar categorias
  const resolvedIndex = window.resolveCurrentListIndex();

  if (window.editingCategoryIndex !== null) {
    window.marketListData[resolvedIndex].categories[
      window.editingCategoryIndex
    ].name = name;
    window.showToast("Categoria atualizada!", "success");
  } else {
    window.marketListData[resolvedIndex].categories.push({
      name: name,
      items: [],
    });
    window.showToast("Categoria criada!", "success");
  }

  await window.saveAndSync();

  // Remove o estado de loading antes de navegar
  if (saveCategoryButton) saveCategoryButton.classList.remove("is-loading");

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

  const healthProfileSelect = document.getElementById("item-health-profile-select");
  if (healthProfileSelect) {
    healthProfileSelect.value = "";
  }

  window.itemCategorySelect.innerHTML = "";

  // Resolve o índice pelo ID estável antes de acessar categorias
  const resolvedIndex = window.resolveCurrentListIndex();
  const categories = window.marketListData[resolvedIndex].categories;

  if (categories.length === 0) {
    window.marketListData[resolvedIndex].categories.push({
      name: "Alimentação",
      items: [],
    });
    await window.saveAndSync();
  }

  window.marketListData[resolvedIndex].categories.forEach(
    (cat, idx) => {
      const option = document.createElement("option");
      option.value = idx;
      option.text = cat.name;
      window.itemCategorySelect.appendChild(option);
    },
  );

  window.showScreen("new-item-screen");
};

window.enterEditMode = function (categoryIndex, itemIndex) {
  // Resolve o índice pelo ID estável antes de acessar o item
  const resolvedIndex = window.resolveCurrentListIndex();

  const item =
    window.marketListData[resolvedIndex].categories[categoryIndex].items[
      itemIndex
    ];
  window.editingItemIndex = itemIndex;
  window.editingCategoryIndex = categoryIndex;

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

  const healthProfileSelect = document.getElementById("item-health-profile-select");
  if (healthProfileSelect) {
    healthProfileSelect.value = item.healthProfile || "";
  }

  window.itemCategorySelect.innerHTML = "";

  window.marketListData[resolvedIndex].categories.forEach(
    (cat, idx) => {
      const option = document.createElement("option");
      option.value = idx;
      option.text = cat.name;
      if (idx === categoryIndex) option.selected = true;
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
  const saveItemButton = document.getElementById("button-save-item");

  // Guard contra duplo clique: impede nova submissão enquanto a operação está em andamento
  if (saveItemButton && saveItemButton.classList.contains("is-loading")) return;

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

  const healthProfileSelectElement = document.getElementById("item-health-profile-select");
  const selectedHealthProfile = healthProfileSelectElement ? healthProfileSelectElement.value : "";

  if (!selectedHealthProfile) {
    window.showToast("Selecione o Perfil de Saúde do item", "danger");
    return;
  }

  // Ativa o estado de loading no botão para bloquear cliques duplicados
  if (saveItemButton) saveItemButton.classList.add("is-loading");

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

  // Resolve o índice pelo ID estável antes de modificar itens
  const resolvedIndex = window.resolveCurrentListIndex();

  if (window.editingItemIndex !== null) {
    if (categoryIndex !== window.editingCategoryIndex) {
      const item = window.marketListData[resolvedIndex].categories[
        window.editingCategoryIndex
      ].items.splice(window.editingItemIndex, 1)[0];

      item.name = name;
      item.desc = description;
      item.price = unitPrice;
      item.quantity = quantity;
      item.totalValue = itemTotalValue;
      item.checked = isChecked;
      item.healthProfile = selectedHealthProfile;
      window.marketListData[resolvedIndex].categories[
        categoryIndex
      ].items.push(item);
    } else {
      const item =
        window.marketListData[resolvedIndex].categories[categoryIndex]
          .items[window.editingItemIndex];
      item.name = name;
      item.desc = description;
      item.price = unitPrice;
      item.quantity = quantity;
      item.totalValue = itemTotalValue;
      item.checked = isChecked;
      item.healthProfile = selectedHealthProfile;
    }
    window.showToast("Item atualizado!", "success");
  } else {
    window.marketListData[resolvedIndex].categories[
      categoryIndex
    ].items.push({
      name,
      desc: description,
      price: unitPrice,
      quantity,
      totalValue: itemTotalValue,
      checked: isChecked,
      healthProfile: selectedHealthProfile,
    });
    window.showToast("Item adicionado!", "success");
  }

  await window.saveAndSync();

  // Remove o estado de loading antes de navegar
  if (saveItemButton) saveItemButton.classList.remove("is-loading");

  window.showScreen("market-list-screen-details");
  window.renderListDetails();
};
