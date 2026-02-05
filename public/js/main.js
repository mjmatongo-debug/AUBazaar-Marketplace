// AUBazaar Main JavaScript File

// DOM Content Loaded
document.addEventListener('DOMContentLoaded', function() {
    // Initialize tooltips
    var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    var tooltipList = tooltipTriggerList.map(function (tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl);
    });

    // Load categories on homepage
    if (document.getElementById('categories-container')) {
        loadCategories();
    }

    // Load listings on homepage
    if (document.getElementById('listings-container')) {
        loadRecentListings();
    }

    // Initialize search functionality
    initializeSearch();
});

// Load Categories
async function loadCategories() {
    try {
        // In a real implementation, this would fetch from your API
        // For now, using mock data
        const categories = [
            { name: 'Textbooks', icon: 'book', count: 156, color: 'primary' },
            { name: 'Electronics', icon: 'laptop', count: 89, color: 'info' },
            { name: 'Furniture', icon: 'couch', count: 45, color: 'warning' },
            { name: 'Clothing', icon: 'tshirt', count: 67, color: 'success' },
            { name: 'Dorm Essentials', icon: 'home', count: 123, color: 'danger' },
            { name: 'Services', icon: 'tools', count: 34, color: 'secondary' }
        ];

        const container = document.getElementById('categories-container');
        container.innerHTML = '';

        categories.forEach(category => {
            const col = document.createElement('div');
            col.className = 'col-md-4 col-lg-2';
            
            col.innerHTML = `
                <div class="category-card" onclick="window.location.href='browse.html?category=${category.name.toLowerCase()}'">
                    <div class="category-icon text-${category.color}">
                        <i class="fas fa-${category.icon}"></i>
                    </div>
                    <h5>${category.name}</h5>
                    <p class="text-muted">${category.count} items</p>
                </div>
            `;
            
            container.appendChild(col);
        });
    } catch (error) {
        console.error('Error loading categories:', error);
    }
}

// Load Recent Listings
async function loadRecentListings() {
    try {
        // Mock data - replace with actual API call
        const listings = [
            {
                id: 1,
                title: 'Calculus Textbook - 3rd Edition',
                price: 25.99,
                image: 'https://images.unsplash.com/photo-1541963463532-d68292c34b19?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80',
                condition: 'Like New',
                location: 'Science Building',
                views: 42,
                date: '2024-03-15'
            },
            {
                id: 2,
                title: 'MacBook Air 2020',
                price: 699.99,
                image: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80',
                condition: 'Good',
                location: 'Computer Lab',
                views: 128,
                date: '2024-03-14'
            },
            {
                id: 3,
                title: 'Dorm Mini Fridge',
                price: 89.50,
                image: 'https://images.unsplash.com/photo-1592489661722-8d3f8eeba40d?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80',
                condition: 'Fair',
                location: 'Residence Hall A',
                views: 56,
                date: '2024-03-13'
            },
            {
                id: 4,
                title: 'Graphing Calculator TI-84',
                price: 45.00,
                image: 'https://images.unsplash.com/photo-1587145820266-a5951ee6f620?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80',
                condition: 'Good',
                location: 'Math Department',
                views: 31,
                date: '2024-03-12'
            }
        ];

        const container = document.getElementById('listings-container');
        container.innerHTML = '';

        listings.forEach(listing => {
            const col = document.createElement('div');
            col.className = 'col-md-6 col-lg-3';
            
            col.innerHTML = `
                <div class="card listing-card h-100">
                    <div class="position-relative">
                        <img src="${listing.image}" class="card-img-top listing-image" alt="${listing.title}">
                        <span class="badge bg-${getConditionClass(listing.condition)} condition-badge">
                            ${listing.condition}
                        </span>
                        <button class="btn btn-sm btn-light position-absolute top-0 start-0 m-2" onclick="toggleFavorite(${listing.id}, event)">
                            <i class="far fa-heart"></i>
                        </button>
                    </div>
                    <div class="card-body">
                        <h5 class="card-title">${listing.title}</h5>
                        <p class="price-tag">$${listing.price.toFixed(2)}</p>
                        <div class="d-flex justify-content-between text-muted small">
                            <span><i class="fas fa-map-marker-alt"></i> ${listing.location}</span>
                            <span><i class="fas fa-eye"></i> ${listing.views}</span>
                        </div>
                    </div>
                    <div class="card-footer bg-white border-0">
                        <a href="listing-detail.html?id=${listing.id}" class="btn btn-primary w-100">
                            <i class="fas fa-shopping-cart"></i> View Details
                        </a>
                    </div>
                </div>
            `;
            
            container.appendChild(col);
        });
    } catch (error) {
        console.error('Error loading listings:', error);
    }
}

