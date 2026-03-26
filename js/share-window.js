/* ==========================================================================
   JANELA DE COMPARTILHAMENTO DE LISTA
   ========================================================================== */

import {
  firestore,
  doc,
  updateDoc,
  getDoc,
  serverTimestamp,
} from "./firebase.js";

/* ==========================================================================
   ESTADO INTERNO DO MÓDULO
   ========================================================================== */

// Controla se o formulário de novo usuário está visível dentro da janela
let isAddingNewSharedUser = false;

/* ==========================================================================
   INJEÇÃO DO HTML DA JANELA NO DOM
   ========================================================================== */

/**
 * Cria e injeta o elemento da janela de compartilhamento no DOM.
 * Executado uma única vez ao carregar o módulo.
 */
function injectShareWindowElement() {
  // Evita duplicação caso o script seja carregado mais de uma vez
  if (document.getElementById("share-window-overlay")) return;

  const shareWindowElement = document.createElement("div");
  shareWindowElement.id = "share-window-overlay";
  shareWindowElement.className = "share-window-overlay";

  shareWindowElement.innerHTML = `
    <div class="share-window-backdrop" onclick="window.closeShareWindow()"></div>
    <div class="share-window-card">
      <div class="share-window-drag-handle"></div>

      <!-- Header da janela -->
      <div class="share-window-header">
        <h3 id="share-window-title">Compartilhar Lista</h3>
        <button class="share-window-close-button" onclick="window.closeShareWindow()">
          <ion-icon name="close-outline"></ion-icon>
        </button>
      </div>

      <!-- Conteúdo dinâmico: alternado entre lista de usuários e formulário -->
      <div id="share-window-body"></div>
    </div>
  `;

  document.querySelector(".app-container").appendChild(shareWindowElement);
}

/* ==========================================================================
   TEMPLATES HTML
   ========================================================================== */

/**
 * Gera o HTML do formulário de adição de novo usuário compartilhado.
 * @returns {string} HTML do formulário
 */
function getShareFormTemplate() {
  return `
    <div class="share-window-form-section">
      <span class="share-window-emoji">🤝</span>

      <!-- Nome do usuário -->
      <div class="input-field">
        <label>Nome da pessoa<span class="required-mark">*</span></label>
        <input
          type="text"
          id="share-user-name-input"
          placeholder="Ex: Maria, João..."
          autocomplete="off"
        />
      </div>

      <!-- Toggle de permissão de edição -->
      <div class="share-window-toggle-row">
        <div class="share-window-toggle-label">
          <span>Permitir edição</span>
          <span>A pessoa poderá adicionar e editar itens e categorias</span>
        </div>
        <label class="share-window-toggle-switch">
          <input type="checkbox" id="share-can-edit-toggle" />
          <span class="share-window-toggle-track"></span>
        </label>
      </div>

      <!-- Botão de confirmar compartilhamento -->
      <button
        class="share-window-submit-button"
        id="share-submit-button"
        onclick="window.handleConfirmShare()"
      >
        <span class="share-button-text">Compartilhar</span>
      </button>
    </div>
  `;
}

/**
 * Gera o HTML da lista de usuários já compartilhados com a lista.
 * @param {Array<Object>} sharedUsers - Array com os objetos de usuário compartilhado
 * @returns {string} HTML da lista de usuários
 */
