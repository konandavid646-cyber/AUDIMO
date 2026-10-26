/* AUDIMO - Logique du site (catalogues, panier, lecteur, admin) */

const ADMIN_PASSWORD = "audimo_admin_2026";
const WAVE_BASE_URL = "https://pay.wave.com/m/M_ci_gSxGrNtAyFwp/c/ci/?amount=";
// Commentaires partagés entre tous les visiteurs : colle ici l'adresse de ta Firebase Realtime Database
// (ex: "https://mon-projet-default-rtdb.firebaseio.com"). Laisse vide pour garder les commentaires locaux.
const FIREBASE_DB_URL = "";
const FIREBASE_BASE = FIREBASE_DB_URL.replace(/\/+$/, '');

// MODE EN LIGNE : livres et catalogues visibles par TOUS les clients (sur tous les appareils).
// Remplis les 4 valeurs ci-dessous (voir le guide). Tant qu'une valeur est vide, le site reste en mode local.
const FIREBASE_API_KEY = "";    // clé API Web du projet Firebase
const ADMIN_EMAIL = "";         // e-mail du compte administrateur créé dans Firebase Authentication
const CLOUDINARY_CLOUD = "";    // « Cloud name » de ton compte Cloudinary
const CLOUDINARY_PRESET = "";   // « Upload preset » (mode Unsigned) créé dans Cloudinary
const CLOUD_MODE = !!(FIREBASE_BASE && FIREBASE_API_KEY && ADMIN_EMAIL && CLOUDINARY_CLOUD && CLOUDINARY_PRESET);
const DEFAULT_CAT_PRICE = 5000; // prix appliqué aux catalogues sans prix défini
let isAdminLoggedIn = false;

function changeTheme(themeName) {
    document.documentElement.setAttribute('data-theme', themeName);
    localStorage.setItem('audimo_theme', themeName);
}

const savedTheme = localStorage.getItem('audimo_theme') || 'dark';
document.documentElement.setAttribute('data-theme', savedTheme);
document.getElementById('theme-selector').value = savedTheme;

// BDD CATALOGUES
let categoriesList = JSON.parse(localStorage.getItem('audimo_cats') || JSON.stringify([
    { id: 'histoire', name: "Cours d'Histoire", icon: "📜", stripeColor: "#3b82f6", desc: "Civilisations anciennes, empires et histoire globale.", price: 5000 },
    { id: 'informatique', name: "Informatique & Code", icon: "💻", stripeColor: "#10b981", desc: "Développement web, algorithmes et programmation.", price: 5000 }
]));

// BDD LIVRES
let coursesList = JSON.parse(localStorage.getItem('audimo_courses') || JSON.stringify([
    { 
        id: 101, 
        cat: 'histoire', 
        title: "L'Égypte Ancienne & Pharaons", 
        audioName: "egypte.mp3", 
        audioUrl: "", 
        accessType: "free",
        unlocked: true,
        img: "https://images.unsplash.com/photo-1461360370896-922624d12aa1?w=400",
        reviews: [{ user: "Marc", rating: "5", text: "Excellente qualité sonore !" }]
    }
]));

// BDD COMMANDES PERSONNALISÉES
let customOrders = JSON.parse(localStorage.getItem('audimo_custom_orders') || '[]');

// PANIER (liste d'identifiants de catalogues)
let cart = JSON.parse(localStorage.getItem('audimo_cart') || '[]');

// CLIENT CONNECTÉ (page « Personnaliser un livre »)
let currentCustomer = JSON.parse(localStorage.getItem('audimo_customer') || 'null');

// ---------- MODE EN LIGNE (Firebase + Cloudinary) ----------
let adminToken = null, adminTokenTime = 0, adminPassMem = '';

async function firebaseSignIn(password) {
    const res = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=' + FIREBASE_API_KEY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: ADMIN_EMAIL, password, returnSecureToken: true })
    });
    if(!res.ok) throw new Error('auth');
    const data = await res.json();
    adminToken = data.idToken;
    adminTokenTime = Date.now();
}

async function getAdminToken() {
    if(!adminToken || Date.now() - adminTokenTime > 50 * 60 * 1000) await firebaseSignIn(adminPassMem);
    return adminToken;
}

async function cloudGet(path) {
    const res = await fetch(FIREBASE_BASE + path + '.json');
    if(!res.ok) throw new Error('cloud-get');
    return res.json();
}

async function cloudPut(path, value) {
    const token = await getAdminToken();
    const res = await fetch(FIREBASE_BASE + path + '.json?auth=' + token, { method: 'PUT', body: JSON.stringify(value) });
    if(!res.ok) throw new Error('cloud-put');
}

async function cloudinaryUpload(file) {
    const fd = new FormData();
    fd.append('file', file, file.name || 'cover.jpg');
    fd.append('upload_preset', CLOUDINARY_PRESET);
    const res = await fetch('https://api.cloudinary.com/v1_1/' + CLOUDINARY_CLOUD + '/auto/upload', { method: 'POST', body: fd });
    if(!res.ok) throw new Error('upload');
    const data = await res.json();
    return data.secure_url;
}

let pushQueue = Promise.resolve();
function pushSiteData() {
    const payload = JSON.stringify({
        categories: categoriesList,
        courses: coursesList.map(c => ({ ...c, unlocked: c.accessType === 'free' }))
    });
    pushQueue = pushQueue.then(() => cloudPut('/site/data', payload))
        .catch(e => { console.error(e); alert("Synchronisation en ligne impossible : vos changements n'ont pas été publiés pour les clients. Vérifiez votre connexion et réessayez."); });
    return pushQueue;
}

