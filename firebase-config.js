/* ========== IMPORTS FIREBASE ========== */
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, setPersistence, browserSessionPersistence, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, onSnapshot, setDoc, getDoc, collection, getDocs, addDoc, query, where, runTransaction } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

/* ========== FIREBASE CONFIG ========== */
const firebaseConfig = {
  apiKey: "AIzaSyDRztedy1U_erKHDY94KlUkxcZNwQcDUZw",
  authDomain: "cine-verano.firebaseapp.com",
  projectId: "cine-verano",
  appId: "1:725171854528:web:a7ca7cd58ee3e024226125"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Re-exportamos aquí los helpers de Firestore/Auth que usa el resto de la
// app, para que script.js solo tenga que importar de un único sitio.
export {
  doc, onSnapshot, setDoc, getDoc, collection, getDocs, addDoc, query, where, runTransaction,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged
};

setPersistence(auth, browserSessionPersistence).catch((err) => {
  console.error("No se pudo fijar la persistencia de sesión:", err);
});
