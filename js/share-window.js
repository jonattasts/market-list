/* ==========================================================================
   JANELA DE COMPARTILHAMENTO DE LISTA
   ========================================================================== */

import {
  firestore,
  firebaseAuth,
  doc,
  updateDoc,
  getDocs,
  collection,
  query,
  where,
  onSnapshot,
  serverTimestamp,
} from "./firebase.js";

/* ==========================================================================
   ESTADO INTERNO DO MÓDULO
   ========================================================================== */

// Controla se o formulário de novo usuário está visível dentro da janela
let isAddingNewSharedUser = false;

// Identificador da lista atualmente aberta na tela de detalhes
// Usado para evitar duplicatas no array marketListData durante sincronizações
let activeDetailsListIdentifier = null;

/* ==========================================================================
   SANITIZAÇÃO — DOMPARSER COMO ALTERNATIVA NATIVA AO DOMPURIFY
   ========================================================================== */

/**
 * Sanitiza uma string removendo tags HTML e scripts maliciosos.
 * Usa DOMParser nativo do browser para extrair apenas o texto em claro,
 * eliminando qualquer tentativa de injeção de HTML/XSS via dados do Firestore.
 *
 * @param {string} rawInput - Texto potencialmente inseguro vindo do banco de dados
 * @returns {string} Texto sanitizado sem tags HTML
 */
function sanitizeHtmlInput(rawInput) {
  if (!rawInput) return "";
  const documentParser = new DOMParser();
  const parsedDocument = documentParser.parseFromString(rawInput, "text/html");
  return parsedDocument.body.textContent || "";
}

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

      <!-- Nome de exibição do usuário a ser adicionado -->
      <div class="input-field">
        <label>Nome da pessoa<span class="required-mark">*</span></label>
        <input
          type="text"
          id="share-user-name-input"
          placeholder="Ex: Maria, João..."
          autocomplete="off"
        />
        <span class="input-hint">💡 Use o nome exato cadastrado no app</span>
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
 * Sanitiza todos os dados do Firestore antes de injetar no DOM
 * para prevenir ataques XSS via nomes de usuários maliciosos.
 *
 * @param {Array<Object>} sharedUsers - Array com os objetos de usuário compartilhado
 * @returns {string} HTML da lista de usuários
 */