// Charge les catalogues et les livres publiés en ligne
async function cloudLoad() {
    if(!CLOUD_MODE) return;
    try {
        const raw = await cloudGet('/site/data');
        if(!raw) {
            if(isAdminLoggedIn) await pushSiteData(); // première publication
            return;
        }
        const d = JSON.parse(raw);
        const unlocked = JSON.parse(localStorage.getItem('audimo_unlocked') || '[]');
        categoriesList = d.categories || [];
        coursesList = (d.courses || []).map(c => ({ ...c, unlocked: c.accessType === 'free' || unlocked.includes(c.id) }));
        try {
            localStorage.setItem('audimo_cats', JSON.stringify(categoriesList));
            localStorage.setItem('audimo_courses', JSON.stringify(coursesList));
        } catch(e) {}
        renderNavigationAndHome();
        if(displayedCatId && document.getElementById('view-dynamic-cat').classList.contains('active')) renderCategoryPage(displayedCatId);
    } catch(e) { console.error('Chargement en ligne impossible', e); }
}

function saveDatabases() {
    try {
        localStorage.setItem('audimo_cats', JSON.stringify(categoriesList));
    localStorage.setItem('audimo_courses', JSON.stringify(coursesList));
    localStorage.setItem('audimo_custom_orders', JSON.stringify(customOrders));
    } catch(e) { console.error('Stockage plein', e); }
    if(CLOUD_MODE && isAdminLoggedIn) pushSiteData();
    renderNavigationAndHome();
}

function saveCart() {
    localStorage.setItem('audimo_cart', JSON.stringify(cart));
    updateCartBadge();
}

// ---------- LOGIQUE DU PANIER ----------
function getCatPrice(cat) {
    return Number(cat.price) >= 0 && cat.price !== undefined ? Number(cat.price) : DEFAULT_CAT_PRICE;
}

function formatPrice(n) {
    return n.toLocaleString('fr-FR') + ' FCFA';
}

function showToast(message) {
    const t = document.getElementById('toast');
    t.innerText = message;
    t.classList.add('show');
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => t.classList.remove('show'), 2200);
}

function updateCartBadge() {
    document.getElementById('cart-count').innerText = cart.length;
}

function addCatalogToCart(catId) {
    const cat = categoriesList.find(c => c.id === catId);
    if(!cat) return;
    if(cart.includes(catId)) {
        showToast('« ' + cat.name + ' » est déjà dans votre panier.');
        return;
    }
    cart.push(catId);
    saveCart();
    renderNavigationAndHome();
    showToast('« ' + cat.name + ' » ajouté au panier');
}

function removeFromCart(catId) {
    cart = cart.filter(id => id !== catId);
    saveCart();
    renderCart();
    renderNavigationAndHome();
}

function renderCart() {
    // On ignore les catalogues qui n'existent plus
    cart = cart.filter(id => categoriesList.some(c => c.id === id));
    saveCart();

    const wrapper = document.getElementById('cart-items-wrapper');
    if(cart.length === 0) {
        wrapper.innerHTML = `
            <div class="cart-empty">
                <p style="font-size:1.1rem; margin-bottom:1rem;">Votre panier est vide.</p>
                <button class="btn-submit" style="max-width:260px;" onclick="showView('home')">Découvrir les catalogues</button>
            </div>`;
        return;
    }

    let total = 0;
    const itemsHtml = cart.map(id => {
        const cat = categoriesList.find(c => c.id === id);
        const price = getCatPrice(cat);
        total += price;
        const count = coursesList.filter(c => c.cat === id).length;
        return `
            <div class="cart-item">
                <div class="cart-item-info">
                    <h4>${cat.name}</h4>
                    <p>${count} livre(s) audio dans ce catalogue</p>
                </div>
                <div class="cart-item-price">${formatPrice(price)}</div>
                <button class="cart-remove" onclick="removeFromCart('${id}')">Retirer</button>
            </div>`;
    }).join('');

    wrapper.innerHTML = itemsHtml + `
        <div class="cart-summary">
            <div class="cart-total"><span>Total à payer</span><span>${formatPrice(total)}</span></div>
            <button class="btn-submit" onclick="checkoutCart()">Payer avec Wave (${formatPrice(total)})</button>
        </div>`;
}

function checkoutCart() {
    if(cart.length === 0) return;
    const total = cart.reduce((sum, id) => {
        const cat = categoriesList.find(c => c.id === id);
        return sum + (cat ? getCatPrice(cat) : 0);
    }, 0);
    alert('Vous allez être redirigé vers la page de paiement sécurisé Wave (' + formatPrice(total) + ').');
    window.location.href = WAVE_BASE_URL + total;
}

