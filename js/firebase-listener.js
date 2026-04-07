/* ==========================================================================
   FIREBASE LISTENER E PERSISTÊNCIA
   ========================================================================== */

import {
  firestore,
  collection,
  doc,
  updateDoc,
  serverTimestamp,
  query,
  orderBy,
  onSnapshot,
  where,
} from "./firebase.js";

/* ==========================================================================
   PROTEÇÃO ANTI-REGRESSÃO DE DADOS — COMPARAÇÃO POR TIMESTAMP
   ========================================================================== */

/**
 * Extrai o valor de timestamp em milissegundos de um campo updatedAt do Firestore.
 *
 * @param {Object|null|undefined} updatedAt - Campo updatedAt do documento
 * @returns {number} Tempo em milissegundos, ou 0 se inválido
 */
function extractTimestampMilliseconds(updatedAt) {
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

/**
 * Verifica se os dados recebidos do Firestore são mais recentes do que
 * os dados atualmente armazenados em memória para a mesma lista.
 *
 * Regra: se o timestamp do dado recebido for MENOR que o do dado em memória,
 * o dado em memória é considerado mais atual e NÃO deve ser substituído.
 *
 * @param {Object} incomingListData - Dados recebidos do snapshot do Firestore
 * @param {Object|undefined} existingListData - Dados atualmente em memória para a mesma lista
 * @returns {boolean} True se os dados recebidos são mais recentes ou iguais (pode substituir)
 */
function isIncomingDataMoreRecent(incomingListData, existingListData) {
  // Se não há dado em memória, sempre aceita o dado recebido
  if (!existingListData) return true;

  const incomingTimestamp = extractTimestampMilliseconds(
    incomingListData.updatedAt,
  );
  const existingTimestamp = extractTimestampMilliseconds(
    existingListData.updatedAt,
  );

  // Aceita dado sem timestamp (documentos antigos sem o campo updatedAt)
  if (incomingTimestamp === 0) return true;

  // Só substitui se o dado recebido for mais recente ou igual ao que está em memória
  return incomingTimestamp >= existingTimestamp;
}

/**
 * Mescla uma lista de documentos recebidos do Firestore com o marketListData atual,
 * aplicando proteção anti-regressão por timestamp em cada item individualmente.
 *
 * Para cada documento recebido:
 * - Se não existe em memória: insere normalmente
 * - Se já existe em memória: substitui APENAS se o dado recebido for mais recente
 *
 * @param {Array} currentMarketListData - Array atual do marketListData
 * @param {Array} incomingDocuments - Documentos recebidos do snapshot
 * @returns {Array} Novo array mesclado com proteção anti-regressão
 */
function mergeListDataWithTimestampProtection(
  currentMarketListData,
  incomingDocuments,
) {
  const mergedData = [...currentMarketListData];

  incomingDocuments.forEach((incomingDocument) => {
    const existingIndex = mergedData.findIndex(
      (existingList) => existingList.id === incomingDocument.id,
    );

    if (existingIndex === -1) {
      // Lista ainda não existe em memória: insere normalmente
      mergedData.push(incomingDocument);
    } else {
      // Lista já existe: substitui apenas se o dado recebido for mais recente
      if (
        isIncomingDataMoreRecent(incomingDocument, mergedData[existingIndex])
      ) {
        mergedData[existingIndex] = incomingDocument;
      }
      // Caso contrário, mantém o dado mais recente que já está em memória
    }
  });

  return mergedData;
}

/* ==========================================================================
   PERSISTÊNCIA FIREBASE
   ========================================================================== */

/**
 * Salva as alterações da lista atual no Firestore.
 * Resolve o índice pelo ID estável antes de qualquer operação,
 * evitando que uma reordenação do onSnapshot aponte para a lista errada.
 */
window.saveAndSync = async function () {
  // Resolve o índice pelo ID estável antes de qualquer operação,
  // evitando que uma reordenação do onSnapshot aponte para a lista errada
  const resolvedIndex = window.resolveCurrentListIndex();

  const currentList = window.marketListData[resolvedIndex];
  if (!currentList || !currentList.id) return;

  try {
    const listRef = doc(firestore, "lists", currentList.id);
    await updateDoc(listRef, {
      listName: currentList.listName,
      location: currentList.location,
      date: currentList.date,
      categories: currentList.categories,
      updatedAt: serverTimestamp(),
      // Preserva o userId original do documento — não sobrescreve com o usuário logado,
      userId: currentList.userId,
    });
  } catch (e) {
    console.error("Erro ao atualizar Firestore:", e);
    window.showToast("Falha na comunicação com o Servidor!", "danger");
  }
};

/* ==========================================================================
   LISTENER EM TEMPO REAL DAS LISTAS PRÓPRIAS
   ========================================================================== */

/**
 * Inicializa o listener em tempo real das listas do Firestore.
 * A query agora filtra pelo uid do usuário autenticado (não mais pelo nome).
 *
 * A função de unsubscribe retornada pelo onSnapshot é armazenada em
 * unsubscribeOwnedListsListener para permitir cancelamento explícito
 * no logout, evitando disparos com credenciais inválidas.
 *
 * @param {string} userUid - UID do Firebase Auth do usuário autenticado
 * @param {boolean} isFirstLoadRef - Referência ao flag de primeira carga (passado como objeto mutável)
 * @param {Function} onFirstLoadComplete - Callback chamado após o primeiro carregamento
 * @returns {Function} Função de unsubscribe do listener
 */
function initFirebaseListener(userUid, isFirstLoadRef, onFirstLoadComplete) {
  const q = query(
    collection(firestore, "lists"),
    where("userId", "==", userUid),
    orderBy("date", "desc"),
  );

  // Armazena o unsubscribe para cancelar o listener antes do logout
  const unsubscribeOwnedListsListener = onSnapshot(
    q,
    (snapshot) => {
      // Mapeia os documentos recebidos do Firestore para objetos de lista
      const ownedListsFromFirestore = snapshot.docs.map((firestoreDoc) => ({
        id: firestoreDoc.id,
        ...firestoreDoc.data(),
      }));

      // Preserva as listas compartilhadas já carregadas pelo initSharedListsListener
      // ao atualizar as listas próprias do usuário.
      // Filtra do array global apenas as listas que não são próprias do usuário.
      const sharedListsAlreadyLoaded = window.marketListData.filter(
        (existingList) =>
          !ownedListsFromFirestore.some(
            (ownedList) => ownedList.id === existingList.id,
          ) && existingList.userId !== userUid,
      );

      // Aplica proteção anti-regressão ao mesclar as listas próprias:
      // substitui cada lista própria em memória apenas se o dado recebido do Firestore
      // for mais recente (baseado em updatedAt).
      const mergedOwnedLists = mergeListDataWithTimestampProtection(
        // Passa apenas as listas próprias que já estão em memória como base
        window.marketListData.filter(
          (existingList) => existingList.userId === userUid,
        ),
        ownedListsFromFirestore,
      );

      const receivedOwnedListIds = new Set(
        ownedListsFromFirestore.map((ownedList) => ownedList.id),
      );

      const sanitizedOwnedLists = mergedOwnedLists.filter((mergedList) =>
        receivedOwnedListIds.has(mergedList.id),
      );

      // Reconstrói o marketListData: listas próprias sanitizadas + compartilhadas preservadas
      window.marketListData = [
        ...sanitizedOwnedLists,
        ...sharedListsAlreadyLoaded,
      ];

      if (isFirstLoadRef.value) {
        onFirstLoadComplete(userUid);
        isFirstLoadRef.value = false;
      } else {
        if (
          !document
            .getElementById("market-lists-screen")
            .classList.contains("screen-hidden")
        ) {
          // Exibe skeleton antes de re-renderizar ao receber atualizações do Firestore
          if (window.showListsSkeleton) window.showListsSkeleton();

          // Timer mínimo para garantir visibilidade do skeleton na atualização
          // e sincronizar com a renderização das listas e paginação
          setTimeout(() => {
            if (window.renderMarketLists) window.renderMarketLists();
          }, 350);
        }
        if (
          !document
            .getElementById("market-list-screen-details")
            .classList.contains("screen-hidden")
        ) {
          const hasActivePontualListener =
            window.getActiveDetailsListIdentifier &&
            window.getActiveDetailsListIdentifier() !== null;

          if (!hasActivePontualListener) {
            window.resolveCurrentListIndex();
            window.renderListDetails();
          }
        }
      }
    },
    (error) => {
      console.error("Erro listener:", error);

      const connectionErrorCodes = [
        "permission-denied",
        "unavailable",
        "network-request-failed",
        "unauthenticated",
        "internal",
        "unknown",
      ];

      if (error.code && connectionErrorCodes.includes(error.code)) {
        window.showToast("Falha na comunicação com o Servidor!", "danger");
        // Usa a função global de navegação exposta pelo navigation.js
        if (window.showScreen) window.showScreen("home-screen");
      }

      if (isFirstLoadRef.value) {
        if (window.showScreen) window.showScreen("home-screen");
        isFirstLoadRef.value = false;
      }
    },
  );

  return unsubscribeOwnedListsListener;
}

export { initFirebaseListener };
