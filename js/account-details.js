/* ==========================================================================
   TELA: DADOS DE CADASTRO
   Exibe nome e email do usuário autenticado.
   Permite editar apenas o nome de exibição com confirmação no Firestore.
   ========================================================================== */
import {
  firestore,
  firebaseAuth,
  doc,
  updateDoc,
  updateProfile,
} from "./firebase.js";

/* ==========================================================================
   ESTADO LOCAL DA TELA
   ========================================================================== */

// Controla se o campo de nome está habilitado para edição
let isNameFieldEditing = false;

// Controla se a operação de salvar está em andamento, evitando duplo clique
let isSaveOperationInProgress = false;

/* ==========================================================================
   UTILITÁRIO — TROCA DE ÍCONE DO BOTÃO DE EDIÇÃO
   ========================================================================== */

/**
 * Atualiza o ícone do botão de lápis conforme o estado de edição.
 * Exibe "close-outline" quando a edição está ativa (clique cancela),
 * e "pencil-outline" quando está inativa (clique habilita).
 *
 * @param {boolean} editingState - True para ícone de fechar, false para lápis
 */
function updateEditButtonIcon(editingState) {
  const editButtonElement = document.getElementById(
    "account-details-edit-button",
  );
  if (!editButtonElement) return;

  const iconElement = editButtonElement.querySelector("ion-icon");

  if (iconElement) {
    iconElement.setAttribute(
      "name",
      editingState ? "close-outline" : "pencil-outline",
    );
  }
}

/* ==========================================================================
   CONTROLE DO MODO DE EDIÇÃO DO NOME
   ========================================================================== */

/**
 * Alterna o modo de edição do campo de nome.
 * Ao ativar: habilita o input, troca ícone para "fechar", aplica classe
 *   editing no wrapper e exibe o botão de salvar.
 * Ao desativar: restaura o valor original, troca ícone de volta para "lápis"
 *   e remove a classe editing do wrapper.
 */
window.toggleNameEditMode = function () {
  const nameInputElement = document.getElementById(
    "account-details-name-input",
  );
  const editButtonElement = document.getElementById(
    "account-details-edit-button",
  );
  const editableRowElement = document.getElementById(
    "account-details-editable-row",
  );
  // Wrapper visual que une o input e o botão de lápis numa mesma caixa
  const inputWrapperElement = document.getElementById(
    "account-details-name-input-wrapper",
  );

  if (!nameInputElement || !editButtonElement || !editableRowElement) return;

  isNameFieldEditing = !isNameFieldEditing;

  if (isNameFieldEditing) {
    // Habilita o campo e foca ao final do texto
    nameInputElement.disabled = false;
    nameInputElement.focus();
    nameInputElement.setSelectionRange(
      nameInputElement.value.length,
      nameInputElement.value.length,
    );

    editButtonElement.classList.add("active");
    editableRowElement.classList.add("editing");
    // Aplica borda do primário no wrapper inteiro ao entrar em edição
    if (inputWrapperElement) inputWrapperElement.classList.add("editing");

    // Troca o ícone para "fechar" indicando que o clique cancela a edição
    updateEditButtonIcon(true);
  } else {
    // Restaura o valor salvo e desabilita o campo
    restoreNameFieldToSavedValue();
  }
};

/**
 * Restaura o campo de nome ao valor salvo anteriormente e desabilita a edição.
 * Também reverte o ícone do botão para "lápis" e remove a classe editing do wrapper.
 */
function restoreNameFieldToSavedValue() {
  const nameInputElement = document.getElementById(
    "account-details-name-input",
  );
  const editButtonElement = document.getElementById(
    "account-details-edit-button",
  );
  const editableRowElement = document.getElementById(
    "account-details-editable-row",
  );
  const inputWrapperElement = document.getElementById(
    "account-details-name-input-wrapper",
  );

  if (!nameInputElement) return;

  // Restaura o valor original armazenado no atributo data-original-value
  nameInputElement.value = nameInputElement.dataset.originalValue || "";
  nameInputElement.disabled = true;

  if (editButtonElement) editButtonElement.classList.remove("active");
  if (editableRowElement) editableRowElement.classList.remove("editing");
  // Remove a borda do primário do wrapper ao sair do modo de edição
  if (inputWrapperElement) inputWrapperElement.classList.remove("editing");

  // Reverte o ícone para "lápis" ao sair do modo de edição
  updateEditButtonIcon(false);

  isNameFieldEditing = false;
}

/* ==========================================================================
   SALVAR NOME NO BANCO DE DADOS
   ========================================================================== */

