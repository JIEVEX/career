const admin = require("firebase-admin");
const express = require("express");
const cors = require("cors");

// =========================================================================
// 1. Inisialisasi Firebase Admin Kunci Menggunakan Environment Variable (Vercel)
// =========================================================================
if (!admin.apps.length) {
  try {
    let privateKey = process.env.FIREBASE_PRIVATE_KEY;
    
    if (privateKey) {
      // Perbaikan mutakhir untuk mengatasi problem ganti baris (\n) di Vercel maupun lokal
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
    console.log("Firebase Admin berhasil terinisialisasi.");
  } catch (initError) {
    console.error("Gagal menginisialisasi Firebase Admin:", initError.message);
  }
}

const db = admin.firestore();
const app = express();

// Konfigurasi CORS Middleware Express
app.use(cors({ origin: true })); 
app.use(express.json());

// =========================================================================
// 2. KUMPULAN ENDPOINT API (ROUTES)
// =========================================================================

// --- DATA META ---
app.get("/meta", (req, res) => {
  res.json({
    skills: [
      { id: "s1", name: "Programming" },
      { id: "s2", name: "Design" },
      { id: "s3", name: "Writing" }
    ],
    interests: [
      { id: "i1", name: "Technology" },
      { id: "i2", name: "Art" },
      { id: "i3", name: "Business" }
    ],
    locations: [
      { id: "l1", name: "Jakarta" },
      { id: "l2", name: "Bandung" },
      { id: "l3", name: "Surabaya" }
    ]
  });
});

// --- AMBIL DATA KARIR (Menyembuhkan Error 404 /careers) ---
app.get("/careers", async (req, res) => {
  try {
    const snapshot = await db.collection("careers").get();
    const careersList = [];
    snapshot.forEach(doc => {
      careersList.push({ id: doc.id, ...doc.data() });
    });
    res.json(careersList);
  } catch (error) {
    console.error("Error GET /careers:", error);
    res.status(500).json({ message: "Gagal mengambil data karir", error: error.message });
  }
});

// --- REGISTER USER ---
app.post("/auth/register", async (req, res) => {
  try {
    const { username, password, role } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: "Username dan password wajib diisi" });
    }

    const userRef = db.collection("users").doc(username);
    const doc = await userRef.get();

    if (doc.exists) { 
      return res.status(400).json({ message: "Username sudah digunakan" });
    }

    const newUser = {
      id: username,
      username,
      password, // Catatan: Idealnya di-hash dengan bcrypt untuk produksi
      role: role || "user",
      testAnswers: { skills: {}, interests: {} },
      completedAt: null
    };

    await userRef.set(newUser);
    res.status(201).json({ message: "Registrasi berhasil", user: newUser });
  } catch (error) {
    console.error("Error POST /auth/register:", error);
    res.status(500).json({ message: "Error server", error: error.message });
  }
});

// --- LOGIN USER (Hanya satu fungsi, menyembuhkan Error 500) ---
app.post("/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ message: "Username dan password wajib diisi" });
    }

    const userRef = db.collection("users").doc(username);
    const doc = await userRef.get();

    const userData = doc.data();
    if (userData.password !== password) {
      return res.status(401).json({ message: "Username atau password salah" });
    }

    const userData = doc.data();
    if (userData.password !== password) {
      return res.status(401).json({ message: "Username atau password salah" });
    }

    res.json({ message: "Login berhasil", user: userData });
  } catch (error) {
    console.error("Error POST /auth/login:", error);
    res.status(500).json({ message: "Error server", error: error.message });
  }
});

// --- SYNC SESSION ---
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
    console.error("Error POST /auth/sync-session:", error);
    res.status(500).json({ message: "Error", error: error.message });
  }
});

// =========================================================================
// 3. JALUR EKSPOR & RUNNER (VERCEL & LOKAL)
// =========================================================================
module.exports = app;

if (process.env.NODE_ENV !== 'production') {
  const PORT = 5000;
  app.listen(PORT, () => console.log(`Backend lokal berjalan di http://localhost:${PORT}`));
}