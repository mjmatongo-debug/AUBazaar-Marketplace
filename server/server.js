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
app.use(express.static('../public'));

// Database connection
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'aubazaar',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

const pool = mysql.createPool(dbConfig);

// File upload configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = '../public/uploads';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Only image files are allowed!'));
        }
    }
});

// Authentication middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }
    
    jwt.verify(token, process.env.JWT_SECRET || 'aubazaar_secret_key', (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid or expired token' });
        }
        req.user = user;
        next();
    });
};

// Routes

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'AUBazaar API is running' });
});

// User Registration
app.post('/api/register', async (req, res) => {
    try {
        const { email, password, full_name, user_type, department, phone } = req.body;
        
        // Validate university email
        if (!email.endsWith('@africa.edu') && !email.endsWith('@students.africa.edu')) {
            return res.status(400).json({ error: 'Please use your Africa University email address' });
        }
        
        // Check if user exists
        const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
        if (existing.length > 0) {
            return res.status(400).json({ error: 'Email already registered' });
        }
        
        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Generate verification token
        const verificationToken = Math.random().toString(36).substring(2, 15) + 
                                  Math.random().toString(36).substring(2, 15);
        
        // Insert user
        const [result] = await pool.query(
            `INSERT INTO users (email, password, full_name, user_type, department, phone, verification_token) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [email, hashedPassword, full_name, user_type || 'student', department, phone, verificationToken]
        );
        
        // Send verification email (in real app, use Nodemailer or similar)
        console.log(`Verification token for ${email}: ${verificationToken}`);
        
        res.status(201).json({ 
            message: 'Registration successful! Please check your email to verify your account.',
            userId: result.insertId 
        });
        
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Registration failed. Please try again.' });
    }
});

// User Login
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        // Find user
        const [users] = await pool.query(
            'SELECT id, email, password, full_name, user_type, email_verified FROM users WHERE email = ?',
            [email]
        );
        
        if (users.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        const user = users[0];
        
        // Check email verification
        if (!user.email_verified) {
            return res.status(401).json({ error: 'Please verify your email before logging in' });
        }
        
        // Verify password
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        // Generate JWT token
        const token = jwt.sign(
            { id: user.id, email: user.email, user_type: user.user_type },
            process.env.JWT_SECRET || 'aubazaar_secret_key',
            { expiresIn: '7d' }
        );
        
        // Get user data without password
        const [userData] = await pool.query(
            'SELECT id, email, full_name, user_type, department, phone, avatar_url FROM users WHERE id = ?',
            [user.id]
        );
        
        res.json({
            token,
            user: userData[0]
        });
        
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed. Please try again.' });
    }
});

// Get Listings
app.get('/api/listings', async (req, res) => {
    try {
        const { category, search, min_price, max_price, condition, page = 1, limit = 20 } = req.query;
        let query = `
            SELECT l.*, u.full_name as seller_name, u.department 
            FROM listings l 
            JOIN users u ON l.user_id = u.id 
            WHERE l.status = 'active'
        `;
        const params = [];
        
        if (category) {
            query += ' AND l.category = ?';
            params.push(category);
        }
        
        if (search) {
            query += ' AND (l.title LIKE ? OR l.description LIKE ?)';
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm);
        }
        
        if (min_price) {
            query += ' AND l.price >= ?';
            params.push(parseFloat(min_price));
        }
        
        if (max_price) {
            query += ' AND l.price <= ?';
            params.push(parseFloat(max_price));
        }
        
        if (condition) {
            query += ' AND l.condition = ?';
            params.push(condition);
        }
        
        // Add pagination
        const offset = (parseInt(page) - 1) * parseInt(limit);
        query += ' ORDER BY l.created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), offset);
        
        const [listings] = await pool.query(query, params);
        
        // Get total count for pagination
        let countQuery = 'SELECT COUNT(*) as total FROM listings WHERE status = "active"';
        const countParams = params.slice(0, -2); // Remove limit and offset
        
        const [countResult] = await pool.query(countQuery, countParams);
        const total = countResult[0].total;
        
        res.json({
            listings,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });
        
    } catch (error) {
        console.error('Error fetching listings:', error);
        res.status(500).json({ error: 'Failed to fetch listings' });
    }
});

// Create Listing
app.post('/api/listings', authenticateToken, upload.array('images', 5), async (req, res) => {
    try {
        const { title, description, price, category, condition, location } = req.body;
        const userId = req.user.id;
        
        // Process uploaded images
        const imageUrls = req.files ? req.files.map(file => `/uploads/${file.filename}`) : [];
        
        const [result] = await pool.query(
            `INSERT INTO listings 
             (user_id, title, description, price, category, condition, location, images) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [userId, title, description, parseFloat(price), category, condition, location, 
             JSON.stringify(imageUrls)]
        );
        
        // Get the created listing
        const [listings] = await pool.query(
            'SELECT l.*, u.full_name as seller_name FROM listings l JOIN users u ON l.user_id = u.id WHERE l.id = ?',
            [result.insertId]
        );
        
        res.status(201).json({
            message: 'Listing created successfully!',
            listing: listings[0]
        });
        
    } catch (error) {
        console.error('Error creating listing:', error);
        res.status(500).json({ error: 'Failed to create listing' });
    }
});

