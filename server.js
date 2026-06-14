const admin = require("firebase-admin");
const express = require("express");
const cors = require("cors");

// =========================================================================
// 1. Inisialisasi Firebase Admin Kunci Menggunakan Environment Variable (Vercel)
// =========================================================================
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // Mengatasi masalah karakter newline (\n) pada private key di Vercel
      privateKey: process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined
    })
  });
}

const db = admin.firestore();
const app = express();

app.use(cors({ origin: true })); 
app.use(express.json());

// ==========================================
// ENDPOINT 1: REGISTER USER (Simpan ke Firestore)
// ==========================================
app.post("/auth/register", async (req, res) => {
  try {
    const { username, password, role } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: "Username dan password wajib diisi" });
    }

    const userRef = db.collection("users").doc(username);
    const doc = await userRef.get();

    if (doc.exists()) {
      return res.status(400).json({ message: "Username sudah digunakan" });
    }

    const newUser = {
      id: username,
      username,
      password, // Catatan: Untuk produksi, idealnya password di-hash dengan bcrypt
      role: role || "user",
      testAnswers: { skills: {}, interests: {} }
    };

    await userRef.set(newUser);
    res.status(201).json({ message: "Registrasi berhasil", user: newUser });
  } catch (error) {
    res.status(500).json({ message: "Error server", error: error.message });
  }
});

// ==========================================
// ENDPOINT 2: LOGIN USER
// ==========================================
app.post("/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    
    const userRef = db.collection("users").doc(username);
    const doc = await userRef.get();

    if (!doc.exists() || doc.data().password !== password) {
      return res.status(401).json({ message: "Username atau password salah" });
    }

    res.json({ message: "Login berhasil", user: doc.data() });
  } catch (error) {
    res.status(500).json({ message: "Error server", error: error.message });
  }
});

// ==========================================
// ENDPOINT 3: SYNC SESSION
// ==========================================
app.post("/auth/sync-session", async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ message: "ID tidak valid" });

    const doc = await db.collection("users").doc(userId).get();
    if (doc.exists()) {
      res.json({ message: "Session pulih", user: doc.data() });
    } else {
      res.status(404).json({ message: "User tidak ditemukan" });
    }
  } catch (error) {
    res.status(500).json({ message: "Error", error: error.message });
  }
});

// --- DATA META ---
app.get("/meta", (req, res) => {
  res.json({
    skills: ["Programming", "Design", "Writing"],
    interests: ["Technology", "Art", "Business"],
    locations: ["Jakarta", "Bandung", "Surabaya"]
  });
});

// ==========================================
// JALUR EKSPOR KHUSUS VERCEL (TIDAK PAKAI FIREBASE ONREQUEST / APP.LISTEN)
// ==========================================
module.exports = app;