const admin = require("firebase-admin");
const express = require("express");
const cors = require("cors");

const app = express();

// 1. UTAMAKAN CORS DI PALING ATAS
app.use(cors({ origin: true })); 
app.use(express.json());

// ID Aplikasi sesuai dengan struktur index.ts
const appId = 'career-rec-ts-001';

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
  console.error("Firebase Gagal Konek:", initError.message);
}

// Middleware Pengecekan Database
app.use((req, res, next) => {
  if (!db && req.path !== "/api/meta") {
    return res.status(500).json({ 
      message: "Server gagal terhubung ke database. Periksa Environment Variable di Vercel.",
      error: "Firebase DB tidak terinisialisasi" 
    });
  }
  next();
});

// Middleware Verifikasi Firebase Auth ID Token (Sesuai index.ts)
const checkAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized. Token diperlukan.' });
  }
  const token = authHeader.split('Bearer ')[1];
  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.firebaseUser = decodedToken; // Simpan data user hasil decode
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid or Expired Token' });
  }
};

// Middleware Validasi Admin (Sesuai kriteria index.ts)
const checkAdmin = (req, res, next) => {
  if (!req.firebaseUser || req.firebaseUser.email !== 'admin@karirku.com') {
    return res.status(403).json({ error: 'Access denied. Khusus Admin.' });
  }
  next();
};

// ==========================================
// KUMPULAN ENDPOINT API (ROUTES)
// ==========================================

// 1. Seed Database (Mengisi data awal jika kosong - Persis seperti index.ts)
app.get("/api/seed", async (req, res) => {
  try {
    const basePublicRef = db.collection('artifacts').doc(appId).collection('public').doc('data');
    const skillsRef = basePublicRef.collection('skills');
    const snap = await skillsRef.get();
    
    if (snap.empty) {
      console.log("Database kosong, mengunggah data contoh...");
      
      const defaultSkills = [
        { id: 's1', name: 'Logika Pemrograman' },
        { id: 's2', name: 'Desain Visual' },
        { id: 's3', name: 'Analisis Data' },
        { id: 's4', name: 'Komunikasi Publik' },
        { id: 's5', name: 'Manajemen Proyek' }
      ];
      for (const s of defaultSkills) await skillsRef.doc(s.id).set(s);

      const interestsRef = basePublicRef.collection('interests');
      const defaultInterests = [
        { id: 'i1', name: 'Teknologi & Gadget' },
        { id: 'i2', name: 'Seni & Kreativitas' },
        { id: 'i3', name: 'Bisnis & Ekonomi' },
        { id: 'i4', name: 'Sosial & Edukasi' }
      ];
      for (const i of defaultInterests) await interestsRef.doc(i.id).set(i);

      const locRef = basePublicRef.collection('locations');
      const defaultLocs = [
        { id: 'l1', name: 'Jakarta' },
        { id: 'l2', name: 'Bandung' },
        { id: 'l3', name: 'Depok' },
        { id: 'l4', name: 'Surabaya' }
      ];
      for (const l of defaultLocs) await locRef.doc(l.id).set(l);

      const careerRef = basePublicRef.collection('careers');
      const defaultCareers = [
        { id: 'c1', title: 'Fullstack Developer', category: 'Teknologi', location: 'Jakarta', requiredSkills: ['s1', 's3'], relatedInterests: ['i1'] },
        { id: 'c2', title: 'UI/UX Designer', category: 'Kreatif', location: 'Bandung', requiredSkills: ['s2'], relatedInterests: ['i2'] },
        { id: 'c3', title: 'Data Scientist', category: 'Teknologi', location: 'Jakarta', requiredSkills: ['s1', 's3'], relatedInterests: ['i1', 'i3'] }
      ];
      for (const c of defaultCareers) await careerRef.doc(c.id).set(c);
      
      return res.json({ seeded: true, message: "Database contoh berhasil diunggah." });
    }
    return res.json({ seeded: false, message: "Database sudah terisi." });
  } catch (error) {
    res.status(500).json({ message: "Gagal seeding database", error: error.message });
  }
});