// ---------- NAVIGATION ----------
function showView(viewId, catId = null) {
    document.querySelectorAll('.page-view').forEach(el => el.classList.remove('active'));
    if(catId) {
        document.getElementById('view-dynamic-cat').classList.add('active');
        renderCategoryPage(catId);
    } else {
        if(viewId === 'custom-order' && !currentCustomer) viewId = 'custom';
        document.getElementById('view-' + viewId).classList.add('active');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if(viewId === 'cart') renderCart();
    if(viewId === 'custom') prefillLogin();
    if(viewId === 'custom-order') renderOrderWelcome();
    if(viewId === 'admin' && isAdminLoggedIn) renderAdminDashboard();
}

function renderNavigationAndHome() {
    const dropdown = document.getElementById('nav-dropdown-links');
    const footerNav = document.getElementById('footer-nav-links');
    const selectAdmin = document.getElementById('new-cat-select');
    const selectDelete = document.getElementById('delete-cat-select');

    dropdown.innerHTML = categoriesList.map(c => `<a onclick="showView(null, '${c.id}')">${c.name}</a>`).join('');
    footerNav.innerHTML = `<li><a onclick="showView('home')">Accueil</a></li>` + categoriesList.map(c => `<li><a onclick="showView(null, '${c.id}')">${c.name}</a></li>`).join('');

    if(selectAdmin) selectAdmin.innerHTML = categoriesList.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    if(selectDelete) selectDelete.innerHTML = categoriesList.map(c => `<option value="${c.id}">${c.name}</option>`).join('');

    const grid = document.getElementById('home-catalog-grid');
    if(grid) {
        grid.innerHTML = categoriesList.map(item => {
            const count = coursesList.filter(c => c.cat === item.id).length;
            const inCart = cart.includes(item.id);
            return `
                <div class="cat-card">
                    <div class="cat-accent-stripe" style="background-color: ${item.stripeColor || '#FFCC00'};"></div>
                    <div class="cat-card-body">
                        <div class="cat-card-top">
                            <div class="cat-count-badge">${count} livres</div>
                        </div>
                        <h3 class="cat-title">${item.name}</h3>
                        <p class="cat-desc">${item.desc}</p>
                        <div class="cat-divider"></div>
                        <div class="cat-action-row">
                            <a class="cat-link-explorer" onclick="showView(null, '${item.id}')">Explorer</a>
                            <div class="cat-buy">
                                <span class="cat-price">${formatPrice(getCatPrice(item))}</span>
                                <button class="cat-add-btn ${inCart ? 'in-cart' : ''}" onclick="addCatalogToCart('${item.id}')" title="${inCart ? 'Déjà dans le panier' : 'Ajouter au panier'}" aria-label="Ajouter ${item.name} au panier">${inCart ? '✓' : '+'}</button>
                            </div>
                        </div>
                    </div>
                </div>`;
        }).join('');
    }
    updateCartBadge();
}

function renderCategoryPage(catId) {
    const cat = categoriesList.find(c => c.id === catId);
    if(!cat) return;
    renderCatComments(catId);
    document.getElementById('cat-banner-title').innerText = cat.name;
    document.getElementById('cat-banner-desc').innerText = cat.desc;

    const grid = document.getElementById('grid-dynamic-courses');
    const filtered = coursesList.filter(c => c.cat === catId);

    if(filtered.length === 0) {
        grid.innerHTML = `<p style="color:var(--text-muted)">Aucun contenu audio disponible dans ce catalogue pour le moment.</p>`;
        return;
    }

    grid.innerHTML = filtered.map(c => {
        const isPaid = c.accessType === 'paid' && !c.unlocked;

        return `
        <div class="course-card">
            <span class="course-badge ${c.accessType === 'free' ? 'badge-free' : 'badge-paid'}">
                ${c.accessType === 'free' ? 'Gratuit' : (c.unlocked ? 'Débloqué' : 'Payant')}
            </span>
            <img ${c.hasMedia ? `data-img-id="${c.id}"` : `src="${c.img && !c.img.startsWith('blob:') ? c.img : FALLBACK_COVER}"`} alt="Couverture">
            <div class="course-content">
                <h4 class="course-title">${c.title}</h4>
                <p class="course-duration">${c.audioName}</p>

                ${isPaid ? `
                    <button onclick="unlockCourse(${c.id})" class="btn-submit" style="background:#e74c3c; color:#fff; margin-top:auto;">
                        Acheter / Débloquer l'écoute
                    </button>
                ` : `
                    <button onclick="openPlayer(${c.id})" class="btn-submit" style="margin-top:auto;">${c.mediaType === 'video' ? 'Lire la vidéo' : 'Écouter le livre audio'}</button>
                `}
            </div>
        </div>`;
    }).join('');
    hydrateCourseMedia();
}

function unlockCourse(courseId) {
    const course = coursesList.find(c => c.id === courseId);
    if(course) {
        course.unlocked = true;
        const unlockedIds = JSON.parse(localStorage.getItem('audimo_unlocked') || '[]');
        if(!unlockedIds.includes(courseId)) { unlockedIds.push(courseId); localStorage.setItem('audimo_unlocked', JSON.stringify(unlockedIds)); }
        saveDatabases();
        alert('Félicitations ! Le livre a été débloqué. Vous pouvez maintenant l\'écouter directement sur AUDIMO.');
        renderCategoryPage(course.cat);
    }
}

// ---------- LIVRE PERSONNALISÉ : CONNEXION PUIS COMMANDE ----------
function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}

function prefillLogin() {
    if(!currentCustomer) return;
    document.getElementById('login-name').value = currentCustomer.name;
    document.getElementById('login-phone').value = currentCustomer.phone;
    document.getElementById('login-level').value = currentCustomer.level;
}

function handleCustomLogin(event) {
    event.preventDefault();
    const name = document.getElementById('login-name').value.trim();
    const phone = document.getElementById('login-phone').value.trim();
    const level = document.getElementById('login-level').value;
    if(phone.replace(/\D/g, '').length < 8) {
        alert('Veuillez entrer un numéro de téléphone valide.');
        return;
    }
    currentCustomer = { name, phone, level };
    localStorage.setItem('audimo_customer', JSON.stringify(currentCustomer));
    showView('custom-order');
}

function renderOrderWelcome() {
    if(!currentCustomer) return;
    document.getElementById('order-welcome').innerHTML =
        'Connecté : <strong>' + escapeHtml(currentCustomer.name) + '</strong> · ' + escapeHtml(currentCustomer.phone) +
        (currentCustomer.level ? ' · ' + escapeHtml(currentCustomer.level) : '') + ' — <a onclick="showView(\'custom\')">Modifier mes infos</a>';
}

// ---------- STOCKAGE DES FICHIERS (IndexedDB : PDF, audios, couvertures) ----------
let pdfDbPromise = null;
function openPdfDB() {
    if(pdfDbPromise) return pdfDbPromise;
    pdfDbPromise = new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pdfDbPromise = null; reject(new Error('blocked')); }, 10000);
        const req = indexedDB.open('audimo_pdfs', 2);
        req.onupgradeneeded = () => {
            const db = req.result;
            if(!db.objectStoreNames.contains('pdfs')) db.createObjectStore('pdfs');
            if(!db.objectStoreNames.contains('media')) db.createObjectStore('media');
        };
        req.onsuccess = () => {
            clearTimeout(timer);
            const db = req.result;
            db.onversionchange = () => { db.close(); pdfDbPromise = null; };
            resolve(db);
        };
        req.onerror = () => { clearTimeout(timer); pdfDbPromise = null; reject(req.error); };
    });
    return pdfDbPromise;
}