function getSharedUsersListTemplate(sharedUsers) {
  const usersItemsHTML = sharedUsers
    .map(
      (sharedUser, userIndex) => `
      <div class="share-user-item" id="share-user-item-${userIndex}">
        <ion-icon name="person-circle-outline" class="share-user-icon"></ion-icon>
        <div class="share-user-info">
          <span class="share-user-name">${sharedUser.name}</span>
          <span class="share-user-permission">
            <span class="share-permission-badge ${sharedUser.canEdit ? "can-edit" : "read-only"}">
              <ion-icon name="${sharedUser.canEdit ? "create-outline" : "eye-outline"}"></ion-icon>
              ${sharedUser.canEdit ? "Pode editar" : "Só visualizar"}
            </span>
          </span>
        </div>
        <button
          class="share-user-remove-button"
          onclick="window.handleRemoveSharedUser(${userIndex})"
          aria-label="Remover ${sharedUser.name}"
        >
          <ion-icon name="trash-outline"></ion-icon>
        </button>
      </div>
    `,
    )
    .join("");

  return `
    <div class="share-window-users-section">
      <span class="share-window-emoji">👥</span>
      <div class="share-window-users-list">
        ${usersItemsHTML}
      </div>
      <button class="share-window-add-more-button" onclick="window.showShareForm()">
        <ion-icon name="person-add-outline"></ion-icon>
        Compartilhar com mais pessoas
      </button>
    </div>
  `;
}

/* ==========================================================================
   ABERTURA E FECHAMENTO DA JANELA
   ========================================================================== */

/**
 * Abre a janela de compartilhamento para a lista atualmente aberta.
 * Se a lista já possuir usuários compartilhados, exibe a lista de usuários.
 * Caso contrário, exibe diretamente o formulário de adição.
 */
window.openShareWindow = function () {
  const overlayElement = document.getElementById("share-window-overlay");
  const bodyElement = document.getElementById("share-window-body");
  const titleElement = document.getElementById("share-window-title");

  if (!overlayElement || !bodyElement) return;

  const currentList = window.marketListData[window.currentListIndex];
  const sharedUsers = currentList.sharedWith || [];

  isAddingNewSharedUser = false;

  if (sharedUsers.length > 0) {
    // Exibe a lista de usuários já compartilhados
    titleElement.textContent = "Compartilhado com";
    bodyElement.innerHTML = getSharedUsersListTemplate(sharedUsers);
  } else {
    // Exibe diretamente o formulário quando não há usuários compartilhados
    titleElement.textContent = "Compartilhar Lista";
    bodyElement.innerHTML = getShareFormTemplate();
    isAddingNewSharedUser = true;
  }

  // Torna a janela visível com animação
  overlayElement.classList.add("share-window-visible");
};

/**
 * Fecha a janela de compartilhamento e limpa os campos do formulário.
 */
window.closeShareWindow = function () {
  const overlayElement = document.getElementById("share-window-overlay");
  if (!overlayElement) return;

  overlayElement.classList.remove("share-window-visible");

  // Reseta o estado interno após a animação de fechamento
  setTimeout(() => {
    isAddingNewSharedUser = false;
    const bodyElement = document.getElementById("share-window-body");
    if (bodyElement) bodyElement.innerHTML = "";
  }, 350);
};

/**
 * Exibe o formulário de adição de usuário dentro da janela,
 * ocultando a lista de usuários compartilhados existentes.
 */
window.showShareForm = function () {
  const bodyElement = document.getElementById("share-window-body");
  const titleElement = document.getElementById("share-window-title");

  if (!bodyElement) return;

  isAddingNewSharedUser = true;
  titleElement.textContent = "Compartilhar Lista";
  bodyElement.innerHTML = getShareFormTemplate();
};

/* ==========================================================================
   CONFIRMAÇÃO DO COMPARTILHAMENTO
   ========================================================================== */

/**
 * Trata o nome da pessoa a ser adicionada ao compartilhamento,
 * aplicando o mesmo padrão de capitalização usado na tela de onboarding.
 * Valida os dados, persiste no Firebase e atualiza os dados em cache.
 */