// 2. Ambil Semua Data Master Publik (Careers, Skills, Interests, Locations sekaligus)
app.get("/api/public-data", async (req, res) => {
  try {
    const baseRef = db.collection('artifacts').doc(appId).collection('public').doc('data');
    
    const [skillsSnap, interestsSnap, locationsSnap, careersSnap] = await Promise.all([
      baseRef.collection('skills').get(),
      baseRef.collection('interests').get(),
      baseRef.collection('locations').get(),
      baseRef.collection('careers').get(),
    ]);

    res.json({
      skills: skillsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })),
      interests: interestsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })),
      locations: locationsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })),
      careers: careersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })),
    });
  } catch (error) {
    res.status(500).json({ message: "Gagal memuat data master publik", error: error.message });
  }
});

// 3. Get User Profile Data (Menggunakan token Firebase login)
app.get("/api/user/profile", checkAuth, async (req, res) => {
  try {
    const uid = req.firebaseUser.uid;
    const userDocRef = db.collection('artifacts').doc(appId).collection('users').doc(uid).collection('profile').doc('data');
    const docSnap = await userDocRef.get();

    if (docSnap.exists) {
      return res.json(docSnap.data());
    } else {
      // Jika profile belum terbentuk di Firestore, buat default data
      const defaultData = {
        name: req.firebaseUser.name || "Pengguna Tamu",
        email: req.firebaseUser.email || "",
        location: "",
        testAnswers: { skills: {}, interests: {} },
        completedAt: null
      };
      await userDocRef.set(defaultData);
      return res.json(defaultData);
    }
  } catch (error) {
    res.status(500).json({ message: "Gagal memuat profil pengguna", error: error.message });
  }
});

// 4. Update / Save User Profile & Test Answers
app.post("/api/user/profile", checkAuth, async (req, res) => {
  try {
    const uid = req.firebaseUser.uid;
    const profileData = req.body;
    
    const userDocRef = db.collection('artifacts').doc(appId).collection('users').doc(uid).collection('profile').doc('data');
    await userDocRef.set(profileData, { merge: true });
    
    res.json({ message: "Profil dan data evaluasi berhasil diperbarui!" });
  } catch (error) {
    res.status(500).json({ message: "Gagal memperbarui profil", error: error.message });
  }
});

// ==========================================
// AKSI CRUD KHUSUS ADMIN
// ==========================================

// Admin: Tambah / Ubah Parameter Karir
app.post("/api/admin/careers", checkAuth, checkAdmin, async (req, res) => {
  try {
    const { id, title, category, location, requiredSkills, relatedInterests } = req.body;
    const targetId = id || 'c_' + Date.now();
    
    const careerRef = db.collection('artifacts').doc(appId).collection('public').doc('data').collection('careers').doc(targetId);
    
    const careerData = {
      id: targetId,
      title,
      category,
      location,
      requiredSkills: requiredSkills || [],
      relatedInterests: relatedInterests || []
    };

    await careerRef.set(careerData);
    res.json({ message: "Data karir berhasil disimpan", id: targetId });
  } catch (error) {
    res.status(500).json({ message: "Admin gagal menyimpan data karir", error: error.message });
  }
});

// Admin: Hapus Data Karir
app.delete("/api/admin/careers/:id", checkAuth, checkAdmin, async (req, res) => {
  try {
    const careerId = req.params.id;
    await db.collection('artifacts').doc(appId).collection('public').doc('data').collection('careers').doc(careerId).delete();
    res.json({ message: "Data karir berhasil dihapus oleh admin" });
  } catch (error) {
    res.status(500).json({ message: "Admin gagal menghapus data karir", error: error.message });
  }
});

// Fallback metadata statis lama Anda jika frontend masih membutuhkan endpoint ini
app.get("/api/meta", (req, res) => {
  res.json({
    skills: [{ id: "s1", name: "Programming" }, { id: "s2", name: "Design" }, { id: "s3", name: "Writing" }, {id: "s4", name: "Logika Pemrograman"}, { id: 's5', name: 'Analisis Data' }, { id: 's6', name: 'Komunikasi Publik' }, { id: 's7', name: 'Manajemen Proyek' }],
    interests: [{ id:  "i1", name: "Technology" }, { id: "i2", name: "Art" }, { id: "i3", name: "Business" }, { id: 'i4', name: 'Sosial & Edukasi' }],
    locations: [{ id: "l1", name: "Jakarta" }, { id: "l2", name: "Bandung" }, { id: "l3", name: "Surabaya" }, {id: "l4", name: "Depok"}]
  });
});

module.exports = app;

if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => console.log(`Backend lokal berjalan di http://localhost:${PORT}`));
}