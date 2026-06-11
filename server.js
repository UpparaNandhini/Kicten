// server.js — Nandhu's Kitchen Backend (pure Node.js, no npm needed)
const http = require('http');
const fs   = require('fs');
const path = require('path');
const url  = require('url');
const os   = require('os');

const PORT    = 3000;
const HOST    = '0.0.0.0';   // listen on ALL interfaces (LAN + localhost)
const DATA_FILE   = path.join(__dirname, 'bookings.json');
const ORDERS_FILE = path.join(__dirname, 'orders.json');
const STAFF_FILE  = path.join(__dirname, 'staff.json');
const PUBLIC      = __dirname;

function cleanPhone(p) {
  if (!p) return '';
  const digits = p.replace(/\D/g, '');
  return digits.slice(-10);
}

// ── Auto-detect LAN IP ───────────────────────────────────────
function getLanIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address; // e.g. 192.168.1.x
      }
    }
  }
  return '127.0.0.1';
}
const LAN_IP = getLanIP();

// Ensure data files exist
if (!fs.existsSync(DATA_FILE))   fs.writeFileSync(DATA_FILE, '[]', 'utf8');
if (!fs.existsSync(ORDERS_FILE)) fs.writeFileSync(ORDERS_FILE, '[]', 'utf8');
if (!fs.existsSync(STAFF_FILE))  fs.writeFileSync(STAFF_FILE, '[]', 'utf8');

// MIME types
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
};

