const PetalApp = (() => {
  const KEYS = {
    users: 'petal_users',
    products: 'petal_products',
    orders: 'petal_orders',
    session: 'petal_session'
  };

  const ADMIN = { email: 'Petal-PH@gmail.com', password: 'Petal-PH123456789', role: 'admin', nickname: 'Admin' };

  function read(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  }
  function write(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
  function uid(prefix = 'id') { return prefix + '_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36); }

  function seed() {
    if (!read(KEYS.products, null)) {
      write(KEYS.products, [
        { id: uid('p'), name: 'Sunrise Tulips', price: 499, season: 'Spring', stock: 12, description: 'Bright tulips for fresh spring days.' },
        { id: uid('p'), name: 'Summer Sunflowers', price: 399, season: 'Summer', stock: 15, description: 'Warm sunflowers to light up any room.' },
        { id: uid('p'), name: 'Autumn Chrysanthemums', price: 450, season: 'Autumn', stock: 10, description: 'Rich blooms perfect for cozy moments.' },
        { id: uid('p'), name: 'Winter Roses', price: 599, season: 'Winter', stock: 8, description: 'Classic roses for heartfelt celebrations.' },
        { id: uid('p'), name: 'Everyday Mixed Bouquet', price: 350, season: 'All Season', stock: 20, description: 'A simple mix for any occasion.' }
      ]);
    }
    if (!read(KEYS.users, null)) write(KEYS.users, []);
    if (!read(KEYS.orders, null)) write(KEYS.orders, []);
  }

  function getUsers() { return read(KEYS.users, []); }
  function saveUsers(users) { write(KEYS.users, users); }
  function getProducts() { return read(KEYS.products, []); }
  function saveProducts(products) { write(KEYS.products, products); }
  function getOrders() { return read(KEYS.orders, []); }
  function saveOrders(orders) { write(KEYS.orders, orders); }
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

  function signup(data) {
    const users = getUsers();
    if (users.some(u => u.email.toLowerCase() === data.email.toLowerCase()) || data.email.toLowerCase() === ADMIN.email.toLowerCase()) {
      return { ok: false, message: 'Email is already registered.' };
    }
    const user = { id: uid('u'), ...data, createdAt: new Date().toISOString() };
    users.push(user);
    saveUsers(users);
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

  seed();
  return { KEYS, ADMIN, read, write, uid, getUsers, saveUsers, getProducts, saveProducts, getOrders, saveOrders, getSession, setSession, clearSession, login, signup, requireAuth, logout, formatMoney, todayISO, anniversaryNotice };
})();