window.handleConfirmShare = async function () {
  const nameInputElement = document.getElementById("share-user-name-input");
  const canEditToggleElement = document.getElementById("share-can-edit-toggle");
  const submitButtonElement = document.getElementById("share-submit-button");

  if (!nameInputElement || !submitButtonElement) return;

  // Aplica a mesma normalização de nome que o onboarding (capitalize)
  const rawName = nameInputElement.value;
  const normalizedName = window.capitalize(rawName);

  // Validação mínima: mesmo critério do onboarding (mínimo 3 caracteres)
  if (!normalizedName || normalizedName.length < 3) {
    window.showToast("O nome deve ter pelo menos 3 caracteres", "danger");
    return;
  }

  const currentList = window.marketListData[window.currentListIndex];
  const existingSharedUsers = currentList.sharedWith || [];

  // Verifica se o nome já está compartilhado (normalizado para comparação)
  const isAlreadyShared = existingSharedUsers.some(
    (sharedUser) =>
      window.normalizeString(sharedUser.name) ===
      window.normalizeString(normalizedName),
  );

  if (isAlreadyShared) {
    window.showToast("Esta lista já está compartilhada com esse nome.", "danger");
    return;
  }

  const canEdit = canEditToggleElement ? canEditToggleElement.checked : false;

  // Verifica se o usuário existe no Firebase antes de compartilhar
  try {
    const userIdToShare = normalizedName.toLowerCase().replace(/\s/g, "");
    const userReferenceToShare = doc(firestore, "users", userIdToShare);
    const userSnapshotToShare = await getDoc(userReferenceToShare);

    if (!userSnapshotToShare.exists()) {
      window.showToast(
        `Nenhum usuário encontrado com o nome "${normalizedName}".`,
        "danger",
      );
      return;
    }
  } catch (fetchError) {
    console.error("Erro ao verificar usuário:", fetchError);
    window.showToast("Falha na comunicação com o Servidor!", "danger");
    return;
  }

  // Exibe loading no botão de submit
  submitButtonElement.classList.add("is-loading");

  const newSharedUserEntry = {
    name: normalizedName,
    canEdit: canEdit,
  };

  const updatedSharedUsersArray = [...existingSharedUsers, newSharedUserEntry];

  try {
    // Persiste a nova lista de compartilhados no Firestore
    const listDocumentReference = doc(
      firestore,
      "lists",
      currentList.id,
    );
    await updateDoc(listDocumentReference, {
      sharedWith: updatedSharedUsersArray,
      updatedAt: serverTimestamp(),
    });

    // Atualiza os dados em cache local para refletir imediatamente
    window.marketListData[window.currentListIndex].sharedWith =
      updatedSharedUsersArray;

    // Fecha a janela e re-renderiza a tela de listas
    window.closeShareWindow();
    window.showToast(
      `Lista compartilhada com ${normalizedName}!`,
      "success",
    );

    // Re-renderiza a tela de listas atualizando cache e interface
    if (window.renderMarketLists) window.renderMarketLists();
  } catch (updateError) {
    console.error("Erro ao compartilhar lista:", updateError);
    submitButtonElement.classList.remove("is-loading");
    window.showToast("Falha na comunicação com o Servidor!", "danger");
  }
};

/* ==========================================================================
   REMOÇÃO DE USUÁRIO COMPARTILHADO
   ========================================================================== */

/**
 * Remove um usuário da lista de compartilhados no Firebase
 * e atualiza o cache local, re-renderizando a janela de compartilhamento.
 *
 * @param {number} userIndex - Índice do usuário no array sharedWith da lista atual
 */
