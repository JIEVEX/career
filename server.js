const express = require('express');
const cors = require('cors');
const app = express();
const PORT = 5000;

// Middleware
app.use(cors());
app.use(express.json());

// --- MOCK DATABASE (In-Memory Array) ---
let skills = [
  { id: 's1', name: 'Logika Pemrograman' },
  { id: 's2', name: 'Desain Visual' },
  { id: 's3', name: 'Analisis Data' },
  { id: 's4', name: 'Komunikasi Publik' },
  { id: 's5', name: 'Manajemen Proyek' }
];

let interests = [
  { id: 'i1', name: 'Teknologi & Gadget' },
  { id: 'i2', name: 'Seni & Kreativitas' },
  { id: 'i3', name: 'Bisnis & Ekonomi' },
  { id: 'i4', name: 'Sosial & Edukasi' }
];

let locations = [
  { id: 'l1', name: 'Jakarta' },
  { id: 'l2', name: 'Bandung' },
  { id: 'l3', name: 'Depok' },
  { id: 'l4', name: 'Surabaya' }
];

let careers = [
  { id: 'c1', title: 'Fullstack Developer', category: 'Teknologi', location: 'Jakarta', requiredSkills: ['s1', 's3'], relatedInterests: ['i1'] },
  { id: 'c2', title: 'UI/UX Designer', category: 'Kreatif', location: 'Bandung', requiredSkills: ['s2'], relatedInterests: ['i2'] },
  { id: 'c3', title: 'Data Scientist', category: 'Teknologi', location: 'Jakarta', requiredSkills: ['s1', 's3'], relatedInterests: ['i1', 'i3'] }
];

let registeredUsers = [
  {
    id: 'usr_admin_001',
    name: 'Super Admin Karirku',
    email: 'admin@karirku.com',
    password: 'admin123',
    location: 'Jakarta',
    role: 'admin',
    testAnswers: { skills: {}, interests: {} },
    completedAt: null
  },
  {
    id: 'usr_tester_002',
    name: 'Ahmad User',
    email: 'test@gmail.com',
    password: 'password123',
    location: 'Bandung',
    role: 'user',
    testAnswers: { skills: {}, interests: {} },
    completedAt: null
  }
]; 

let currentUserSession = null;

// --- REST API ENDPOINTS ---

// 1. ENDPOINT AUTH: Register Akun Baru (Sudah Diperbaiki & Digabung)
app.post('/api/auth/register', (req, res) => {
  const { name, email, password } = req.body;
  
  if (!name || !email || !password) {
    return res.status(400).json({ message: "Semua kolom form pendaftaran wajib diisi!" });
  }

  const userExists = registeredUsers.find(u => u.email === email);
  if (userExists) {
    return res.status(400).json({ message: "Email ini sudah terdaftar di sistem!" });
  }

  const assignedRole = (email.toLowerCase() === 'admin@karirku.com') ? 'admin' : 'user';

  const newUser = {
    id: 'usr_' + Date.now(),
    name,
    email,
    password, 
    location: "Jakarta",
    role: assignedRole, 
    testAnswers: { skills: {}, interests: {} },
    completedAt: null
  };

  registeredUsers.push(newUser);
  currentUserSession = newUser; 

  res.status(201).json({ message: "Registrasi berhasil!", user: newUser });
});

// 2. ENDPOINT AUTH: Login Masuk (Sudah Diperbaiki)
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;

  const user = registeredUsers.find(u => u.email === email && u.password === password);
  if (!user) {
    return res.status(401).json({ message: "Kombinasi Email atau Password salah!" });
  }

  currentUserSession = user;
  res.json({ message: "Login Berhasil!", user });
});

// 3. ENDPOINT AUTH: Logout Keluar
app.post('/api/auth/logout', (req, res) => {
  currentUserSession = null;
  res.json({ message: "Berhasil keluar dari session server." });
});

// 4. Ambil Data Meta Utama
app.get('/api/meta', (req, res) => {
  res.json({ skills, interests, locations });
});

// 5. Ambil Daftar Karir
app.get('/api/careers', (req, res) => {
  res.json(careers);
});

// 6. Ambil Profil User yang Sedang Login
app.get('/api/user/profile', (req, res) => {
  if (!currentUserSession) {
    return res.status(401).json({ message: "Unauthorized. Silakan login terlebih dahulu." });
  }
  res.json(currentUserSession);
});

// 7. Update Biodata Profil (HTTP PUT)
app.put('/api/user/profile', (req, res) => {
  if (!currentUserSession) return res.status(401).json({ message: "Unauthorized" });
  
  const { name, email, location } = req.body;
  currentUserSession.name = name || currentUserSession.name;
  currentUserSession.email = email || currentUserSession.email;
  currentUserSession.location = location || currentUserSession.location;

  const idx = registeredUsers.findIndex(u => u.id === currentUserSession.id);
  if (idx !== -1) registeredUsers[idx] = currentUserSession;

  res.json({ message: "Profil berhasil diperbarui.", data: currentUserSession });
});

// 8. Simpan Hasil Uji Tes Evaluasi
app.post('/api/user/test', (req, res) => {
  if (!currentUserSession) return res.status(401).json({ message: "Unauthorized" });

  const { skills: userSkills, interests: userInterests } = req.body;

  currentUserSession.testAnswers = {
    skills: userSkills || {},
    interests: userInterests || {}
  };
  currentUserSession.completedAt = new Date().toISOString();

  const idx = registeredUsers.findIndex(u => u.id === currentUserSession.id);
  if (idx !== -1) registeredUsers[idx] = currentUserSession;

  res.json({ message: "Hasil tes tersimpan.", data: currentUserSession });
});

// 9. Ambil Algoritma Rekomendasi Karir Terhitung Server
app.get('/api/user/recommendations', (req, res) => {
  if (!currentUserSession || !currentUserSession.completedAt) {
    return res.json([]);
  }

  const uSkills = currentUserSession.testAnswers.skills || {};
  const uInterests = currentUserSession.testAnswers.interests || {};

  const calculated = careers.map(career => {
    let score = 0;
    let totalPossible = 0;

    career.requiredSkills?.forEach(sId => {
      totalPossible += 5;
      score += uSkills[sId] || 0;
    });

    career.relatedInterests?.forEach(iId => {
      totalPossible += 5;
      score += uInterests[iId] || 0;
    });

    const percentage = totalPossible > 0 ? Math.round((score / totalPossible) * 100) : 0;
    return { ...career, matchPercentage: percentage };
  }).sort((a, b) => b.matchPercentage - a.matchPercentage);

  res.json(calculated);
});

// 10. Tambah Karir Baru (Admin CRUD)
app.post('/api/careers', (req, res) => {
  const { title, category, location, requiredSkills, relatedInterests } = req.body;
  const newCareer = {
    id: 'c_' + Date.now(), 
    title, 
    category, 
    location,
    requiredSkills: requiredSkills || [], 
    relatedInterests: relatedInterests || []
  };
  careers.push(newCareer);
  res.status(201).json({ message: "Karir baru berhasil ditambahkan", data: newCareer });
});

// 11. Hapus Data Karir (Admin CRUD)
app.delete('/api/careers/:id', (req, res) => {
  const { id } = req.params;
  careers = careers.filter(c => c.id !== id);
  res.json({ message: "Karir berhasil dihapus" });
});

app.listen(PORT, () => {
  console.log(`Backend Server REST API aktif di http://localhost:${PORT}`);
});