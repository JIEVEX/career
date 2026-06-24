const admin = require("firebase-admin");
const express = require("express");
const cors = require("cors");

const app = express();

// ID Aplikasi sesuai dengan struktur Firestore
const appId = 'career-rec-ts-001';

// 1. PENGATURAN CORS & PARSER (Hanya satu konfigurasi yang spesifik)
app.use(cors({
  origin: [
    'https://career-1d668.web.app',         
    'https://career-1d668.firebaseapp.com',
    'http://localhost:5173'                
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));

app.use(express.json());

// 2. Inisialisasi Firebase dengan Blok Try-Catch 
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

// Middleware Verifikasi Firebase Auth ID Token
const checkAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized. Token diperlukan.' });
  }
  const token = authHeader.split('Bearer ')[1];
  try {
    
    // BACKUP SIMULASI: Agar bypass token tiruan dari Login.tsx versi cepat
    if (token.length > 15) {
      const decodedString = Buffer.from(token, 'base64').toString('ascii');
      const [email] = decodedString.split(':');
      req.firebaseUser = { uid: btoa(email).substring(0, 10), email: email, name: email.split('@')[0] };
    } else {
      throw new Error("Token tidak valid");
    }
    
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid or Expired Token' });
  }
};

// Middleware Validasi Admin
const checkAdmin = (req, res, next) => {
  if (!req.firebaseUser || req.firebaseUser.email !== 'admin@karirku.com') {
    return res.status(403).json({ error: 'Access denied. Khusus Admin.' });
  }
  next();
};

// ==========================================
// ENDPOINT AUTENTIKASI 
// ==========================================

app.post("/api/auth/register", async (req, res) => {
  try {
    const { username, password, name, role } = req.body;
    const generatedUid = btoa(username).substring(0, 10); // Membuat UID unik sederhana dari email

    const userProfileRef = db.collection('artifacts').doc(appId).collection('users').doc(generatedUid).collection('profile').doc('data');
    
    const initialProfile = {
      id: generatedUid,
      username: username,
      name: name || username.split('@')[0],
      email: username,
      role: role || "user",
      testAnswers: { skills: {}, interests: {} },
      completedAt: null
    };

    await userProfileRef.set(initialProfile);
    res.json({ message: "Registrasi berhasil", user: initialProfile });
  } catch (error) {
    res.status(500).json({ message: "Gagal mendaftarkan user baru", error: error.message });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const generatedUid = btoa(username).substring(0, 10);

    const userProfileRef = db.collection('artifacts').doc(appId).collection('users').doc(generatedUid).collection('profile').doc('data');
    const docSnap = await userProfileRef.get();

    if (docSnap.exists) {
      res.status(200).json({ message: "Login Berhasil", user: docSnap.data() });
    } else {
      res.status(404).json({ message: "Email belum terdaftar. Silakan registrasi terlebih dahulu!" });
    }
  } catch (error) {
    res.status(500).json({ message: "Proses login gagal", error: error.message });
  }
});

// ==========================================
// KUMPULAN ENDPOINT API UTAMA
// ==========================================

// 1. Seed Database
app.get("/api/seed", async (req, res) => {
  try {
    const basePublicRef = db.collection('artifacts').doc(appId).collection('public').doc('data');
    const skillsRef = basePublicRef.collection('skills');
    const snap = await skillsRef.get();
    
    if (snap.empty) {
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

      const careerRef = basePublicRef.collection('careers');
      const defaultCareers = [
        { id: 'c1', title: 'Fullstack Developer', category: 'Teknologi', requiredSkills: ['s1', 's3'], relatedInterests: ['i1'] },
        { id: 'c2', title: 'UI/UX Designer', category: 'Kreatif', requiredSkills: ['s2'], relatedInterests: ['i2'] },
        { id: 'c3', title: 'Data Scientist', category: 'Teknologi', requiredSkills: ['s1', 's3'], relatedInterests: ['i1', 'i3'] }
      ];
      for (const c of defaultCareers) await careerRef.doc(c.id).set(c);
      
      return res.json({ seeded: true, message: "Database contoh berhasil diunggah." });
    }
    return res.json({ seeded: false, message: "Database sudah terisi." });
  } catch (error) {
    res.status(500).json({ message: "Gagal seeding database", error: error.message });
  }
});

