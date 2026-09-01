let allMenuItems = [];
let cart = [];
let currentUser = JSON.parse(localStorage.getItem('stella_user')) || null;

/* Opening Hours Helper Function */
function isKitchenOpen() {
  const now = new Date();
  const hours = now.getHours(); // 0 to 23
  // Open at 6 AM (6) and closes at 10 PM (22)
  return hours >= 6 && hours < 22;
}

document.addEventListener('DOMContentLoaded', () => {
  fetchMenu();
  updateAuthUI();

  // Show top alert banner if kitchen is closed
  if (!isKitchenOpen()) {
    const banner = document.createElement('div');
    banner.id = 'kitchen-closed-banner';
    banner.style.cssText = 'background: #ff4757; color: #ffffff; text-align: center; padding: 10px; font-weight: 600; font-size: 0.95rem; position: sticky; top: 0; z-index: 1000; box-shadow: 0 2px 5px rgba(0,0,0,0.2);';
    banner.innerHTML = '🔴 Orders are currently CLOSED. Operating hours are 6:00 AM – 10:00 PM daily.';
    document.body.insertBefore(banner, document.body.firstChild);
  }

  // Close drawer menu when clicking anywhere outside of it
  document.addEventListener('click', (event) => {
    const navDrawer = document.getElementById('navDrawer');
    const menuToggle = document.getElementById('menuToggle');
    
    if (navDrawer && menuToggle) {
      if (!navDrawer.contains(event.target) && !menuToggle.contains(event.target)) {
        navDrawer.classList.remove('active');
      }
    }
  });
});

/* Drawer Navigation & Live Search Toggle */
function toggleDrawer() {
  const navDrawer = document.getElementById('navDrawer');
  if (navDrawer) {
    navDrawer.classList.toggle('active');
  }
}

function handleMenuSearch(e) {
  const query = e.target.value.toLowerCase().trim();
  
  // Filter menu items by name matching query
  const filtered = allMenuItems.filter(item => 
    item.name.toLowerCase().includes(query)
  );
  
  renderMenu(filtered);
}

function updateAuthUI() {
  const drawerContainer = document.getElementById('drawer-auth-container');
  const userGreetingEl = document.getElementById('user-greeting');

  if (currentUser) {
    // Auto-fill phone in checkout form if user is logged in
    const phoneInput = document.getElementById('customer-phone');
    if (phoneInput && currentUser.phone) {
      phoneInput.value = currentUser.phone;
    }

    // Render user greeting beside the Cart button in top navbar
    if (userGreetingEl) {
      const firstName = currentUser.fullname ? currentUser.fullname.split(' ')[0] : 'User';
      userGreetingEl.innerHTML = `Hi, ${firstName}`;
    }

    // Render remaining links inside drawer menu
    if (drawerContainer) {
      drawerContainer.innerHTML = `
        <a href="#" onclick="openMyOrders(); toggleDrawer();"><i class="fa-solid fa-clock-rotate-left"></i> My Orders</a>
        <a href="#" onclick="handleLogout(); toggleDrawer();" style="color: #ffa502;"><i class="fa-solid fa-right-from-bracket"></i> Logout</a>
      `;
    }
  } else {
    // Clear greeting when logged out
    if (userGreetingEl) {
      userGreetingEl.innerHTML = '';
    }

    // Show login link in drawer menu
    if (drawerContainer) {
      drawerContainer.innerHTML = `
        <a href="#" onclick="toggleAuthModal(); toggleDrawer();"><i class="fa-solid fa-user"></i> Login / Register</a>
      `;
    }
  }
}

async function fetchMenu() {
  try {
    const response = await fetch('/api/menu');
    allMenuItems = await response.json();
    renderMenu(allMenuItems);
  } catch (error) {
    console.error('Error fetching menu:', error);
  }
}

