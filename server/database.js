const mysql = require('mysql2/promise');
require('dotenv').config();

async function setupDatabase() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
    });

    await connection.query(`CREATE DATABASE IF NOT EXISTS ${process.env.DB_NAME || 'aubazaar'}`);
    await connection.query(`USE ${process.env.DB_NAME || 'aubazaar'}`);

    // Users table
    await connection.query(`
        CREATE TABLE IF NOT EXISTS users (
            id INT PRIMARY KEY AUTO_INCREMENT,
            email VARCHAR(255) UNIQUE NOT NULL,
            password VARCHAR(255) NOT NULL,
            full_name VARCHAR(255) NOT NULL,
            user_type ENUM('student', 'staff', 'faculty') DEFAULT 'student',
            department VARCHAR(255),
            phone VARCHAR(50),
            graduation_year INT,
            avatar_url VARCHAR(500),
            email_verified BOOLEAN DEFAULT FALSE,
            verification_token VARCHAR(255),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
    `);

    // Listings table
    await connection.query(`
        CREATE TABLE IF NOT EXISTS listings (
            id INT PRIMARY KEY AUTO_INCREMENT,
            user_id INT NOT NULL,
            title VARCHAR(255) NOT NULL,
            description TEXT,
            price DECIMAL(10,2) NOT NULL,
            category VARCHAR(100),
            condition ENUM('new', 'like new', 'good', 'fair') DEFAULT 'good',
            location VARCHAR(255),
            images JSON,
            view_count INT DEFAULT 0,
            status ENUM('active', 'sold', 'inactive') DEFAULT 'active',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

    // Messages table
    await connection.query(`
        CREATE TABLE IF NOT EXISTS messages (
            id INT PRIMARY KEY AUTO_INCREMENT,
            listing_id INT,
            sender_id INT NOT NULL,
            receiver_id INT NOT NULL,
            message TEXT NOT NULL,
            is_read BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE SET NULL,
            FOREIGN KEY (sender_id) REFERENCES users(id),
            FOREIGN KEY (receiver_id) REFERENCES users(id)
        )
    `);

    // Categories table
    await connection.query(`
        CREATE TABLE IF NOT EXISTS categories (
            id INT PRIMARY KEY AUTO_INCREMENT,
            name VARCHAR(100) UNIQUE NOT NULL,
            icon VARCHAR(50),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Insert default categories if empty
    const defaultCategories = [
        { name: 'Textbooks', icon: 'book' },
        { name: 'Electronics', icon: 'laptop' },
        { name: 'Furniture', icon: 'couch' },
        { name: 'Clothing', icon: 'tshirt' },
        { name: 'Dorm Essentials', icon: 'bed' },
        { name: 'Sports', icon: 'futbol' },
        { name: 'Services', icon: 'tools' }
    ];
    for (const cat of defaultCategories) {
        await connection.query(
            `INSERT IGNORE INTO categories (name, icon) VALUES (?, ?)`,
            [cat.name, cat.icon]
        );
    }

    console.log('✅ Database setup complete! Tables created.');
    await connection.end();
}

setupDatabase().catch(console.error);