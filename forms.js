/* ==========================================================================
   5. CRIAÇÃO E EDIÇÃO DE LISTA
   ========================================================================== */
function openNewListForm() {
  const homeVisible = !document
    .getElementById("home-screen")
    .classList.contains("screen-hidden");
  previousScreen = homeVisible ? "home-screen" : "market-lists-screen";

  isEditingListMode = false;
  isCopyingListMode = false;
  document.getElementById("form-title").innerText = "Nova Lista";
  document.getElementById("btn-save-list").innerText = "Salvar";
  document.getElementById("new-list-name").value = "";
  document.getElementById("new-list-location").value = "";
  const now = new Date();
  const year = now.getFullYear(),
    month = String(now.getMonth() + 1).padStart(2, "0"),
    day = String(now.getDate()).padStart(2, "0");
  document.getElementById("new-list-date").value = `${year}-${month}-${day}`;
  showScreen("new-list-screen");
}

function openEditListForm() {
  isEditingListMode = true;
  isCopyingListMode = false;
  const list = marketListData[currentListIndex];
  document.getElementById("form-title").innerText = "Editar Lista";
  document.getElementById("btn-save-list").innerText = "Atualizar";
  document.getElementById("new-list-name").value = list.listName;
  document.getElementById("new-list-location").value = list.location || "";
  document.getElementById("new-list-date").value = list.date;
  showScreen("new-list-screen");
}

function handleSaveNewList() {
  const name = capitalize(document.getElementById("new-list-name").value);
  const location = capitalize(
    document.getElementById("new-list-location").value,
  );
  const date = document.getElementById("new-list-date").value;

  if (!name || !date) {
    showToast("Por favor, preencha os campos obrigatórios", "danger");
    return;
  }

  if (isEditingListMode) {
    marketListData[currentListIndex].listName = name;
    marketListData[currentListIndex].location = location;
    marketListData[currentListIndex].date = date;
    saveAndSync();

    const detailsVisible = !document
      .getElementById("market-list-screen-details")
      .classList.contains("screen-hidden");
    if (detailsVisible) {
      renderListDetails();
    } else {
      showScreen("market-lists-screen");
    }
    showToast("Lista atualizada!", "success");
  } else if (isCopyingListMode) {
    const original = marketListData[currentListIndex];

    if (date === original.date) {
      showToast(
        "Por favor insira uma data diferente da lista copiada",
        "danger",
      );
      return;
    }

    const clonedCategories = original.categories.map((cat) => ({
      name: cat.name,
      items: cat.items.map((item) => ({ ...item, checked: false })),
    }));
    marketListData.push({
      listName: name,
      location,
      date,
      categories: clonedCategories,
    });
    saveAndSync();
    isCopyingListMode = false;
    showScreen("market-lists-screen");
    showToast("Lista copiada!", "success");
  } else {
    marketListData.push({
      listName: name,
      location,
      date,
      categories: [{ name: "Geral", items: [] }],
    });
    saveAndSync();
    showScreen("market-lists-screen");
    showToast("Lista criada!", "success");
  }
}

/* ==========================================================================
   6. GESTÃO DE CATEGORIAS E ITENS (REFATORADO PARA TELAS)
   ========================================================================== */
function openNewCategoryForm() {
  editingCategoryIndex = null;
  document.getElementById("category-form-title").innerText = "Nova Categoria";
  document.getElementById("btn-save-category").innerText = "Salvar";
  document.getElementById("new-category-name").value = "";
  showScreen("new-category-screen");
}

function openEditCategoryForm(catIdx) {
  editingCategoryIndex = catIdx;
  const category = marketListData[currentListIndex].categories[catIdx];
  document.getElementById("category-form-title").innerText = "Editar Categoria";
  document.getElementById("btn-save-category").innerText = "Atualizar";
  document.getElementById("new-category-name").value = category.name;
  showScreen("new-category-screen");
}

function handleSaveCategory() {
  const input = document.getElementById("new-category-name");
  const name = capitalize(input.value);

  if (!name) {
    showToast("Digite o nome da categoria", "danger");
    return;
  }

  if (editingCategoryIndex !== null) {
    marketListData[currentListIndex].categories[editingCategoryIndex].name =
      name;
    showToast("Categoria atualizada!", "success");
  } else {
    marketListData[currentListIndex].categories.push({ name: name, items: [] });
    showToast("Categoria criada!", "success");
  }

  saveAndSync();
  input.value = "";
  showScreen("market-list-screen-details");
  renderListDetails();
}

function openNewItemForm() {
  editingItemIndex = null;
  editingCategoryIndex = null;

  document.getElementById("item-form-title").innerText = "Novo Item";
  itemNameInput.value = "";
  itemDescInput.value = "";
  itemPriceInput.value = "";
  itemQuantityInput.value = "1";
  itemCategorySelect.innerHTML = "";
  const categories = marketListData[currentListIndex].categories;

  if (categories.length === 0) {
    marketListData[currentListIndex].categories.push({
      name: "Geral",
      items: [],
    });
    saveAndSync();
  }

  marketListData[currentListIndex].categories.forEach((cat, idx) => {
    const option = document.createElement("option");
    option.value = idx;
    option.text = cat.name;
    itemCategorySelect.appendChild(option);
  });

  showScreen("new-item-screen");
}

function enterEditMode(catIdx, itemIdx) {
  const item =
    marketListData[currentListIndex].categories[catIdx].items[itemIdx];
  editingItemIndex = itemIdx;
  editingCategoryIndex = catIdx;

  document.getElementById("item-form-title").innerText = "Editar Item";
  itemNameInput.value = item.name;
  itemDescInput.value = item.desc;
  itemPriceInput.value = item.price;
  itemQuantityInput.value = item.quantity || 1;
  itemCategorySelect.innerHTML = "";
  marketListData[currentListIndex].categories.forEach((cat, idx) => {
    const option = document.createElement("option");
    option.value = idx;
    option.text = cat.name;
    if (idx === catIdx) option.selected = true;
    itemCategorySelect.appendChild(option);
  });

  showScreen("new-item-screen");
}

function handleSaveItem() {
  const name = capitalize(itemNameInput.value);
  let desc = capitalize(itemDescInput.value);
  if (!desc) desc = "Unidade";

  const price = itemPriceInput.value.trim() || "0,00";
  const quantity = parseInt(itemQuantityInput.value) || 1;
  const catIdx = parseInt(itemCategorySelect.value);

  if (!name) {
    showToast("O nome do produto é obrigatório", "danger");
    return;
  }

  if (editingItemIndex !== null) {
    if (catIdx !== editingCategoryIndex) {
      const item = marketListData[currentListIndex].categories[
        editingCategoryIndex
      ].items.splice(editingItemIndex, 1)[0];
      item.name = name;
      item.desc = desc;
      item.price = price;
      item.quantity = quantity;
      marketListData[currentListIndex].categories[catIdx].items.push(item);
    } else {
      const item =
        marketListData[currentListIndex].categories[catIdx].items[
          editingItemIndex
        ];
      item.name = name;
      item.desc = desc;
      item.price = price;
      item.quantity = quantity;
    }
    showToast("Item atualizado!", "success");
  } else {
    marketListData[currentListIndex].categories[catIdx].items.push({
      name,
      desc,
      price,
      quantity,
      checked: false,
    });
    showToast("Item adicionado!", "success");
  }

  saveAndSync();
  showScreen("market-list-screen-details");
  renderListDetails();
}
