let allMenuItems = [];
let cart = [];
let currentUser = JSON.parse(localStorage.getItem('stella_user')) || null;

document.addEventListener('DOMContentLoaded', () => {
  fetchMenu();
  updateAuthUI();

  // Automatically load "All" items if the user is already logged in
  if (currentUser) {
    filterMenu('All');
  } else {
    // Hide menu items and display a login prompt when logged out
    const menuGrid = document.getElementById('menu-grid');
    if (menuGrid) {
      menuGrid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; font-weight: 600; padding: 2rem;">Please log in to view our special menu!</p>';
    }
  }
});

function updateAuthUI() {
  const container = document.getElementById('auth-nav-container');
  if (currentUser) {
    if (currentUser.phone === '024XXXXXXX') {
      const phoneInput = document.getElementById('customer-phone');
      if (phoneInput) phoneInput.value = currentUser.phone;
    }
    container.innerHTML = `
      <span class="user-welcome">Hi, ${currentUser.fullname.split(' ')[0]}</span>
      <button class="nav-auth-btn" onclick="openMyOrders()">My Orders</button>
      <button class="nav-auth-btn" style="border-color:#ffa502;" onclick="handleLogout()">Logout</button>
    `;
  } else {
    container.innerHTML = `
      <button class="nav-auth-btn" onclick="toggleAuthModal()">Login / Register</button>
    `;
  }
}

async function fetchMenu() {
  try {
    const response = await fetch('/api/menu');
    allMenuItems = await response.json();
    // Do not auto-render here so items remain hidden until logged in/requested
  } catch (error) {
    console.error('Error fetching menu:', error);
  }
}

