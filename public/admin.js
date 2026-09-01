document.addEventListener('DOMContentLoaded', () => {
  fetchOrders();
  fetchAdminMenu();
});

function getAdminPasscode() {
  // Checks 'adminPasscode' (matching app.js) or 'stella_user', fallback to 'Stella123'
  return localStorage.getItem('adminPasscode') || localStorage.getItem('admin_passcode') || 'Stella123';
}

// Fetch and render menu items for price management
async function fetchAdminMenu() {
  const tbody = document.getElementById('admin-menu-body');
  try {
    const res = await fetch('/api/menu');
    const menuItems = await res.json();

    if (!menuItems || menuItems.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No menu items found.</td></tr>';
      return;
    }

    tbody.innerHTML = '';
    menuItems.forEach(item => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>#${item.id}</td>
        <td><strong>${item.name}</strong></td>
        <td>${item.category}</td>
        <td>
          GH₵ <input type="number" step="0.5" id="price-input-${item.id}" value="${item.price}" style="width: 90px; padding: 5px;">
        </td>
        <td>
          <button onclick="updatePrice(${item.id})" style="background: #70a1ff; color: #fff; border: none; padding: 5px 12px; border-radius: 4px; cursor: pointer; font-weight: 600;">
            Save Price
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Error loading menu items.</td></tr>';
  }
}

async function updatePrice(itemId) {
  const priceInput = document.getElementById(`price-input-${itemId}`);
  const newPrice = parseFloat(priceInput.value);

  if (isNaN(newPrice) || newPrice < 0) {
    alert('Please enter a valid price.');
    return;
  }

  try {
    const res = await fetch(`/api/admin/menu/${itemId}/price`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-passcode': getAdminPasscode()
      },
      body: JSON.stringify({ price: newPrice })
    });

    const data = await res.json();
    if (res.ok) {
      alert(data.message || 'Price updated successfully!');
      fetchAdminMenu(); // Refresh table view
    } else {
      alert(data.error || 'Failed to update price.');
    }
  } catch (err) {
    alert('Server error while updating price.');
  }
}

// Handle adding new menu item with image upload
async function handleAddMenuItem(event) {
  event.preventDefault();
  
  const statusDiv = document.getElementById('upload-status');
  statusDiv.style.display = 'block';
  statusDiv.style.background = '#e8f5e9';
  statusDiv.style.color = '#2e7d32';
  statusDiv.innerText = '⏳ Uploading...';

  const formData = new FormData();
  const itemName = document.getElementById('item-name').value;
  const itemCategory = document.getElementById('item-category').value;
  const itemPrice = parseFloat(document.getElementById('item-price').value);
  const itemImage = document.getElementById('item-image').files[0];

  if (!itemImage) {
    statusDiv.style.background = '#ffebee';
    statusDiv.style.color = '#c62828';
    statusDiv.innerText = '❌ Please select an image file.';
    return;
  }

  // Validate image type
  const validTypes = ['image/jpeg', 'image/png'];
  if (!validTypes.includes(itemImage.type)) {
    statusDiv.style.background = '#ffebee';
    statusDiv.style.color = '#c62828';
    statusDiv.innerText = '❌ Only JPG and PNG images are allowed.';
    return;
  }

  // Validate image size (max 5MB)
  if (itemImage.size > 5 * 1024 * 1024) {
    statusDiv.style.background = '#ffebee';
    statusDiv.style.color = '#c62828';
    statusDiv.innerText = '❌ Image file must be smaller than 5MB.';
    return;
  }

  formData.append('name', itemName);
  formData.append('category', itemCategory);
  formData.append('price', itemPrice);
  formData.append('image', itemImage);

  try {
    const res = await fetch('/api/admin/menu/add', {
      method: 'POST',
      headers: {
        'x-admin-passcode': getAdminPasscode()
      },
      body: formData
    });

    const data = await res.json();

    if (res.ok) {
      statusDiv.style.background = '#e8f5e9';
      statusDiv.style.color = '#2e7d32';
      statusDiv.innerText = `✅ ${data.message}`;
      
      document.getElementById('add-menu-form').reset();
      fetchAdminMenu(); // Refresh the menu table
      
      // Clear success message after 3 seconds
      setTimeout(() => {
        statusDiv.style.display = 'none';
      }, 3000);
    } else {
      statusDiv.style.background = '#ffebee';
      statusDiv.style.color = '#c62828';
      statusDiv.innerText = `❌ ${data.error || 'Failed to add item.'}`;
    }
  } catch (err) {
    statusDiv.style.background = '#ffebee';
    statusDiv.style.color = '#c62828';
    statusDiv.innerText = '❌ Server error while adding item.';
    console.error('Error:', err);
  }
}