function renderMenu(items) {
  const menuGrid = document.getElementById('menu-grid');
  if (!menuGrid) return;
  menuGrid.innerHTML = '';

  const fallbackImg = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=500&q=80';

  if (items.length === 0) {
    menuGrid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: #777;">No matching menu items found.</p>';
    return;
  }

  items.forEach(item => {
    const imageSrc = item.image ? `images/${item.image}` : fallbackImg;
    
    // Check if item is in cart and get quantity
    const cartItem = cart.find(c => c.id === item.id);
    const inCart = cartItem ? cartItem.quantity : 0;

    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <img src="${imageSrc}" alt="${item.name}" onerror="this.src='${fallbackImg}'">
      ${inCart > 0 ? `<div class="cart-badge">${inCart}</div>` : ''}
      <div class="card-info">
        <h3>${item.name}</h3>
        <p class="price">GH₵ ${item.price.toFixed(2)}</p>
        <button class="add-cart-btn" onclick="addToCart(${item.id})">
          <i class="fa-solid fa-cart-plus"></i> Add to Cart
        </button>
      </div>
    `;
    menuGrid.appendChild(card);
  });
}

function filterMenu(category, e) {
  if (e && e.target && e.target.classList.contains('filter-btn')) {
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    e.target.classList.add('active');
  }

  if (category === 'All') {
    renderMenu(allMenuItems);
  } else {
    const filtered = allMenuItems.filter(item => item.category === category);
    renderMenu(filtered);
  }
}

/* Authentication */
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
}

/* User Order History */
async function openMyOrders() {
  if (!currentUser) {
    alert('Please log in or create an account to view your order history!');
    toggleAuthModal();
    return;
  }

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

/* Cart & Checkout Logic */
function addToCart(itemId) {
  const product = allMenuItems.find(p => p.id === itemId);
  const existingIndex = cart.findIndex(c => c.id === itemId);

  if (existingIndex > -1) {
    cart[existingIndex].quantity += 1;
  } else {
    cart.push({ ...product, quantity: 1 });
  }

  updateCartUI();
  // Re-render menu to show cart badges
  const activeCategory = document.querySelector('.filter-btn.active')?.innerText || 'All';
  if (activeCategory === 'Foods') {
    const filtered = allMenuItems.filter(item => item.category === 'Food');
    renderMenu(filtered);
  } else if (activeCategory === 'Drinks') {
    const filtered = allMenuItems.filter(item => item.category === 'Drink');
    renderMenu(filtered);
  } else {
    renderMenu(allMenuItems);
  }
}

function removeFromCart(itemId) {
  cart = cart.filter(item => item.id !== itemId);
  updateCartUI();
  // Re-render menu to remove cart badges
  const activeCategory = document.querySelector('.filter-btn.active')?.innerText || 'All';
  if (activeCategory === 'Foods') {
    const filtered = allMenuItems.filter(item => item.category === 'Food');
    renderMenu(filtered);
  } else if (activeCategory === 'Drinks') {
    const filtered = allMenuItems.filter(item => item.category === 'Drink');
    renderMenu(filtered);
  } else {
    renderMenu(allMenuItems);
  }
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

  // Operating hours check
  if (!isKitchenOpen()) {
    alert('🔴 Kitchen De Stella is currently CLOSED.\n\nWe accept orders daily between 6:00 AM and 10:00 PM.');
    return;
  }

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
      const itemsList = cart.map(i => `• ${i.name} (x${i.quantity}) - GH₵ ${(i.price * i.quantity).toFixed(2)}`).join('\n');
      const waMessage = encodeURIComponent(
        `Hello Kitchen De Stella! 🍲\n` +
        `I just placed an order on the website (#${result.orderId}):\n\n` +
        `*Order Items:*\n${itemsList}\n\n` +
        `*Total Amount:* GH₵ ${total_amount.toFixed(2)}\n` +
        `*Fulfillment:* ${fulfillment_type}\n` +
        `*Branch:* ${branch}\n` +
        `*Customer Phone:* ${customer_phone}\n` +
        `*Delivery Address:* ${delivery_location}\n` +
        `*Payment Choice:* ${payment_method}`
      );

      cart = [];
      updateCartUI();
      toggleCartModal();
      document.getElementById('checkout-form').reset();

      const adminWhatsApp = '233276061417';
      window.location.href = `https://wa.me/${adminWhatsApp}?text=${waMessage}`;
    } else {
      alert('Failed: ' + result.error);
    }
  } catch (err) {
    alert('Error connecting to backend server.');
  }
}