function renderMenu(items) {
  const menuGrid = document.getElementById('menu-grid');
  if (!menuGrid) return;
  menuGrid.innerHTML = '';

  items.forEach(item => {
    const imageSrc = item.image ? `images/${item.image}` : 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=500&q=80';

    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <img src="${imageSrc}" alt="${item.name}" onerror="this.src='https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=500&q=80'">
      <div class="card-info">
        <h3>${item.name}</h3>
        <p class="price">GH₵ ${item.price.toFixed(2)}</p>
        <button class="add-cart-btn" onclick="addToCart(${item.id})">Add to Cart</button>
      </div>
    `;
    menuGrid.appendChild(card);
  });
}

function filterMenu(category, e) {
  // 1. Block guests and prompt for login
  if (!currentUser) {
    alert('Please log in or create an account to view our menu and place orders!');
    toggleAuthModal();
    return;
  }

  // 2. Update active tab styling
  if (e && e.target && e.target.classList.contains('filter-btn')) {
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    e.target.classList.add('active');
  }

  // 3. Render items
  if (category === 'All') {
    renderMenu(allMenuItems);
  } else {
    const filtered = allMenuItems.filter(item => item.category === category);
    renderMenu(filtered);
  }
}

// Auth Functions
function toggleAuthModal() {
  const modal = document.getElementById('auth-modal');
  modal.style.display = modal.style.display === 'flex' ? 'none' : 'flex';
}
function switchAuthTab(type) {
  const loginForm = document.getElementById('login-form');
  const regForm = document.getElementById('register-form');
  const title = document.getElementById('auth-modal-title');

  if (type === 'register') {
    loginForm.style.display = 'none';
    regForm.style.display = 'block';
    title.innerText = 'Login / Create an Account';
  } else {
    regForm.style.display = 'none';
    loginForm.style.display = 'block';
    title.innerText = 'Login / Create an Account';
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const phone = document.getElementById('login-phone').value;
  const password = document.getElementById('login-password').value;

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, password })
    });
    const data = await res.json();

    if (res.ok) {
      if (data.user.role === 'admin') {
        localStorage.setItem('adminPasscode', password);
        localStorage.setItem('stella_user', JSON.stringify(data.user));
        window.location.href = '/admin.html';
        return;
      }
      currentUser = data.user;
      localStorage.setItem('stella_user', JSON.stringify(currentUser));
      updateAuthUI();
      toggleAuthModal();
      
      // Auto-display menu upon login
      filterMenu('All');

      alert(`Welcome back, ${currentUser.fullname}!`);
    } else {
      alert(data.error);
    }
  } catch (err) {
    alert('Login error.');
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const fullname = document.getElementById('reg-name').value;
  const phone = document.getElementById('reg-phone').value;
  const password = document.getElementById('reg-password').value;

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullname, phone, password })
    });
    const data = await res.json();

    if (res.ok) {
      currentUser = data.user;
      localStorage.setItem('stella_user', JSON.stringify(currentUser));
      updateAuthUI();
      toggleAuthModal();

      // Auto-display menu upon registration
      filterMenu('All');

      alert('Account registered successfully!');
    } else {
      alert(data.error);
    }
  } catch (err) {
    alert('Registration error.');
  }
}

function handleLogout() {
  currentUser = null;
  localStorage.removeItem('stella_user');
  localStorage.removeItem('adminPasscode');
  updateAuthUI();

  // Reset menu grid view on logout
  const menuGrid = document.getElementById('menu-grid');
  if (menuGrid) {
    menuGrid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; font-weight: 600; padding: 2rem;">Please log in to view our special menu!</p>';
  }
}

// User Orders History Modal
async function openMyOrders() {
  if (!currentUser) return;
  const modal = document.getElementById('orders-modal');
  const container = document.getElementById('user-orders-list');
  modal.style.display = 'flex';

  container.innerHTML = '<p>Loading orders...</p>';

  try {
    const res = await fetch(`/api/user/orders/${currentUser.id}`);
    const orders = await res.json();

    if (orders.length === 0) {
      container.innerHTML = '<p>You have no past orders yet.</p>';
      return;
    }

    container.innerHTML = '';
    orders.forEach(o => {
      const items = JSON.parse(o.items).map(i => `${i.name} (x${i.quantity})`).join(', ');
      const div = document.createElement('div');
      div.style.borderBottom = '1px solid #ddd';
      div.style.padding = '10px 0';
      div.innerHTML = `
        <strong>Order #${o.id}</strong> - <span style="color:#ff4757;">${o.order_status}</span><br>
        <small>${items}</small><br>
        <strong>Total: GH₵ ${o.total_amount.toFixed(2)}</strong> | ${o.branch}
      `;
      container.appendChild(div);
    });
  } catch (err) {
    container.innerHTML = '<p>Error loading orders.</p>';
  }
}

function toggleOrdersModal() {
  document.getElementById('orders-modal').style.display = 'none';
}

// Cart logic
function addToCart(itemId) {
  const product = allMenuItems.find(p => p.id === itemId);
  const existingIndex = cart.findIndex(c => c.id === itemId);

  if (existingIndex > -1) {
    cart[existingIndex].quantity += 1;
  } else {
    cart.push({ ...product, quantity: 1 });
  }

  updateCartUI();
}

function removeFromCart(itemId) {
  cart = cart.filter(item => item.id !== itemId);
  updateCartUI();
}

function updateCartUI() {
  const cartCount = document.getElementById('cart-count');
  const cartItemsDiv = document.getElementById('cart-items');
  const cartTotalSpan = document.getElementById('cart-total');

  const totalQuantity = cart.reduce((sum, item) => sum + item.quantity, 0);
  const totalPrice = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  if (cartCount) cartCount.innerText = totalQuantity;
  if (cartTotalSpan) cartTotalSpan.innerText = totalPrice.toFixed(2);

  if (!cartItemsDiv) return;

  if (cart.length === 0) {
    cartItemsDiv.innerHTML = '<p style="text-align:center; padding: 1rem;">Your cart is empty.</p>';
    return;
  }

  cartItemsDiv.innerHTML = '';
  cart.forEach(item => {
    const itemRow = document.createElement('div');
    itemRow.className = 'cart-item';
    itemRow.innerHTML = `
      <div>
        <strong>${item.name}</strong><br>
        <small>GH₵ ${item.price.toFixed(2)} x ${item.quantity}</small>
      </div>
      <div>
        <button class="remove-item-btn" onclick="removeFromCart(${item.id})">Remove</button>
      </div>
    `;
    cartItemsDiv.appendChild(itemRow);
  });
}

function toggleCartModal() {
  const modal = document.getElementById('cart-modal');
  modal.style.display = modal.style.display === 'flex' ? 'none' : 'flex';
}

async function submitOrder(e) {
  e.preventDefault();

  if (cart.length === 0) {
    alert('Your cart is empty!');
    return;
  }

  const branch = document.getElementById('branch-select').value;
  const fulfillment_type = document.getElementById('fulfillment-select').value;
  const customer_phone = document.getElementById('customer-phone').value;
  const delivery_location = document.getElementById('delivery-location').value;
  const payment_method = document.getElementById('payment-select').value;

  const total_amount = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  const payload = {
    user_id: currentUser ? currentUser.id : null,
    branch,
    fulfillment_type,
    customer_phone,
    delivery_location,
    payment_method,
    items: cart,
    total_amount
  };

  try {
    const response = await fetch('/api/order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (response.ok) {
      alert(`🎉 Order placed successfully! Order ID: #${result.orderId}`);
      cart = [];
      updateCartUI();
      toggleCartModal();
      document.getElementById('checkout-form').reset();
    } else {
      alert('Failed: ' + result.error);
    }
  } catch (err) {
    alert('Error connecting to backend server.');
  }
}