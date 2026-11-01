// Firebase khusus Tic Tac Toe Online Arena.
// Project ini terpisah dari Firebase Math Battle.
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyBDbWXJVaMmvnSQ1ZJPriV9gre9k8wT7Ng",
  authDomain: "tiktakto-b957f.firebaseapp.com",
  databaseURL: "https://tiktakto-b957f-default-rtdb.firebaseio.com",
  projectId: "tiktakto-b957f",
  storageBucket: "tiktakto-b957f.firebasestorage.app",
  messagingSenderId: "210958306478",
  appId: "1:210958306478:web:dbb0510bd49076dac0f13f",
  measurementId: "G-1RZBJWYQEQ"
};

// Nama app khusus agar tidak mengambil Firebase app lain jika kelak
// project ini dijalankan berdampingan dengan aplikasi lain.
const app = initializeApp(firebaseConfig, "tictactoe-arena");
export const auth = getAuth(app);
export const db = getDatabase(app);
