// firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* 🔧 FIREBASE */
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

export {
  firestore,
  collection,
  doc,
  addDoc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
};