// Get Single Listing
app.get('/api/listings/:id', async (req, res) => {
    try {
        const listingId = req.params.id;
        
        // Increment view count
        await pool.query('UPDATE listings SET view_count = view_count + 1 WHERE id = ?', [listingId]);
        
        const [listings] = await pool.query(
            `SELECT l.*, u.full_name as seller_name, u.email as seller_email, 
                    u.phone as seller_phone, u.department, u.avatar_url as seller_avatar
             FROM listings l 
             JOIN users u ON l.user_id = u.id 
             WHERE l.id = ?`,
            [listingId]
        );
        
        if (listings.length === 0) {
            return res.status(404).json({ error: 'Listing not found' });
        }
        
        // Get similar listings
        const [similar] = await pool.query(
            `SELECT l.*, u.full_name as seller_name 
             FROM listings l 
             JOIN users u ON l.user_id = u.id 
             WHERE l.category = ? AND l.id != ? AND l.status = 'active'
             ORDER BY l.created_at DESC 
             LIMIT 4`,
            [listings[0].category, listingId]
        );
        
        res.json({
            listing: listings[0],
            similar: similar
        });
        
    } catch (error) {
        console.error('Error fetching listing:', error);
        res.status(500).json({ error: 'Failed to fetch listing' });
    }
});

// Send Message
app.post('/api/messages', authenticateToken, async (req, res) => {
    try {
        const { listing_id, receiver_id, message } = req.body;
        const sender_id = req.user.id;
        
        const [result] = await pool.query(
            `INSERT INTO messages (listing_id, sender_id, receiver_id, message) 
             VALUES (?, ?, ?, ?)`,
            [listing_id, sender_id, receiver_id, message]
        );
        
        res.status(201).json({
            message: 'Message sent successfully!',
            messageId: result.insertId
        });
        
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({ error: 'Failed to send message' });
    }
});

// Get User Messages
app.get('/api/messages', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        
        const [messages] = await pool.query(
            `SELECT m.*, l.title as listing_title, 
                    s.full_name as sender_name, r.full_name as receiver_name
             FROM messages m
             LEFT JOIN listings l ON m.listing_id = l.id
             JOIN users s ON m.sender_id = s.id
             JOIN users r ON m.receiver_id = r.id
             WHERE m.sender_id = ? OR m.receiver_id = ?
             ORDER BY m.created_at DESC`,
            [userId, userId]
        );
        
        res.json({ messages });
        
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
});