window.handleRemoveSharedUser = async function (userIndex) {
  const currentList = window.marketListData[window.currentListIndex];
  const existingSharedUsers = currentList.sharedWith || [];
  const userToRemove = existingSharedUsers[userIndex];

  if (!userToRemove) return;

  // Feedback visual imediato no botão de remoção
  const removeButtonElement = document.querySelector(
    `#share-user-item-${userIndex} .share-user-remove-button`,
  );
  if (removeButtonElement) {
    removeButtonElement.classList.add("is-removing");
  }

  // Filtra o usuário removido do array
  const updatedSharedUsersArray = existingSharedUsers.filter(
    (_, index) => index !== userIndex,
  );

  try {
    // Persiste a remoção no Firestore
    const listDocumentReference = doc(
      firestore,
      "lists",
      currentList.id,
    );
    await updateDoc(listDocumentReference, {
      sharedWith: updatedSharedUsersArray,
      updatedAt: serverTimestamp(),
    });

    // Atualiza os dados em cache local
    window.marketListData[window.currentListIndex].sharedWith =
      updatedSharedUsersArray;

    window.showToast(`${userToRemove.name} removido do compartilhamento.`, "success");

    // Re-renderiza a janela com os dados atualizados
    const bodyElement = document.getElementById("share-window-body");
    const titleElement = document.getElementById("share-window-title");

    if (updatedSharedUsersArray.length > 0) {
      // Ainda há usuários compartilhados: exibe a lista atualizada
      titleElement.textContent = "Compartilhado com";
      bodyElement.innerHTML = getSharedUsersListTemplate(updatedSharedUsersArray);
    } else {
      // Nenhum usuário restante: exibe o formulário de adição
      titleElement.textContent = "Compartilhar Lista";
      bodyElement.innerHTML = getShareFormTemplate();
      isAddingNewSharedUser = true;
    }

    // Atualiza a tela de listas refletindo a mudança no cache
    if (window.renderMarketLists) window.renderMarketLists();
  } catch (removeError) {
    console.error("Erro ao remover usuário compartilhado:", removeError);

    // Reverte o estado visual em caso de erro
    if (removeButtonElement) {
      removeButtonElement.classList.remove("is-removing");
    }
    window.showToast("Falha na comunicação com o Servidor!", "danger");
  }
};

/* ==========================================================================
   POPOVER DA TELA DE DETALHES
   ========================================================================== */

/**
 * Alterna a visibilidade do popover de opções na tela de detalhes da lista.
 * Segue o mesmo padrão do toggleMenuOptions do index.js.
 *
 * @param {Event} event - Evento de clique para evitar propagação
 */
window.toggleDetailsMenuOptions = function (event) {
  if (event) event.stopPropagation();

  const detailsPopoverElement = document.getElementById("details-options-popover");
  if (!detailsPopoverElement) return;

  const isPopoverHidden = detailsPopoverElement.classList.contains("popover-hidden");

  if (isPopoverHidden) {
    detailsPopoverElement.classList.remove("popover-hidden");
    detailsPopoverElement.classList.add("popover-visible");

    if (detailsPopoverElement.showPopover) {
      try {
        detailsPopoverElement.showPopover();
      } catch (popoverError) {
        console.log("Manual trigger active");
      }
    }
  } else {
    window.closeDetailsPopover();
  }
};

/**
 * Fecha o popover de opções da tela de detalhes.
 */
window.closeDetailsPopover = function () {
  const detailsPopoverElement = document.getElementById("details-options-popover");
  if (detailsPopoverElement) {
    detailsPopoverElement.classList.add("popover-hidden");
    detailsPopoverElement.classList.remove("popover-visible");
    if (detailsPopoverElement.hidePopover) {
      try {
        detailsPopoverElement.hidePopover();
      } catch (hideError) {}
    }
  }
};

/**
 * Trata as ações do popover da tela de detalhes.
 * @param {string} action - Identificador da ação selecionada
 */
window.handleDetailsPopoverAction = function (action) {
  window.closeDetailsPopover();
  if (action === "share") {
    window.openShareWindow();
  }
};

// Listener global para fechar o popover de detalhes ao clicar fora
document.addEventListener("click", function (clickEvent) {
  const detailsPopoverElement = document.getElementById("details-options-popover");
  const detailsOptionsButtonElement = document.getElementById("button-options-details");

  if (
    detailsPopoverElement &&
    !detailsPopoverElement.contains(clickEvent.target) &&
    detailsOptionsButtonElement &&
    !detailsOptionsButtonElement.contains(clickEvent.target)
  ) {
    window.closeDetailsPopover();
  }
});