async function idbPut(store, key, value) {
    const db = await openPdfDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite');
        tx.objectStore(store).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

async function idbGet(store, key) {
    const db = await openPdfDB();
    return new Promise((resolve, reject) => {
        const req = db.transaction(store).objectStore(store).get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function idbDelete(store, key) {
    const db = await openPdfDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite');
        tx.objectStore(store).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

function savePdf(id, file) { return idbPut('pdfs', id, file); }
function getPdf(id) { return idbGet('pdfs', id); }

// Audios et couvertures des livres
const FALLBACK_COVER = "https://images.unsplash.com/photo-1461360370896-922624d12aa1?w=400";
const mediaUrlCache = {};

async function mediaUrl(key) {
    if(mediaUrlCache[key]) return mediaUrlCache[key];
    const file = await idbGet('media', key);
    if(!file) return null;
    mediaUrlCache[key] = URL.createObjectURL(file);
    return mediaUrlCache[key];
}

async function hydrateCourseMedia() {
    for(const img of document.querySelectorAll('img[data-img-id]')) {
        try { img.src = (await mediaUrl(img.dataset.imgId + '_img')) || FALLBACK_COVER; }
        catch(e) { img.src = FALLBACK_COVER; }
    }
    for(const au of document.querySelectorAll('audio[data-audio-id]')) {
        try {
            const url = await mediaUrl(au.dataset.audioId + '_audio');
            if(url) au.src = url;
        } catch(e) {}
    }
}

function invalidateMediaCache(key) {
    if(mediaUrlCache[key]) { URL.revokeObjectURL(mediaUrlCache[key]); delete mediaUrlCache[key]; }
}

function deleteCourseMedia(id) {
    ['_audio', '_img'].forEach(suffix => {
        const key = id + suffix;
        if(mediaUrlCache[key]) { URL.revokeObjectURL(mediaUrlCache[key]); delete mediaUrlCache[key]; }
        idbDelete('media', key).catch(() => {});
    });
}

// Admin : ouvrir le PDF dans un nouvel onglet
async function viewOrderPdf(id) {
    const w = window.open('', '_blank'); // ouvert tout de suite pour éviter le blocage des popups
    try {
        const file = await getPdf(id);
        if(!file) { if(w) w.close(); alert('PDF introuvable sur cet appareil.'); return; }
        const url = URL.createObjectURL(new Blob([file], { type: 'application/pdf' }));
        if(w) { w.location.href = url; } else { alert('Autorisez les fenêtres pop-up pour afficher le PDF.'); }
        setTimeout(() => URL.revokeObjectURL(url), 10 * 60 * 1000);
    } catch(e) {
        if(w) w.close();
        alert('Impossible de lire le PDF.');
    }
}

// Admin : télécharger le PDF
async function downloadOrderPdf(id) {
    try {
        const file = await getPdf(id);
        const order = customOrders.find(o => o.id === id);
        if(!file) { alert('PDF introuvable sur cet appareil.'); return; }
        const url = URL.createObjectURL(new Blob([file], { type: 'application/pdf' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = (order && order.pdfName) ? order.pdfName : 'cours.pdf';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch(e) {
        alert('Impossible de télécharger le PDF.');
    }
}

// VALIDATION DE LA COMMANDE + REDIRECTION WAVE
async function handleCustomOrder(event) {
    event.preventDefault();
    if(!currentCustomer) { showView('custom'); return; }
    const form = event.target;
    const pdfFile = document.getElementById('order-pdf').files[0];
    const melody = document.getElementById('order-melody').value.trim();
    const design = document.getElementById('order-design').value.trim();
    const id = Date.now();

    try {
        await savePdf(id, pdfFile);
    } catch(e) {
        alert("Impossible d'enregistrer le PDF sur cet appareil. Vérifiez l'espace disponible ou essayez un fichier plus léger.");
        return;
    }

    customOrders.push({
        id,
        date: new Date().toLocaleDateString('fr-FR') + ' ' + new Date().toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'}),
        name: currentCustomer.name,
        phone: currentCustomer.phone,
        level: currentCustomer.level,
        pdfName: pdfFile.name,
        hasPdf: true,
        melody,
        design
    });
    saveDatabases();
    form.reset();

    alert('Commande enregistrée ! Vous allez être redirigé vers la page de paiement sécurisé Wave (2000 FCFA).');
    window.location.href = "https://pay.wave.com/m/M_ci_gSxGrNtAyFwp/c/ci/?amount=2000";
}

// ---------- COMMENTAIRES DU CATALOGUE ----------
let displayedCatId = null;

async function loadCatComments(catId) {
    if(FIREBASE_BASE) {
        const res = await fetch(FIREBASE_BASE + '/comments/' + catId + '.json');
        if(!res.ok) throw new Error('load');
        const data = await res.json();
        return data ? Object.values(data).sort((a, b) => (a.ts || 0) - (b.ts || 0)) : [];
    }
    const cat = categoriesList.find(c => c.id === catId);
    return (cat && cat.comments) || [];
}

function renderCatComments(catId) {
    const cat = categoriesList.find(c => c.id === catId);
    const box = document.getElementById('cat-comments-section');
    if(!cat || !box) return;
    displayedCatId = catId;
    box.innerHTML = `
        <h3>Commentaires sur ce catalogue (<span id="cat-comments-count">…</span>)</h3>
        <div class="cat-comments-list" id="cat-comments-list"><p style="color:var(--text-muted)">Chargement des commentaires...</p></div>
        <form class="cat-comment-form" onsubmit="addCatComment(event, '${catId}')">
            <select>
                <option value="5">5/5 - Excellent</option>
                <option value="4">4/5 - Très bien</option>
                <option value="3">3/5 - Bien</option>
                <option value="2">2/5 - Moyen</option>
                <option value="1">1/5 - Insuffisant</option>
            </select>
            <textarea rows="3" maxlength="500" placeholder="Écrivez votre commentaire (aucun nom demandé)..." required></textarea>
            <button type="submit" class="btn-submit">Publier mon commentaire</button>
        </form>`;
    refreshCatCommentList(catId);
}

async function refreshCatCommentList(catId) {
    const listBox = document.getElementById('cat-comments-list');
    const countBox = document.getElementById('cat-comments-count');
    if(!listBox || !countBox) return;
    try {
        const list = await loadCatComments(catId);
        if(displayedCatId !== catId) return;
        countBox.innerText = list.length;
        listBox.innerHTML = list.length ? list.slice().reverse().map(c => `
            <div class="cat-comment">
                <div class="cat-comment-head"><strong>${escapeHtml(c.user || 'Anonyme')}</strong><span>${escapeHtml(c.rating)}/5 · ${escapeHtml(c.date)}</span></div>
                <p>${escapeHtml(c.text)}</p>
            </div>`).join('') : '<p style="color:var(--text-muted)">Aucun commentaire pour le moment. Soyez le premier à donner votre avis !</p>';
    } catch(e) {
        if(displayedCatId !== catId) return;
        countBox.innerText = '0';
        listBox.innerHTML = '<p style="color:var(--text-muted)">Impossible de charger les commentaires pour le moment.</p>';
    }
}

async function addCatComment(event, catId) {
    event.preventDefault();
    const f = event.target;
    const btn = f.querySelector('button');
    const comment = {
        user: '',
        rating: f.elements[0].value,
        text: f.elements[1].value.trim(),
        date: new Date().toLocaleDateString('fr-FR'),
        ts: Date.now()
    };
    btn.disabled = true;
    try {
        if(FIREBASE_BASE) {
            const res = await fetch(FIREBASE_BASE + '/comments/' + catId + '.json', { method: 'POST', body: JSON.stringify(comment) });
            if(!res.ok) throw new Error('save');
        } else {
            const cat = categoriesList.find(c => c.id === catId);
            if(!cat) return;
            if(!cat.comments) cat.comments = [];
            cat.comments.push(comment);
            saveDatabases();
        }
        f.reset();
        showToast('Commentaire publié');
        refreshCatCommentList(catId);
    } catch(e) {
        alert("Impossible de publier le commentaire. Vérifiez votre connexion et réessayez.");
    } finally {
        btn.disabled = false;
    }
}

// LOGIQUE ADMIN
async function handleAdminLogin(event) {
    event.preventDefault();
    const pass = document.getElementById('admin-pass').value;
    if(CLOUD_MODE) {
        try {
            await firebaseSignIn(pass);
            adminPassMem = pass;
        } catch(e) {
            alert(e.message === 'auth' ? 'Mot de passe administrateur incorrect.' : 'Connexion au serveur impossible. Vérifiez votre connexion internet.');
            return;
        }
    } else if(pass !== ADMIN_PASSWORD) {
        alert('Mot de passe administrateur incorrect.');
        return;
    }
    isAdminLoggedIn = true;
    document.getElementById('admin-auth-sec').style.display = 'none';
    document.getElementById('admin-dash-sec').style.display = 'block';
    if(CLOUD_MODE) await cloudLoad();
    renderAdminDashboard();
}

function adminLogout() {
    isAdminLoggedIn = false;
    adminToken = null;
    adminPassMem = '';
    document.getElementById('admin-auth-sec').style.display = 'block';
    document.getElementById('admin-dash-sec').style.display = 'none';
    document.getElementById('admin-pass').value = '';
}

function renderAdminDashboard() {
    const totalCourses = coursesList.length;
    const totalCats = categoriesList.length;
    const totalCustomOrders = customOrders.length;

    document.getElementById('admin-stats-container').innerHTML = `
        <div class="stat-box"><h4>${totalCourses}</h4><p>Livres Enregistrés</p></div>
        <div class="stat-box"><h4>${totalCats}</h4><p>Catalogues Actifs</p></div>
        <div class="stat-box"><h4>${totalCustomOrders}</h4><p>Commandes Personnalisées</p></div>
    `;

    document.getElementById('orders-count').innerText = totalCustomOrders;

    // Tableau des livres publiés
    const catName = id => { const c = categoriesList.find(x => x.id === id); return c ? c.name : id; };
    document.getElementById('courses-count').innerText = totalCourses;
    const courseRows = [];
    categoriesList.forEach(cat => {
        const books = coursesList.filter(c => c.cat === cat.id);
        books.forEach((c, i) => courseRows.push(`
        <tr>
            <td style="white-space:nowrap;">
                <input type="number" class="pos-input" min="1" max="${books.length}" value="${i + 1}" onchange="moveCourseTo(${c.id}, this.value)" aria-label="Position du livre">
                <span style="color:var(--text-muted);">sur ${books.length}</span>
                <button class="pdf-btn" onclick="moveCourseBy(${c.id}, -1)" ${i === 0 ? 'disabled' : ''}>Monter</button>
                <button class="pdf-btn" onclick="moveCourseBy(${c.id}, 1)" ${i === books.length - 1 ? 'disabled' : ''}>Descendre</button>
            </td>
            <td>${escapeHtml(c.title)}</td>
            <td>${escapeHtml(cat.name)}</td>
            <td>${c.accessType === 'free' ? 'Gratuit' : 'Payant'}</td>
            <td>${c.mediaType === 'video' ? 'Vidéo' : 'Audio'}</td>
            <td style="white-space:nowrap;"><button class="pdf-btn" onclick="editCourse(${c.id})">Modifier</button> <button class="btn-logout" onclick="deleteCourse(${c.id})">Supprimer</button></td>
        </tr>`));
    });
    document.getElementById('admin-courses-list').innerHTML = courseRows.length ? courseRows.join('') : '<tr><td colspan="6" style="text-align:center; color:var(--text-muted)">Aucun livre publié.</td></tr>';

    // Rendu du tableau des commandes personnalisées
    const ordersTbody = document.getElementById('admin-custom-orders-list');
    if(customOrders.length === 0) {
        ordersTbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-muted)">Aucune commande personnalisée pour le moment.</td></tr>`;
    } else {
        ordersTbody.innerHTML = customOrders.map(o => `
            <tr>
                <td>${o.date}</td>
                <td><strong>${o.name}</strong></td>
                <td>${o.phone}</td>
                <td><span style="background:var(--accent); color:#121212; padding:0.2rem 0.5rem; border-radius:4px; font-weight:700;">${escapeHtml(o.level || 'Non précisé')}</span></td>
                <td>${escapeHtml(o.melody || o.title || '-')}</td>
                <td>${escapeHtml(o.design || o.desc || '-')}</td>
                <td>
                    <code>${escapeHtml(o.pdfName)}</code>
                    ${o.hasPdf ? `
                        <div style="display:flex; gap:0.4rem; margin-top:0.4rem;">
                            <button class="pdf-btn" onclick="viewOrderPdf(${o.id})">👁 Voir</button>
                            <button class="pdf-btn" onclick="downloadOrderPdf(${o.id})">⬇ Télécharger</button>
                        </div>` : `<div style="color:var(--text-muted); font-size:0.75rem; margin-top:0.3rem;">PDF non conservé</div>`}
                </td>
            </tr>
        `).join('');
    }
}

function addNewCategory(event) {
    event.preventDefault();
    const name = document.getElementById('new-cat-name').value;
    const desc = document.getElementById('new-cat-desc').value;
    const price = parseInt(document.getElementById('new-cat-price').value, 10) || 0;
    const id = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, '_');

    categoriesList.push({ id, name, stripeColor: "#3b82f6", desc, price });
    saveDatabases();
    alert('Catalogue ajouté avec succès !');
    event.target.reset();
    renderAdminDashboard();
}

// ---------- LECTEUR AUDIO (STYLE APPLICATION DE MUSIQUE) ----------
const PLAYER_SPEEDS = [1, 1.25, 1.5, 1.75, 2, 0.75];
let playerSpeedIndex = 0;
let playerCourseId = null;
let playerSeeking = false;
let playerLastSaved = 0;
const COVER_RATIO = 2000 / 1414;

const ICON_PLAY = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
const ICON_PAUSE = '<svg viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>';

function formatTime(sec) {
    if(!isFinite(sec) || sec < 0) sec = 0;
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), r = Math.floor(sec % 60);
    return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(r).padStart(2, '0');
}

async function openPlayer(courseId) {
    const c = coursesList.find(x => x.id === courseId);
    if(!c || (c.accessType === 'paid' && !c.unlocked)) return;
    const cat = categoriesList.find(x => x.id === c.cat);
    let src = c.audioUrl || '';
    let cover = (c.img && !c.img.startsWith('blob:')) ? c.img : FALLBACK_COVER;
    if(c.hasMedia) {
        src = (await mediaUrl(c.id + '_audio')) || '';
        cover = (await mediaUrl(c.id + '_img')) || FALLBACK_COVER;
    }
    if(!src) { alert("Le fichier audio de ce livre est introuvable sur cet appareil."); return; }

    const au = document.getElementById('player-audio');
    playerCourseId = courseId;
    document.getElementById('player-cover').src = cover;
    const isVideo = c.mediaType === 'video';
    document.getElementById('player-cover').style.display = isVideo ? 'none' : 'block';
    au.classList.toggle('active', isVideo);
    if(isVideo) au.poster = cover; else au.removeAttribute('poster');
    document.getElementById('player-fs').style.display = isVideo ? 'inline-block' : 'none';
    document.getElementById('player-title').innerText = c.title;
    document.getElementById('player-cat').innerText = cat ? cat.name : '';
    document.getElementById('player-play').innerHTML = ICON_PLAY;
    document.getElementById('player-seek').value = 0;
    document.getElementById('player-current').innerText = '0:00';
    document.getElementById('player-total').innerText = '0:00';

    au.src = src;
    au.playbackRate = PLAYER_SPEEDS[playerSpeedIndex];
    au.volume = parseFloat(document.getElementById('player-volume').value);
    const saved = parseFloat(localStorage.getItem('audimo_pos_' + courseId) || '0');
    au.onloadedmetadata = () => {
        if(saved > 5 && saved < au.duration - 5) au.currentTime = saved; // reprise là où le client s'est arrêté
    };
    document.getElementById('player-overlay').classList.add('active');
    document.body.style.overflow = 'hidden';
    au.play().catch(() => {});

    if('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({ title: c.title, artist: 'AUDIMO', album: cat ? cat.name : '', artwork: [{ src: cover }] });
        navigator.mediaSession.setActionHandler('play', () => au.play());
        navigator.mediaSession.setActionHandler('pause', () => au.pause());
        navigator.mediaSession.setActionHandler('seekbackward', () => skipPlayer(-15));
        navigator.mediaSession.setActionHandler('seekforward', () => skipPlayer(15));
    }
}

function closePlayer() {
    const au = document.getElementById('player-audio');
    au.pause();
    au.removeAttribute('src');
    au.load();
    document.getElementById('player-overlay').classList.remove('active');
    document.body.style.overflow = '';
    playerCourseId = null;
}

function togglePlayer() {
    const au = document.getElementById('player-audio');
    if(au.paused) au.play().catch(() => {}); else au.pause();
}

function skipPlayer(delta) {
    const au = document.getElementById('player-audio');
    au.currentTime = Math.max(0, Math.min((au.duration || 0), au.currentTime + delta));
}

function fullscreenPlayer() {
    const v = document.getElementById('player-audio');
    if(v.requestFullscreen) v.requestFullscreen();
    else if(v.webkitEnterFullscreen) v.webkitEnterFullscreen();
}

function cyclePlayerSpeed() {
    playerSpeedIndex = (playerSpeedIndex + 1) % PLAYER_SPEEDS.length;
    const speed = PLAYER_SPEEDS[playerSpeedIndex];
    document.getElementById('player-audio').playbackRate = speed;
    document.getElementById('player-speed').innerText = speed + 'x';
}

(function initPlayer() {
    const au = document.getElementById('player-audio');
    const seek = document.getElementById('player-seek');
    au.addEventListener('loadedmetadata', () => {
        seek.max = au.duration || 100;
        document.getElementById('player-total').innerText = formatTime(au.duration);
    });
    au.addEventListener('timeupdate', () => {
        if(!playerSeeking) seek.value = au.currentTime;
        document.getElementById('player-current').innerText = formatTime(au.currentTime);
        if(playerCourseId && Math.abs(au.currentTime - playerLastSaved) > 5) {
            playerLastSaved = au.currentTime;
            try { localStorage.setItem('audimo_pos_' + playerCourseId, au.currentTime); } catch(e) {}
        }
    });
    au.addEventListener('play', () => { document.getElementById('player-play').innerHTML = ICON_PAUSE; });
    au.addEventListener('pause', () => { document.getElementById('player-play').innerHTML = ICON_PLAY; });
    au.addEventListener('ended', () => {
        if(playerCourseId) localStorage.removeItem('audimo_pos_' + playerCourseId);
        seek.value = 0;
    });
    seek.addEventListener('pointerdown', () => { playerSeeking = true; });
    seek.addEventListener('input', () => {
        document.getElementById('player-current').innerText = formatTime(parseFloat(seek.value));
    });
    seek.addEventListener('change', () => { au.currentTime = parseFloat(seek.value); playerSeeking = false; });
    document.getElementById('player-volume').addEventListener('input', e => { au.volume = parseFloat(e.target.value); });
    document.addEventListener('keydown', e => { if(e.key === 'Escape' && !document.fullscreenElement) closePlayer(); });
    document.addEventListener('fullscreenchange', () => { au.controls = !!document.fullscreenElement; });
})();

// Vérifie que la couverture a le même format que la couverture modèle
function getImageRatio(file) {
    return new Promise(resolve => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        setTimeout(() => resolve(null), 4000);
        img.onload = () => { URL.revokeObjectURL(url); resolve(img.width / img.height); };
        img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
        img.src = url;
    });
}

function isVideoFile(file) {
    return file.type.startsWith('video/') || /\.(mp4|webm|mov|m4v|ogv)$/i.test(file.name);
}

// Crée une couverture à partir d'une image de la vidéo
function captureVideoFrame(file) {
    return new Promise(resolve => {
        const url = URL.createObjectURL(file);
        const v = document.createElement('video');
        v.muted = true; v.playsInline = true; v.preload = 'auto';
        let timer;
        const done = blob => { clearTimeout(timer); URL.revokeObjectURL(url); resolve(blob); };
        timer = setTimeout(() => done(null), 10000);
        v.onloadeddata = () => { v.currentTime = Math.min(1, (v.duration || 2) / 2); };
        v.onseeked = () => {
            try {
                if(!v.videoWidth) return done(null);
                const w = Math.min(v.videoWidth, 1000);
                const h = Math.round(w * v.videoHeight / v.videoWidth);
                const canvas = document.createElement('canvas');
                canvas.width = w; canvas.height = h;
                canvas.getContext('2d').drawImage(v, 0, 0, w, h);
                canvas.toBlob(blob => done(blob), 'image/jpeg', 0.85);
            } catch(e) { done(null); }
        };
        v.onerror = () => done(null);
        v.src = url;
    });
}

// Enregistre les fichiers d'un livre : en ligne (Cloudinary) ou sur cet appareil (mode local)
async function storeCourseFiles(course, mediaFile, coverBlob) {
    if(CLOUD_MODE) {
        if(mediaFile) { showToast('Envoi en ligne en cours, patientez...'); course.audioUrl = await cloudinaryUpload(mediaFile); course.hasMedia = false; }
        if(coverBlob) course.img = await cloudinaryUpload(coverBlob);
    } else {
        if(mediaFile) { invalidateMediaCache(course.id + '_audio'); await idbPut('media', course.id + '_audio', mediaFile); course.hasMedia = true; }
        if(coverBlob) { invalidateMediaCache(course.id + '_img'); await idbPut('media', course.id + '_img', coverBlob); }
    }
}

function uploadErrorMessage() {
    return CLOUD_MODE
        ? "L'envoi en ligne a échoué. Vérifiez votre connexion et la taille du fichier (100 Mo maximum pour une vidéo), puis réessayez."
        : "Impossible d'enregistrer les fichiers sur cet appareil. Fermez les autres onglets du site, vérifiez l'espace disponible, puis réessayez.";
}

async function addNewCourse(event) {
    event.preventDefault();
    const form = event.target;
    const btn = form.querySelector('button[type="submit"]');
    const title = document.getElementById('new-title').value.trim();
    const cat = document.getElementById('new-cat-select').value;
    const accessType = document.getElementById('new-access-type').value;
    const mediaFile = document.getElementById('new-media-file').files[0];
    const imgFile = document.getElementById('new-img-file').files[0];
    const isVideo = isVideoFile(mediaFile);
    const id = Date.now();

    if(isVideo && !document.createElement('video').canPlayType(mediaFile.type || 'video/mp4')) {
        if(!confirm("Ce format vidéo risque de ne pas être lu par tous les navigateurs. Le format MP4 est recommandé. Continuer quand même ?")) return;
    }
    if(imgFile) {
        const ratio = await getImageRatio(imgFile);
        if(ratio && Math.abs(ratio - COVER_RATIO) / COVER_RATIO > 0.05) {
            if(!confirm("Cette couverture n'a pas le même format que ta couverture modèle (paysage 2000 x 1414). Elle sera recadrée à l'affichage. Continuer quand même ?")) return;
        }
    }

    btn.disabled = true;
    try {
        let coverBlob = imgFile || null;
        if(!coverBlob && isVideo) {
            showToast('Création de la couverture à partir de la vidéo...');
            coverBlob = await captureVideoFrame(mediaFile);
        }
        const course = {
            id, cat, title, accessType,
            unlocked: accessType === 'free',
            audioName: mediaFile.name,
            audioUrl: '',
            mediaType: isVideo ? 'video' : 'audio',
            hasMedia: false,
            img: '',
            reviews: []
        };
        await storeCourseFiles(course, mediaFile, coverBlob);
        coursesList.push(course);
        saveDatabases();
        alert(isVideo ? 'Livre vidéo publié avec succès !' : 'Livre audio publié avec succès !');
        form.reset();
        renderAdminDashboard();
    } catch(e) {
        console.error(e);
        deleteCourseMedia(id);
        alert(uploadErrorMessage());
    } finally {
        btn.disabled = false;
    }
}

// Modification d'un livre depuis l'admin
let editingCourseId = null;

function editCourse(id) {
    const c = coursesList.find(x => x.id === id);
    if(!c) return;
    editingCourseId = id;
    document.getElementById('edit-title').value = c.title;
    document.getElementById('edit-cat').innerHTML = categoriesList.map(k => `<option value="${k.id}" ${k.id === c.cat ? 'selected' : ''}>${escapeHtml(k.name)}</option>`).join('');
    document.getElementById('edit-access').value = c.accessType;
    document.getElementById('edit-media-file').value = '';
    document.getElementById('edit-img-file').value = '';
    document.getElementById('edit-current-file').innerText = c.audioName || 'aucun';
    const card = document.getElementById('edit-course-card');
    card.style.display = 'block';
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function cancelEditCourse() {
    editingCourseId = null;
    document.getElementById('edit-course-card').style.display = 'none';
}

async function saveCourseEdit(event) {
    event.preventDefault();
    const c = coursesList.find(x => x.id === editingCourseId);
    if(!c) return;
    const btn = event.target.querySelector('button[type="submit"]');
    const title = document.getElementById('edit-title').value.trim();
    const cat = document.getElementById('edit-cat').value;
    const accessType = document.getElementById('edit-access').value;
    const mediaFile = document.getElementById('edit-media-file').files[0] || null;
    const coverFile = document.getElementById('edit-img-file').files[0] || null;

    if(!CLOUD_MODE && !c.hasMedia && coverFile && !mediaFile) {
        alert("Pour ce livre, importe aussi le fichier audio ou vidéo en même temps que la nouvelle couverture.");
        return;
    }
    if(coverFile) {
        const ratio = await getImageRatio(coverFile);
        if(ratio && Math.abs(ratio - COVER_RATIO) / COVER_RATIO > 0.05) {
            if(!confirm("Cette couverture n'a pas le même format que ta couverture modèle (paysage 2000 x 1414). Elle sera recadrée à l'affichage. Continuer quand même ?")) return;
        }
    }

    btn.disabled = true;
    try {
        await storeCourseFiles(c, mediaFile, coverFile);
        if(mediaFile) {
            c.audioName = mediaFile.name;
            c.mediaType = isVideoFile(mediaFile) ? 'video' : 'audio';
        }
        c.title = title;
        if(c.cat !== cat) {
            coursesList = coursesList.filter(x => x.id !== c.id);
            c.cat = cat;
            coursesList.push(c);
        }
        if(c.accessType !== accessType) {
            c.accessType = accessType;
            c.unlocked = accessType === 'free';
        }
        saveDatabases();
        renderAdminDashboard();
        cancelEditCourse();
        showToast('Livre modifié');
    } catch(e) {
        console.error(e);
        alert(uploadErrorMessage());
    } finally {
        btn.disabled = false;
    }
}

// Position d'un livre dans son catalogue (1 = premier). L'ordre du catalogue suit cette position.
function moveCourseTo(id, pos) {
    const c = coursesList.find(x => x.id === id);
    if(!c) return;
    const same = coursesList.filter(x => x.cat === c.cat);
    const from = same.findIndex(x => x.id === id);
    let to = parseInt(pos, 10);
    if(isNaN(to)) { renderAdminDashboard(); return; }
    to = Math.max(1, Math.min(same.length, to)) - 1;
    if(to === from) { renderAdminDashboard(); return; }
    same.splice(from, 1);
    same.splice(to, 0, c);
    let k = 0;
    coursesList = coursesList.map(x => x.cat === c.cat ? same[k++] : x);
    saveDatabases();
    renderAdminDashboard();
    showToast('Position mise à jour');
}

function moveCourseBy(id, delta) {
    const c = coursesList.find(x => x.id === id);
    if(!c) return;
    const same = coursesList.filter(x => x.cat === c.cat);
    moveCourseTo(id, same.findIndex(x => x.id === id) + 1 + delta);
}

// Suppression d'un livre depuis l'admin
function deleteCourse(id) {
    const c = coursesList.find(x => x.id === id);
    if(!c) return;
    if(!confirm('Supprimer définitivement le livre « ' + c.title + ' » ?')) return;
    deleteCourseMedia(id);
    coursesList = coursesList.filter(x => x.id !== id);
    saveDatabases();
    renderAdminDashboard();
    showToast('Livre supprimé');
}

function deleteCategory() {
    const catId = document.getElementById('delete-cat-select').value;
    categoriesList = categoriesList.filter(c => c.id !== catId);
    coursesList.filter(c => c.cat === catId).forEach(c => deleteCourseMedia(c.id));
    coursesList = coursesList.filter(c => c.cat !== catId);
    cart = cart.filter(id => id !== catId);
    saveCart();
    saveDatabases();
    renderAdminDashboard();
    alert('Catalogue supprimé avec succès.');
}

renderNavigationAndHome();
cloudLoad();
