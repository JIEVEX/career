const admin = require("firebase-admin");
const express = require("express");
const cors = require("cors");

const app = express();

// 1. UTAMAKAN CORS DI PALING ATAS (Agar request OPTIONS selalu diizinkan)
app.use(cors({ origin: true })); 
app.use(express.json());

// 2. Inisialisasi Firebase dengan Blok Try-Catch yang Aman
let db;
try {
  if (!admin.apps.length) {
    let privateKey = process.env.FIREBASE_PRIVATE_KEY;
    
    if (privateKey) {
      privateKey = privateKey.replace(/\\n/g, '\n');
      if (!privateKey.startsWith('-----BEGIN PRIVATE KEY-----')) {
        privateKey = `-----BEGIN PRIVATE KEY-----\n${privateKey}\n-----END PRIVATE KEY-----`;
      }
    }

    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: privateKey
      })
    });
  }
  db = admin.firestore();
  console.log("Firebase Admin Berhasil Terhubung.");
} catch (initError) {
  // Jika Firebase gagal, server Express TIDAK AKAN crash, sehingga CORS tetap aktif
  console.error("Firebase Gagal Konek:", initError.message);
}

// Middleware Pengecekan Database (Jika DB gagal, kirim JSON, bukan crash)
app.use((req, res, next) => {
  if (!db && req.path !== "/meta") {
    return res.status(500).json({ 
      message: "Server gagal terhubung ke database. Periksa Environment Variable di Vercel.",
      error: "Firebase DB tidak terinisialisasi" 
    });
  }
  next();
});

// ==========================================
// KUMPULAN ENDPOINT API (ROUTES)
// ==========================================

app.get("/meta", (req, res) => {
  res.json({
    skills: [{ id: "s1", name: "Programming" }, { id: "s2", name: "Design" }, { id: "s3", name: "Writing" }],
    interests: [{ id: "i1", name: "Technology" }, { id: "i2", name: "Art" }, { id: "i3", name: "Business" }],
    locations: [{ id: "l1", name: "Jakarta" }, { id: "l2", name: "Bandung" }, { id: "l3", name: "Surabaya" }]
  });
});

app.get("/careers", async (req, res) => {
  try {
    const snapshot = await db.collection("careers").get();
    const careersList = [];
    snapshot.forEach(doc => {
      careersList.push({ id: doc.id, ...doc.data() });
    });
    res.json(careersList);
  } catch (error) {
    res.status(500).json({ message: "Gagal mengambil data karir", error: error.message });
  }
});

app.post("/auth/register", async (req, res) => {
  try {
    const { username, password, role } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: "Username dan password wajib diisi" });
    }

    const userRef = db.collection("users").doc(username);
    const doc = await userRef.get();

    // PERBAIKAN: Menggunakan properti .exists (Tanpa tanda kurung)
    if (doc.exists) { 
      return res.status(400).json({ message: "Username sudah digunakan" });
    }

    const newUser = {
      id: username,
      username,
      password,
      role: role || "user",
      testAnswers: { skills: {}, interests: {} }
    };

    await userRef.set(newUser);
    res.status(201).json({ message: "Registrasi berhasil", user: newUser });
  } catch (error) {
    res.status(500).json({ message: "Error server", error: error.message });
  }
});

app.post("/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: "Username dan password wajib diisi" });
    }

    const userRef = db.collection("users").doc(username);
    const doc = await userRef.get();

    // PERBAIKAN: Menggunakan properti .exists (Tanpa tanda kurung)
    if (!doc.exists) {
      return res.status(401).json({ message: "Username atau password salah" });
    }

    const userData = doc.data();
    if (userData.password !== password) {
      return res.status(401).json({ message: "Username atau password salah" });
    }

    res.json({ message: "Login berhasil", user: userData });
  } catch (error) {
    res.status(500).json({ message: "Error server", error: error.message });
  }
});

app.post("/auth/sync-session", async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ message: "ID tidak valid" });

    const doc = await db.collection("users").doc(userId).get();
    if (doc.exists) {
      res.json({ message: "Session pulih", user: doc.data() });
    } else {
      res.status(404).json({ message: "User tidak ditemukan" });
    }
  } catch (error) {
    res.status(500).json({ message: "Error", error: error.message });
  }
});

module.exports = app;

if (process.env.NODE_ENV !== 'production') {
  const PORT = 5000;
  app.listen(PORT, () => console.log(`Backend lokal berjalan di http://localhost:${PORT}`));
}