const PetalApp = (() => {
  const KEYS = {
    users: 'petal_users',
    products: 'petal_products',
    orders: 'petal_orders',
    session: 'petal_session',
    couriers: 'petal_couriers',
    messages: 'petal_messages'
  };

  const ADMIN = { email: 'Petal-PH@gmail.com', password: 'Petal-PH123456789', role: 'admin', nickname: 'Admin' };

  const FALLBACK_IMAGE = 'landing page.jpg';
  const LOW_STOCK_THRESHOLD = 5;

  const ORDER_STATUS = ['Pending', 'Accepted', 'Rejected', 'Completed', 'Cancelled'];
  const DELIVERY_STATUS = ['Preparing', 'In transit', 'Delivered', 'Failed'];
  const ACTIVE_STATUSES = ['Pending', 'Accepted'];

  const SEED_PRODUCTS = [
    { name: 'White Tulips', price: 499, season: 'Spring', stock: 12, image: 'White Tulips.jpg', description: 'Fresh white tulips for gentle spring moments.' },
    { name: 'White Lisianthus', price: 549, season: 'Spring', stock: 10, image: 'White Lisianthus.jpg', description: 'Elegant lisianthus with soft ruffled petals.' },
    { name: 'Pink Garden Roses', price: 599, season: 'Spring', stock: 9, image: 'Pink Garden Roses.jpg', description: 'Romantic garden roses in soft pink.' },
    { name: 'Oriental Lily Buds', price: 525, season: 'Spring', stock: 11, image: 'Oriental Lily Buds.jpg', description: 'Fragrant oriental lilies ready to bloom.' },
    { name: 'Sunflower', price: 399, season: 'Summer', stock: 15, image: 'Sunflower.jpg', description: 'Bright sunflowers to light up summer days.' },
    { name: 'White Gerbera Daisy', price: 379, season: 'Summer', stock: 14, image: 'White Gerbera Daisy.jpg', description: 'Cheerful daisies with clean white petals.' },
    { name: 'White Ping Pong Mum', price: 429, season: 'Summer', stock: 8, image: 'White Ping Pong Mum.jpg', description: 'Playful round blooms for summer decor.' },
    { name: 'Pink Chrysanthemums', price: 450, season: 'Autumn', stock: 10, image: 'Pink Chrysanthemums.jpg', description: 'Warm pink mums for cozy autumn vibes.' },
    { name: 'White Carnations', price: 389, season: 'Autumn', stock: 13, image: 'White carnations.jpg', description: 'Classic carnations with lasting beauty.' },
    { name: 'Green Carnations', price: 469, season: 'Autumn', stock: 7, image: 'Green Carnations.jpg', description: 'Unique green carnations for standout gifts.' },
    { name: 'Carnations', price: 350, season: 'Winter', stock: 16, image: 'Carnations.jpg', description: 'Soft ruffled carnations for winter warmth.' },
    { name: 'Rose Flower', price: 599, season: 'Winter', stock: 8, image: 'Rose Flower.jpg', description: 'Timeless roses for heartfelt celebrations.' },
    { name: 'Pink Phalaenopsis Orchid', price: 899, season: 'Winter', stock: 6, image: 'Pink Phalaenopsis Orchid.jpg', description: 'Elegant orchid for special occasions.' },
    { name: 'Peonies', price: 649, season: 'All Season', stock: 9, image: 'Peonies.jpg', description: 'Lush peonies loved in every season.' },
    { name: 'Preserved Rose', price: 750, season: 'All Season', stock: 12, image: 'Preserved Rose.jpg', description: 'Long-lasting preserved rose keepsake.' }
  ];

  const SEED_COURIERS = ['Jun Marquez', 'Ana Reyes', 'Carlo Dizon', 'Rosa Lim'];

  const DB_NAME = 'petal_ph_db';
  const DB_VERSION = 1;
  const STORES = ['users', 'products', 'orders', 'messages', 'couriers'];
  const LEGACY_KEYS = {
    users: 'petal_users', products: 'petal_products', orders: 'petal_orders',
    messages: 'petal_messages', couriers: 'petal_couriers'
  };

  const cache = { users: [], products: [], orders: [], messages: [], couriers: [] };
  let db = null;
  let useFallback = false;
  let initialized = false;

  function read(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  }
  function write(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
  function uid(prefix = 'id') { return prefix + '_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36); }

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const database = req.result;
        STORES.forEach(name => {
          if (!database.objectStoreNames.contains(name)) database.createObjectStore(name, { keyPath: 'id' });
        });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function getAllFromDB(store) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readonly');
      const req = tx.objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  const MAPPERS = {
    products: {
      toRow: p => ({ id: p.id, name: p.name, price: p.price, season: p.season, stock: p.stock, image: p.image, description: p.description || '', available: !!p.available }),
      toObj: r => ({ id: r.id, name: r.name, price: Number(r.price), season: r.season, stock: r.stock, image: r.image, description: r.description || '', available: r.available })
    },
    users: {
      toRow: u => ({ id: u.id, email: u.email, nickname: u.nickname, status: u.status, anniversary: u.anniversary || null, phone: u.phone, location: u.location, password: u.password, avatar: u.avatar || '', created_at: u.createdAt }),
      toObj: r => ({ id: r.id, email: r.email, nickname: r.nickname, status: r.status, anniversary: r.anniversary, phone: r.phone, location: r.location, password: r.password, avatar: r.avatar || '', createdAt: r.created_at })
    },
    orders: {
      toRow: o => ({ id: o.id, user_id: o.userId, user_email: o.userEmail, user_name: o.userName, product_id: o.productId, product_name: o.productName, season: o.season || null, qty: o.qty, total: o.total, payment: o.payment, address: o.address || '', notes: o.notes || '', status: o.status, delivery_personnel: o.deliveryPersonnel || '', delivery_fee: o.deliveryFee || 0, delivery_status: o.deliveryStatus || 'Preparing', created_at: o.date }),
      toObj: r => ({ id: r.id, userId: r.user_id, userEmail: r.user_email, userName: r.user_name, productId: r.product_id, productName: r.product_name, season: r.season, qty: r.qty, total: Number(r.total), payment: r.payment, address: r.address || '', notes: r.notes || '', status: r.status, deliveryPersonnel: r.delivery_personnel || '', deliveryFee: Number(r.delivery_fee || 0), deliveryStatus: r.delivery_status || 'Preparing', date: r.created_at })
    },
    messages: {
      toRow: m => ({ id: m.id, user_id: m.userId, sender: m.from, body: m.text, read_by_user: !!m.readByUser, read_by_admin: !!m.readByAdmin, created_at: m.date }),
      toObj: r => ({ id: r.id, userId: r.user_id, from: r.sender, text: r.body, readByUser: r.read_by_user, readByAdmin: r.read_by_admin, date: r.created_at })
    },
    couriers: {
      toRow: c => ({ id: c.id, name: c.name }),
      toObj: r => ({ id: r.id, name: r.name })
    }
  };

  function useCloud() {
    const url = (window.PETAL_CONFIG && window.PETAL_CONFIG.supabaseUrl) || '';
    const key = (window.PETAL_CONFIG && window.PETAL_CONFIG.supabaseAnonKey) || '';
    return /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url) && key.length > 20 && !/YOUR-|xxxx/i.test(key);
  }

  function sbFetch(path, options) {
    const url = window.PETAL_CONFIG.supabaseUrl.replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
    const key = window.PETAL_CONFIG.supabaseAnonKey;
    return fetch(`${url}/rest/v1/${path}`, Object.assign({}, options, {
      headers: Object.assign({
        apikey: key,
        Authorization: 'Bearer ' + key,
        'Content-Type': 'application/json'
      }, (options && options.headers) || {})
    }));
  }

  async function sbReplace(name, rows) {
    const del = await sbFetch(`${name}?id=not.is.null`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
    if (!del.ok) throw new Error(`Supabase delete failed on ${name}: ${del.status}`);
    if (rows.length) {
      const ins = await sbFetch(name, { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(rows) });
      if (!ins.ok) throw new Error(`Supabase insert failed on ${name}: ${ins.status}`);
    }
  }

  async function loadFromCloud() {
    for (const name of STORES) {
      const res = await sbFetch(`${name}?select=*`);
      if (!res.ok) throw new Error(`Supabase load failed on ${name}: ${res.status}`);
      const rows = await res.json();
      cache[name] = (rows || []).map(r => MAPPERS[name].toObj(r));
    }
  }

  function replaceStore(name, values) {
    cache[name] = values || [];
    if (useCloud()) {
      return sbReplace(name, cache[name].map(v => MAPPERS[name].toRow(v)))
        .catch(err => console.warn('Petal-PH: Supabase write failed', err));
    }
    if (useFallback || !db) { write(LEGACY_KEYS[name], cache[name]); return Promise.resolve(); }
    try {
      const tx = db.transaction(name, 'readwrite');
      const os = tx.objectStore(name);
      os.clear();
      cache[name].forEach(v => os.put(v));
    } catch (err) { console.warn('Petal-PH: IndexedDB write failed', err); }
    return Promise.resolve();
  }

  function importLegacy() {
    const imported = [];
    STORES.forEach(name => {
      const legacy = read(LEGACY_KEYS[name], null);
      if (!cache[name].length && Array.isArray(legacy) && legacy.length) { cache[name] = legacy; imported.push(name); }
      localStorage.removeItem(LEGACY_KEYS[name]);
    });
    return imported;
  }

  async function init() {
    if (initialized) return;
    if (useCloud()) {
      try {
        await loadFromCloud();
      } catch (err) {
        console.warn('Petal-PH: Supabase unavailable, using local storage', err);
        useFallback = true;
        for (const name of STORES) cache[name] = read(LEGACY_KEYS[name], []) || [];
      }
    } else {
      try {
        if (!('indexedDB' in window)) throw new Error('IndexedDB unavailable');
        db = await openDB();
        for (const name of STORES) cache[name] = await getAllFromDB(name);
      } catch (err) {
        console.warn('Petal-PH: using localStorage fallback', err);
        useFallback = true;
        for (const name of STORES) cache[name] = read(LEGACY_KEYS[name], []) || [];
      }
    }
    const imported = importLegacy();
    seed();
    if (useCloud()) imported.forEach(name => replaceStore(name, cache[name]));
    initialized = true;
  }

  function seedCouriers() { return SEED_COURIERS.map(name => ({ id: uid('c'), name })); }

  function seed() {
    let productsChanged = false;
    if (!cache.products.length || cache.products.some(p => !p.image)) {
      cache.products = SEED_PRODUCTS.map(p => ({ id: uid('p'), ...p, available: true }));
      productsChanged = true;
    }
    cache.products.forEach(p => { if (typeof p.available === 'undefined') { p.available = true; productsChanged = true; } });

    let usersChanged = false;
    cache.users.forEach(u => { if (typeof u.avatar === 'undefined') { u.avatar = ''; usersChanged = true; } });

    let couriersChanged = false;
    if (!cache.couriers.length) { cache.couriers = seedCouriers(); couriersChanged = true; }
    else if (cache.couriers.some(c => typeof c === 'string')) {
      cache.couriers = cache.couriers.map(c => typeof c === 'string' ? { id: uid('c'), name: c } : c);
      couriersChanged = true;
    }

    if (productsChanged) replaceStore('products', cache.products);
    if (usersChanged) replaceStore('users', cache.users);
    if (couriersChanged) replaceStore('couriers', cache.couriers);
  }

  function getUsers() { return cache.users; }
  function saveUsers(users) { replaceStore('users', users); }
  function getProducts() { return cache.products; }
  function saveProducts(products) { replaceStore('products', products); }
  function getOrders() { return cache.orders; }
  function saveOrders(orders) { replaceStore('orders', orders); }
  function getCouriers() { return cache.couriers; }
  function saveCouriers(couriers) { replaceStore('couriers', couriers); }
  function getSession() { return read(KEYS.session, null); }
  function setSession(session) { write(KEYS.session, session); }
  function clearSession() { localStorage.removeItem(KEYS.session); }

  function login(email, password) {
    if (email === ADMIN.email && password === ADMIN.password) {
      setSession({ role: 'admin', email: ADMIN.email, nickname: ADMIN.nickname });
      return { ok: true, role: 'admin' };
    }
    const user = getUsers().find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === password);
    if (!user) return { ok: false, message: 'Invalid email or password.' };
    setSession({ role: 'user', email: user.email, nickname: user.nickname, id: user.id });
    return { ok: true, role: 'user' };
  }

  async function signup(data) {
    const users = getUsers();
    if (users.some(u => u.email.toLowerCase() === data.email.toLowerCase()) || data.email.toLowerCase() === ADMIN.email.toLowerCase()) {
      return { ok: false, message: 'Email is already registered.' };
    }
    const user = { id: uid('u'), ...data, avatar: '', createdAt: new Date().toISOString() };
    users.push(user);
    await saveUsers(users);
    setSession({ role: 'user', email: user.email, nickname: user.nickname, id: user.id });
    return { ok: true };
  }

  function requireAuth(role) {
    const session = getSession();
    if (!session) { window.location.href = 'login.html'; return null; }
    if (role && session.role !== role) {
      window.location.href = session.role === 'admin' ? 'admin.html' : 'dashboard.html';
      return null;
    }
    return session;
  }

  function logout() { clearSession(); window.location.href = 'login.html'; }

  function updateAvatar(userId, dataUrl) {
    const users = getUsers();
    const user = users.find(u => u.id === userId);
    if (!user) return false;
    user.avatar = dataUrl;
    saveUsers(users);
    return true;
  }

  function deleteCustomer(userId) {
    saveUsers(getUsers().filter(u => u.id !== userId));
  }

  function addProduct(data) {
    const products = getProducts();
    const product = { id: uid('p'), available: true, ...data };
    products.unshift(product);
    saveProducts(products);
    return product;
  }

  function updateProduct(productId, data) {
    const products = getProducts();
    const product = products.find(p => p.id === productId);
    if (!product) return null;
    Object.assign(product, data);
    saveProducts(products);
    return product;
  }

  function deleteProduct(productId) {
    saveProducts(getProducts().filter(p => p.id !== productId));
  }

  function toggleAvailability(productId) {
    const products = getProducts();
    const product = products.find(p => p.id === productId);
    if (!product) return null;
    product.available = !product.available;
    saveProducts(products);
    return product.available;
  }

  function setStock(productId, stock) {
    return updateProduct(productId, { stock: Math.max(0, parseInt(stock, 10) || 0) });
  }

  function restoreStock(order) {
    const products = getProducts();
    const product = products.find(p => p.id === order.productId);
    if (product) {
      product.stock += order.qty;
      saveProducts(products);
    }
  }

  function setOrderStatus(orderId, status) {
    const orders = getOrders();
    const order = orders.find(o => o.id === orderId);
    if (!order || !ORDER_STATUS.includes(status)) return null;
    const wasActive = ACTIVE_STATUSES.includes(order.status);
    if ((status === 'Cancelled' || status === 'Rejected') && wasActive) restoreStock(order);
    order.status = status;
    saveOrders(orders);
    return order;
  }

  function saveDelivery(orderId, { personnel, fee, status }) {
    const orders = getOrders();
    const order = orders.find(o => o.id === orderId);
    if (!order) return null;
    if (typeof personnel !== 'undefined') order.deliveryPersonnel = personnel;
    if (typeof fee !== 'undefined') order.deliveryFee = Math.max(0, parseFloat(fee) || 0);
    if (typeof status !== 'undefined' && DELIVERY_STATUS.includes(status)) order.deliveryStatus = status;
    saveOrders(orders);
    return order;
  }

  function revenueOf(order) { return (order.status === 'Rejected' || order.status === 'Cancelled') ? 0 : (order.total || 0); }

  function getMessages() { return cache.messages; }
  function saveMessages(messages) { replaceStore('messages', messages); }

  function sendMessage(userId, from, text) {
    const clean = String(text || '').trim();
    if (!clean) return null;
    const messages = getMessages();
    const msg = {
      id: uid('m'), userId, from, text: clean, date: new Date().toISOString(),
      readByUser: from === 'user', readByAdmin: from === 'admin'
    };
    messages.push(msg);
    saveMessages(messages);
    return msg;
  }

  function markRead(userId, role) {
    const messages = getMessages();
    let changed = false;
    messages.forEach(m => {
      if (m.userId !== userId) return;
      if (role === 'user' && m.from === 'admin' && !m.readByUser) { m.readByUser = true; changed = true; }
      if (role === 'admin' && m.from === 'user' && !m.readByAdmin) { m.readByAdmin = true; changed = true; }
    });
    if (changed) saveMessages(messages);
  }

  function unreadCount(userId, role) {
    return getMessages().filter(m => m.userId === userId &&
      (role === 'user' ? (m.from === 'admin' && !m.readByUser) : (m.from === 'user' && !m.readByAdmin))).length;
  }

  function conversationList() {
    const users = getUsers();
    const messages = getMessages();
    return users.map(u => {
      const mine = messages.filter(m => m.userId === u.id);
      const last = mine[mine.length - 1];
      return {
        user: u,
        last,
        unread: mine.filter(m => m.from === 'user' && !m.readByAdmin).length
      };
    }).filter(c => c.last).sort((a, b) => new Date(b.last.date) - new Date(a.last.date));
  }

  function bestSellers(period) {
    const now = new Date();
    let start;
    if (period === 'daily') start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    else if (period === 'weekly') { start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6); }
    else if (period === 'monthly') start = new Date(now.getFullYear(), now.getMonth(), 1);
    else start = new Date(now.getFullYear(), 0, 1);

    const counts = {};
    getOrders().forEach(o => {
      if (o.status === 'Rejected' || o.status === 'Cancelled') return;
      if (!o.payment) return;
      if (new Date(o.date) < start) return;
      counts[o.productName] = (counts[o.productName] || 0) + (o.qty || 0);
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, units]) => ({ name, units }));
  }

  function mountBestSellerChart(root) {
    if (!root || root.dataset.mounted) return null;
    root.dataset.mounted = '1';
    const colors = ['#c94f7c', '#5b8def', '#2e7d5b', '#d98e2b', '#8e6bbf'];
    const bars = new Map();
    const labels = new Map();
    const plot = root.querySelector('.bs-plot');
    const xlabels = root.querySelector('.bs-xlabels');
    const yaxis = root.querySelector('.bs-yaxis');
    const empty = root.querySelector('.bs-empty');
    let period = 'daily';

    root.querySelectorAll('.bs-filter').forEach(btn => {
      btn.addEventListener('click', () => {
        root.querySelectorAll('.bs-filter').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        period = btn.dataset.period;
        update();
      });
    });

    function niceMax(v) {
      if (v <= 0) return 10;
      const pow = Math.pow(10, Math.floor(Math.log10(v)));
      const n = v / pow;
      const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
      return step * pow;
    }

    function update() {
      const data = bestSellers(period);
      empty.style.display = data.length ? 'none' : 'block';
      const max = niceMax(Math.max(...data.map(d => d.units), 0));
      yaxis.innerHTML = [0, 1, 2, 3, 4]
        .map(i => `<span style="top:${i * 25}%">${Math.round(max * (1 - i / 4))}</span>`)
        .join('');

      const names = new Set(data.map(d => d.name));
      bars.forEach((el, name) => { if (!names.has(name)) { el.remove(); bars.delete(name); } });
      labels.forEach((el, name) => { if (!names.has(name)) { el.remove(); labels.delete(name); } });

      data.forEach((d, i) => {
        let bar = bars.get(d.name);
        if (!bar) {
          bar = document.createElement('div');
          bar.className = 'bs-bar';
          bar.innerHTML = '<div class="bs-bar-fill"><span class="bs-tip"></span></div>';
          bar.style.height = '0%';
          plot.appendChild(bar);
          bars.set(d.name, bar);
        }
        bar.style.left = (i * 20) + '%';
        bar.style.zIndex = 10 + i;
        const h = max ? Math.round((d.units / max) * 1000) / 10 : 0;
        requestAnimationFrame(() => { bar.style.height = h + '%'; });
        const fill = bar.firstElementChild;
        fill.style.background = colors[i % colors.length];
        fill.querySelector('.bs-tip').textContent = `${d.units} unit${d.units === 1 ? '' : 's'} sold`;

        let lab = labels.get(d.name);
        if (!lab) {
          lab = document.createElement('div');
          lab.className = 'bs-xlabel';
          xlabels.appendChild(lab);
          labels.set(d.name, lab);
        }
        lab.textContent = d.name;
        lab.style.left = (i * 20) + '%';
      });
    }

    update();
    return { update };
  }

  function resizeImage(file, maxSize, cb) {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        cb(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  function formatMoney(n) { return '₱' + Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function todayISO() { return new Date().toISOString().slice(0, 10); }

  function anniversaryNotice(user) {
    if (!user || !user.anniversary) return '';
    const a = new Date(user.anniversary);
    const now = new Date();
    const thisYear = new Date(now.getFullYear(), a.getMonth(), a.getDate());
    const diffDays = Math.round((thisYear - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
    if (diffDays === 0) return `Happy Anniversary, ${user.nickname}! Celebrate today with a special bouquet from Petal-PH.`;
    if (diffDays > 0 && diffDays <= 7) return `Anniversary reminder: ${user.nickname}, your anniversary is in ${diffDays} day(s). Surprise your loved one with flowers!`;
    return '';
  }

  return {
    KEYS, ADMIN, FALLBACK_IMAGE, LOW_STOCK_THRESHOLD,
    ORDER_STATUS, DELIVERY_STATUS, ACTIVE_STATUSES,
    init, read, write, uid,
    getUsers, saveUsers, getProducts, saveProducts, getOrders, saveOrders, getCouriers, saveCouriers,
    getSession, setSession, clearSession,
    login, signup, requireAuth, logout,
    updateAvatar, deleteCustomer,
    addProduct, updateProduct, deleteProduct, toggleAvailability, setStock,
    setOrderStatus, saveDelivery, revenueOf,
    getMessages, saveMessages, sendMessage, markRead, unreadCount, conversationList,
    bestSellers, mountBestSellerChart,
    resizeImage,
    formatMoney, todayISO, anniversaryNotice
  };
})();