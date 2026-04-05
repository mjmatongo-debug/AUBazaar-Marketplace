// AUBazaar Backend Server 
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '../public')));

// Database connection pool
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'aubazaar',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// File upload configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../public/uploads');
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ 
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = /jpeg|jpg|png|gif/;
        const ext = allowed.test(path.extname(file.originalname).toLowerCase());
        const mime = allowed.test(file.mimetype);
        if (ext && mime) cb(null, true);
        else cb(new Error('Only images allowed'));
    }
});

// JWT Auth middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Access token required' });
    jwt.verify(token, process.env.JWT_SECRET || 'aubazaar_secret', (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid or expired token' });
        req.user = user;
        next();
    });
};

// ========== ROUTES ==========

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'OK' }));

// Register
app.post('/api/register', async (req, res) => {
    try {
        const { email, password, full_name, user_type, department, phone } = req.body;
        if (!email.endsWith('@africa.edu') && !email.endsWith('@students.africa.edu')) {
            return res.status(400).json({ error: 'Use your Africa University email' });
        }
        const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
        if (existing.length) return res.status(400).json({ error: 'Email already registered' });
        
        const hashed = await bcrypt.hash(password, 10);
        const token = Math.random().toString(36).substring(2, 15);
        await pool.query(
            `INSERT INTO users (email, password, full_name, user_type, department, phone, verification_token, email_verified)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [email, hashed, full_name, user_type || 'student', department, phone, token, true] // auto-verify for demo
        );
        res.status(201).json({ message: 'Registration successful! You can now log in.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// Login
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        if (users.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
        const user = users[0];
        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
        if (!user.email_verified) return res.status(401).json({ error: 'Please verify your email' });
        
        const token = jwt.sign(
            { id: user.id, email: user.email, user_type: user.user_type },
            process.env.JWT_SECRET || 'aubazaar_secret',
            { expiresIn: '7d' }
        );
        const { password: _, ...userData } = user;
        res.json({ token, user: userData });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Login failed' });
    }
});

// Get all listings (with filters & pagination)
app.get('/api/listings', async (req, res) => {
    try {
        const { category, search, min_price, max_price, condition, page = 1, limit = 20 } = req.query;
        let query = `SELECT l.*, u.full_name as seller_name FROM listings l JOIN users u ON l.user_id = u.id WHERE l.status = 'active'`;
        const params = [];
        if (category) { query += ' AND l.category = ?'; params.push(category); }
        if (search) { query += ' AND (l.title LIKE ? OR l.description LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
        if (min_price) { query += ' AND l.price >= ?'; params.push(parseFloat(min_price)); }
        if (max_price) { query += ' AND l.price <= ?'; params.push(parseFloat(max_price)); }
        if (condition) { query += ' AND l.condition = ?'; params.push(condition); }
        
        const offset = (parseInt(page)-1) * parseInt(limit);
        query += ' ORDER BY l.created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), offset);
        
        const [listings] = await pool.query(query, params);
        const [countResult] = await pool.query('SELECT COUNT(*) as total FROM listings WHERE status = "active"');
        res.json({ listings, pagination: { page: parseInt(page), limit: parseInt(limit), total: countResult[0].total } });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch listings' });
    }
});

// Get single listing (increment view count)
app.get('/api/listings/:id', async (req, res) => {
    try {
        const id = req.params.id;
        await pool.query('UPDATE listings SET view_count = view_count + 1 WHERE id = ?', [id]);
        const [listings] = await pool.query(
            `SELECT l.*, u.full_name as seller_name, u.email as seller_email, u.phone as seller_phone 
             FROM listings l JOIN users u ON l.user_id = u.id WHERE l.id = ?`,
            [id]
        );
        if (listings.length === 0) return res.status(404).json({ error: 'Not found' });
        res.json({ listing: listings[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed' });
    }
});

// Create listing (authenticated)
app.post('/api/listings', authenticateToken, upload.array('images', 5), async (req, res) => {
    try {
        const { title, description, price, category, condition, location } = req.body;
        const userId = req.user.id;
        const imageUrls = req.files ? req.files.map(f => `/uploads/${f.filename}`) : [];
        const [result] = await pool.query(
            `INSERT INTO listings (user_id, title, description, price, category, condition, location, images)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [userId, title, description, parseFloat(price), category, condition, location, JSON.stringify(imageUrls)]
        );
        const [newListing] = await pool.query(
            `SELECT l.*, u.full_name as seller_name FROM listings l JOIN users u ON l.user_id = u.id WHERE l.id = ?`,
            [result.insertId]
        );
        res.status(201).json({ message: 'Listing created', listing: newListing[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Creation failed' });
    }
});

// Update listing status (PATCH) – mark as sold
app.patch('/api/listings/:id', authenticateToken, async (req, res) => {
    try {
        const { status } = req.body;
        const listingId = req.params.id;
        const userId = req.user.id;
        const [result] = await pool.query(
            'UPDATE listings SET status = ? WHERE id = ? AND user_id = ?',
            [status, listingId, userId]
        );
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Listing not found' });
        res.json({ message: 'Listing updated' });
    } catch (err) {
        res.status(500).json({ error: 'Update failed' });
    }
});

// Delete listing
app.delete('/api/listings/:id', authenticateToken, async (req, res) => {
    try {
        const listingId = req.params.id;
        const userId = req.user.id;
        const [result] = await pool.query('DELETE FROM listings WHERE id = ? AND user_id = ?', [listingId, userId]);
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Listing not found' });
        res.json({ message: 'Listing deleted' });
    } catch (err) {
        res.status(500).json({ error: 'Delete failed' });
    }
});

// Get user profile + listings
app.get('/api/profile', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const [users] = await pool.query('SELECT id, email, full_name, user_type, department, phone, avatar_url FROM users WHERE id = ?', [userId]);
        if (users.length === 0) return res.status(404).json({ error: 'User not found' });
        const [listings] = await pool.query('SELECT * FROM listings WHERE user_id = ? ORDER BY created_at DESC', [userId]);
        res.json({ user: users[0], listings });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
});

// Update profile
app.put('/api/profile', authenticateToken, upload.single('avatar'), async (req, res) => {
    try {
        const userId = req.user.id;
        const { full_name, department, phone } = req.body;
        let avatar_url = null;
        if (req.file) avatar_url = `/uploads/${req.file.filename}`;
        const updates = [], values = [];
        if (full_name) { updates.push('full_name = ?'); values.push(full_name); }
        if (department) { updates.push('department = ?'); values.push(department); }
        if (phone) { updates.push('phone = ?'); values.push(phone); }
        if (avatar_url) { updates.push('avatar_url = ?'); values.push(avatar_url); }
        if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
        values.push(userId);
        await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values);
        const [users] = await pool.query('SELECT id, email, full_name, user_type, department, phone, avatar_url FROM users WHERE id = ?', [userId]);
        res.json({ message: 'Profile updated', user: users[0] });
    } catch (err) {
        res.status(500).json({ error: 'Update failed' });
    }
});

// Get categories with counts
app.get('/api/categories', async (req, res) => {
    try {
        const [categories] = await pool.query('SELECT * FROM categories ORDER BY name');
        for (let cat of categories) {
            const [cnt] = await pool.query('SELECT COUNT(*) as count FROM listings WHERE category = ? AND status = "active"', [cat.name]);
            cat.count = cnt[0].count;
        }
        res.json({ categories });
    } catch (err) {
        res.status(500).json({ error: 'Failed' });
    }
});

// Dashboard stats
app.get('/api/dashboard/stats', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const [active] = await pool.query('SELECT COUNT(*) as count FROM listings WHERE user_id = ? AND status = "active"', [userId]);
        const [sold] = await pool.query('SELECT COUNT(*) as count FROM listings WHERE user_id = ? AND status = "sold"', [userId]);
        const [views] = await pool.query('SELECT SUM(view_count) as total FROM listings WHERE user_id = ?', [userId]);
        res.json({ activeListings: active[0].count, soldListings: sold[0].count, totalViews: views[0].total || 0 });
    } catch (err) {
        res.status(500).json({ error: 'Failed' });
    }
});

// 404 handler
app.use((req, res) => res.status(404).json({ error: 'Endpoint not found' }));

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`AUBazaar server running on http://localhost:${PORT}`);
});