function getSharedUsersListTemplate(sharedUsers) {
  const usersItemsHTML = sharedUsers
    .map((sharedUser, userIndex) => {
      // Sanitiza o displayName antes de injetar no HTML
      const safeDisplayName = sanitizeHtmlInput(
        sharedUser.displayName || sharedUser.name || "",
      );

      return `
          <div class="share-user-item" id="share-user-item-${userIndex}">
            <ion-icon name="person-circle-outline" class="share-user-icon"></ion-icon>
            <div class="share-user-info">
              <span class="share-user-name">${safeDisplayName}</span>
              <span class="share-user-permission">
                <span class="share-permission-badge ${sharedUser.canEdit ? "can-edit" : "read-only"}">
                  <ion-icon name="${sharedUser.canEdit ? "create-outline" : "eye-outline"}" class="permission-icon"></ion-icon>
                  ${sharedUser.canEdit ? "Pode editar" : "Só visualizar"}
                </span>
              </span>
            </div>
            <button
              class="share-user-remove-button"
              onclick="window.handleRemoveSharedUser(${userIndex})"
              aria-label="Remover ${safeDisplayName}"
            >
              <ion-icon name="trash-outline"></ion-icon>
            </button>
          </div>
        `;
    })
    .join("");

  return `
    <div class="share-window-users-section">
      <span class="share-window-emoji">🫂</span>
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
 * Busca um usuário no Firestore pelo displayName exato.
 * A busca é feita na coleção "users" pelo campo displayName.
 * Retorna o documento do usuário encontrado ou null se não existir.
 *
 * @param {string} displayName - Nome de exibição a ser buscado
 * @returns {Promise<Object|null>} Dados do usuário encontrado ou null
 */
async function findUserByDisplayName(displayName) {
  try {
    const usersQuery = query(
      collection(firestore, "users"),
      where("displayName", "==", displayName),
    );
    const usersSnapshot = await getDocs(usersQuery);

    if (usersSnapshot.empty) return null;

    // Retorna o primeiro usuário encontrado com esse displayName
    const userDocument = usersSnapshot.docs[0];
    return { id: userDocument.id, ...userDocument.data() };
  } catch (queryError) {
    console.error("Erro ao buscar usuário por displayName:", queryError);
    return null;
  }
}

/**
 * Extrai o array de UIDs a partir do array sharedWith atualizado.
 * Usado para manter o campo auxiliar "sharedUids" em sincronia com "sharedWith".
 *
 * O campo "sharedUids" é um array de strings de UID que permite a query
 * array-contains no initSharedListsListener sem depender de match exato
 * de objetos.
 *
 * @param {Array<Object>} sharedUsersArray - Array de objetos do campo sharedWith
 * @returns {Array<string>} Array de UIDs extraídos
 */
function extractUidsFromSharedUsersArray(sharedUsersArray) {
  return sharedUsersArray.map((sharedUser) => sharedUser.uid);
}

/**
 * Trata o nome da pessoa a ser adicionada ao compartilhamento,
 * buscando pelo displayName no Firestore e linkando pelo UID.
 * Valida os dados, persiste no Firebase e atualiza os dados em cache.
 */
window.handleConfirmShare = async function () {
  const nameInputElement = document.getElementById("share-user-name-input");
  const canEditToggleElement = document.getElementById("share-can-edit-toggle");
  const submitButtonElement = document.getElementById("share-submit-button");

  if (!nameInputElement || !submitButtonElement) return;

  const rawName = nameInputElement.value;
  const normalizedDisplayName = window.capitalize(rawName);

  // Validação mínima: mesmo critério do onboarding (mínimo 3 caracteres)
  if (!normalizedDisplayName || normalizedDisplayName.length < 3) {
    window.showToast("O nome deve ter pelo menos 3 caracteres", "danger");
    return;
  }

  const currentList = window.marketListData[window.currentListIndex];
  const existingSharedUsers = currentList.sharedWith || [];

  // Verifica se o uid já está compartilhado (evita duplicatas por UID)
  const currentUser = firebaseAuth.currentUser;
  if (!currentUser) {
    window.showToast("Usuário não autenticado.", "danger");
    return;
  }

  // Não permite compartilhar consigo mesmo
  if (
    window.normalizeString(normalizedDisplayName) ===
    window.normalizeString(currentUser.displayName || "")
  ) {
    window.showToast(
      "Você não pode compartilhar a lista com você mesmo.",
      "danger",
    );
    return;
  }

  // Busca o usuário pelo displayName no Firestore
  submitButtonElement.classList.add("is-loading");

  let targetUserData = null;
  try {
    targetUserData = await findUserByDisplayName(normalizedDisplayName);

    if (!targetUserData) {
      submitButtonElement.classList.remove("is-loading");
      window.showToast(
        `Nenhum usuário encontrado com o nome "${normalizedDisplayName}".`,
        "danger",
      );
      return;
    }
  } catch (fetchError) {
    console.error("Erro ao verificar usuário:", fetchError);
    submitButtonElement.classList.remove("is-loading");
    window.showToast("Falha na comunicação com o Servidor!", "danger");
    return;
  }

  // Verifica se o uid do usuário encontrado já está na lista de compartilhados
  const isAlreadyShared = existingSharedUsers.some(
    (sharedUser) => sharedUser.uid === targetUserData.uid,
  );

  if (isAlreadyShared) {
    submitButtonElement.classList.remove("is-loading");
    window.showToast(
      "Esta lista já está compartilhada com esse usuário.",
      "danger",
    );
    return;
  }

  const canEdit = canEditToggleElement ? canEditToggleElement.checked : false;

  const newSharedUserEntry = {
    uid: targetUserData.uid,
    displayName: targetUserData.displayName,
    canEdit: canEdit,
  };

  const updatedSharedUsersArray = [...existingSharedUsers, newSharedUserEntry];

  // Extrai o array auxiliar de UIDs para permitir a query array-contains
  // no initSharedListsListener sem depender de match exato de objetos completos
  const updatedSharedUidsArray = extractUidsFromSharedUsersArray(
    updatedSharedUsersArray,
  );

  const ownerDisplayName =
    currentList.ownerDisplayName || currentUser.displayName || "";

  try {
    // Persiste a nova lista de compartilhados no Firestore.
    const listDocumentReference = doc(firestore, "lists", currentList.id);
    await updateDoc(listDocumentReference, {
      sharedWith: updatedSharedUsersArray,
      sharedUids: updatedSharedUidsArray,
      ownerDisplayName: ownerDisplayName,
      updatedAt: serverTimestamp(),
    });

    // Atualiza os dados em cache local para refletir imediatamente
    window.marketListData[window.currentListIndex].sharedWith =
      updatedSharedUsersArray;
    window.marketListData[window.currentListIndex].sharedUids =
      updatedSharedUidsArray;
    window.marketListData[window.currentListIndex].ownerDisplayName =
      ownerDisplayName;

    // Fecha a janela e re-renderiza a tela de listas
    window.closeShareWindow();
    window.showToast(
      `Lista compartilhada com ${normalizedDisplayName}!`,
      "success",
    );

    // Ativa (ou mantém ativo) o listener em tempo real do lado do dono.
    // Necessário para que o dono receba em tempo real as alterações feitas
    // pelo usuário recém-adicionado ao compartilhamento, mesmo que a lista
    // já estivesse aberta antes do compartilhamento ser criado.
    if (window.activateDetailsRealtimeListener) {
      window.activateDetailsRealtimeListener(currentList.id);
    }

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

  // Mantém o campo auxiliar "sharedUids" sincronizado após a remoção
  const updatedSharedUidsArray = extractUidsFromSharedUsersArray(
    updatedSharedUsersArray,
  );

  try {
    // Persiste a remoção no Firestore mantendo sharedUids sincronizado
    const listDocumentReference = doc(firestore, "lists", currentList.id);
    await updateDoc(listDocumentReference, {
      sharedWith: updatedSharedUsersArray,
      sharedUids: updatedSharedUidsArray,
      updatedAt: serverTimestamp(),
    });

    // Atualiza os dados em cache local
    window.marketListData[window.currentListIndex].sharedWith =
      updatedSharedUsersArray;
    window.marketListData[window.currentListIndex].sharedUids =
      updatedSharedUidsArray;

    const safeRemovedName = sanitizeHtmlInput(
      userToRemove.displayName || userToRemove.name || "",
    );
    window.showToast(
      `${safeRemovedName} removido do compartilhamento.`,
      "success",
    );

    // Re-renderiza a janela com os dados atualizados
    const bodyElement = document.getElementById("share-window-body");
    const titleElement = document.getElementById("share-window-title");

    if (updatedSharedUsersArray.length > 0) {
      // Ainda há usuários compartilhados: exibe a lista atualizada
      titleElement.textContent = "Compartilhado com";
      bodyElement.innerHTML = getSharedUsersListTemplate(
        updatedSharedUsersArray,
      );
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

  const detailsPopoverElement = document.getElementById(
    "details-options-popover",
  );
  if (!detailsPopoverElement) return;

  const isPopoverHidden =
    detailsPopoverElement.classList.contains("popover-hidden");

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
  const detailsPopoverElement = document.getElementById(
    "details-options-popover",
  );
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
  const detailsPopoverElement = document.getElementById(
    "details-options-popover",
  );
  const detailsOptionsButtonElement = document.getElementById(
    "button-options-details",
  );

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
 * ou um usuário compartilhado, e retorna suas permissões pelo UID do Firebase Auth.
 *
 * @param {Object} list - Objeto da lista de compras
 * @returns {{ isOwner: boolean, canEdit: boolean }} Permissões do usuário atual
 */
window.getCurrentUserPermissions = function (list) {
  const currentUser = firebaseAuth.currentUser;
  if (!currentUser) return { isOwner: false, canEdit: false };

  const currentUserUid = currentUser.uid;

  if (list.userId === currentUserUid) {
    return { isOwner: true, canEdit: true };
  }

  // Verifica se está na lista de compartilhados
  const sharedUsers = list.sharedWith || [];
  const sharedEntry = sharedUsers.find(
    (sharedUser) => sharedUser.uid === currentUserUid,
  );

  if (sharedEntry) {
    return { isOwner: false, canEdit: sharedEntry.canEdit };
  }

  // Usuário sem acesso (não deveria ocorrer em fluxo normal)
  return { isOwner: false, canEdit: false };
};

/* ==========================================================================
   GETTER E SETTER PARA O IDENTIFICADOR DA LISTA ATIVA EM DETALHES
   ========================================================================== */

/**
 * Retorna o identificador da lista atualmente aberta na tela de detalhes.
 * Usado pelo listener de listas compartilhadas para evitar duplicatas.
 * @returns {string|null} ID da lista aberta ou null se nenhuma estiver aberta
 */
window.getActiveDetailsListIdentifier = function () {
  return activeDetailsListIdentifier;
};

/**
 * Define o identificador da lista atualmente aberta na tela de detalhes.
 * Deve ser chamado pelo details.js ao ativar/desativar o listener de tempo real.
 * @param {string|null} listIdentifier - ID da lista ou null para limpar
 */
window.setActiveDetailsListIdentifier = function (listIdentifier) {
  activeDetailsListIdentifier = listIdentifier;
};

/* ==========================================================================
   LISTENER PARA LISTAS COMPARTILHADAS COM O USUÁRIO ATUAL
   ========================================================================== */

/**
 * Inicializa o listener do Firebase para carregar também as listas
 * que estão compartilhadas com o usuário atual (campo sharedWith).
 *
 * Este listener é responsável exclusivamente pela aba "Compartilhadas" da
 * tela de listas. Detecta remoções de compartilhamento enquanto o usuário
 * estiver navegando pela aba, exibindo toast informativo se necessário.
 *
 * O listener de tempo real pontual (ativado ao abrir a lista) é gerenciado
 * separadamente em details.js via activateDetailsRealtimeListener.
 *
 * A função de unsubscribe é exposta via window.unsubscribeSharedListsListener
 * para que o handleLogout no index.js possa cancelá-la antes do signOut,
 * evitando o erro "Missing or insufficient permissions" após o logout.
 *
 * NOTA: Este listener usa a importação dinâmica para evitar dependências circulares
 * e é inicializado após o login do usuário.
 *
 * @param {string} currentUserUid - UID do usuário autenticado via Firebase Auth
 */
window.initSharedListsListener = async function (currentUserUid) {
  try {
    const sharedListsQuery = query(
      collection(firestore, "lists"),
      where("sharedUids", "array-contains", currentUserUid),
    );

    // Usado para detectar quais listas foram removidas do compartilhamento
    let previousSharedListIds = new Set();

    if (typeof window.unsubscribeSharedListsListener === "function") {
      window.unsubscribeSharedListsListener();
    }

    window.unsubscribeSharedListsListener = onSnapshot(
      sharedListsQuery,
      (sharedSnapshot) => {
        const sharedListsFromFirestore = sharedSnapshot.docs.map(
          (sharedDoc) => ({
            id: sharedDoc.id,
            ...sharedDoc.data(),
          }),
        );

        // IDs das listas compartilhadas recebidas neste snapshot
        const currentSharedListIds = new Set(
          sharedListsFromFirestore.map((list) => list.id),
        );

        // Detecta listas que estavam compartilhadas e deixaram de estar
        // (presentes no snapshot anterior mas ausentes no atual).
        if (
          previousSharedListIds.size > 0 &&
          !window.isDatabaseFieldMigrationInProgress
        ) {
          previousSharedListIds.forEach((previousListId) => {
            if (!currentSharedListIds.has(previousListId)) {
              const listInCache = window.marketListData.find(
                (existingList) => existingList.id === previousListId,
              );
              const isOwnedByCurrentUser =
                listInCache && listInCache.userId === currentUserUid;

              // Ignora remoção de listas próprias — elas são gerenciadas
              // exclusivamente pelo initFirebaseListener no index.js
              if (isOwnedByCurrentUser) return;

              // Remove a lista do cache local imediatamente ao detectar a remoção,
              // garantindo que ela desapareça da aba de listas compartilhadas sem
              // precisar aguardar o próximo ciclo de renderização ou ação do usuário
              window.marketListData = window.marketListData.filter(
                (existingList) => existingList.id !== previousListId,
              );

              // Verifica se o usuário está na aba de listas compartilhadas
              const listsScreenElement = document.getElementById(
                "market-lists-screen",
              );
              const isOnListsScreen =
                listsScreenElement &&
                !listsScreenElement.classList.contains("screen-hidden");

              // Toast exibido somente se o usuário estiver na aba de listas compartilhadas
              if (isOnListsScreen) {
                window.showToast(
                  "Uma lista compartilhada não está mais disponível para você.",
                  "danger",
                );

                // Re-renderiza imediatamente para remover a lista da tela
                if (window.renderMarketLists) window.renderMarketLists();
              }
            }
          });
        }

        // Atualiza o registro de IDs para o próximo ciclo de detecção
        previousSharedListIds = currentSharedListIds;

        const currentlyOpenListIdentifier =
          window.getActiveDetailsListIdentifier
            ? window.getActiveDetailsListIdentifier()
            : null;

        // Aplica proteção anti-regressão ao mesclar as listas compartilhadas:
        // para cada lista recebida do Firestore, substitui o dado em memória
        // apenas se o dado recebido for mais recente (comparação por updatedAt).
        const sharedListsToMerge = sharedListsFromFirestore.filter(
          (sharedList) => sharedList.id !== currentlyOpenListIdentifier,
        );

        // Reconstrói a base preservando:
        // 1. Listas próprias do usuário (gerenciadas pelo initFirebaseListener)
        // 2. A lista aberta em detalhes (gerenciada pelo listener pontual)
        // Remove apenas as listas compartilhadas que serão reprocessadas,
        // evitando duplicatas ao reinserir a lista aberta via preservedOpenList.
        const baseMarketListData = window.marketListData.filter(
          (existingList) => {
            // Sempre preserva listas próprias do usuário
            if (existingList.userId === currentUserUid) return true;

            // Sempre preserva a lista atualmente aberta em detalhes
            // (ela NÃO deve ser reprocessada por sharedListsToMerge nem duplicada)
            if (existingList.id === currentlyOpenListIdentifier) return true;

            // Remove as demais listas compartilhadas que serão reprocessadas
            return !sharedListsToMerge.some(
              (sharedList) => sharedList.id === existingList.id,
            );
          },
        );

        // Mescla com proteção anti-regressão por timestamp
        const mergedSharedLists = sharedListsToMerge.reduce(
          (accumulator, incomingSharedList) => {
            const existingIndex = accumulator.findIndex(
              (existingList) => existingList.id === incomingSharedList.id,
            );

            if (existingIndex === -1) {
              // Lista ainda não existe em memória: insere normalmente
              return [...accumulator, incomingSharedList];
            }

            // Lista já existe: substitui apenas se o dado recebido for mais recente
            const existingTimestamp = extractUpdatedAtMilliseconds(
              accumulator[existingIndex].updatedAt,
            );
            const incomingTimestamp = extractUpdatedAtMilliseconds(
              incomingSharedList.updatedAt,
            );

            if (
              incomingTimestamp === 0 ||
              incomingTimestamp >= existingTimestamp
            ) {
              const updatedAccumulator = [...accumulator];
              updatedAccumulator[existingIndex] = incomingSharedList;
              return updatedAccumulator;
            }

            // Mantém o dado mais recente que já está em memória
            return accumulator;
          },
          baseMarketListData,
        );

        // Aplica o array mesclado ao marketListData.
        window.marketListData = mergedSharedLists;

        // Re-renderiza a tela de listas se estiver visível
        const listsScreenElement = document.getElementById(
          "market-lists-screen",
        );
        if (
          listsScreenElement &&
          !listsScreenElement.classList.contains("screen-hidden")
        ) {
          if (window.renderMarketLists) window.renderMarketLists();
        }

        // Só renderiza se não houver um listener pontual ativo, pois ele é mais preciso
        // e já garante a atualização em tempo real via onSnapshot do documento.
        const detailsScreenElement = document.getElementById(
          "market-list-screen-details",
        );
        if (
          detailsScreenElement &&
          !detailsScreenElement.classList.contains("screen-hidden")
        ) {
          const hasActivePontualListener = currentlyOpenListIdentifier !== null;

          if (!hasActivePontualListener) {
            window.resolveCurrentListIndex();
            if (window.renderListDetails) window.renderListDetails();
          }
        }
      },
      (sharedListenerError) => {
        console.error(
          "Erro listener listas compartilhadas:",
          sharedListenerError,
        );
      },
    );
  } catch (listenerInitError) {
    console.error(
      "Erro ao inicializar listener de listas compartilhadas:",
      listenerInitError,
    );
  }
};

/* ==========================================================================
   UTILITÁRIO INTERNO — EXTRAÇÃO DE TIMESTAMP
   ========================================================================== */

/**
 * Converte o campo updatedAt de um documento do Firestore para milissegundos.
 * Versão local para uso no listener de compartilhadas, espelhando a função
 * equivalente do index.js sem criar dependência entre módulos.
 *
 * @param {Object|null|undefined} updatedAt - Campo updatedAt do documento
 * @returns {number} Tempo em milissegundos, ou 0 se inválido
 */
function extractUpdatedAtMilliseconds(updatedAt) {
  if (!updatedAt) return 0;

  // Timestamp do Firestore com método toMillis()
  if (typeof updatedAt.toMillis === "function") {
    return updatedAt.toMillis();
  }

  // Objeto com campo seconds (formato serializado do Firestore)
  if (typeof updatedAt.seconds === "number") {
    return updatedAt.seconds * 1000;
  }

  return 0;
}

/* ==========================================================================
   INICIALIZAÇÃO DO MÓDULO
   ========================================================================== */

// Injeta a estrutura HTML da janela no DOM ao carregar o módulo
injectShareWindowElement();