// Get condition badge class
function getConditionClass(condition) {
    const classes = {
        'New': 'success',
        'Like New': 'primary',
        'Good': 'warning',
        'Fair': 'secondary'
    };
    return classes[condition] || 'secondary';
}

// Toggle favorite
function toggleFavorite(listingId, event) {
    event.preventDefault();
    event.stopPropagation();
    
    const icon = event.currentTarget.querySelector('i');
    if (icon.classList.contains('far')) {
        icon.classList.remove('far');
        icon.classList.add('fas', 'text-danger');
        showToast('Added to favorites!', 'success');
    } else {
        icon.classList.remove('fas', 'text-danger');
        icon.classList.add('far');
        showToast('Removed from favorites', 'info');
    }
    
    // Save to localStorage (in real app, save to database)
    let favorites = JSON.parse(localStorage.getItem('aubazaar_favorites') || '[]');
    if (favorites.includes(listingId)) {
        favorites = favorites.filter(id => id !== listingId);
    } else {
        favorites.push(listingId);
    }
    localStorage.setItem('aubazaar_favorites', JSON.stringify(favorites));
}

// Show toast notification
function showToast(message, type = 'info') {
    // Create toast element
    const toast = document.createElement('div');
    toast.className = `toast align-items-center text-bg-${type} border-0 position-fixed`;
    toast.style.cssText = 'top: 20px; right: 20px; z-index: 9999;';
    toast.setAttribute('role', 'alert');
    
    toast.innerHTML = `
        <div class="d-flex">
            <div class="toast-body">${message}</div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
        </div>
    `;
    
    document.body.appendChild(toast);
    
    // Initialize and show toast
    const bsToast = new bootstrap.Toast(toast);
    bsToast.show();
    
    // Remove toast after it's hidden
    toast.addEventListener('hidden.bs.toast', function () {
        document.body.removeChild(toast);
    });
}

// Initialize search functionality
function initializeSearch() {
    const searchForm = document.querySelector('form[role="search"]');
    if (searchForm) {
        searchForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const searchInput = this.querySelector('input[type="search"]');
            const query = searchInput.value.trim();
            
            if (query) {
                window.location.href = `browse.html?search=${encodeURIComponent(query)}`;
            }
        });
    }
}

// Check authentication status
function checkAuth() {
    const token = localStorage.getItem('aubazaar_token');
    const userData = localStorage.getItem('aubazaar_user');
    
    if (token && userData) {
        // User is logged in
        updateNavForLoggedInUser(JSON.parse(userData));
        return true;
    }
    return false;
}

// Update navigation for logged in user
function updateNavForLoggedInUser(user) {
    const accountDropdown = document.querySelector('.nav-item.dropdown');
    if (accountDropdown) {
        accountDropdown.innerHTML = `
            <a class="nav-link dropdown-toggle" href="#" id="navbarDropdown" role="button" data-bs-toggle="dropdown">
                <img src="${user.avatar_url || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(user.full_name) + '&background=007bff&color=fff'}" 
                     class="rounded-circle me-1" width="24" height="24" alt="${user.full_name}">
                ${user.full_name.split(' ')[0]}
            </a>
            <ul class="dropdown-menu">
                <li><a class="dropdown-item" href="dashboard.html"><i class="fas fa-tachometer-alt me-2"></i>Dashboard</a></li>
                <li><a class="dropdown-item" href="profile.html"><i class="fas fa-user me-2"></i>Profile</a></li>
                <li><a class="dropdown-item" href="my-listings.html"><i class="fas fa-list me-2"></i>My Listings</a></li>
                <li><a class="dropdown-item" href="messages.html"><i class="fas fa-envelope me-2"></i>Messages</a></li>
                <li><hr class="dropdown-divider"></li>
                <li><a class="dropdown-item" href="#" onclick="logout()"><i class="fas fa-sign-out-alt me-2"></i>Logout</a></li>
            </ul>
        `;
    }
}

// Logout function
function logout() {
    localStorage.removeItem('aubazaar_token');
    localStorage.removeItem('aubazaar_user');
    window.location.href = 'index.html';
}

// Initialize on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        checkAuth();
    });
} else {
    checkAuth();
}