/* ==========================================================================
   CONTROLE DE PERMISSÃO DO USUÁRIO ATUAL NA TELA DE DETALHES
   ========================================================================== */

/**
 * Verifica se o usuário logado atualmente é o dono da lista
 * ou um usuário compartilhado, e retorna suas permissões.
 *
 * @param {Object} list - Objeto da lista de compras
 * @returns {{ isOwner: boolean, canEdit: boolean }} Permissões do usuário atual
 */
window.getCurrentUserPermissions = function (list) {
  const currentUserName = localStorage.getItem("marketUserName");

  // Verifica se é o dono da lista (campo userName)
  if (list.userName === currentUserName) {
    return { isOwner: true, canEdit: true };
  }

  // Verifica se está na lista de compartilhados
  const sharedUsers = list.sharedWith || [];
  const sharedEntry = sharedUsers.find(
    (sharedUser) =>
      window.normalizeString(sharedUser.name) ===
      window.normalizeString(currentUserName),
  );

  if (sharedEntry) {
    return { isOwner: false, canEdit: sharedEntry.canEdit };
  }

  // Usuário sem acesso (não deveria ocorrer em fluxo normal)
  return { isOwner: false, canEdit: false };
};

/* ==========================================================================
   LISTENER PARA LISTAS COMPARTILHADAS COM O USUÁRIO ATUAL
   ========================================================================== */

/**
 * Inicializa o listener do Firebase para carregar também as listas
 * que estão compartilhadas com o usuário atual (campo sharedWith).
 * Mescla os resultados com o marketListData existente sem duplicar.
 *
 * NOTA: Este listener usa a importação dinâmica para evitar dependências circulares
 * e é inicializado após o login do usuário.
 *
 * @param {string} currentUserName - Nome do usuário atualmente logado
 */
window.initSharedListsListener = async function (currentUserName) {
  try {
    const {
      firestore: firestoreInstance,
      collection,
      query,
      where,
      onSnapshot,
    } = await import("./firebase.js");

    const sharedListsQuery = query(
      collection(firestoreInstance, "lists"),
      where("sharedWith", "array-contains-any", [
        { name: currentUserName, canEdit: true },
        { name: currentUserName, canEdit: false },
      ]),
    );

    onSnapshot(
      sharedListsQuery,
      (sharedSnapshot) => {
        const sharedListsData = sharedSnapshot.docs.map((sharedDoc) => ({
          id: sharedDoc.id,
          ...sharedDoc.data(),
        }));

        // Filtra para evitar duplicatas com listas próprias do usuário
        const uniqueSharedLists = sharedListsData.filter(
          (sharedList) =>
            !window.marketListData.some(
              (ownedList) => ownedList.id === sharedList.id,
            ),
        );

        // Agrega as listas compartilhadas ao array global
        window.marketListData = [
          ...window.marketListData.filter(
            (existingList) =>
              !sharedListsData.some(
                (sharedList) => sharedList.id === existingList.id,
              ),
          ),
          ...sharedListsData,
        ];

        // Re-renderiza a tela de listas se estiver visível
        const listsScreenElement = document.getElementById("market-lists-screen");
        if (
          listsScreenElement &&
          !listsScreenElement.classList.contains("screen-hidden")
        ) {
          if (window.renderMarketLists) window.renderMarketLists();
        }
      },
      (sharedListenerError) => {
        console.error("Erro listener listas compartilhadas:", sharedListenerError);
      },
    );
  } catch (importError) {
    console.error("Erro ao inicializar listener de listas compartilhadas:", importError);
  }
};

/* ==========================================================================
   INICIALIZAÇÃO DO MÓDULO
   ========================================================================== */

// Injeta a estrutura HTML da janela no DOM ao carregar o módulo
injectShareWindowElement();
