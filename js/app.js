const PetalApp = (() => {
  const FALLBACK_IMAGE = 'landing page.jpg';
  const LOW_STOCK_THRESHOLD = 5;

  const ORDER_STATUS = ['Pending', 'Accepted', 'Rejected', 'Completed', 'Cancelled'];
  const DELIVERY_STATUS = ['Preparing', 'In transit', 'Delivered', 'Failed'];
  const ACTIVE_STATUSES = ['Pending', 'Accepted'];

  const cache = { me: null, profile: null, products: [], orders: [], messages: [], couriers: [] };
  let sb = null;
  let initialized = false;

  function isConfigured() {
    return !!(window.SUPABASE_URL && window.SUPABASE_ANON_KEY &&
      /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(window.SUPABASE_URL) &&
      window.SUPABASE_ANON_KEY.length > 20 &&
      !/PASTE_/.test(window.SUPABASE_ANON_KEY));
  }

  async function init() {
    if (initialized) return;
    if (!isConfigured()) {
      alert('Petal-PH: Supabase is not configured yet. Open js/config.js and paste your project URL and anon key, then reload.');
      throw new Error('Supabase not configured');
    }
    if (!window.supabase || !window.supabase.createClient) {
      alert('Petal-PH: the Supabase library failed to load. Check your internet connection and reload.');
      throw new Error('Supabase library missing');
    }
    sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
    const { data: { session } } = await sb.auth.getSession();
    cache.me = session ? session.user : null;
    if (cache.me) {
      await loadOwn();
      if (cache.profile && (cache.profile.deleted_at || cache.profile.disabled)) {
        try { if (sb) await sb.auth.signOut(); } catch (err) { console.warn('Petal-PH: signOut failed', err); }
        cache.me = null;
        cache.profile = null;
      }
    }
    sb.auth.onAuthStateChange((_event, session) => {
      cache.me = session ? session.user : null;
    });
    initialized = true;
  }

  function requireAuth(role) {
    if (!cache.me) { window.location.href = 'login.html'; return null; }
    if (cache.profile && (cache.profile.deleted_at || cache.profile.disabled)) {
      try { if (sb) sb.auth.signOut(); } catch (err) { console.warn('Petal-PH: signOut failed', err); }
      cache.me = null;
      cache.profile = null;
      alert('This account has been disabled. Please contact the shop.');
      window.location.href = 'login.html';
      return null;
    }
    if (role && cache.profile && cache.profile.role !== role) {
      window.location.href = cache.profile.role === 'admin' ? 'admin.html' : 'dashboard.html';
      return null;
    }
    return cache.me;
  }

  async function logout() {
    try {
      if (sb) await sb.auth.signOut();
    } catch (err) {
      console.warn('Petal-PH: signOut failed', err);
    }
    cache.me = null; cache.profile = null;
    window.location.href = 'login.html';
  }

  async function login(email, password) {
    const { data, error } = await sb.auth.signInWithPassword({ email: email, password: password });
    if (error) return { ok: false, message: 'Invalid email or password.' };
    cache.me = data.user;
    await loadOwn();
    if (cache.profile && (cache.profile.deleted_at || cache.profile.disabled)) {
      try { if (sb) await sb.auth.signOut(); } catch (err) { console.warn('Petal-PH: signOut failed', err); }
      cache.me = null;
      cache.profile = null;
      return { ok: false, message: 'This account has been disabled. Please contact the shop.' };
    }
    return { ok: true, role: cache.profile ? cache.profile.role : 'user' };
  }

  async function signup(data) {
    const { data: res, error } = await sb.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: {
          nickname: data.nickname,
          status: data.status,
          anniversary: data.anniversary || null,
          phone: data.phone || '',
          location: data.location || ''
        }
      }
    });
    if (error) return { ok: false, message: error.message || 'Sign-up failed.' };
    if (!res.session) {
      return { ok: true, needsConfirm: true, message: 'Account created. Check your email to confirm, then log in.' };
    }
    cache.me = res.user;
    await loadOwn();
    return { ok: true };
  }

  async function reload() {
    if (!cache.me) return;
    await loadOwn();
  }

  async function loadAll() {
    const [products, orders, messages, couriers] = await Promise.all([
      sb.from('products').select('*').order('name'),
      sb.from('orders').select('*').order('created_at', { ascending: false }),
      sb.from('messages').select('*').order('created_at'),
      sb.from('couriers').select('*').order('name')
    ]);
    if (products.error) throw products.error;
    if (orders.error) throw orders.error;
    if (messages.error) throw messages.error;
    if (couriers.error) throw couriers.error;
    cache.products = products.data || [];
    cache.orders = orders.data || [];
    cache.messages = messages.data || [];
    cache.couriers = couriers.data || [];
  }

  async function loadOwn() {
    if (!cache.me) return;
    const [profile, orders, messages] = await Promise.all([
      sb.from('profiles').select('*').eq('id', cache.me.id).maybeSingle(),
      sb.from('orders').select('*').eq('user_id', cache.me.id).order('created_at', { ascending: false }),
      sb.from('messages').select('*').eq('user_id', cache.me.id).order('created_at')
    ]);
    if (profile.error) throw profile.error;
    if (orders.error) throw orders.error;
    if (messages.error) throw messages.error;
    cache.profile = profile.data || null;
    cache.orders = orders.data || [];
    cache.messages = messages.data || [];
  }

  function getMyProfile() { return cache.profile; }
  function getMyOrders() { return cache.orders; }
  function getOrders() { return cache.orders; }
  function getMessages() { return cache.messages; }
  function getProducts() { return cache.products; }
  function getCouriers() { return cache.couriers; }
  function getSession() { return cache.me ? { id: cache.me.id, email: cache.me.email, role: cache.profile ? cache.profile.role : 'user' } : null; }
  function getMessageUser(userId) { return cache.profile && cache.profile.id === userId ? cache.profile : null; }

  async function placeOrder(productId, qty, payment, address, notes) {
    if (cache.profile && (cache.profile.deleted_at || cache.profile.disabled)) {
      return { ok: false, message: 'Account disabled' };
    }
    const { data, error } = await sb.rpc('place_order', {
      p_product_id: productId,
      p_qty: qty,
      p_payment: payment,
      p_address: address,
      p_notes: notes || ''
    });
    if (error) return { ok: false, message: error.message || 'Could not place order.' };
    await loadOwn();
    await refreshProducts();
    return { ok: true, order: data };
  }

  async function cancelMyOrder(orderId) {
    const { error } = await sb.rpc('cancel_my_order', { p_order_id: orderId });
    if (error) return { ok: false, message: error.message };
    await loadOwn();
    await refreshProducts();
    return { ok: true };
  }

  async function refreshProducts() {
    const { data, error } = await sb.from('products').select('*').order('name');
    if (error) { console.warn('Petal-PH: product refresh failed', error); return; }
    cache.products = data || [];
  }

  async function refreshCouriers() {
    const { data, error } = await sb.from('couriers').select('*').order('name');
    if (error) { console.warn('Petal-PH: courier refresh failed', error); return; }
    cache.couriers = data || [];
  }

  async function getAllProfiles(includeAvatar) {
    const cols = includeAvatar ? '*' : 'id,email,nickname,status,anniversary,phone,location,role,created_at,deleted_at,disabled';
    const { data, error } = await sb.from('profiles').select(cols).order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async function setOrderStatus(orderId, status) {
    const { error } = await sb.rpc('set_order_status', { p_order_id: orderId, p_status: status });
    if (error) return { ok: false, message: error.message };
    await loadAll();
    return { ok: true };
  }

  async function saveDelivery(orderId, { courierId, deliveryDate, fee, status }) {
    const patch = {};
    if (typeof courierId !== 'undefined') {
      if (!courierId) {
        patch.delivery_personnel = '';
      } else {
        const { data: courier, error } = await sb.from('couriers').select('name').eq('id', courierId).maybeSingle();
        if (error) return { ok: false, message: error.message };
        patch.delivery_personnel = courier ? courier.name : '';
      }
    }
    if (typeof fee !== 'undefined') patch.delivery_fee = Math.max(0, parseFloat(fee) || 0);
    if (typeof status !== 'undefined' && DELIVERY_STATUS.includes(status)) patch.delivery_status = status;
    if (typeof deliveryDate !== 'undefined') patch.delivery_date = deliveryDate || null;
    const { error } = await sb.from('orders').update(patch).eq('id', orderId);
    if (error) return { ok: false, message: error.message };
    await loadAll();
    return { ok: true };
  }

  async function sendMessage(userId, from, text) {
    const clean = String(text || '').trim();
    if (!clean) return { ok: false, message: 'Message is empty.' };
    const row = {
      user_id: userId,
      sender: from,
      body: clean,
      read_by_user: from === 'user',
      read_by_admin: from === 'admin'
    };
    const { error } = await sb.from('messages').insert(row);
    if (error) return { ok: false, message: error.message };
    return { ok: true };
  }

  async function markRead(userId, role) {
    const col = role === 'user' ? 'read_by_user' : 'read_by_admin';
    const { error } = await sb.from('messages').update({ [col]: true }).eq('user_id', userId).eq(col, false);
    if (error) console.warn('Petal-PH: markRead failed', error);
  }

  function unreadCount(userId, role) {
    const col = role === 'user' ? 'read_by_user' : 'read_by_admin';
    const from = role === 'user' ? 'admin' : 'user';
    return cache.messages.filter(m => m.user_id === userId && m.sender === from && !m[col]).length;
  }

  function conversationList() {
    const byUser = {};
    cache.messages.forEach(m => {
      const u = byUser[m.user_id] || (byUser[m.user_id] = { last: null, unread: 0 });
      if (!u.last || new Date(m.created_at) >= new Date(u.last.created_at)) u.last = m;
      if (m.sender === 'user' && !m.read_by_admin) u.unread++;
    });
    return Object.entries(byUser)
      .map(([userId, v]) => ({ userId, last: v.last, unread: v.unread }))
      .sort((a, b) => new Date(b.last.created_at) - new Date(a.last.created_at));
  }

  async function updateAvatar(dataUrl) {
    const { error } = await sb.from('profiles').update({ avatar: dataUrl }).eq('id', cache.me.id);
    if (error) return { ok: false, message: error.message };
    if (cache.profile) cache.profile.avatar = dataUrl;
    return { ok: true };
  }

  async function removeAvatar() {
    return updateAvatar('');
  }

  async function saveProduct(data) {
    if (data.id) {
      const { id, ...patch } = data;
      const { error } = await sb.from('products').update(patch).eq('id', id);
      if (error) return { ok: false, message: error.message };
    } else {
      const { error } = await sb.from('products').insert(data);
      if (error) return { ok: false, message: error.message };
    }
    await refreshProducts();
    return { ok: true };
  }

  async function deleteProduct(productId) {
    const { error } = await sb.from('products').delete().eq('id', productId);
    if (error) return { ok: false, message: error.message };
    await refreshProducts();
    return { ok: true };
  }

  async function setAvailability(productId, available) {
    const { error } = await sb.from('products').update({ available }).eq('id', productId);
    if (error) return { ok: false, message: error.message };
    await refreshProducts();
    return { ok: true };
  }

  async function setStock(productId, stock) {
    const { error } = await sb.from('products').update({ stock: Math.max(0, parseInt(stock, 10) || 0) }).eq('id', productId);
    if (error) return { ok: false, message: error.message };
    await refreshProducts();
    return { ok: true };
  }

  async function softDeleteCustomer(userId) {
    const { error } = await sb.from('profiles').update({ deleted_at: new Date().toISOString() }).eq('id', userId);
    if (error) return { ok: false, message: error.message };
    await refreshReports();
    return { ok: true };
  }

  async function restoreCustomer(userId) {
    const { error } = await sb.from('profiles').update({ deleted_at: null }).eq('id', userId);
    if (error) return { ok: false, message: error.message };
    await refreshReports();
    return { ok: true };
  }

  async function addCourier(name) {
    const clean = String(name || '').trim();
    if (!clean) return { ok: false, message: 'Courier name is required.' };
    const { error } = await sb.from('couriers').insert({ name: clean });
    if (error) return { ok: false, message: error.message };
    await refreshCouriers();
    return { ok: true };
  }

  async function removeCourier(courierId) {
    const { error } = await sb.from('couriers').delete().eq('id', courierId);
    if (error) return { ok: false, message: error.message };
    await refreshCouriers();
    return { ok: true };
  }

  function safeAvatar(v) {
    if (typeof v !== 'string') return '';
    return v.startsWith('data:image/') ? v : '';
  }

  function revenueOf(order) {
    return (order.status === 'Rejected' || order.status === 'Cancelled') ? 0 : ((order.total || 0) + (order.delivery_fee || 0));
  }

  async function bestSellers(period) {
    const { data, error } = await sb.rpc('best_sellers', { p_period: period });
    if (error) { console.warn('Petal-PH: best_sellers failed', error); return []; }
    return (data || []).map(r => ({ name: r.product_name, units: Number(r.units) || 0 }));
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

    let updateTimer = null;
    async function update() {
      if (updateTimer) clearTimeout(updateTimer);
      updateTimer = setTimeout(async () => {
        const data = await bestSellers(period);
        renderBars(data);
      }, 150);
    }

    function renderBars(data) {
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

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  return {
    FALLBACK_IMAGE, LOW_STOCK_THRESHOLD,
    ORDER_STATUS, DELIVERY_STATUS, ACTIVE_STATUSES,
    get sb() { return sb; },
    cache,
    isConfigured, init, reload, loadAll, loadOwn, refreshProducts, refreshCouriers, getAllProfiles,
    requireAuth, logout, login, signup, getSession,
    getMyProfile, getMyOrders, getOrders, getMessages, getProducts, getCouriers, getMessageUser,
    placeOrder, cancelMyOrder,
    setOrderStatus, saveDelivery,
    sendMessage, markRead, unreadCount, conversationList,
    updateAvatar, removeAvatar,
    saveProduct, deleteProduct, setAvailability, setStock,
    softDeleteCustomer, restoreCustomer, addCourier, removeCourier,
    safeAvatar, revenueOf, bestSellers, mountBestSellerChart,
    resizeImage, formatMoney, todayISO, anniversaryNotice, escapeHtml
  };
})();