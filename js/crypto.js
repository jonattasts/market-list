/* ==========================================================================
   CRIPTOGRAFIA — AES-GCM COM CHAVE DERIVADA VIA PBKDF2
   ========================================================================== */

// Salt fixo do app — não é segredo crítico, apenas evita ataques de rainbow table
// O segredo real é o uid que só o Firebase Auth entrega após autenticação real
const APPLICATION_SALT = "marketlist-salt-v1";

/**
 * Deriva uma chave AES-256-GCM a partir do uid do usuário autenticado.
 * Usa PBKDF2 com 100.000 iterações para dificultar brute-force.
 *
 * @param {string} userUid - UID do Firebase Auth do usuário autenticado
 * @returns {Promise<CryptoKey>} Chave AES-GCM derivada
 */
async function deriveEncryptionKeyFromUid(userUid) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(userUid),
    { name: "PBKDF2" },
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: encoder.encode(APPLICATION_SALT),
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/**
 * Criptografa uma string usando AES-GCM com a chave derivada do uid.
 * Gera um IV aleatório a cada chamada para garantir unicidade do cifrado.
 *
 * @param {string} plainText - Texto em claro a ser criptografado
 * @param {CryptoKey} encryptionKey - Chave AES-GCM derivada
 * @returns {Promise<string>} Objeto JSON serializado com iv e dados cifrados em base64
 */
async function encryptData(plainText, encryptionKey) {
  const encoder = new TextEncoder();
  const initializationVector = crypto.getRandomValues(new Uint8Array(12));

  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: initializationVector },
    encryptionKey,
    encoder.encode(plainText),
  );

  // Serializa iv e dados cifrados como base64 para armazenamento no localStorage
  const encryptedArray = Array.from(new Uint8Array(encryptedBuffer));
  const ivArray = Array.from(initializationVector);

  return JSON.stringify({
    iv: btoa(String.fromCharCode(...ivArray)),
    data: btoa(String.fromCharCode(...encryptedArray)),
  });
}

/**
 * Descriptografa um valor cifrado previamente por encryptData.
 * Retorna null se a descriptografia falhar (chave errada, dado corrompido, etc.)
 *
 * @param {string} encryptedJson - JSON serializado com iv e dados em base64
 * @param {CryptoKey} encryptionKey - Chave AES-GCM derivada
 * @returns {Promise<string|null>} Texto em claro ou null em caso de falha
 */
async function decryptData(encryptedJson, encryptionKey) {
  try {
    const { iv, data } = JSON.parse(encryptedJson);

    const initializationVector = new Uint8Array(
      atob(iv)
        .split("")
        .map((char) => char.charCodeAt(0)),
    );
    const encryptedBuffer = new Uint8Array(
      atob(data)
        .split("")
        .map((char) => char.charCodeAt(0)),
    );

    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: initializationVector },
      encryptionKey,
      encryptedBuffer,
    );

    return new TextDecoder().decode(decryptedBuffer);
  } catch (decryptionError) {
    console.error(
      "Erro ao descriptografar dado do localStorage:",
      decryptionError,
    );
    return null;
  }
}

/**
 * Salva os dados do usuário autenticado no localStorage de forma criptografada.
 *
 * @param {string} userUid - UID do Firebase Auth
 * @param {string} userDisplayName - Nome de exibição do usuário
 */
async function saveEncryptedUserDataToStorage(userUid, userDisplayName) {
  const encryptionKey = await deriveEncryptionKeyFromUid(userUid);
  const encryptedDisplayName = await encryptData(
    userDisplayName,
    encryptionKey,
  );
  const encryptedUid = await encryptData(userUid, encryptionKey);

  const encryptedUidReference = await encryptData(userUid, encryptionKey);

  localStorage.setItem("mkuid_ref", encryptedUidReference);
  localStorage.setItem("mku", encryptedDisplayName);
  localStorage.setItem("mkuid", encryptedUid);
}

/**
 * Lê e descriptografa os dados do usuário do localStorage.
 * Requer o uid como parâmetro para derivar a chave correta.
 *
 * @param {string} userUid - UID do Firebase Auth (vem do onAuthStateChanged)
 * @returns {Promise<{displayName: string|null, uid: string|null}>} Dados descriptografados
 */
async function readDecryptedUserDataFromStorage(userUid) {
  const encryptedDisplayName = localStorage.getItem("mku");
  const encryptedUid = localStorage.getItem("mkuid");

  if (!encryptedDisplayName || !encryptedUid) {
    return { displayName: null, uid: null };
  }

  const encryptionKey = await deriveEncryptionKeyFromUid(userUid);

  const displayName = await decryptData(encryptedDisplayName, encryptionKey);
  const uid = await decryptData(encryptedUid, encryptionKey);

  return { displayName, uid };
}

/**
 * Limpa todos os dados do usuário do localStorage.
 * Chamado no logout ou em caso de erro de autenticação.
 */
function clearUserDataFromStorage() {
  localStorage.removeItem("mku");
  localStorage.removeItem("mkuid");
  localStorage.removeItem("mkuid_ref");
  // Remove chave legada de versões anteriores sem criptografia
  localStorage.removeItem("marketUserName");
}

// Expõe clearUserDataFromStorage para uso pelo módulo my-account.js
// durante o fluxo de exclusão de conta
window.clearUserDataFromStorage = clearUserDataFromStorage;

// Expõe saveEncryptedUserDataToStorage para uso pelo módulo account-details.js
// durante a atualização do nome no localStorage criptografado
window.saveEncryptedUserDataToStorage = saveEncryptedUserDataToStorage;

export {
  saveEncryptedUserDataToStorage,
  readDecryptedUserDataFromStorage,
  clearUserDataFromStorage,
};