function sendJSON(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type':  'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end',  () => {
      try { resolve(JSON.parse(body)); }
      catch(e) { resolve({}); }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const parsed   = url.parse(req.url, true);
  const pathname = parsed.pathname;

  // ── CORS pre-flight ───────────────────────────────────────────
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }

  // ── GET /api/config — expose server's LAN IP to frontend ─────
  if (req.method === 'GET' && pathname === '/api/config') {
    return sendJSON(res, 200, {
      lanIP:   LAN_IP,
      port:    PORT,
      baseUrl: `http://${LAN_IP}:${PORT}`,
    });
  }

  // ── POST /api/book — save a booking ──────────────────────────
  if (req.method === 'POST' && pathname === '/api/book') {
    const data = await readBody(req);
    const { name, phone, date, time, guests, seating, notes } = data;

    if (!name || !phone || !date || !time) {
      return sendJSON(res, 400, { success: false, message: 'Missing required fields.' });
    }

    const booking = {
      id:        Date.now(),
      name, phone, date, time,
      guests:    guests  || '2 Guests',
      seating:   seating || 'Indoor – AC Hall',
      notes:     notes   || '',
      bookedAt:  new Date().toISOString(),
    };

    try {
      const existing = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      existing.push(booking);
      fs.writeFileSync(DATA_FILE, JSON.stringify(existing, null, 2), 'utf8');
      console.log(`✨ New booking #${booking.id} — ${name} on ${date} at ${time}`);
      return sendJSON(res, 200, { success: true, booking });
    } catch (err) {
      console.error('Save error:', err);
      return sendJSON(res, 500, { success: false, message: 'Server error. Try again.' });
    }
  }

  // ── GET /api/bookings — list all bookings ────────────────────
  if (req.method === 'GET' && pathname === '/api/bookings') {
    try {
      const list = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      return sendJSON(res, 200, { success: true, count: list.length, bookings: list });
    } catch {
      return sendJSON(res, 500, { success: false, message: 'Could not read bookings.' });
    }
  }

  // ── POST /api/booking/delete — delete a booking ───────────────
  if (req.method === 'POST' && pathname === '/api/booking/delete') {
    const data = await readBody(req);
    const { id } = data;
    if (!id) {
      return sendJSON(res, 400, { success: false, message: 'Missing booking id.' });
    }
    try {
      const existing = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      const filtered = existing.filter(b => b.id !== parseInt(id));
      fs.writeFileSync(DATA_FILE, JSON.stringify(filtered, null, 2), 'utf8');
      return sendJSON(res, 200, { success: true });
    } catch (err) {
      return sendJSON(res, 500, { success: false, message: 'Server error deleting booking.' });
    }
  }

  // ── GET /api/staff — list all staff ──────────────────────────
  if (req.method === 'GET' && pathname === '/api/staff') {
    try {
      const list = JSON.parse(fs.readFileSync(STAFF_FILE, 'utf8'));
      return sendJSON(res, 200, { success: true, count: list.length, staff: list });
    } catch {
      return sendJSON(res, 500, { success: false, message: 'Could not read staff.' });
    }
  }

  // ── POST /api/staff — add/edit a staff member ─────────────────
  if (req.method === 'POST' && pathname === '/api/staff') {
    const data = await readBody(req);
    const { id, name, role, contact, shift, status } = data;

    if (!name || !role) {
      return sendJSON(res, 400, { success: false, message: 'Missing required fields: name, role.' });
    }

    try {
      const existing = JSON.parse(fs.readFileSync(STAFF_FILE, 'utf8'));
      if (id) {
        // Edit existing
        const idx = existing.findIndex(s => s.id === parseInt(id));
        if (idx !== -1) {
          existing[idx] = { ...existing[idx], name, role, contact, shift, status };
        } else {
          return sendJSON(res, 404, { success: false, message: 'Staff member not found.' });
        }
      } else {
        // Add new
        const staffMember = {
          id: Date.now(),
          name, role,
          contact: contact || '',
          shift: shift || 'Morning',
          status: status || 'Active'
        };
        existing.push(staffMember);
      }
      fs.writeFileSync(STAFF_FILE, JSON.stringify(existing, null, 2), 'utf8');
      return sendJSON(res, 200, { success: true });
    } catch (err) {
      return sendJSON(res, 500, { success: false, message: 'Server error saving staff.' });
    }
  }

  // ── POST /api/staff/delete — delete a staff member ────────────
  if (req.method === 'POST' && pathname === '/api/staff/delete') {
    const data = await readBody(req);
    const { id } = data;
    if (!id) {
      return sendJSON(res, 400, { success: false, message: 'Missing staff id.' });
    }
    try {
      const existing = JSON.parse(fs.readFileSync(STAFF_FILE, 'utf8'));
      const filtered = existing.filter(s => s.id !== parseInt(id));
      fs.writeFileSync(STAFF_FILE, JSON.stringify(filtered, null, 2), 'utf8');
      return sendJSON(res, 200, { success: true });
    } catch (err) {
      return sendJSON(res, 500, { success: false, message: 'Server error deleting staff.' });
    }
  }

  // ── POST /api/order — save a customer order ──────────────────
  if (req.method === 'POST' && pathname === '/api/order') {
    const data = await readBody(req);
    const { name, table, items, total, notes, phone } = data;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return sendJSON(res, 400, { success: false, message: 'Cart is empty.' });
    }

    const order = {
      id:        Date.now(),
      name:      name || 'Guest',
      table:     table || 'Table 5',
      phone:     phone || '',
      items,
      total:     total || 0,
      notes:     notes || '',
      status:    'Pending',
      orderedAt: new Date().toISOString(),
    };

    try {
      const existing = JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8'));
      existing.push(order);
      fs.writeFileSync(ORDERS_FILE, JSON.stringify(existing, null, 2), 'utf8');
      console.log(`🍔 New order #${order.id} — ${order.table} | ₹${order.total}`);
      return sendJSON(res, 200, { success: true, order });
    } catch (err) {
      console.error('Order save error:', err);
      return sendJSON(res, 500, { success: false, message: 'Server error. Try again.' });
    }
  }

  // ── GET /api/customer/bookings — list customer bookings ────────
  if (req.method === 'GET' && pathname === '/api/customer/bookings') {
    const phone = parsed.query.phone;
    if (!phone) {
      return sendJSON(res, 400, { success: false, message: 'Phone number is required.' });
    }
    try {
      const list = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      const target = cleanPhone(phone);
      const filtered = list.filter(b => cleanPhone(b.phone) === target);
      return sendJSON(res, 200, { success: true, bookings: filtered });
    } catch {
      return sendJSON(res, 500, { success: false, message: 'Could not read bookings.' });
    }
  }

  // ── GET /api/customer/orders — list customer orders ────────────
  if (req.method === 'GET' && pathname === '/api/customer/orders') {
    const phone = parsed.query.phone;
    if (!phone) {
      return sendJSON(res, 400, { success: false, message: 'Phone number is required.' });
    }
    try {
      const list = JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8'));
      const target = cleanPhone(phone);
      const filtered = list.filter(o => cleanPhone(o.phone) === target);
      return sendJSON(res, 200, { success: true, orders: filtered });
    } catch {
      return sendJSON(res, 500, { success: false, message: 'Could not read orders.' });
    }
  }

  // ── GET /api/orders — list all orders ────────────────────────
  if (req.method === 'GET' && pathname === '/api/orders') {
    try {
      const list = JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8'));
      return sendJSON(res, 200, { success: true, count: list.length, orders: list });
    } catch {
      return sendJSON(res, 500, { success: false, message: 'Could not read orders.' });
    }
  }

  // ── POST /api/order/status — update order status ─────────────
  if (req.method === 'POST' && pathname === '/api/order/status') {
    const data = await readBody(req);
    const { id, status } = data;
    if (!id || !status) {
      return sendJSON(res, 400, { success: false, message: 'Missing id or status.' });
    }
    try {
      const existing = JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8'));
      const order = existing.find(o => o.id === parseInt(id));
      if (!order) return sendJSON(res, 404, { success: false, message: 'Order not found.' });
      order.status = status;
      fs.writeFileSync(ORDERS_FILE, JSON.stringify(existing, null, 2), 'utf8');
      console.log(`🔄  Order #${id} → ${status}`);
      return sendJSON(res, 200, { success: true, order });
    } catch (err) {
      return sendJSON(res, 500, { success: false, message: 'Server error.' });
    }
  }

  // ── POST /api/orders/clear — clear all orders ────────────────
  if (req.method === 'POST' && pathname === '/api/orders/clear') {
    try {
      fs.writeFileSync(ORDERS_FILE, '[]', 'utf8');
      console.log('🗑️ All kitchen orders cleared.');
      return sendJSON(res, 200, { success: true });
    } catch {
      return sendJSON(res, 500, { success: false, message: 'Could not clear orders.' });
    }
  }

  // ── Static file serving ───────────────────────────────────────
  // Route / and /menu to the main HTML
  let file = pathname;
  if (pathname === '/' || pathname === '/menu') {
    file = 'index.html';
  } else if (pathname === '/kitchen') {
    file = 'kitchen.html';
  } else if (pathname === '/admin') {
    file = 'admin.html';
  } else if (pathname === '/customer') {
    file = 'customer.html';
  } else if (pathname === '/book') {
    // /book route also serves main HTML (router handles it via ?mode=book)
    file = 'index.html';
  }

  const filePath = path.join(PUBLIC, file);

  // Prevent directory traversal
  if (!filePath.startsWith(PUBLIC)) {
    res.writeHead(403); return res.end('Forbidden');
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('404 – Page Not Found');
    }
    const ext  = path.extname(filePath).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-cache' });
    res.end(content);
  });
});

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log("║        👨‍🍳  Nandhu's Kitchen — Server Running         ║");
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log(`║  Local:    http://localhost:${PORT}                     ║`);
  console.log(`║  Network:  http://${LAN_IP}:${PORT}              ║`);
  console.log('║                                                      ║');
  console.log('║  QR codes → auto-point to your real LAN IP above 🔗  ║');
  console.log('║  Kitchen:  http://localhost:3000/kitchen             ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');
});
