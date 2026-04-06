/* ==========================================================================
   TELA: MINHA CONTA
   Exibe lista de opções da conta do usuário:
   - Dados de cadastro
   - Encerrar minha conta (com dialog de confirmação)
   ========================================================================== */
import {
  firestore,
  firebaseAuth,
  collection,
  doc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp,
  signOut,
} from "./firebase.js";

/* ==========================================================================
   ABERTURA E FECHAMENTO DO ALERT DE CONFIRMAÇÃO
   ========================================================================== */

/**
 * Exibe o overlay de confirmação para encerrar a conta.
 * O alert só pode ser fechado pelos botões de ação — nunca pelo overlay externo.
 */
function openDeleteAccountConfirmDialog() {
  const overlayElement = document.getElementById("my-account-confirm-overlay");
  if (!overlayElement) return;

  overlayElement.style.display = "flex";

  // Aguarda um frame para garantir que o display já foi aplicado antes de animar
  requestAnimationFrame(() => {
    overlayElement.classList.add("active");
  });
}

/**
 * Fecha o overlay de confirmação com animação de saída.
 */
function closeDeleteAccountConfirmDialog() {
  const overlayElement = document.getElementById("my-account-confirm-overlay");
  if (!overlayElement) return;

  overlayElement.classList.remove("active");

  // Aguarda o fade-out antes de remover do fluxo visual
  setTimeout(() => {
    overlayElement.style.display = "none";
  }, 280);
}

/* ==========================================================================
   EXCLUSÃO DE CONTA E DADOS RELACIONADOS
   ========================================================================== */

/**
 * Exclui todos os documentos de uma coleção que pertencem ao usuário.
 *
 * @param {string} collectionName - Nome da coleção no Firestore
 * @param {string} userUid - UID do usuário autenticado
 */
async function deleteUserCollectionData(collectionName, userUid) {
  const collectionQuery = query(
    collection(firestore, collectionName),
    where("userId", "==", userUid),
  );

  const collectionSnapshot = await getDocs(collectionQuery);

  const deletionPromises = collectionSnapshot.docs.map((firestoreDoc) =>
    deleteDoc(doc(firestore, collectionName, firestoreDoc.id)),
  );

  await Promise.all(deletionPromises);
}

/**
 * Remove o UID do usuário excluído de todas as listas compartilhadas
 * das quais ele era colaborador (campo sharedWith e sharedUids).
 *
 * Essa operação garante que o dono da lista veja a remoção refletida
 * em tempo real via onSnapshot sem precisar de nenhuma ação manual.
 *
 * @param {string} userUid - UID do usuário cuja conta está sendo encerrada
 */
async function removeUserFromAllSharedLists(userUid) {
  // Busca todas as listas onde o UID do usuário está no array auxiliar sharedUids
  const sharedListsQuery = query(
    collection(firestore, "lists"),
    where("sharedUids", "array-contains", userUid),
  );

  const sharedListsSnapshot = await getDocs(sharedListsQuery);

  if (sharedListsSnapshot.empty) return;

  // Para cada lista compartilhada, remove apenas a entrada do usuário excluído
  const removalPromises = sharedListsSnapshot.docs.map(async (listDocument) => {
    const listData = listDocument.data();

    // Filtra o usuário deletado do array sharedWith
    const updatedSharedWithArray = (listData.sharedWith || []).filter(
      (sharedUser) => sharedUser.uid !== userUid,
    );

    // Mantém o campo auxiliar sharedUids sincronizado com o array sharedWith atualizado
    const updatedSharedUidsArray = updatedSharedWithArray.map(
      (sharedUser) => sharedUser.uid,
    );

    // Persiste a remoção no Firestore — o onSnapshot do dono receberá a mudança em tempo real
    return updateDoc(doc(firestore, "lists", listDocument.id), {
      sharedWith: updatedSharedWithArray,
      sharedUids: updatedSharedUidsArray,
      updatedAt: serverTimestamp(),
    });
  });

  await Promise.all(removalPromises);
}

/**
 * Executa a exclusão completa da conta do usuário:
 * 1. Cancela todos os listeners ativos do Firestore
 * 2. Remove o usuário de todas as listas compartilhadas
 * 3. Exclui todas as listas próprias do usuário no Firestore
 * 4. Exclui o documento do usuário em users/{uid}
 * 5. Ativa o guard de deleção para bloquear o onAuthStateChanged
 * 6. Exclui a conta no Firebase Auth
 * 7. Limpa o localStorage e navega para o onboarding
 */
