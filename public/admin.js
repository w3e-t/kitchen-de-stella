document.addEventListener('DOMContentLoaded', () => {
  fetchOrders();
});

function getAdminPasscode() {
  return localStorage.getItem('admin_passcode') || 'stella2026';
}

async function fetchOrders() {
  const tbody = document.getElementById('admin-orders-body');
  try {
    const res = await fetch('/api/admin/orders', {
      headers: { 'x-admin-passcode': getAdminPasscode() }
    });

    if (!res.ok) {
      tbody.innerHTML = '<tr><td colspan="9" style="color:red;">Unauthorized access. Please log in as admin.</td></tr>';
      return;
    }

    const orders = await res.json();
    if (orders.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9">No orders found.</td></tr>';
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
    tbody.innerHTML = '<tr><td colspan="9">Error loading orders.</td></tr>';
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