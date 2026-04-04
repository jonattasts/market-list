/* ==========================================================================
   Firebase - Configuração e Exportação de Todos os Métodos
   ========================================================================== */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  getDocs,
  getDocsFromServer,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  query,
  orderBy,
  onSnapshot,
  where,
  limit,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

/* 🔧 FIREBASE KEYS */
const firebaseConfig = {
  apiKey: "AIzaSyDcCOiSvr1M1ocEnuZcNtpkCVZ_8ckPJ34",
  authDomain: "market-list-e09aa.firebaseapp.com",
  projectId: "market-list-e09aa",
  storageBucket: "market-list-e09aa.firebasestorage.app",
  messagingSenderId: "488901242020",
  appId: "1:488901242020:web:bd57db8af20abf6aa34a31",
};

const app = initializeApp(firebaseConfig);
const firestore = getFirestore(app);
const firebaseAuth = getAuth(app);

export {
  // Instância do Firestore
  firestore,
  // Instância do Firebase Auth
  firebaseAuth,
  // Métodos de documento e coleção
  collection,
  doc,
  // Métodos de CRUD
  addDoc,
  getDocs,
  getDocsFromServer,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  // Métodos de timestamp
  serverTimestamp,
  // Métodos de query e consulta
  query,
  orderBy,
  onSnapshot,
  where,
  limit,
  // Métodos de autenticação
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  signOut,
};