async function executeAccountDeletion() {
  const confirmButton = document.getElementById("my-account-confirm-delete-button");
  const cancelButton = document.getElementById("my-account-cancel-delete-button");

  // Desabilita os botões durante a operação para evitar cliques duplos
  if (confirmButton) confirmButton.disabled = true;
  if (cancelButton) cancelButton.disabled = true;
  if (confirmButton) confirmButton.textContent = "Excluindo...";

  try {
    const currentUser = firebaseAuth.currentUser;
    if (!currentUser) {
      window.showToast("Usuário não encontrado. Faça login novamente.", "danger");
      closeDeleteAccountConfirmDialog();
      return;
    }

    const userUid = currentUser.uid;

    // Cancela TODOS os listeners ativos do Firestore antes de qualquer operação destrutiva.
    if (window.cancelActiveFirestoreListeners) {
      window.cancelActiveFirestoreListeners();
    }

    if (window.deactivateDetailsRealtimeListener) {
      window.deactivateDetailsRealtimeListener();
    }

    // Remove o usuário de todas as listas onde ele é colaborador.
    // Isso propaga a mudança em tempo real para os donos das listas via onSnapshot,
    // refletindo a remoção do colaborador sem exibir toast para o dono.
    await removeUserFromAllSharedLists(userUid);

    // Exclui todas as listas próprias do usuário no Firestore
    await deleteUserCollectionData("lists", userUid);

    // Exclui o documento do perfil do usuário
    const userDocumentReference = doc(firestore, "users", userUid);
    await deleteDoc(userDocumentReference);

    // Ativa o guard ANTES de deletar a conta no Firebase Auth.
    window.isAccountDeletionInProgress = true;

    // Exclui a conta no Firebase Auth — dispara onAuthStateChanged com user = null
    await currentUser.delete();

    // Limpa dados locais e reseta o estado global
    if (window.clearUserDataFromStorage) {
      window.clearUserDataFromStorage();
    } else {
      // Fallback caso a função não esteja exposta — limpa as chaves conhecidas
      localStorage.removeItem("mku");
      localStorage.removeItem("mkuid");
      localStorage.removeItem("mkuid_ref");
    }

    window.marketListData = [];

    closeDeleteAccountConfirmDialog();

    // Navega para o onboarding após a exclusão completa com overlay de transição
    setTimeout(() => {
      // Desativa o guard após a navegação ser iniciada para restaurar o comportamento normal
      window.isAccountDeletionInProgress = false;

      window.showScreen("onboarding-screen");
      setTimeout(() => {
        window.showToast("Conta encerrada com sucesso.", "success");
      }, 400);
    }, 300);
  } catch (deletionError) {
    console.error("Erro ao encerrar conta:", deletionError);

    // Desativa o guard em caso de erro para não bloquear o fluxo de autenticação
    window.isAccountDeletionInProgress = false;

    // Reativa os botões em caso de erro para permitir nova tentativa
    if (confirmButton) confirmButton.disabled = false;
    if (cancelButton) cancelButton.disabled = false;
    if (confirmButton) confirmButton.textContent = "Encerrar";

    // O Firebase exige reautenticação recente para deletar a conta
    if (deletionError.code === "auth/requires-recent-login") {
      closeDeleteAccountConfirmDialog();
      window.showToast(
        "Por segurança, faça login novamente antes de encerrar a conta.",
        "danger",
      );
    } else {
      window.showToast("Erro ao encerrar conta. Tente novamente.", "danger");
    }
  }
}

/* ==========================================================================
   INICIALIZAÇÃO DA TELA
   ========================================================================== */

/**
 * Inicializa a tela Minha Conta registrando os eventos dos botões de ação
 * do alert de confirmação de exclusão de conta.
 *
 * Chamado por showScreen ao exibir a tela "my-account-screen".
 */
window.initializeMyAccountScreen = function () {
  const confirmButton = document.getElementById("my-account-confirm-delete-button");
  const cancelButton = document.getElementById("my-account-cancel-delete-button");

  if (confirmButton) {
    confirmButton.onclick = executeAccountDeletion;
  }

  if (cancelButton) {
    cancelButton.onclick = closeDeleteAccountConfirmDialog;
  }
};

/* Exposição das funções necessárias ao escopo global para os eventos inline do HTML */
window.openDeleteAccountConfirmDialog = openDeleteAccountConfirmDialog;
window.closeDeleteAccountConfirmDialog = closeDeleteAccountConfirmDialog;