async function fetchOrders() {
  const tbody = document.getElementById('admin-orders-body');
  try {
    const res = await fetch('/api/admin/orders', {
      headers: { 'x-admin-passcode': getAdminPasscode() }
    });

    if (!res.ok) {
      tbody.innerHTML = '<tr><td colspan="9" style="color:red; text-align:center;">Unauthorized access. Please log out and log in as admin.</td></tr>';
      return;
    }

    const orders = await res.json();
    if (orders.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;">No orders found.</td></tr>';
      return;
    }

    tbody.innerHTML = '';
    orders.forEach(order => {
      const items = JSON.parse(order.items).map(i => `${i.name} (x${i.quantity})`).join(', ');
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>#${order.id}</td>
        <td>${order.branch}</td>
        <td>${order.fulfillment_type}</td>
        <td>${order.customer_phone}</td>
        <td>${order.delivery_location}</td>
        <td><small>${items}</small></td>
        <td>GH₵ ${order.total_amount.toFixed(2)}</td>
        <td>${order.payment_method}</td>
        <td>
          <select class="status-select" onchange="updateOrderStatus(${order.id}, this.value)">
            <option value="Pending" ${order.order_status === 'Pending' ? 'selected' : ''}>Pending</option>
            <option value="Preparing" ${order.order_status === 'Preparing' ? 'selected' : ''}>Preparing</option>
            <option value="Out for Delivery" ${order.order_status === 'Out for Delivery' ? 'selected' : ''}>Out for Delivery</option>
            <option value="Delivered" ${order.order_status === 'Delivered' ? 'selected' : ''}>Delivered</option>
            <option value="Cancelled" ${order.order_status === 'Cancelled' ? 'selected' : ''}>Cancelled</option>
          </select>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;">Error loading orders.</td></tr>';
  }
}

async function updateOrderStatus(orderId, status) {
  try {
    const res = await fetch(`/api/admin/orders/${orderId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-passcode': getAdminPasscode()
      },
      body: JSON.stringify({ order_status: status })
    });

    if (res.ok) {
      alert(`Order #${orderId} status updated to: ${status}`);
    } else {
      alert('Failed to update status.');
    }
  } catch (err) {
    alert('Server error while updating status.');
  }
}

async function addMenuItem(e) {
  e.preventDefault();
  const name = document.getElementById('item-name').value;
  const category = document.getElementById('item-category').value;
  const price = parseFloat(document.getElementById('item-price').value);
  const image = document.getElementById('item-image').value;

  const res = await fetch('/api/admin/menu', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-passcode': getAdminPasscode()
    },
    body: JSON.stringify({ name, category, price, image })
  });

  if (res.ok) {
    alert('Item added successfully!');
    document.getElementById('add-item-form').reset();
    fetchAdminMenu(); // Refresh admin menu table
  } else {
    alert('Failed to add item');
  }
}

// Danger Zone Actions
async function clearCompletedOrders() {
  if (!confirm('Are you sure you want to delete all COMPLETED and DELIVERED orders?')) return;

  try {
    const res = await fetch('/api/admin/orders?target=completed', {
      method: 'DELETE',
      headers: { 'x-admin-passcode': getAdminPasscode() }
    });
    const data = await res.json();
    alert(data.message);
    fetchOrders();
  } catch (err) {
    alert('Failed to clear completed orders.');
  }
}

async function clearAllOrders() {
  const confirmation = prompt('Type "DELETE" to confirm wiping all customer order records:');
  if (confirmation !== 'DELETE') {
    alert('Action cancelled.');
    return;
  }

  try {
    const res = await fetch('/api/admin/orders?target=all', {
      method: 'DELETE',
      headers: { 'x-admin-passcode': getAdminPasscode() }
    });
    const data = await res.json();
    alert(data.message);
    fetchOrders();
  } catch (err) {
    alert('Failed to wipe order records.');
  }
}

async function resetDatabase() {
  const confirmation = prompt('Type "RESET" to confirm clearing all orders and customer accounts:');
  if (confirmation !== 'RESET') {
    alert('Action cancelled.');
    return;
  }

  try {
    const res = await fetch('/api/admin/reset-db', {
      method: 'POST',
      headers: { 'x-admin-passcode': getAdminPasscode() }
    });
    const data = await res.json();
    alert(data.message);
    fetchOrders();
  } catch (err) {
    alert('Failed to reset database.');
  }
}