// 2. Ambil Semua Data Master Publik
app.get("/api/public-data", async (req, res) => {
  try {
    const baseRef = db.collection('artifacts').doc(appId).collection('public').doc('data');
    
    const [skillsSnap, interestsSnap, careersSnap] = await Promise.all([
      baseRef.collection('skills').get(),
      baseRef.collection('interests').get(),
      baseRef.collection('careers').get(),
    ]);

    res.json({
      skills: skillsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })),
      interests: interestsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })),
      careers: careersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })),
    });
  } catch (error) {
    res.status(500).json({ message: "Gagal memuat data master publik", error: error.message });
  }
});

// 3. Get User Profile Data
app.get("/api/user/profile", checkAuth, async (req, res) => {
  try {
    const uid = req.firebaseUser.uid;
    const userDocRef = db.collection('artifacts').doc(appId).collection('users').doc(uid).collection('profile').doc('data');
    const docSnap = await userDocRef.get();

    if (docSnap.exists) {
      return res.json(docSnap.data());
    } else {
      const defaultData = {
        name: req.firebaseUser.name || "Pengguna Tamu",
        email: req.firebaseUser.email || "",
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

// 5. Admin: Tambah / Ubah Parameter Karir
app.post("/api/admin/careers", checkAuth, checkAdmin, async (req, res) => {
  try {
    const { id, title, category, requiredSkills, relatedInterests } = req.body;
    const targetId = id || 'c_' + Date.now();
    
    const careerRef = db.collection('artifacts').doc(appId).collection('public').doc('data').collection('careers').doc(targetId);
    
    const careerData = {
      id: targetId,
      title,
      category,
      requiredSkills: requiredSkills || [],
      relatedInterests: relatedInterests || []
    };

    await careerRef.set(careerData);
    res.json({ message: "Data karir berhasil disimpan", id: targetId });
  } catch (error) {
    res.status(500).json({ message: "Admin gagal menyimpan data karir", error: error.message });
  }
});

// 6. Admin: Hapus Data Karir
app.delete("/api/admin/careers/:id", checkAuth, checkAdmin, async (req, res) => {
  try {
    const careerId = req.params.id;
    await db.collection('artifacts').doc(appId).collection('public').doc('data').collection('careers').doc(careerId).delete();
    res.json({ message: "Data karir berhasil dihapus oleh admin" });
  } catch (error) {
    res.status(500).json({ message: "Admin gagal menghapus data karir", error: error.message });
  }
});

// ==========================================
// ENDPOINT ADMIN: PENGELOLAAN DATA USER (CRUD)
// ==========================================

// 1. READ: Ambil Semua Data Profil User (Daftar Pengguna)
app.get("/api/admin/users", checkAuth, checkAdmin, async (req, res) => {
  try {
    // Mengambil semua dokumen profil dari sub-collection 'profile' lewat Group Collection Query 
    // atau mengambil dokumen induk jika terstruktur. 
    // Namun karena struktur Firestore Anda bertingkat, kita bisa melakukan scan dokumen user:
    const usersRef = db.collection('artifacts').doc(appId).collection('users');
    const usersSnap = await usersRef.get();
    
    const userList = [];
    
    // Looping setiap folder user untuk mengambil dokumen 'data' di dalam sub-collection 'profile'
    for (const userDoc of usersSnap.docs) {
      const profileDoc = await usersRef.doc(userDoc.id).collection('profile').doc('data').get();
      if (profileDoc.exists) {
        userList.push(profileDoc.data());
      }
    }

    res.status(200).json({
      message: "Berhasil memuat daftar seluruh pengguna",
      users: userList
    });
  } catch (error) {
    res.status(500).json({ message: "Admin gagal memuat data user", error: error.message });
  }
});

// 2. CREATE: Admin Membuat User Baru Secara Manual
app.post("/api/admin/users", checkAuth, checkAdmin, async (req, res) => {
  try {
    const { username, password, name, role } = req.body;
    
    if (!username) {
      return res.status(400).json({ message: "Email/Username wajib diisi" });
    }

    const generatedUid = btoa(username).substring(0, 10);
    const userProfileRef = db.collection('artifacts').doc(appId).collection('users').doc(generatedUid).collection('profile').doc('data');
    
    // Cek apakah user sudah terdaftar sebelumnya
    const docSnap = await userProfileRef.get();
    if (docSnap.exists) {
      return res.status(400).json({ message: "User dengan email tersebut sudah ada di sistem." });
    }

    const newUserProfile = {
      id: generatedUid,
      username: username,
      name: name || username.split('@')[0],
      email: username,
      role: role || "user", // Admin bisa menentukan apakah akun baru ini 'admin' atau 'user'
      testAnswers: { skills: {}, interests: {} },
      completedAt: null
    };

    await userProfileRef.set(newUserProfile);
    res.status(201).json({ message: "User baru berhasil dibuat oleh Admin", user: newUserProfile });
  } catch (error) {
    res.status(500).json({ message: "Admin gagal membuat user baru", error: error.message });
  }
});

// 3. UPDATE: Admin Mengubah Data Profil / Role User Berdasarkan ID User
app.put("/api/admin/users/:id", checkAuth, checkAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    const { name, role, email } = req.body;

    const userProfileRef = db.collection('artifacts').doc(appId).collection('users').doc(userId).collection('profile').doc('data');
    const docSnap = await userProfileRef.get();

    if (!docSnap.exists) {
      return res.status(404).json({ message: "Data user tidak ditemukan" });
    }

    // Menyiapkan data yang diperbarui tanpa menghapus data jawaban kuesioner yang sudah ada
    const updatedData = {
      name: name || docSnap.data().name,
      role: role || docSnap.data().role,
      email: email || docSnap.data().email,
    };

    await userProfileRef.update(updatedData);
    res.status(200).json({ message: "Data user berhasil diperbarui oleh Admin" });
  } catch (error) {
    res.status(500).json({ message: "Admin gagal memperbarui data user", error: error.message });
  }
});

// 4. DELETE: Admin Menghapus Akun & Data Profil User Berdasarkan ID User
app.delete("/api/admin/users/:id", checkAuth, checkAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    
    // Proteksi agar admin tidak sengaja menghapus dirinya sendiri
    if (userId === btoa('admin@karirku.com').substring(0, 10)) {
      return res.status(400).json({ message: "Aksi ditolak. Anda tidak bisa menghapus akun Admin Utama Anda sendiri!" });
    }

    const baseUserPath = db.collection('artifacts').doc(appId).collection('users').doc(userId);
    
    // Hapus dokumen profil di dalam sub-collection terlebih dahulu
    await baseUserPath.collection('profile').doc('data').delete();
    
    res.status(200).json({ message: "Akun dan profil user berhasil dihapus dari sistem." });
  } catch (error) {
    res.status(500).json({ message: "Admin gagal menghapus data user", error: error.message });
  }
});

// Fallback metadata statis
app.get("/api/meta", (req, res) => {
  res.json({
    skills: [{ id: "s1", name: "Programming" }, { id: "s2", name: "Design" }, { id: "s3", name: "Writing" }],
    interests: [{ id: "i1", name: "Technology" }, { id: "i2", name: "Art" }, { id: "i3", name: "Business" }],
  });
});

module.exports = app;

if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => console.log(`Backend lokal berjalan di http://localhost:${PORT}`));
}