/**
 * Salva o novo nome do usuário no Firestore e no Firebase Auth.
 * Após salvar com sucesso, atualiza o localStorage criptografado e
 * retorna para a tela de Minha Conta.
 */
window.saveUserDisplayName = async function () {
  // Bloqueia execução duplicada enquanto a operação estiver em andamento
  if (isSaveOperationInProgress) return;

  const nameInputElement = document.getElementById(
    "account-details-name-input",
  );
  const saveButtonElement = document.getElementById(
    "account-details-save-name-button",
  );

  if (!nameInputElement) return;

  const newDisplayName = nameInputElement.value.trim();

  if (!newDisplayName) {
    window.showToast("O nome não pode ficar em branco.", "danger");
    return;
  }

  // Ativa o flag e desabilita o botão antes de iniciar a operação assíncrona
  isSaveOperationInProgress = true;

  if (saveButtonElement) {
    saveButtonElement.disabled = true;
    saveButtonElement.textContent = "Salvando...";
  }

  try {
    const currentUser = firebaseAuth.currentUser;
    if (!currentUser) {
      window.showToast("Usuário não encontrado.", "danger");
      return;
    }

    // Atualiza o displayName no Firebase Auth
    await updateProfile(currentUser, { displayName: newDisplayName });

    // Atualiza o displayName no documento do usuário no Firestore
    const userDocumentReference = doc(firestore, "users", currentUser.uid);
    await updateDoc(userDocumentReference, { displayName: newDisplayName });

    // Atualiza o localStorage criptografado com o novo nome
    if (window.saveEncryptedUserDataToStorage) {
      await window.saveEncryptedUserDataToStorage(
        currentUser.uid,
        newDisplayName,
      );
    }

    // Atualiza o título de boas-vindas na home para refletir o novo nome
    if (window.updateWelcomeTitle) {
      window.updateWelcomeTitle();
    }

    // Armazena o novo valor como referência original para restauração futura
    nameInputElement.dataset.originalValue = newDisplayName;

    // Restaura o campo para o estado de leitura (também reverte o ícone)
    restoreNameFieldToSavedValue();

    window.showToast("Nome atualizado com sucesso!", "success");

    // Retorna para a tela Minha Conta após salvar
    setTimeout(() => {
      window.showScreen("my-account-screen");
    }, 600);
  } catch (saveError) {
    console.error("Erro ao salvar nome:", saveError);
    window.showToast("Erro ao salvar nome. Tente novamente.", "danger");
  } finally {
    // Libera o flag e restaura o botão independentemente do resultado
    isSaveOperationInProgress = false;

    if (saveButtonElement) {
      saveButtonElement.disabled = false;
      saveButtonElement.innerHTML =
        '<ion-icon name="checkmark-outline"></ion-icon> Salvar';
    }
  }
};

/* ==========================================================================
   INICIALIZAÇÃO DA TELA
   ========================================================================== */

/**
 * Inicializa a tela de Dados de Cadastro preenchendo nome e email
 * com os dados do usuário autenticado.
 *
 * Chamado por showScreen ao exibir a tela "account-details-screen".
 */
window.initializeAccountDetailsScreen = async function () {
  const nameInputElement = document.getElementById(
    "account-details-name-input",
  );
  const emailValueElement = document.getElementById(
    "account-details-email-value",
  );

  // Reseta o estado de edição e o flag de salvamento sempre que a tela é aberta
  isNameFieldEditing = false;
  isSaveOperationInProgress = false;

  if (nameInputElement) {
    nameInputElement.disabled = true;
  }

  const editButtonElement = document.getElementById(
    "account-details-edit-button",
  );
  const editableRowElement = document.getElementById(
    "account-details-editable-row",
  );
  const inputWrapperElement = document.getElementById(
    "account-details-name-input-wrapper",
  );

  if (editButtonElement) editButtonElement.classList.remove("active");
  if (editableRowElement) editableRowElement.classList.remove("editing");
  // Garante que o wrapper inicia sem a borda do primário ao abrir a tela
  if (inputWrapperElement) inputWrapperElement.classList.remove("editing");

  // Garante que o ícone inicia como lápis ao abrir a tela
  updateEditButtonIcon(false);

  const currentUser = firebaseAuth.currentUser;
  if (!currentUser) return;

  // Preenche o email (somente leitura)
  if (emailValueElement) {
    emailValueElement.textContent = currentUser.email || "—";
  }

  // Preenche o nome do usuário autenticado
  if (nameInputElement) {
    const displayName = currentUser.displayName || "";
    nameInputElement.value = displayName;
    // Armazena o valor original para restauração caso o usuário cancele a edição
    nameInputElement.dataset.originalValue = displayName;
  }
};