// Get User Profile
app.get('/api/profile', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        
        const [users] = await pool.query(
            `SELECT id, email, full_name, user_type, department, 
                    graduation_year, phone, avatar_url, created_at
             FROM users 
             WHERE id = ?`,
            [userId]
        );
        
        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Get user's listings
        const [listings] = await pool.query(
            'SELECT * FROM listings WHERE user_id = ? ORDER BY created_at DESC',
            [userId]
        );
        
        res.json({
            user: users[0],
            listings
        });
        
    } catch (error) {
        console.error('Error fetching profile:', error);
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
});

// Update User Profile
app.put('/api/profile', authenticateToken, upload.single('avatar'), async (req, res) => {
    try {
        const userId = req.user.id;
        const { full_name, department, phone, graduation_year } = req.body;
        
        let avatar_url;
        if (req.file) {
            avatar_url = `/uploads/${req.file.filename}`;
        }
        
        const updateFields = [];
        const updateValues = [];
        
        if (full_name) {
            updateFields.push('full_name = ?');
            updateValues.push(full_name);
        }
        
        if (department) {
            updateFields.push('department = ?');
            updateValues.push(department);
        }
        
        if (phone) {
            updateFields.push('phone = ?');
            updateValues.push(phone);
        }
        
        if (graduation_year) {
            updateFields.push('graduation_year = ?');
            updateValues.push(graduation_year);
        }
        
        if (avatar_url) {
            updateFields.push('avatar_url = ?');
            updateValues.push(avatar_url);
        }
        
        if (updateFields.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }
        
        updateValues.push(userId);
        const query = `UPDATE users SET ${updateFields.join(', ')}, updated_at = NOW() WHERE id = ?`;
        
        await pool.query(query, updateValues);
        
        // Get updated user
        const [users] = await pool.query(
            'SELECT id, email, full_name, user_type, department, phone, avatar_url FROM users WHERE id = ?',
            [userId]
        );
        
        res.json({
            message: 'Profile updated successfully!',
            user: users[0]
        });
        
    } catch (error) {
        console.error('Error updating profile:', error);
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

// Get Categories
app.get('/api/categories', async (req, res) => {
    try {
        const [categories] = await pool.query(
            'SELECT * FROM categories ORDER BY name'
        );
        
        // Add counts
        for (let category of categories) {
            const [countResult] = await pool.query(
                'SELECT COUNT(*) as count FROM listings WHERE category = ? AND status = "active"',
                [category.name]
            );
            category.count = countResult[0].count;
        }
        
        res.json({ categories });
        
    } catch (error) {
        console.error('Error fetching categories:', error);
        res.status(500).json({ error: 'Failed to fetch categories' });
    }
});

// Get Dashboard Stats
app.get('/api/dashboard/stats', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        
        const [activeListings] = await pool.query(
            'SELECT COUNT(*) as count FROM listings WHERE user_id = ? AND status = "active"',
            [userId]
        );
        
        const [soldListings] = await pool.query(
            'SELECT COUNT(*) as count FROM listings WHERE user_id = ? AND status = "sold"',
            [userId]
        );
        
        const [totalViews] = await pool.query(
            'SELECT SUM(view_count) as total FROM listings WHERE user_id = ?',
            [userId]
        );
        
        const [unreadMessages] = await pool.query(
            'SELECT COUNT(*) as count FROM messages WHERE receiver_id = ? AND is_read = FALSE',
            [userId]
        );
        
        res.json({
            activeListings: activeListings[0].count,
            soldListings: soldListings[0].count,
            totalViews: totalViews[0].total || 0,
            unreadMessages: unreadMessages[0].count
        });
        
    } catch (error) {
        console.error('Error fetching dashboard stats:', error);
        res.status(500).json({ error: 'Failed to fetch dashboard stats' });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    
    if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: `File upload error: ${err.message}` });
    }
    
    res.status(500).json({ error: 'Something went wrong!' });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`AUBazaar server running on port ${PORT}`);
    console.log(`API available at http://localhost:${PORT}/api`);
    console.log(`Website available at http://localhost:${PORT}/index.html`);
});