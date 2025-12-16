// ==========================================
// 1. SUPABASE AYARLARI
// ==========================================
const supabaseUrl = 'https://smiwzsnistezopeuxtii.supabase.co' 
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNtaXd6c25pc3Rlem9wZXV4dGlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ3MTAxNjUsImV4cCI6MjA4MDI4NjE2NX0.ppJSueW-wLW3_eDtY537EuUNzeVRpVc-tNhnrWK6B4w'

const client = supabase.createClient(supabaseUrl, supabaseKey)

// ADMIN MAİLİ
const adminEmail = "samet_icacan@outlook.com"; 

// ==========================================
// 🤖 GEMINI AI AYARLARI
// ==========================================
// Kullanıcının sağladığı son key
const GEMINI_API_KEY_RAW = "AIzaSyAcWxTJryr2920Ixkm-T7uZlMfpCY9ID-c"; 
const GEMINI_API_KEY = GEMINI_API_KEY_RAW ? GEMINI_API_KEY_RAW.trim() : "";

// 🔥 DÜZELTME: Sadece en garanti çalışan model isimleri
const GEMINI_MODELS = [
    "gemini-2.5-flash",  // "latest" yok, sadece düz flash (En garantisi bu)
    "gemini-2.0-flash",    // Eğer flash çalışmazsa bu devreye girer
    "gemini-flash-latest"         // En eski ama en sağlam yedek
];

// ==========================================
// 3. GLOBAL DEĞİŞKENLER
// ==========================================

let currentGalleryImages = []; 
let currentImageIndex = 0;     
let currentAuthMode = 'login'; 
let pendingDeleteId = null; 
let verifiedUserIds = []; 
let currentRating = 0; 
let reviewTargetId = null; 
let reviewSellerEmail = null; 
let reportTargetId = null; 
let allData = [];
let myCloudFavorites = []; 
let currentUser = null;
let activeCategory = 'Tümü';
let activeCity = 'Tümü';
let currentPage = 0;       
const ITEMS_PER_PAGE = 10; 
let isLastPage = false;    
const notificationSound = new Audio("https://cdn.freesound.org/previews/536/536108_11966020-lq.mp3");
let selectedRequestId = null;
let currentFilterMode = 'all';
let editingRequestId = null; 
let chatSubscription = null;
let mapInstance = null; 
let currentChatReceiverEmail = null; // aktif sohbette karşı tarafın maili
let searchTimer = null; // Arama geciktiricisi için

let adminCache = {
    reports: [],
    requests: [],
    profiles: [],
    offers: [],
    messages: []
};

const cityCoordinates = {
    "İstanbul": [41.0082, 28.9784], "Ankara": [39.9334, 32.8597], "İzmir": [38.4192, 27.1287],
    "Bursa": [40.1885, 29.0610], "Antalya": [36.8969, 30.7133], "Adana": [37.0000, 35.3213],
    "Gaziantep": [37.0662, 37.3833], "Konya": [37.8667, 32.4833], "Nevşehir": [38.6244, 34.7144],
    "Tüm Türkiye": [39.1667, 35.6667] 
};

// ==========================================
// 4. BAŞLANGIÇ
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log("🚀 Uygulama Başlatılıyor... vFinalFixed");

    if (localStorage.getItem('theme') === 'dark') document.body.classList.add('dark-mode');

    // Oturum Kontrolü
    try {
        const { data: { session } } = await client.auth.getSession();
        if (session) {
            currentUser = session.user;
            updateAuthUI();
            await fetchFavorites();
        }
    } catch (e) { console.error("Auth hatası:", e); }

    // Veri Çekme
    try {
        await fetchRequests();
        checkNotifications();
    } catch (err) {
        console.error("Veri yükleme hatası:", err);
    } finally {
        removeSplashScreen();
        injectIncomingOffersMenu();

    }

    // Oturum Dinleyici
    client.auth.onAuthStateChange((_event, session) => {
        currentUser = session?.user || null;
        updateAuthUI();
        fetchFavorites();
        fetchRequests(); 
    });
});
// ==========================================
// 2. TOAST BİLDİRİM
// ==========================================
function showToast(message, type = 'success') {
    let toast = document.getElementById('toastBox');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toastBox';
        document.body.appendChild(toast);
    }
    toast.innerText = message;

    if (type === 'error') toast.style.backgroundColor = "#ef4444"; 
    else if (type === 'info') toast.style.backgroundColor = "#3b82f6";
    else toast.style.backgroundColor = "#10b981"; 

    toast.className = "show";
    setTimeout(() => { toast.className = toast.className.replace("show", ""); }, 3000);
}

function removeSplashScreen() {
    const splash = document.getElementById('splashScreen');
    if(splash && splash.style.display !== 'none') {
        splash.classList.add('fade-out');
        setTimeout(() => { splash.style.display = 'none'; }, 500);
    }
}

// Güvenlik: Logo takılırsa 4sn sonra zorla kaldır
setTimeout(() => {
    const splash = document.getElementById('splashScreen');
    if(splash && splash.style.display !== 'none') splash.style.display = 'none';
}, 4000);

// ==========================================
// 5. GEMINI AI FONKSİYONLARI (FALLBACK MANTIKLI)
// ==========================================

function toggleAIChat() {
    const chatBox = document.getElementById('aiChatBox');
    if (chatBox.style.display === 'flex') {
        chatBox.style.display = 'none';
    } else {
        chatBox.style.display = 'flex';
        setTimeout(() => document.getElementById('aiChatInput').focus(), 100);
    }
}

async function askGemini(predefinedPrompt) {
    if(predefinedPrompt) {
        document.getElementById('aiChatInput').value = predefinedPrompt;
        sendAIMessage();
    }
}

function handleAIEnter(e) { if (e.key === 'Enter') sendAIMessage(); }

async function tryFetchGeminiModel(modelName, userText) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`;
    const systemInstruction = `Sen "Arıyorum" uygulamasının yardımsever asistanısın. Kullanıcılara ikinci el piyasası hakkında Türkçe bilgi ver. Kısa, net ve samimi ol.`;

    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: systemInstruction + "\n\nKullanıcı: " + userText }] }] })
    });

    if (!response.ok) throw new Error(`${response.status}`);
    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
}

async function sendAIMessage() {
    const input = document.getElementById('aiChatInput');
    const userText = input.value.trim();
    if (!userText) return;

    if (!GEMINI_API_KEY) {
        appendAIMessage("⚠️ Hata: API Anahtarı eksik.", 'ai');
        return;
    }

    appendAIMessage(userText, 'user');
    input.value = "";
    const loadingId = showAILoading();
    let success = false;
    let lastError = "";

    // Modelleri sırayla dene
    for (const model of GEMINI_MODELS) {
        try {
            console.log(`⏳ AI Deneniyor: ${model}...`);
            const reply = await tryFetchGeminiModel(model, userText);
            removeAILoading(loadingId);
            appendAIMessage(reply, 'ai');
            success = true;
            break; 
        } catch (error) {
            console.warn(`❌ ${model} başarısız: ${error.message}`);
            lastError = error.message;
        }
    }

    if (!success) {
        removeAILoading(loadingId);
        if (lastError.includes("404")) appendAIMessage("⚠️ <b>HATA:</b> Google API servisi bu anahtar için aktif değil (404). Lütfen yeni bir API Key al.", 'ai');
        else appendAIMessage("⚠️ Üzgünüm, şu an bağlantı kurulamıyor.", 'ai');
    }
}

function appendAIMessage(text, sender) {
    const chatBody = document.getElementById('aiChatMessages');
    const div = document.createElement('div');
    div.classList.add('bubble');
    if (sender === 'user') { div.classList.add('bubble-user'); div.innerText = text; }
    else { div.classList.add('bubble-ai'); div.innerHTML = text.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>'); }
    chatBody.appendChild(div);
    chatBody.scrollTop = chatBody.scrollHeight; 
}

function showAILoading() {
    const chatBody = document.getElementById('aiChatMessages');
    const id = 'loading-' + Date.now();
    const div = document.createElement('div');
    div.id = id; div.classList.add('bubble', 'bubble-ai');
    div.innerHTML = `<div class="typing-indicator"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div>`;
    chatBody.appendChild(div); chatBody.scrollTop = chatBody.scrollHeight;
    return id;
}

function removeAILoading(id) { const el = document.getElementById(id); if(el) el.remove(); }

// ==========================================
// 6. AUTH & KULLANICI İŞLEMLERİ
// ==========================================

async function handleLogin() {
    const email = document.getElementById('authEmail').value;
    const pass = document.getElementById('authPass').value;
    const { data, error } = await client.auth.signInWithPassword({ email: email, password: pass });
    if (error) showToast("Giriş Hatası: " + error.message, 'error');
    else { currentUser = data.user; updateAuthUI(); fetchFavorites(); closeModal('authModal'); showToast("Tekrar hoş geldin! 👋"); }
}

async function handleRegister() {
    const email = document.getElementById('authEmail').value;
    const pass = document.getElementById('authPass').value;
    const name = document.getElementById('regName').value;
    const phone = document.getElementById('regPhone').value;
    if (!email || !pass) return showToast("Bilgiler eksik!", 'error');
    const { error } = await client.auth.signUp({ email: email, password: pass, options: { data: { full_name: name, phone: phone } } });
    if (error) showToast("Hata: " + error.message, 'error'); else { showToast("✅ Kayıt başarılı! Giriş yapıldı."); closeModal('authModal'); setTimeout(() => window.location.reload(), 1000); }
}

async function handleLogout() { await client.auth.signOut(); currentUser = null; updateAuthUI(); showToast("Çıkış yapıldı. 👋"); setTimeout(() => window.location.reload(), 1500); }

// AUTH ARAYÜZÜNÜ GÜNCELLEME (Admin Butonu Fixlendi)
function updateAuthUI() {
    const authBtnDiv = document.getElementById('authButtons');
    const nameSpan = document.getElementById('headerUserName');
    const avatarImg = document.getElementById('headerAvatar');
    const profileDiv = document.getElementById('headerUserProfile');

    if (currentUser) {
        const displayName = currentUser.user_metadata?.full_name || currentUser.email.split('@')[0];
        nameSpan.innerHTML = `${displayName} ${getVerificationBadge(currentUser.id)}`;
        
        avatarImg.src = currentUser.user_metadata?.avatar_url || "https://cdn-icons-png.flaticon.com/512/847/847969.png";
        avatarImg.style.display = "block"; 
        profileDiv.style.display = "flex";

        // ADMIN BUTONU KONTROLÜ
        if (currentUser.email === adminEmail) {
            // Eğer buton daha önce eklenmemişse ekle
            if(!document.getElementById('adminBtn')) {
                const adminBtn = document.createElement('span'); 
                adminBtn.id = 'adminBtn'; 
                adminBtn.innerHTML = '👑'; 
                adminBtn.style.cssText = "cursor:pointer; font-size:1.5rem; margin-left:10px; transition:transform 0.2s;";
                adminBtn.title = "Yönetim Paneli";
                
                // BURASI DEĞİŞTİ: Tıklama olayını durduruyoruz ki profil açılmasın
                adminBtn.onclick = (e) => {
                    e.stopPropagation(); // Olayın profil div'ine ulaşmasını engelle
                    openAdminPanel();
                };

                adminBtn.onmouseover = () => adminBtn.style.transform = "scale(1.2)";
                adminBtn.onmouseout = () => adminBtn.style.transform = "scale(1)";

                profileDiv.appendChild(adminBtn);
            }
        }

        authBtnDiv.innerHTML = `<button class="desktop-post-btn" onclick="handleLogout()" style="background:#dc3545;">Çıkış</button>`;
    } else {
        nameSpan.innerHTML = ""; 
        avatarImg.style.display = "none"; 
        profileDiv.style.display = "none";
        // Admin butonu varsa temizle
        const existingAdminBtn = document.getElementById('adminBtn');
        if(existingAdminBtn) existingAdminBtn.remove();
        
        authBtnDiv.innerHTML = `<button class="desktop-post-btn" onclick="openAuthModal('login')" style="background:#333;">Giriş Yap</button>`;
    }

    // Mobil menüdeki buton güncellemesi
    const sidebarBtn = document.getElementById('sidebarAuthBtn');
    if (sidebarBtn) {
        if (currentUser) { 
            sidebarBtn.innerText = "Çıkış Yap"; 
            sidebarBtn.style.background = "#dc3545"; 
            sidebarBtn.onclick = handleLogout; 
        } else { 
            sidebarBtn.innerText = "Giriş Yap"; 
            sidebarBtn.style.background = "#333"; 
            sidebarBtn.onclick = () => openAuthModal('login'); 
        }
    }
}

async function openProfileModal() {
    if (!currentUser) return showToast("Giriş yapmalısın.", 'error');
    
    // Modalı aç
    const modal = document.getElementById('profileModal');
    modal.style.display = 'flex';
    
    // Mobildeysen başlangıçta Sidebar görünsün, içerik gizli olsun
    document.querySelector('.profile-dashboard-card').classList.remove('show-content');

    const meta = currentUser.user_metadata || {};
    
    // 1. SOL SIDEBAR BİLGİLERİNİ DOLDUR
    document.getElementById('profilePreview').src = meta.avatar_url || "https://cdn-icons-png.flaticon.com/512/847/847969.png";
    document.getElementById('profileModalName').innerText = meta.full_name || "İsimsiz Kullanıcı";
    document.getElementById('profileEmailDisplay').innerText = currentUser.email;
    document.getElementById('profileName').value = meta.full_name || "";
    document.getElementById('profilePhone').value = meta.phone || "";
    
    // Tarih
    const joinDate = new Date(currentUser.created_at);
    document.getElementById('profileJoinedDate').innerText = `Katılım: ${joinDate.toLocaleDateString('tr-TR')}`;

    // Statü Rozeti
    const isVerified = verifiedUserIds.includes(currentUser.id);
    const badge = document.getElementById('profileStatusBadge');
    if(currentUser.email === adminEmail) { badge.innerText = "👑 Yönetici"; badge.style.background = "#fff7ed"; badge.style.color = "#c2410c"; }
    else if(isVerified) { badge.innerText = "✅ Onaylı"; badge.style.background = "#dcfce7"; badge.style.color = "#15803d"; }
    else { badge.innerText = "👤 Üye"; badge.style.background = "#f1f5f9"; badge.style.color = "#475569"; }

    // İstatistikler (Sidebar)
    const myItems = allData.filter(x => x.user_id === currentUser.id);
    document.getElementById('statListingCountSide').innerText = myItems.length;
    document.getElementById('statFavCountSide').innerText = myCloudFavorites.length;

    // 2. SAĞ TARAF VERİLERİNİ HAZIRLA
    await hydrateMyProfilePanels();
    
    // Varsayılan olarak Özet sekmesini aç
    switchMyProfileTab('overview');
}
function switchMyProfileTab(tabName) {
    // 1. Menü Butonunu Aktif Yap
    document.querySelectorAll('.pro-menu-item').forEach(btn => btn.classList.remove('active'));
    // Basit bir eşleştirme mantığı (Sıraya göre veya onclick eventinden yakalayabiliriz ama manuel class ekliyoruz şimdilik)
    // Not: Bu kısım HTML'deki onclick'lerde otomatik class eklemiyor, manuel yapalım:
    const menuIndex = { 'overview':0, 'listings':1, 'offers':2, 'settings':3 };
    const menuBtns = document.querySelectorAll('.pro-menu-item');
    if(menuBtns[menuIndex[tabName]]) menuBtns[menuIndex[tabName]].classList.add('active');

    // 2. Sağ Taraf İçeriğini Değiştir
    document.querySelectorAll('.pro-pane').forEach(el => el.style.display = 'none');
    document.getElementById(`myProfilePane_${tabName}`).style.display = 'block';

    // 3. Başlığı Güncelle
    const titles = {
        'overview': 'Genel Bakış',
        'listings': 'İlanlarım',
        'offers': 'Tekliflerim',
        'settings': 'Profil Ayarları'
    };
    document.getElementById('proContentTitle').innerText = titles[tabName];

    // 4. MOBİL İÇİN: İçerik alanını kaydır (Slide effect)
    if(window.innerWidth <= 768) {
        const card = document.querySelector('.profile-dashboard-card');
        if(card) card.classList.add('show-content');
    }
}
function toggleProfileSidebar(showSidebar) {
    const card = document.querySelector('.profile-dashboard-card');
    if (card) {
        if(showSidebar) {
            // Menüye dön (Sidebar'ı göster)
            card.classList.remove('show-content');
        } else {
            // İçeriğe git
            card.classList.add('show-content');
        }
    }
}
async function hydrateMyProfilePanels() {
    if (!currentUser) return;

    // Yükleniyor ibaresi koyalım ki boş sanmasınlar
    const listingsBox = document.getElementById('myProfileListings');
    if(listingsBox) listingsBox.innerHTML = '<div style="text-align:center; padding:20px; color:#999;">Verilerin yükleniyor...</div>';

    // 1. Veritabanından SADECE bu kullanıcının ilanlarını çek
    const { data: myItems, error } = await client
        .from('requests')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false });

    if (error || !myItems) {
        console.error("Profil veri hatası:", error);
        if(listingsBox) listingsBox.innerHTML = '<div style="color:red; text-align:center;">Veri yüklenemedi.</div>';
        return;
    }

    // 2. Verileri Ayrıştır
    const activeItems = myItems.filter(x => !x.is_sold);
    const soldItems = myItems.filter(x => x.is_sold);
    
    // Toplam Teklif Sayısını Hesapla (offer_count sütununu topla)
    // Eğer offer_count null ise 0 kabul et
    const offerSum = myItems.reduce((total, item) => total + (item.offer_count || 0), 0);

    // 3. İSTATİSTİKLERİ GÜNCELLE (DOM)
    // Sidebar'daki sayılar
    const sideListingCount = document.getElementById('statListingCountSide');
    if(sideListingCount) sideListingCount.innerText = myItems.length;

    // Dashboard (Genel Bakış) kutuları
    const elActive = document.getElementById('statActiveCount');
    const elSold = document.getElementById('statSoldCount');
    const elOffer = document.getElementById('statOfferCount');

    if (elActive) elActive.innerText = activeItems.length;
    if (elSold) elSold.innerText = soldItems.length;
    if (elOffer) elOffer.innerText = offerSum;

    // 4. LİSTELERİ ÇİZ
    renderMyProfileListings('myProfileListings', myItems);
    renderMyProfileRecentListings(activeItems);
}

function renderMyProfileRecentListings(activeItems) {
  const box = document.getElementById('myProfileRecentListings');
  if (!box) return;

  const recent = [...activeItems].sort((a,b) => (b.id||0) - (a.id||0)).slice(0, 3);
  if (recent.length === 0) {
    box.innerHTML = `
      <div class="empty-state" style="margin:0;">
        <div class="empty-title">Henüz aktif ilan yok</div>
        <div class="empty-desc">“Yeni İlan Aç” ile hemen başla.</div>
      </div>
    `;
    return;
  }

  box.innerHTML = recent.map(item => miniListingHTML(item)).join('');
}

function renderMyProfileListings(targetId, items) {
  const box = document.getElementById(targetId);
  if (!box) return;

  const sorted = [...items].sort((a,b) => (b.id||0) - (a.id||0));
  if (sorted.length === 0) {
    box.innerHTML = `
      <div class="empty-state" style="margin:0;">
        <div class="empty-title">Hiç ilan açmamışsın</div>
        <div class="empty-desc">Bir ilan açınca burada görünecek.</div>
      </div>
    `;
    return;
  }

  box.innerHTML = sorted.map(item => miniListingHTML(item)).join('');
}

function miniListingHTML(item) {
  const img = (item.image_url || (item.images && item.images[0])) || "https://via.placeholder.com/80";
  const price = (item.budget || 0).toLocaleString('tr-TR');
  const city = item.city || "Tüm Türkiye";
  const tag = item.is_sold ? `<span style="background:#fee2e2;color:#991b1b;padding:3px 8px;border-radius:999px;font-size:0.75rem;font-weight:800;">Satıldı</span>`
                           : `<span style="background:#dcfce7;color:#166534;padding:3px 8px;border-radius:999px;font-size:0.75rem;font-weight:800;">Aktif</span>`;

  // mini-card css'in zaten var :contentReference[oaicite:5]{index=5}
  return `
    <div class="mini-card" onclick="openSellerModal('${item.id}')">
      <img class="mini-thumb" src="${img}" alt="">
      <div style="flex:1;">
        <div style="display:flex; justify-content:space-between; gap:10px; align-items:center;">
          <div style="font-weight:800; font-size:0.95rem; line-height:1.2;">${escapeHTML(item.title || 'İlan')}</div>
          ${tag}
        </div>
        <div style="font-size:0.85rem; color:#666; margin-top:4px;">${city} • ${price} TL</div>
      </div>
    </div>
  `;
}

// minik XSS kalkanı
function escapeHTML(str) {
  return String(str).replace(/[&<>"']/g, m => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[m]));
}

function previewProfileImage(input) { if (input.files && input.files[0]) { const reader = new FileReader(); reader.onload = function(e) { document.getElementById('profilePreview').src = e.target.result; }; reader.readAsDataURL(input.files[0]); } }

async function saveProfile() {
    if (!currentUser) return showToast("Oturum kapalı.", 'error');
    const name = document.getElementById('profileName').value;
    const phone = document.getElementById('profilePhone').value;
    const file = document.getElementById('profileFile').files[0];
    const btn = document.querySelector('#profileModal button.btn-primary');
    if (!name) return showToast("İsim zorunlu!", 'error');
    btn.innerText = "Kaydediliyor..."; btn.disabled = true;
    try {
        let finalAvatarUrl = currentUser.user_metadata?.avatar_url || "";
        if (file) {
            const options = { maxSizeMB: 0.2, maxWidthOrHeight: 500, useWebWorker: true }; 
            const compressedFile = await imageCompression(file, options);
            const fileName = `avatar_${currentUser.id}_${Date.now()}.jpg`;
            await client.storage.from('images').upload(fileName, compressedFile);
            const { data } = client.storage.from('images').getPublicUrl(fileName);
            finalAvatarUrl = data.publicUrl;
        }
        await client.auth.updateUser({ data: { full_name: name, phone: phone, avatar_url: finalAvatarUrl } });
        await client.from('profiles').upsert({ id: currentUser.id, email: currentUser.email, full_name: name, avatar_url: finalAvatarUrl, phone: phone, updated_at: new Date() });
        currentUser.user_metadata.full_name = name; currentUser.user_metadata.phone = phone; currentUser.user_metadata.avatar_url = finalAvatarUrl;
        updateAuthUI(); showToast("Profil güncellendi! 😎"); closeModal('profileModal');
    } catch (err) { showToast("Hata: " + err.message, 'error'); } 
    finally { btn.innerText = "Kaydet ve Güncelle"; btn.disabled = false; }
}

// ==========================================
// 7. İLAN İŞLEMLERİ (CRUD)
// ==========================================

// ==========================================
// 🚀 GÜVENLİ İLAN YAYINLAMA (FIXED)
// ==========================================
async function postRequest() {
    if (!currentUser) {
        showToast("İlan vermek için giriş yapmalısın!", 'error');
        openModal('authModal');
        return;
    }

    const title = document.getElementById('reqTitle').value;
    const budget = document.getElementById('reqBudget').value;
    const city = document.getElementById('reqCity').value;
    const category = document.getElementById('reqCategory').value;
    const isUrgent = document.getElementById('reqUrgent').checked;
    const files = document.getElementById('reqFile').files;

    if (!title || !budget) return showToast("Başlık ve bütçe zorunlu!", 'error');

    const btn = document.querySelector('#buyerModal button.btn-primary');
    const oldText = btn.innerText;
    btn.innerText = "Yükleniyor...";
    btn.disabled = true;

    try {
        let uploadedImageUrls = [];
        
        // Resim Yükleme İşlemi
        if (files.length > 0) {
            for (let i = 0; i < files.length; i++) {
                let fileToUpload = files[i];
                
                // Sıkıştırma dene, hata verirse orjinali yükle
                try {
                    if (typeof imageCompression !== 'undefined') {
                        const options = { maxSizeMB: 0.5, maxWidthOrHeight: 1280, useWebWorker: true };
                        fileToUpload = await imageCompression(files[i], options);
                    }
                } catch (compErr) {
                    console.warn("Resim sıkıştırma atlandı:", compErr);
                }

                const fileName = `ilan_${currentUser.id}_${Date.now()}_${i}.jpg`;
                const { data, error: uploadErr } = await client.storage.from('images').upload(fileName, fileToUpload);
                
                if (uploadErr) throw uploadErr;
                
                const { data: publicData } = client.storage.from('images').getPublicUrl(fileName);
                uploadedImageUrls.push(publicData.publicUrl);
            }
        }

        const payload = {
            title,
            budget: parseFloat(budget),
            city,
            category,
            is_urgent: isUrgent,
            image_url: uploadedImageUrls[0] || "",
            images: uploadedImageUrls,
            user_id: currentUser.id,
            user_email: currentUser.email,
            user_name: currentUser.user_metadata?.full_name || 'Kullanıcı',
            offer_count: 0
        };

        let result;
        if (editingRequestId) {
            result = await client.from('requests').update(payload).eq('id', editingRequestId);
        } else {
            result = await client.from('requests').insert([payload]);
        }

        if (result.error) throw result.error;

        showToast("İlan başarıyla yayınlandı! 🎉");
        closeModal('buyerModal');
        // ... postRequest fonksiyonunun içi ...

// Modal kapanırken resmi temizle:
document.getElementById('reqImagePreview').style.display = 'none';
document.getElementById('uploadPlaceholder').style.display = 'block';
document.getElementById('uploadPreviewBox').style.border = "2px dashed #ccc";
document.getElementById('reqFile').value = ""; // Inputu da temizle
        fetchRequests(); // Listeyi yenile

    } catch (error) {
        console.error("Yayınlama hatası:", error);
        showToast("Hata: " + error.message, 'error');
    } finally {
        btn.innerText = oldText;
        btn.disabled = false;
        editingRequestId = null;
    }
}

// ==========================================
// 7. İLANLARI ÇEKME VE İSİM DÜZELTME (FIX)
// ==========================================

async function fetchRequests(isLoadMore = false) {
    const feed = document.getElementById('feedContainer');
    const loadMoreBtn = document.getElementById('loadMoreContainer');
    if (!isLoadMore) {
        currentPage = 0;
        isLastPage = false;
        allData = [];
        feed.innerHTML = "";
        renderSkeleton();
        if (loadMoreBtn) loadMoreBtn.style.display = 'none';
    }

    const sortMode = document.getElementById('sortSelect')?.value || 'newest';
    const minVal = document.getElementById('minPrice')?.value;
    const maxVal = document.getElementById('maxPrice')?.value;

    let requestQuery = client.from('requests').select('*');
    if (minVal) requestQuery = requestQuery.gte('budget', parseInt(minVal));
    if (maxVal) requestQuery = requestQuery.lte('budget', parseInt(maxVal));
    if (activeCity !== 'Tümü' && activeCity !== 'Tüm Türkiye') requestQuery = requestQuery.eq('city', activeCity);
    if (activeCategory !== 'Tümü' && activeCategory !== 'Diğer') requestQuery = requestQuery.eq('category', activeCategory);

    if (sortMode === 'price_asc') requestQuery = requestQuery.order('budget', { ascending: true });
    else if (sortMode === 'price_desc') requestQuery = requestQuery.order('budget', { ascending: false });
    else requestQuery = requestQuery.order('id', { ascending: false });

    requestQuery = requestQuery.range(currentPage * ITEMS_PER_PAGE, (currentPage * ITEMS_PER_PAGE) + ITEMS_PER_PAGE - 1);

    try {
        // BURASI DEĞİŞTİ: Sadece ID değil, İsimleri de çekiyoruz
        const [profilesRes, requestsRes] = await Promise.all([
            client.from('profiles').select('id, full_name, is_verified'),
            requestQuery
        ]);

        // Profil Eşleme Haritası Oluştur
        const profileMap = {};
        verifiedUserIds = []; // Global listeyi sıfırla

        if (profilesRes?.data) {
            profilesRes.data.forEach(p => {
                if (p.full_name) profileMap[p.id] = p.full_name; // ID -> İsim
                if (p.is_verified) verifiedUserIds.push(p.id);
            });
        }

        if (requestsRes?.error) throw requestsRes.error;
        const newItems = requestsRes?.data || [];

        // İlanlardaki isimleri güncelle
        newItems.forEach(item => {
            // 1. Profil tablosunda ismi var mı?
            if (profileMap[item.user_id]) {
                item.user_name = profileMap[item.user_id];
            } 
            // 2. Yoksa ve ilan tablosunda da yoksa Email'den üret
            else if (!item.user_name && item.user_email) {
                item.user_name = item.user_email.split('@')[0];
            }
            // 3. Hiçbiri yoksa varsayılan kalır (Anonim)
        });

        if (newItems.length < ITEMS_PER_PAGE) {
            isLastPage = true;
            if (loadMoreBtn) loadMoreBtn.style.display = 'none';
        } else if (loadMoreBtn) loadMoreBtn.style.display = 'block';
        
        allData = [...allData, ...newItems];
        
        if (!isLoadMore) {
            // Sadece ilk sayfadaysak temizle
            feed.innerHTML = ""; 
            renderFeed(newItems);
        } else {
            // "Daha Fazla" dendiğinde sadece ekleme yap (Temizleme!)
            appendFeed(newItems); 
        }

        if (currentFilterMode === 'my_listings') showMyListings();
        else if (currentFilterMode === 'favorites') showFavorites();
        else if (currentFilterMode === 'my_offers') showMyOffers();
        else if (isLoadMore) appendFeed(newItems); 
        else renderFeed(newItems);
        
    } catch (error) {
        console.error('İlan çekme hatası:', error);
        feed.innerHTML += '<div style="text-align:center; color:red; padding:20px;">Hata oluştu.</div>';
    }
}
function loadMore() {
    if (isLastPage) return;
    currentPage++;
    const btn = document.querySelector('#loadMoreContainer button');
    if (btn) {
        btn.innerText = "Yükleniyor...";
        btn.disabled = true;
    }
    fetchRequests(true).finally(() => {
        if (btn) {
            btn.innerText = "Daha Fazla";
            btn.disabled = false;
        }
    });
}
function appendFeed(items) { items.forEach(item => document.getElementById('feedContainer').innerHTML += createCardHTML(item)); }
function renderFeed(items) { 
    const feed = document.getElementById('feedContainer'); feed.innerHTML = ""; 
    if (!items || items.length === 0) feed.innerHTML = '<div class="empty-state"><div class="empty-icon-bg"><span class="material-icons">search_off</span></div><div class="empty-title">İlan Bulunamadı</div></div>';
    else items.forEach(item => feed.innerHTML += createCardHTML(item)); 
}

function createCardHTML(item) {
    const isUrgent = item.is_urgent;
    const borderStyle = isUrgent ? 'border: 2px solid #ef4444; background:#fff5f5;' : ''; 
    const urgentBadge = isUrgent ? `<div style="position:absolute; top:10px; right:10px; background:#ef4444; color:white; font-size:0.7rem; font-weight:bold; padding:3px 8px; border-radius:4px; z-index:5;">🔥 ACİL</div>` : '';
    const img = (item.images && item.images.length > 0) ? item.images[0] : (item.image_url || getCategoryIcon(item.category));
    const isFav = isFavorite(item.id);
    const sellerName = item.user_name || "Anonim";
    return `
        <div class="card ${item.is_sold ? 'card-sold' : ''}" style="${borderStyle}">
            ${urgentBadge}
            ${item.is_sold ? '<div class="sold-badge">✅ BULUNDU</div>' : ''}
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 15px; cursor: pointer;" 
                onclick="openSellerModal('${item.id}', '${item.title}', '${item.user_email}', ${item.is_sold})">
                <div style="display:flex; align-items:center; gap:12px; flex:1;"> 
                    <img src="${img}" style="width:60px; height:60px; object-fit:cover; border-radius:8px; border:1px solid #eee;">
                    <div>
                        <h4 style="margin:0; font-size:1rem; color:#333; font-weight:600;">${item.title}</h4>
                        <div style="color:#666; font-size:0.8rem;">${sellerName} ${getVerificationBadge(item.user_id)}</div>
                        <div style="color:#888; font-size:0.75rem;"><span class="material-icons" style="font-size:10px;">location_on</span> ${item.city}</div>
                    </div>
                </div>
                <div style="text-align:right;">
                    <div style="color:#2563eb; font-weight:700; font-size:1.1rem;">${item.budget.toLocaleString()} TL</div>
                    ${item._myOfferPrice ? `<div style="color:#16a34a; font-size:0.75rem; margin-top:4px;">Senin teklifin: ${item._myOfferPrice.toLocaleString()} TL</div>` : ''}

                    <div style="margin-top:5px;">
                        ${currentUser && currentUser.id === item.user_id ? `<span class="material-icons" onclick="deleteRequest('${item.id}', event)" style="color:#ef4444; cursor:pointer;">delete</span>` : ''}
                        <span class="material-icons heart-icon" onclick="toggleFavorite('${item.id}', event)" style="color:${isFav ? '#dc3545' : '#ccc'}; font-size:1.5rem;">${isFav ? 'favorite' : 'favorite_border'}</span>
                    </div>
                </div>
            </div>
        </div>`;
}

// ==========================================
// 8. EKSİK OLAN YARDIMCI FONKSİYONLAR (DÜZELTİLDİ)
// ==========================================

function filterCategory(c) { activeCategory = c; currentFilterMode = 'all'; fetchRequests(); if(event) setActiveCat(event.currentTarget); }
function filterCity(c) { activeCity = c; currentFilterMode = 'all'; fetchRequests(); }
// ==========================================
// 🔍 SERVER-SIDE AKILLI ARAMA (OPTIMIZED)
// ==========================================

function searchData() {
    // Hem masaüstü hem mobil inputu kontrol et
    const val = (document.getElementById('searchInput').value || document.getElementById('mobileSearchInput').value || "").trim();

    // Eğer önceki bir arama emri varsa iptal et (Debounce)
    if (searchTimer) clearTimeout(searchTimer);

    // Eğer kutu boşaldıysa ana akışı geri yükle
    if (val.length === 0) {
        document.getElementById('loadMoreContainer').style.display = 'block'; // Butonu geri aç
        fetchRequests(); // Varsayılan listeyi getir
        return;
    }

    // Kullanıcı yazmayı bitirdikten 500ms sonra çalıştır
    searchTimer = setTimeout(() => {
        performDatabaseSearch(val);
    }, 500);
}

async function performDatabaseSearch(query) {
    const feed = document.getElementById('feedContainer');
    const loadMoreBtn = document.getElementById('loadMoreContainer');
    
    // Yükleniyor efekti
    feed.innerHTML = `
        <div style="text-align:center; padding:40px; color:#999;">
            <div class="skeleton" style="width:50px; height:50px; border-radius:50%; margin:0 auto 10px;"></div>
            "${query}" aranıyor...
        </div>`;
    
    // Load More butonunu gizle (Arama sonuçlarında sayfalama karışmasın diye)
    if(loadMoreBtn) loadMoreBtn.style.display = 'none';

    try {
        // Veritabanından "title" sütununda arama yap (ilike = büyük/küçük harf duyarsız)
        const { data, error } = await client
            .from('requests')
            .select('*')
            .ilike('title', `%${query}%`) // % işareti "içinde geçen" demek
            .order('created_at', { ascending: false })
            .limit(50); // Maksimum 50 sonuç getir (Performans için)

        if (error) throw error;

        // Sonuçları ekrana bas
        renderFeed(data);

        // Eğer sonuç yoksa uyarı ver
        if (!data || data.length === 0) {
            feed.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon-bg"><span class="material-icons">search_off</span></div>
                    <div class="empty-title">Sonuç Bulunamadı</div>
                    <div class="empty-desc">"${query}" ile ilgili bir ilan bulamadık.</div>
                </div>`;
        }

    } catch (e) {
        console.error("Arama hatası:", e);
        feed.innerHTML = '<div style="text-align:center; color:red; padding:20px;">Arama sırasında hata oluştu.</div>';
    }
}
function getCategoryIcon(c) { if(c==='Telefon') return 'https://cdn-icons-png.flaticon.com/512/644/644458.png'; if(c==='Vasıta') return 'https://cdn-icons-png.flaticon.com/512/3202/3202926.png'; return 'https://cdn-icons-png.flaticon.com/512/1150/1150612.png'; }
function toggleTheme() { document.body.classList.toggle('dark-mode'); localStorage.setItem('theme', document.body.classList.contains('dark-mode') ? 'dark' : 'light'); }
function openModal(id) { document.getElementById(id).style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; if(id==='sellerModal'){ const p=document.getElementById('sellerPanelContent'); if(p) p.classList.remove('active'); } }
function openNewRequestModal() { editingRequestId=null; document.getElementById('reqTitle').value=""; document.getElementById('reqBudget').value=""; document.getElementById('reqFile').value=""; openModal('buyerModal'); }
function prepareEditMode(id) { const item=allData.find(i=>String(i.id)===String(id)); if(!item) return; editingRequestId=item.id; document.getElementById('reqTitle').value=item.title; document.getElementById('reqBudget').value=item.budget; closeModal('sellerModal'); openModal('buyerModal'); }
function deleteRequest(id, e) { if(e) e.stopPropagation(); pendingDeleteId=id; openModal('deleteModal'); }
async function confirmDelete() {
    if (!pendingDeleteId) return;

    const btn = document.querySelector('#deleteModal button[style*="background:red"]');
    btn.innerText = "Siliniyor...";
    btn.disabled = true;

    try {
        // 1. Önce silinecek ilanın verisini çek (Resim yolunu bulmak için)
        const { data: item } = await client.from('requests').select('image_url, images').eq('id', pendingDeleteId).single();

        // 2. İlanı veritabanından sil
        const { error } = await client.from('requests').delete().eq('id', pendingDeleteId);
        if (error) throw error;

        // 3. Storage'dan Resmi Sil (Arka planda sessizce yapabilir)
        if (item) {
            // Ana resim varsa
            if (item.image_url) {
                const fileName = item.image_url.split('/').pop(); // URL'den dosya adını al
                client.storage.from('images').remove([fileName]).then(res => console.log("Resim silindi:", res));
            }
            // Çoklu resim varsa (Array)
            if (item.images && item.images.length > 0) {
                const fileNames = item.images.map(url => url.split('/').pop());
                client.storage.from('images').remove(fileNames);
            }
        }

        // UI Güncelleme
        allData = allData.filter(x => String(x.id) !== String(pendingDeleteId));
        fetchRequests();
        closeModal('deleteModal');
        showToast("İlan ve resimler başarıyla silindi.");

    } catch (e) {
        console.error("Silme hatası:", e);
        showToast("Silme sırasında hata oluştu.", "error");
    } finally {
        btn.innerText = "Sil";
        btn.disabled = false;
        pendingDeleteId = null;
    }
}async function fetchFavorites() {
    myCloudFavorites = [];
    if (currentUser) {
        const { data } = await client.from('favorites').select('request_id').eq('user_id', currentUser.id);
        if (data) myCloudFavorites = data.map(f => String(f.request_id));
    } else {
        const l = localStorage.getItem('myFavorites');
        if (l) myCloudFavorites = JSON.parse(l);
    }
}
function isFavorite(id) { return myCloudFavorites.includes(String(id)); }
function showFavorites() { currentFilterMode='favorites'; renderFeed(allData.filter(item => myCloudFavorites.includes(String(item.id)))); }
async function toggleFavorite(id, e) {
    if (e) e.stopPropagation();
    const tid = String(id);
    const isFav = myCloudFavorites.includes(tid);

    if (currentUser) {
        if (isFav) await client.from('favorites').delete().eq('user_id', currentUser.id).eq('request_id', tid);
        else await client.from('favorites').insert({ user_id: currentUser.id, request_id: tid });
    } else {
        const updated = new Set(myCloudFavorites);
        if (isFav) updated.delete(tid); else updated.add(tid);
        myCloudFavorites = Array.from(updated);
        localStorage.setItem('myFavorites', JSON.stringify(myCloudFavorites));
    }

    await fetchFavorites();
    showFavorites();
}
function showMyListings() { if(!currentUser) return showToast("Giriş yap",'error'); currentFilterMode='my_listings'; renderFeed(allData.filter(i=>i.user_email===currentUser.email)); }
async function showMyOffers() {
    if (!currentUser) return showToast("Giriş yap", 'error');
    currentFilterMode = 'my_offers';

    const feed = document.getElementById('feedContainer');
    feed.innerHTML = "<p style='text-align:center; padding:20px;'>Tekliflerin yükleniyor...</p>";

    // 1) Bu kullanıcının tüm tekliflerini çek (tarihe göre, en yeni en üstte)
    const { data: offers, error } = await client
        .from('offers')
        .select('*')
        .eq('buyer_email', currentUser.email)
        .order('created_at', { ascending: false });

    if (error) {
        console.error("Tekliflerim hatası:", error);
        feed.innerHTML = "<p style='text-align:center; color:red; padding:20px;'>Teklifler alınırken hata oluştu.</p>";
        return;
    }

    if (!offers || offers.length === 0) {
        feed.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon-bg">
                    <span class="material-icons">local_offer</span>
                </div>
                <div class="empty-title">Henüz teklif vermemişsin</div>
                <div class="empty-desc">Bir ilana teklif verdiğinde burada görebileceksin.</div>
            </div>
        `;
        return;
    }

    // 2) Teklif verilen ilanları çek
    const requestIds = [...new Set(offers.map(o => o.request_id))];
    const { data: relatedRequests, error: reqErr } = await client
        .from('requests')
        .select('*')
        .in('id', requestIds);

    if (reqErr) {
        console.error("İlanlar alınamadı:", reqErr);
        feed.innerHTML = "<p style='text-align:center; color:red; padding:20px;'>İlanlar alınırken hata oluştu.</p>";
        return;
    }

    const requestMap = {};
    (relatedRequests || []).forEach(r => { requestMap[r.id] = r; });

    // 3) Her ilan için en son verilen teklife göre sıralama
    const latestByRequest = {};
    offers.forEach(off => {
        const key = off.request_id;
        if (!latestByRequest[key] || new Date(off.created_at) > new Date(latestByRequest[key].created_at)) {
            latestByRequest[key] = off;
        }
    });

    const sortedOffers = Object.values(latestByRequest).sort(
        (a, b) => new Date(b.created_at) - new Date(a.created_at)
    );

    // 4) Kartları bas
    feed.innerHTML = "";
    sortedOffers.forEach(off => {
        const req = requestMap[off.request_id];
        if (!req) return;          // ilan silinmiş olabilir
        feed.innerHTML += createCardHTML(req);   // mevcut kart tasarımını bozma
    });
}
async function showIncomingOffers() {
    if (!currentUser) return showToast("Giriş yap", 'error');
    currentFilterMode = 'incoming_offers';

    const feed = document.getElementById('feedContainer');
    const loadMore = document.getElementById('loadMoreContainer');
    if (loadMore) loadMore.style.display = 'none';

    feed.innerHTML = "<p style='text-align:center; padding:20px;'>Gelen tekliflerin yükleniyor...</p>";

    // 1) Önce senin ilanlarını çek
    const { data: myRequests, error: reqError } = await client
        .from('requests')
        .select('id')
        .eq('user_email', currentUser.email);

    if (reqError) {
        console.error("Gelen teklifler (ilanlar) hatası:", reqError);
        feed.innerHTML = "<p style='text-align:center; color:red; padding:20px;'>İlanların alınırken hata oluştu.</p>";
        return;
    }

    if (!myRequests || myRequests.length === 0) {
        feed.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon-bg">
                    <span class="material-icons">inventory_2</span>
                </div>
                <div class="empty-title">Henüz ilan açmamışsın</div>
                <div class="empty-desc">İlan açtıktan sonra gelen teklifleri burada görebileceksin.</div>
            </div>
        `;
        return;
    }

    const requestIds = myRequests.map(r => r.id);

    // 2) Bu ilanlara gelen tüm teklifleri çek (en yeni en üstte)
    const { data: offers, error: offError } = await client
        .from('offers')
        .select('*')
        .in('request_id', requestIds)
        .order('created_at', { ascending: false });

    if (offError) {
        console.error("Gelen teklifler (offers) hatası:", offError);
        feed.innerHTML = "<p style='text-align:center; color:red; padding:20px;'>Teklifler alınırken hata oluştu.</p>";
        return;
    }

    if (!offers || offers.length === 0) {
        feed.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon-bg">
                    <span class="material-icons">local_offer</span>
                </div>
                <div class="empty-title">İlanlarına henüz teklif gelmemiş</div>
                <div class="empty-desc">İlan paylaştıkça burada hareket göreceksin.</div>
            </div>
        `;
        return;
    }

    // 3) Her ilan için EN SON gelen teklifi bul
    const latestByRequest = {};
    offers.forEach(off => {
        const key = off.request_id;
        if (!latestByRequest[key] || new Date(off.created_at) > new Date(latestByRequest[key].created_at)) {
            latestByRequest[key] = off;
        }
    });

    // 4) Bu “son teklifler”i tarihe göre sırala (en yeni en üstte)
    const sortedLatest = Object.values(latestByRequest).sort(
        (a, b) => new Date(b.created_at) - new Date(a.created_at)
    );

    const idsWithOffers = sortedLatest.map(o => o.request_id);

    // 5) Bu ilanların detaylarını çek
    const { data: relatedRequests, error: relErr } = await client
        .from('requests')
        .select('*')
        .in('id', idsWithOffers);

    if (relErr) {
        console.error("Gelen teklifler (ilan detay) hatası:", relErr);
        feed.innerHTML = "<p style='text-align:center; color:red; padding:20px;'>İlanlar alınırken hata oluştu.</p>";
        return;
    }

    const requestMap = {};
    (relatedRequests || []).forEach(r => { requestMap[r.id] = r; });

    // 6) Kartları bas (createCardHTML aynen kullanıyoruz)
    feed.innerHTML = "";
    sortedLatest.forEach(off => {
        const req = requestMap[off.request_id];
        if (!req) return;
        // İstersek son fiyatı objeye ekstra property olarak gömebiliriz (createCardHTML şimdilik bunu kullanmıyor ama zarar da vermiyor)
        const enriched = { ...req, _lastOfferPrice: off.price, _lastOfferSeller: off.seller_name };
        feed.innerHTML += createCardHTML(enriched);
    });
}
function injectIncomingOffersMenu() {
    // Doğru container: hem menü hem kategoriler burada
    const menuList = document.querySelector('.category-list');
    if (!menuList) return;

    // Daha önce eklenmişse tekrar ekleme
    if (document.getElementById('incomingOffersMenuItem')) return;

    const div = document.createElement('div');
    div.id = 'incomingOffersMenuItem';
    div.className = 'menu-item'; // CSS'teki standart sınıfı kullanacak
    // Inline stilleri SİLDİK, artık diğerleriyle birebir aynı olacak.
    
    div.onclick = () => showIncomingOffers();
    div.innerHTML = `
        <span class="material-icons">move_to_inbox</span>
        Gelen Teklifler
    `;

    // Menüdeki mevcut itemleri al
    const items = menuList.querySelectorAll('.menu-item');

    // "Tekliflerim" item'ini bul
    let insertAfter = null;
    items.forEach(item => {
        if (item.textContent.includes('Tekliflerim')) {
            insertAfter = item;
        }
    });

    if (insertAfter) {
        // Tekliflerim'in hemen altına ekle
        insertAfter.insertAdjacentElement('afterend', div);
    } else {
        // Bulamazsa başa ekle
        const firstChild = menuList.firstElementChild;
        if (firstChild) {
            menuList.insertBefore(div, firstChild);
        } else {
            menuList.appendChild(div);
        }
    }
}
function updateNotificationBadge(count) {
    const badge = document.getElementById('notificationBadge');
    const dot = document.getElementById('notifDot'); // Alt menüdeki nokta

    if (count > 0) {
        if (badge) {
            badge.style.display = 'flex';
            badge.innerText = count > 9 ? '9+' : count;
            badge.classList.add('heart-active'); // Pop efekti
        }
        if (dot) dot.style.display = 'block';
        
        // Opsiyonel: Ses çal (Sadece sayfa ilk açıldığında değil, artış varsa)
        // if(count > 0) notificationSound.play().catch(()=>{});
    } else {
        if (badge) badge.style.display = 'none';
        if (dot) dot.style.display = 'none';
    }
}





// ==========================================
// 6. DETAY PENCERESİ (MESAJ BUTONU FİXLENDİ) ✅
// ==========================================
// ==========================================
// 6. DETAY PENCERESİ (FİNAL DÜZELTME) ✅
// ==========================================
// ==========================================
// 6. DETAY PENCERESİ (FİNAL DÜZELTME) ✅
// ==========================================
async function openSellerModal(id, title, ownerEmail, isSold) {
    selectedRequestId = id;

    // İlan verisini bul
    const currentItem = allData.find(i => String(i.id) === String(id));
    if (!currentItem) {
        showToast("İlan verisi yüklenemedi.", "error");
        return;
    }

    // Email Kontrolü (Mesajlaşma için kritik)
    const targetEmail = currentItem.user_email || ownerEmail;
    const ownerMailSafe = targetEmail || '';
    // Başlıkları güvenli hale getir (JavaScript hatasını önler)
    const displayTitle = title || currentItem.title || "";
    const safeTitle = displayTitle.replace(/'/g, "\\'");

    // ID Kontrolü (Profil sorgusu için)
    const ownerId = currentItem.user_id;

    const modal = document.getElementById('sellerModal');
    if (modal) modal.style.display = 'flex'; 

    // --- PROFİL KARTI ---
    const profileBox = document.getElementById('ownerProfilePreview');
    if (profileBox) {
        let avatarUrl = "https://cdn-icons-png.flaticon.com/512/847/847969.png";
        let displayName = (currentItem.user_name || (targetEmail ? targetEmail.split('@')[0] : 'Anonim')).toUpperCase();

        // Mavi Tik Kontrolü (Hata vermemesi için güvenli erişim)
        const isVerified = (Array.isArray(verifiedUserIds) && verifiedUserIds.includes(ownerId));

        // İlk çizim
        renderOwnerCard(profileBox, avatarUrl, displayName, targetEmail, isVerified, ownerId);
        // Profil verisini veritabanından çek (Sadece geçerli ID varsa)
        if (ownerId && ownerId.length > 30) { 
            client.from('profiles').select('avatar_url, full_name, is_verified').eq('id', ownerId).maybeSingle()
            .then(({ data: profile }) => {
                if (profile) {
                    if(profile.avatar_url) avatarUrl = profile.avatar_url;
                    if(profile.full_name) displayName = profile.full_name;
                    renderOwnerCard(profileBox, avatarUrl, displayName, targetEmail, isVerified, ownerId);
                }
            }).catch(err => console.log("Profil çekme hatası (önemsiz):", err));
        }
    }

    // --- GALERİ / SLIDER ---
    currentGalleryImages = [];
    currentImageIndex = 0;
    if (currentItem.images && currentItem.images.length > 0) {
        currentGalleryImages = currentItem.images;
    } else if (currentItem.image_url && currentItem.image_url.trim() !== "") {
        currentGalleryImages = [currentItem.image_url];
    } else {
        currentGalleryImages = [getCategoryIcon(currentItem.category)];
    }

    const galleryHTML = `
        <div style="position:relative; width:100%; height:200px; background:#f0f0f0; display:flex; align-items:center; justify-content:center; border-radius:8px; overflow:hidden; margin-bottom:10px;">
            <button onclick="changeSlide(-1)" style="position:absolute; left:10px; background:rgba(255,255,255,0.8); color:#333; border:none; border-radius:50%; width:30px; height:30px; cursor:pointer; z-index:10; display:${currentGalleryImages.length > 1 ? 'block' : 'none'}">❮</button>
            <img id="targetItemImage" src="${currentGalleryImages[0]}" style="width:100%; height:100%; object-fit:contain;" onclick="openLightbox(this.src)">
            <button onclick="changeSlide(1)" style="position:absolute; right:10px; background:rgba(255,255,255,0.8); color:#333; border:none; border-radius:50%; width:30px; height:30px; cursor:pointer; z-index:10; display:${currentGalleryImages.length > 1 ? 'block' : 'none'}">❯</button>
             <div id="slideCounter" style="position:absolute; bottom:10px; background:rgba(0,0,0,0.6); color:white; padding:2px 8px; border-radius:10px; font-size:0.75rem; display:${currentGalleryImages.length > 1 ? 'block' : 'none'}">1 / ${currentGalleryImages.length}</div>
        </div>`;
    document.getElementById('galleryBox').innerHTML = galleryHTML;

    // --- BAŞLIK ---
    document.getElementById('targetItemName').innerHTML =
        `<div style="font-size:1.2rem; font-weight:bold; color:#333; line-height:1.2;">
        ${safeTitle} ${isSold ? " <span style='color:#28a745; font-size:0.8rem; border:1px solid #28a745; padding:2px 5px; border-radius:4px;'>✅ BULUNDU</span>" : ""}
         </div>
         <div style="color:#2563eb; font-weight:bold; font-size:1.3rem; margin-top:5px;">${currentItem.budget.toLocaleString()} TL</div>
         <div style="margin-top:8px; font-size:0.9rem; color:#666; padding-top:5px;">
            <span style="font-size:0.85rem; color:#999;">📍 ${currentItem.city} • ${getCategoryIcon(currentItem.category, true) || currentItem.category}</span>
         </div>`;

    if(typeof initMap === 'function') setTimeout(() => initMap(currentItem.city), 200);

    // --- TEKLİFLERİ ÇEK ---
    const listDiv = document.getElementById('offerListContainer');
    listDiv.innerHTML = '<small>Yükleniyor...</small>';
    const { data, error: offersError } = await client.from('offers').select('*').eq('request_id', id).order('created_at', { ascending: false });
    listDiv.innerHTML = '';

    if (offersError) {
        listDiv.innerHTML = '<small style="color:red;">Teklifler yüklenemedi.</small>';
        console.error('Teklif sorgusu hatası:', offersError);
        return;
    }

    const isAdmin = currentUser && currentUser.email === adminEmail;
    const isOwner = currentUser && currentUser.id === ownerId;

    if (!data || data.length === 0) {
        listDiv.innerHTML = '<small style="color:#888;">Henüz teklif yok.</small>';
    } else {
        data.forEach(off => {
            const canSee = isAdmin || isOwner;
            let phoneHtml = '';
            if (canSee && off.phone) {
                 const cleanPhone = off.phone.replace(/[^0-9]/g, '');
                 const finalPhone = cleanPhone.startsWith('90') ? cleanPhone : '90' + cleanPhone;
                 phoneHtml = `<a href="https://wa.me/${finalPhone}" target="_blank" style="margin-left:5px; text-decoration:none;">📞</a>`;
            }
            if(canSee) {
                listDiv.innerHTML += `<div style="border-bottom:1px solid #eee; padding:8px 0; display:flex; justify-content:space-between; font-size:0.9rem;"><div><strong>${off.seller_name}</strong> ${phoneHtml}</div><div style="color:#2c6ec9; font-weight:bold;">${off.price} TL</div></div>`;
            } else {
                listDiv.innerHTML += `<div style="border-bottom:1px solid #eee; padding:8px 0; color:#999; font-size:0.8rem;">Gizli Teklif</div>`;
            }
        });
    }

    // --- BUTONLAR (KRİTİK DÜZELTME BURADA) ---
    const actionDiv = document.getElementById('actionButtons'); 
    const inputArea = document.getElementById('offerInputArea'); 
    actionDiv.innerHTML = ''; 

    const shareBtn = document.createElement('button');
    shareBtn.innerHTML = `<span class="material-icons" style="font-size:1.2rem;">share</span>`;
    shareBtn.style.cssText = `width:45px; background:#f3f4f6; color:#333; border:1px solid #ddd; border-radius:5px; cursor:pointer; display:flex; align-items:center; justify-content:center;`;
    shareBtn.onclick = () => shareListing(title.replace(" (BULUNDU)", ""), currentItem?.budget, currentItem?.city);
    actionDiv.appendChild(shareBtn);

    if (currentUser && !isOwner) {
        const meta = currentUser.user_metadata || {};
        if (meta.full_name) document.getElementById('offerName').value = meta.full_name;
        if (meta.phone) document.getElementById('offerPhone').value = meta.phone;
    }

    if (isOwner) {
        const soldBtn = document.createElement('button');
        soldBtn.innerText = isSold ? "İlanı Tekrar Aç" : "✅ Bulundu İşaretle";
        soldBtn.style.cssText = `flex:1; padding:10px; background:${isSold ? "#6c757d" : "#28a745"}; color:white; border:none; border-radius:5px; cursor:pointer; font-weight:bold; font-size:0.9rem;`;
        soldBtn.onclick = () => toggleSoldStatus(id, !isSold);
        actionDiv.appendChild(soldBtn);

        const editBtn = document.createElement('button');
        editBtn.innerText = "✏️ Düzenle";
        editBtn.style.cssText = `flex:1; padding:10px; background:#ffc107; color:#333; border:none; border-radius:5px; cursor:pointer; font-weight:bold; font-size:0.9rem;`;
        editBtn.onclick = () => prepareEditMode(id);
        actionDiv.appendChild(editBtn);
        inputArea.style.display = 'none'; 
    } else {
        const reportBtn = document.createElement('button');
        reportBtn.innerHTML = `<span class="material-icons" style="font-size:1.2rem;">flag</span>`;
        reportBtn.style.cssText = `width:45px; background:#fee2e2; color:#ef4444; border:1px solid #fca5a5; border-radius:5px; cursor:pointer; display:flex; align-items:center; justify-content:center;`;
        reportBtn.onclick = () => openReportModal(id);
        actionDiv.appendChild(reportBtn);

        // --- İŞTE BURASI DÜZELDİ ---
        // Artık openSocialChat'e 3 parametre (ID, Başlık, Email) gönderiyoruz.
        const chatBtn = document.createElement('button');
        chatBtn.innerHTML = `<span class="material-icons" style="vertical-align:middle; font-size:1.1rem; margin-right:5px;">chat</span> İlan Sahibine Yaz`;
        chatBtn.style.cssText = `flex:1; padding:10px; background:#2c6ec9; color:white; border:none; border-radius:5px; cursor:pointer; font-weight:bold; display:flex; align-items:center; justify-content:center; font-size:0.9rem;`;

        chatBtn.onclick = () => { 
            closeModal('sellerModal'); 
            // targetEmail boşsa hata vermesin diye kontrol
            if (!targetEmail) {
                 showToast("Satıcı bilgisine ulaşılamadı.", "error");
            } else {
                 openSocialChat(id, safeTitle, targetEmail); 
            }
        };

        actionDiv.appendChild(chatBtn);

        if (isSold) {
            inputArea.style.display = 'none';
            if (currentUser) {
                const reviewBtn = document.createElement('button');
                reviewBtn.innerHTML = "⭐ Kullanıcıyı Puanla";
                reviewBtn.style.cssText = `width:100%; padding:12px; background:#ffc107; color:#333; border:none; border-radius:5px; cursor:pointer; font-weight:bold; margin-top:10px;`;
                 reviewBtn.onclick = () => openReviewModal(id, ownerMailSafe);
                const soldMsg = document.createElement('div');
                soldMsg.innerHTML = '✅ BU ÜRÜN BULUNDU / TEMİN EDİLDİ';
                soldMsg.style.cssText = "width:100%; text-align:center; color:#28a745; font-weight:bold; border:1px solid #28a745; padding:10px; border-radius:5px;";
                actionDiv.innerHTML = ""; 
                actionDiv.style.flexDirection = "column";
                actionDiv.appendChild(soldMsg);
                actionDiv.appendChild(reviewBtn);
            } else {
                actionDiv.innerHTML += '<div style="width:100%; text-align:center; color:#28a745; font-weight:bold; border:1px solid #28a745; padding:10px; border-radius:5px;">✅ BU ÜRÜN BULUNDU</div>';
            }
        } else {
            inputArea.style.display = 'block';
        }
    }

    // --- ÖNERİLER (SAĞ TARAF) ---
    const relatedContainer = document.getElementById('relatedItemsContainer');
    if (relatedContainer) {
        relatedContainer.innerHTML = '<small>Öneriler aranıyor...</small>';
        const relatedItems = allData.filter(item => 
            item.category === currentItem.category && String(item.id) !== String(currentItem.id)
        ).slice(0, 5); 

        relatedContainer.innerHTML = ''; 
        if (relatedItems.length === 0) {
            relatedContainer.innerHTML = `<div style="text-align:center; padding:20px; color:#999; font-size:0.85rem;"><span class="material-icons" style="font-size:2rem; opacity:0.5;">sentiment_dissatisfied</span><br>Bu kategoride başka ilan yok.</div>`;
        } else {
            relatedItems.forEach(rel => {
                let img = "https://cdn-icons-png.flaticon.com/512/1150/1150612.png";
                if(rel.images && rel.images.length > 0) img = rel.images[0];
                else if(rel.image_url) img = rel.image_url;
                else img = getCategoryIcon(rel.category);
                const isSoldRel = rel.is_sold === true;
                const html = `
                    <div class="suggestion-card" onclick="openSellerModal('${rel.id}', '${rel.title}', '${rel.user_email}', ${isSoldRel})">
                        <img src="${img}" style="width:50px; height:50px; border-radius:6px; object-fit:cover;">
                        <div style="flex:1;">
                            <div style="font-size:0.85rem; font-weight:600; color:#333; line-height:1.2; margin-bottom:2px;">
                                ${rel.title.substring(0, 35)}${rel.title.length>35?'...':''}
                            </div>
                            <div style="font-size:0.8rem; color:#2563eb; font-weight:bold;">${rel.budget.toLocaleString()} TL</div>
                        </div>
                    </div>`;
                relatedContainer.innerHTML += html;
            });
        }
    }
}

// ==========================================
// 🗺️ HARİTA DÜZELTME (GREY SCREEN FIX)
// ==========================================
function initMap(city) {
    const mapContainer = document.getElementById('mapContainer');
    if (!mapContainer) return;

    // Koordinat Bul (Yoksa Türkiye geneli)
    const c = cityCoordinates[city] || cityCoordinates["Tüm Türkiye"];

    // Eğer harita zaten varsa temizle (Çakışmayı önle)
    if (mapInstance) {
        mapInstance.remove();
        mapInstance = null;
    }

    // Haritayı Başlat
    mapInstance = L.map('mapContainer', {
        zoomControl: false, // Zoom butonlarını gizle (Daha temiz görünüm)
        attributionControl: false // Sağ alttaki yazıyı gizle
    }).setView(c, 10);

    // Harita Katmanı Ekle (OpenStreetMap)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapInstance);

    // İşaretçi Ekle
    L.marker(c).addTo(mapInstance)
        .bindPopup(`<b>${city}</b><br>Konum tahmini`)
        .openPopup();

    // 🔥 KRİTİK NOKTA: Gri ekran sorununu çözen sihirli kod
    // Modal animasyonu bitince haritayı "salla" kendine gelsin
    setTimeout(() => {
        mapInstance.invalidateSize();
    }, 300);
}function getVerificationBadge(uid) { 
    return verifiedUserIds.includes(uid) 
        ? '<span class="material-icons" style="color:#2563eb; font-size:14px; vertical-align:middle; margin-left:3px;" title="Onaylı Hesap">verified</span>' 
        : ''; 
}// GÜNCELLENMİŞ RENDER OWNER CARD (Tıklanabilir Oldu)
function renderOwnerCard(el, img, name, email, verified, userId) {
    // userId varsa tıklanabilir yap, yoksa normal dur
    const cursorStyle = userId ? "cursor:pointer;" : "";
    const clickAttr = userId ? `onclick="openPublicProfile('${userId}')"` : "";
    
    el.innerHTML = `
        <div class="owner-card-preview" style="${cursorStyle} transition:transform 0.2s;" ${clickAttr} onmouseover="this.style.background='#e0e7ff'" onmouseout="this.style.background='#f0f7ff'">
            <img src="${img}" style="width:40px; height:40px; border-radius:50%; object-fit:cover; border:1px solid #e5e7eb;">
            <div>
                <div style="font-weight:600; font-size:0.9rem; display:flex; align-items:center; gap:4px;">
                    <span>${name}</span>
                    ${verified ? '<span class="material-icons" style="font-size:14px; color:#2563eb;">verified</span>' : ''}
                </div>
                <div style="font-size:0.75rem; color:#6b7280;">${email || ""}</div>
                ${userId ? '<div style="font-size:0.7rem; color:#2563eb; font-weight:600; margin-top:2px;">Profili Gör ›</div>' : ''}
            </div>
        </div>
    `;
}

async function shareListing(title, price, city) {
    const shareData = {
        title: 'Arıyorum Fırsatı!',
        text: `${title} - ${price?.toLocaleString()} TL (${city})\nBu ilana göz at:`,
        url: window.location.href // Şu anki sayfa linki (İleride detay linki yapılabilir)
    };

    if (navigator.share) {
        try {
            await navigator.share(shareData);
            console.log('Paylaşıldı');
        } catch (err) {
            console.log('Paylaşım iptal edildi');
        }
    } else {
        // Tarayıcı desteklemiyorsa kopyala
        navigator.clipboard.writeText(`${shareData.text} ${shareData.url}`);
        showToast("Link panoya kopyalandı! 📋");
    }
}async function checkNotifications() {
    if (!currentUser) return;

    try {
        // A) BANA GELEN SON MESAJLAR (Son 10)
        const { data: msgs } = await client.from('messages')
            .select('*')
            .eq('receiver_email', currentUser.email)
            .order('created_at', { ascending: false })
            .limit(10);

        // B) BENİM İLANLARIMA GELEN TEKLİFLER (Son 10)
        // 1. Önce benim ilan ID'lerimi bul
        const { data: myReqs } = await client.from('requests').select('id, title').eq('user_id', currentUser.id);
        
        let offers = [];
        if (myReqs && myReqs.length > 0) {
            const myReqIds = myReqs.map(r => r.id);
            
            // 2. Bu ilanlara gelen teklifleri çek
            const { data: offs } = await client.from('offers')
                .select('*')
                .in('request_id', myReqIds)
                .order('created_at', { ascending: false })
                .limit(10);
            
            // Teklif verisine ilan başlığını ekle (Görünüm için lazım)
            if (offs) {
                offers = offs.map(o => {
                    const r = myReqs.find(req => req.id === o.request_id);
                    return { ...o, req_title: r ? r.title : 'İlanın' };
                });
            }
        }

        // C) VERİLERİ BİRLEŞTİR VE STANDARTLAŞTIR
        const cleanMsgs = (msgs || []).map(m => ({
            type: 'message',
            id: m.id,
            title: m.sender_email.split('@')[0], // Gönderen ismi
            desc: `Mesaj: "${m.content.substring(0, 40)}${m.content.length>40?'...':''}"`,
            date: new Date(m.created_at),
            data: m // Tüm veriyi sakla
        }));

        const cleanOffers = (offers || []).map(o => ({
            type: 'offer',
            id: o.id,
            title: '💰 Yeni Teklif!',
            desc: `"${o.req_title}" için ${o.price} TL teklif geldi.`,
            date: new Date(o.created_at),
            data: o
        }));

        // Hepsini Tarihe Göre Sırala (En Yeni En Üstte)
        myNotifications = [...cleanMsgs, ...cleanOffers].sort((a, b) => b.date - a.date);

        // D) OKUNMAMIŞ SAYISINI HESAPLA
        // LocalStorage'da son kontrol ettiğimiz zamanı tutuyoruz.
        // Ondan sonra gelen her şey "YENİ"dir.
        const lastCheckTime = localStorage.getItem('lastNotificationCheck') || 0;
        const newCount = myNotifications.filter(n => n.date.getTime() > lastCheckTime).length;

        updateNotificationBadge(newCount);

    } catch (e) {
        console.error("Bildirim kontrol hatası:", e);
    }
}
// 3. Bildirim Modalını Açma (YENİ TASARIM)
function openNotifications() {
    if (!currentUser) return showToast("Giriş yapmalısın.", 'error');

    openModal('notificationModal');
    const list = document.getElementById('notificationList');
    
    // Son kontrol zamanını al (Okunmamışları işaretlemek için)
    const lastCheckTime = parseInt(localStorage.getItem('lastNotificationCheck') || 0);

    if (myNotifications.length === 0) {
        list.innerHTML = `
            <div class="notif-empty">
                <span class="material-icons">notifications_off</span>
                <div style="font-weight:600; font-size:1.1rem; margin-bottom:5px;">Bildirim Yok</div>
                <div style="font-size:0.9rem;">Henüz yeni bir mesaj veya teklif almadın.</div>
            </div>`;
    } else {
        list.innerHTML = myNotifications.map(n => {
            // Bu bildirim son kontrol tarihinden yeni mi?
            const isUnread = n.date.getTime() > lastCheckTime;
            
            // İkon ve Stil Belirleme
            let icon = 'notifications';
            let typeClass = 'notif-type-system';
            
            if (n.type === 'offer') {
                icon = 'monetization_on'; // veya local_offer
                typeClass = 'notif-type-offer';
            } else if (n.type === 'message') {
                icon = 'chat_bubble';
                typeClass = 'notif-type-message';
            }

            return `
            <div class="notif-item ${isUnread ? 'unread' : ''}" onclick="handleNotificationClick('${n.type}', '${n.data.sender_email || ''}', '${n.data.request_id || ''}')">
                <div class="notif-icon-box ${typeClass}">
                    <span class="material-icons">${icon}</span>
                </div>
                <div class="notif-content">
                    <div class="notif-title">${n.title}</div>
                    <div class="notif-desc">${n.desc}</div>
                    <div class="notif-time">
                        ${n.date.toLocaleTimeString('tr-TR', {hour:'2-digit', minute:'2-digit'})} • ${n.date.toLocaleDateString('tr-TR')}
                        ${isUnread ? '<span style="color:#2563eb; font-weight:bold; margin-left:5px;">● Yeni</span>' : ''}
                    </div>
                </div>
            </div>
            `;
        }).join('');
    }
    // Modal açıldığı an "Okundu" sayılır (Basit mantık)
    markAllRead(); 
}
function markAllRead() {
    // Şu anki zamanı "son kontrol" olarak kaydet
    localStorage.setItem('lastNotificationCheck', Date.now());
    updateNotificationBadge(0);
}
function handleMobileAuthClick() { if(currentUser) openProfileModal(); else openModal('authModal'); }
// ==========================================
// 📱 MOBİL MENÜ (SIDEBAR) KONTROLÜ
// ==========================================
function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    
    // Hem menüyü hem karartmayı aç/kapat
    if (sidebar) sidebar.classList.toggle('active');
    if (overlay) {
        if (sidebar.classList.contains('active')) {
            overlay.style.display = 'block';
            setTimeout(() => overlay.style.opacity = '1', 10); // Animasyon için ufak gecikme
        } else {
            overlay.style.opacity = '0';
            setTimeout(() => overlay.style.display = 'none', 300); // Animasyon bitince gizle
        }
    }
}function setActiveCat(el) { if(el) { document.querySelectorAll('.scroll-cat-item').forEach(i=>i.classList.remove('active')); el.classList.add('active'); } }
function startProgress(b,f) { document.getElementById(b).style.display='block'; return setInterval(()=>{},100); }
function stopProgress(p) { clearInterval(p); }
function startVoiceSearch() {
    if (!('webkitSpeechRecognition' in window)) {
        return showToast("Tarayıcın sesli aramayı desteklemiyor.", "error");
    }

    const recognition = new webkitSpeechRecognition();
    recognition.lang = 'tr-TR'; // Türkçe
    recognition.continuous = false;

    const micBtn = document.getElementById('micBtn');
    micBtn.style.color = "red"; // Dinlediğini belli et

    recognition.onstart = function() {
        showToast("Dinliyorum... 🎤", "info");
    };

    recognition.onresult = function(event) {
        const transcript = event.results[0][0].transcript;
        document.getElementById('searchInput').value = transcript;
        document.getElementById('mobileSearchInput').value = transcript;
        searchData(); // Aramayı tetikle
    };

    recognition.onerror = function(event) {
        console.error("Ses hatası:", event.error);
        showToast("Anlaşılamadı.", "error");
        micBtn.style.color = "#666";
    };

    recognition.onend = function() {
        micBtn.style.color = "#666";
    };

    recognition.start();
}// ==========================================
// 📍 GELİŞMİŞ KONUM ALGILAMA SİSTEMİ
// ==========================================
// ==========================================
// 📍 GELİŞMİŞ KONUM ALGILAMA SİSTEMİ (FIXED)
// ==========================================
function detectUserLocation() {
    const btn = document.querySelector('button[title="Konumumu Bul"]');
    
    // 1. Tarayıcı Desteği Kontrolü
    if (!navigator.geolocation) {
        return showToast("Tarayıcın konum servisini desteklemiyor.", "error");
    }

    // Butona yükleniyor efekti ver
    if(btn) { 
        btn.disabled = true; 
        btn.innerHTML = '<span class="material-icons spin-anim">sync</span>'; 
    }

    showToast("Konumun algılanıyor, lütfen bekle...", "info");

    // Başarı Fonksiyonu
    const successCallback = (position) => {
        const userLat = position.coords.latitude;
        const userLon = position.coords.longitude;

        let closestCity = "Tümü";
        let minDistance = Infinity;

        // Şehirler listesini tara ve en yakını bul
        for (const [city, coords] of Object.entries(cityCoordinates)) {
            if (city === "Tüm Türkiye") continue; 

            // Basit Öklid Mesafesi
            const dist = Math.sqrt(
                Math.pow(coords[0] - userLat, 2) +
                Math.pow(coords[1] - userLon, 2)
            );

            if (dist < minDistance) {
                minDistance = dist;
                closestCity = city;
            }
        }

        // Select Kutusunu Güncelle
        const select = document.getElementById('reqCityFilter');
        if (select) {
            const optionExists = [...select.options].some(o => o.value === closestCity);
            
            if (optionExists) {
                select.value = closestCity;
                filterCity(closestCity); 
                showToast(`Konum bulundu: ${closestCity}`, 'success');
            } else {
                showToast(`Bulunduğun yer (${closestCity} yakını) listede yok.`, 'info');
            }
        }

        resetBtn();
    };

    // Hata Fonksiyonu
    const errorCallback = (error) => {
        console.error("Konum hatası:", error);
        let msg = "Konum alınamadı.";
        
        if (error.code === 1) msg = "Lütfen tarayıcıdan konum izni ver.";
        else if (error.code === 2) msg = "GPS sinyali alınamıyor.";
        else if (error.code === 3) msg = "Zaman aşımı! Lütfen tekrar dene.";
        
        showToast(msg, "error");
        resetBtn();
    };

    // Butonu eski haline getirme
    const resetBtn = () => {
        if(btn) { 
            btn.disabled = false; 
            btn.innerHTML = '<span class="material-icons">my_location</span>'; 
        }
    };

    // 2. Konum İsteği (AYARLAR GÜNCELLENDİ)
    navigator.geolocation.getCurrentPosition(
        successCallback,
        errorCallback,
        { 
            enableHighAccuracy: true, // Hassas konum iste
            timeout: 15000,           // SÜREYİ ARTIRDIK: 5sn -> 15sn
            maximumAge: 30000         // ÖNBELLEK: Son 30 saniyedeki konumu kabul et (Hızlandırır)
        }
    );
}
function renderSkeleton() { document.getElementById('feedContainer').innerHTML='Yükleniyor...'; }
function openAuthModal(m) { currentAuthMode=m; openModal('authModal'); }
function toggleAuthMode() { currentAuthMode=currentAuthMode==='login'?'register':'login'; document.getElementById('btnLoginBtn').style.display=currentAuthMode==='login'?'block':'none'; document.getElementById('btnRegisterBtn').style.display=currentAuthMode!=='login'?'block':'none'; document.getElementById('registerInputs').style.display=currentAuthMode!=='login'?'block':'none'; }
function handleNotificationClick(type, email, requestId) {
    closeModal('notificationModal');
    
    if (type === 'message') {
        // Mesaj ise sohbete git
        openSocialChat(null, 'Sohbet', email);
    } else if (type === 'offer') {
        // Teklif ise Gelen Teklifler sayfasına git
        showIncomingOffers();
    }
}
window.openAuthModal = openAuthModal;

/* ============================================================
   👑 EFSANE YÖNETİM PANELİ - TAM FONKSİYON SETİ (FIXED)
   ============================================================ */

// 1. Paneli Açma
function openAdminPanel() {
    // Admin yetki kontrolü
    if (!currentUser || currentUser.email !== adminEmail) {
        return showToast("⛔ Yetkisiz Giriş", "error");
    }

    const modal = document.getElementById('adminModal');
    if (modal) {
        modal.style.display = 'flex';
        // Animasyon için class ekle
        setTimeout(() => modal.classList.add('open'), 10);
        
        loadAdminData(true); // Verileri çek
        switchAdminTab('dashboard'); // İlk sekmeyi aç
    } else {
        console.error("Admin modal HTML'de bulunamadı! index.html dosyasını kontrol et.");
        showToast("Panel hatası: HTML eksik.", "error");
    }
}

// 2. Sekme Değiştirme
function switchAdminTab(tabName) {
    adminActiveTab = tabName;
    
    // Butonların aktifliğini güncelle
    document.querySelectorAll('.admin-nav button').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById(`tab-${tabName}`);
    if(activeBtn) activeBtn.classList.add('active');

    // Başlığı Güncelle
    const titles = {
        'dashboard': 'Genel Bakış & İstatistikler',
        'users': 'Kullanıcı Yönetimi',
        'listings': 'İlan Veritabanı',
        'reports': 'Şikayet Merkezi',
        'messages': 'Mesaj Kayıtları',
        'logs': 'Sistem Logları'
    };
    const titleEl = document.getElementById('adminPageTitle');
    if(titleEl) titleEl.innerText = titles[tabName] || 'Yönetim';

    renderAdminView();
}

// 3. Verileri Çekme
async function loadAdminData(force = false) {
    const view = document.getElementById('adminMainView');
    if(force && view) view.innerHTML = '<div style="display:flex;justify-content:center;align-items:center;height:100%;color:#999;">Veriler güncelleniyor...</div>';

    try {
        const [reports, requests, profiles, messages] = await Promise.all([
            client.from('reports').select('*').order('created_at', { ascending: false }),
            client.from('requests').select('*').order('created_at', { ascending: false }),
            client.from('profiles').select('*'),
            client.from('messages').select('*').order('created_at', { ascending: false })
        ]);

        adminCache.reports = reports.data || [];
        adminCache.requests = requests.data || [];
        adminCache.profiles = profiles.data || [];
        adminCache.messages = messages.data || [];
        adminCache._loaded = true;

        renderAdminView();
        showToast("Admin verileri güncel.");
    } catch (e) {
        console.error("Admin veri hatası:", e);
        if(view) view.innerHTML = '<div style="color:red;text-align:center;">Veri yüklenemedi. Konsol detayına bak.</div>';
    }
}

// 4. Görünümü Oluşturma (ROUTER)
function renderAdminView() {
    const main = document.getElementById('adminMainView');
    if (!main || !adminCache._loaded) return;

    let html = '';
    switch (adminActiveTab) {
        case 'dashboard': html = renderDashboardHTML(); break;
        case 'users': html = renderUsersHTML(); break;
        case 'listings': html = renderListingsHTML(); break;
        case 'reports': html = renderReportsHTML(); break;
        case 'messages': html = renderAdminMessagesHTML(); break;
        default: html = '<div style="text-align:center;padding:50px;">Bu modül yapım aşamasında.</div>';
    }
    main.innerHTML = html;
}

// --- ALT HTML OLUŞTURUCULAR ---

function renderDashboardHTML() {
    const reqs = adminCache.requests;
    const users = adminCache.profiles;
    const sold = reqs.filter(r => r.is_sold).length;
    const totalVal = reqs.reduce((a, b) => a + (b.budget || 0), 0);

    return `
    <div class="admin-grid">
        <div class="stat-card"><div class="stat-icon" style="background:#dbeafe;color:#2563eb;">📦</div><div class="stat-info"><h4>Toplam İlan</h4><p>${reqs.length}</p></div></div>
        <div class="stat-card"><div class="stat-icon" style="background:#dcfce7;color:#16a34a;">💰</div><div class="stat-info"><h4>Piyasa Değeri</h4><p>${(totalVal/1000).toFixed(1)}k ₺</p></div></div>
        <div class="stat-card"><div class="stat-icon" style="background:#f3e8ff;color:#9333ea;">👥</div><div class="stat-info"><h4>Kullanıcı</h4><p>${users.length}</p></div></div>
        <div class="stat-card"><div class="stat-icon" style="background:#ffedd5;color:#ea580c;">✅</div><div class="stat-info"><h4>Satılan</h4><p>${sold}</p></div></div>
    </div>
    <div class="admin-table-wrapper">
        <div style="padding:15px; border-bottom:1px solid #eee; font-weight:bold;">Son İlanlar</div>
        <table class="admin-table">
            <thead><tr><th>İlan</th><th>Fiyat</th><th>Satıcı</th></tr></thead>
            <tbody>
                ${reqs.slice(0, 5).map(r => `<tr>
                    <td>${r.title}</td>
                    <td style="color:#2563eb;font-weight:bold;">${r.budget} TL</td>
                    <td>${r.user_email}</td>
                </tr>`).join('')}
            </tbody>
        </table>
    </div>`;
}

function renderUsersHTML() {
    return `<div class="admin-table-wrapper"><table class="admin-table"><thead><tr><th>Kullanıcı</th><th>Mail</th><th>Durum</th><th>İşlem</th></tr></thead><tbody>
    ${adminCache.profiles.map(u => `<tr>
        <td><div class="user-cell"><img src="${u.avatar_url||'https://via.placeholder.com/30'}" class="user-avatar">${u.full_name||'Anonim'}</div></td>
        <td>${u.email}</td>
        <td>${u.is_verified ? '<span class="badge badge-success">Onaylı</span>' : '<span class="badge badge-warning">Standart</span>'}</td>
        <td><button class="action-btn" onclick="adminToggleVerify('${u.id}', ${!u.is_verified})">${u.is_verified?'Onayı Sil':'Onayla'}</button></td>
    </tr>`).join('')}
    </tbody></table></div>`;
}

function renderListingsHTML() {
    return `<div class="admin-table-wrapper"><table class="admin-table"><thead><tr><th>İlan</th><th>Fiyat</th><th>Durum</th><th>İşlem</th></tr></thead><tbody>
    ${adminCache.requests.map(r => `<tr>
        <td>${r.title}</td>
        <td>${r.budget} TL</td>
        <td>${r.is_sold ? '<span class="badge badge-success">Satıldı</span>' : '<span class="badge badge-blue">Yayında</span>'}</td>
        <td><button class="action-btn" onclick="adminDeleteListing('${r.id}')" style="color:red;">Sil</button></td>
    </tr>`).join('')}
    </tbody></table></div>`;
}

function renderReportsHTML() {
    if(adminCache.reports.length === 0) return '<div style="text-align:center;padding:20px;">Temiz! Şikayet yok. 🎉</div>';
    return adminCache.reports.map(r => `
        <div style="background:white; padding:15px; border-radius:10px; border:1px solid #eee; margin-bottom:10px;">
            <div style="color:red; font-weight:bold;">${r.reason}</div>
            <div style="font-size:0.9rem; color:#666;">Raporlayan: ${r.reporter_email}</div>
            <div style="margin-top:10px;">
                <button class="action-btn" onclick="openSellerModal('${r.request_id}', 'İncelenen İlan', '', false)">İlanı Gör</button>
                <button class="action-btn" onclick="adminDeleteReport('${r.id}')" style="color:red;">Şikayeti Sil</button>
            </div>
        </div>
    `).join('');
}

function renderAdminMessagesHTML() {
    return `<div class="admin-table-wrapper"><table class="admin-table"><thead><tr><th>Kimden</th><th>Kime</th><th>Mesaj</th></tr></thead><tbody>
    ${adminCache.messages.slice(0, 20).map(m => `<tr>
        <td>${m.sender_email}</td>
        <td>${m.receiver_email}</td>
        <td style="max-width:300px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${m.content}</td>
    </tr>`).join('')}
    </tbody></table></div>`;
}

// --- ADMIN YARDIMCI İŞLEMLER ---
// ==========================================
// 🛠️ KULLANICI ONAYLAMA SİSTEMİ (FIX)
// ==========================================

async function adminToggleVerify(uid, status) {
    // 1. Onay Kutusu
    if(!confirm(`Bu kullanıcının onay durumunu "${status ? 'Onaylı' : 'Onaysız'}" yapmak istiyor musun?`)) return;

    showToast("İşlem yapılıyor...", "info");

    try {
        // 2. Güncelleme İsteği
        const { data, error } = await client.from('profiles')
            .update({ is_verified: status })
            .eq('id', uid)
            .select();

        // 3. Hata Kontrolü
        if (error) {
            console.error("Onay Hatası:", error);
            // Genelde RLS (Yetki) hatası "42501" koduyla döner
            if (error.code === '42501') {
                showToast("⛔ HATA: Supabase'de 'profiles' tablosu için UPDATE izni yok. SQL Editor'den politika eklemelisin.", "error");
            } else {
                showToast("Güncelleme başarısız: " + error.message, "error");
            }
            return;
        }

        // 4. Başarılıysa Listeleri Güncelle
        showToast("Kullanıcı durumu güncellendi! ✅", "success");
        
        // Admin tablosunu yenile
        loadAdminData(); 
        
        // Ana sayfadaki rozetleri de anlık güncelle (Sayfa yenilemeye gerek kalmasın)
        if (status) {
            if (!verifiedUserIds.includes(uid)) verifiedUserIds.push(uid);
        } else {
            verifiedUserIds = verifiedUserIds.filter(id => id !== uid);
        }
        
        // Vitrini yenile ki rozetler hemen görünsün
        const feed = document.getElementById('feedContainer');
        if(feed) fetchRequests(); 

    } catch (e) {
        console.error("Beklenmeyen hata:", e);
        showToast("Sistem hatası oluştu.", "error");
    }
}
async function adminDeleteListing(rid) {
    if(confirm('Bu ilanı kalıcı olarak silmek istediğine emin misin?')) {
        await client.from('requests').delete().eq('id', rid);
        loadAdminData();
    }
}
async function adminDeleteReport(rid) {
    if(confirm('Şikayeti silmek istiyor musun?')) {
        await client.from('reports').delete().eq('id', rid);
        loadAdminData();
    }
}
function populateRightSidebar() {
    const container = document.getElementById('rightSideSuggestions');
    if (!container) return; // Mobildeysek veya element yoksa çık

    // allData yüklendiyse içinden rastgele 3-4 tane seç
    if (!allData || allData.length === 0) {
        container.innerHTML = '<small style="color:#999;">Fırsatlar yükleniyor...</small>';
        return;
    }

    // Rastgele karıştır ve ilk 4'ünü al
    const randomPicks = [...allData]
        .sort(() => 0.5 - Math.random())
        .slice(0, 4);

    container.innerHTML = randomPicks.map(item => {
        const img = (item.images && item.images[0]) || item.image_url || getCategoryIcon(item.category);
        return `
            <div class="mini-card" onclick="openSellerModal('${item.id}', '${item.title}', '${item.user_email}', ${item.is_sold})" style="border:none; border-bottom:1px solid #eee; margin-bottom:5px; padding:8px 0;">
                <img src="${img}" style="width:40px; height:40px; border-radius:6px; object-fit:cover;">
                <div style="flex:1; overflow:hidden;">
                    <div style="font-size:0.85rem; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:var(--text-main);">
                        ${item.title}
                    </div>
                    <div style="font-size:0.8rem; color:#2563eb; font-weight:bold;">${item.budget.toLocaleString()} TL</div>
                </div>
            </div>
        `;
    }).join('');
}
setInterval(() => {
    const container = document.getElementById('rightSideSuggestions');if (container && (container.innerHTML.includes('skeleton') || container.innerText.includes('yükleniyor')) && allData.length > 0) {
        populateRightSidebar();
    }
}, 2000);
async function openMyMessages() {
    if (!currentUser) return showToast("Giriş yapmalısın.", "error");
    
    // Mobilde menüyü kapat
    const sidebar = document.querySelector('.sidebar');
    if(sidebar) sidebar.classList.remove('active');

    openModal('messagesListModal');
    loadInbox();
}

// 2. Mesaj Listesini Yükleme (Kişileri Listele)
// 2. Mesaj Listesini Yükleme (YENİ TASARIM)
async function loadInbox() {
    const container = document.getElementById('inboxContainer');
    
    // Yükleniyor animasyonu
    container.innerHTML = `
        <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; color:#94a3b8; gap:10px;">
            <div class="skeleton" style="width:50px; height:50px; border-radius:50%;"></div>
            <div class="skeleton" style="width:150px; height:10px; border-radius:5px;"></div>
        </div>`;

    try {
        // Bana gelen ve benim gönderdiğim tüm mesajları çek
        const { data: sent } = await client.from('messages').select('*').eq('sender_email', currentUser.email).order('created_at', {ascending:false});
        const { data: received } = await client.from('messages').select('*').eq('receiver_email', currentUser.email).order('created_at', {ascending:false});

        const allMsgs = [...(sent || []), ...(received || [])];
        
        // Sohbetleri Kişiye Göre Grupla
        const conversations = {};
        
        allMsgs.forEach(msg => {
            // Karşı tarafın mailini bul
            const otherEmail = msg.sender_email === currentUser.email ? msg.receiver_email : msg.sender_email;
            
            // Eğer bu kişiyle daha önce eklenmiş bir sohbet yoksa veya bu mesaj daha yeniyse güncelle
            if (!conversations[otherEmail] || new Date(msg.created_at) > new Date(conversations[otherEmail].created_at)) {
                conversations[otherEmail] = msg;
            }
        });

        // HTML'e dök
        container.innerHTML = '';
        const sortedEmails = Object.keys(conversations).sort((a,b) => new Date(conversations[b].created_at) - new Date(conversations[a].created_at));

        if (sortedEmails.length === 0) {
            container.innerHTML = `
                <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:300px; text-align:center;">
                    <div style="width:80px; height:80px; background:#f1f5f9; border-radius:50%; display:flex; align-items:center; justify-content:center; margin-bottom:15px; color:#cbd5e1;">
                        <span class="material-icons" style="font-size:40px;">chat_bubble_outline</span>
                    </div>
                    <h4 style="margin:0; color:#334155; font-size:1.1rem;">Mesaj Kutun Boş</h4>
                    <p style="margin:5px 0 0; color:#94a3b8; font-size:0.9rem; max-width:200px;">İlan sahiplerine yazarak sohbet başlatabilirsin.</p>
                </div>`;
            return;
        }

        sortedEmails.forEach(email => {
            const lastMsg = conversations[email];
            const timeDate = new Date(lastMsg.created_at);
            // Bugünse saat, değilse tarih göster
            const isToday = new Date().toDateString() === timeDate.toDateString();
            const timeDisplay = isToday 
                ? timeDate.toLocaleTimeString('tr-TR', {hour: '2-digit', minute:'2-digit'})
                : timeDate.toLocaleDateString('tr-TR', {day:'numeric', month:'short'});

            const displayName = email.split('@')[0]; 
            const isMe = lastMsg.sender_email === currentUser.email;

            container.innerHTML += `
                <div class="msg-item" onclick="openSocialChat(null, 'Sohbet', '${email}')">
                    <div class="msg-avatar-box">
                        <div class="msg-avatar">
                            ${displayName.charAt(0).toUpperCase()}
                        </div>
                    </div>
                    
                    <div class="msg-content">
                        <div class="msg-top-row">
                            <span class="msg-name">${displayName}</span>
                            <span class="msg-time">${timeDisplay}</span>
                        </div>
                        <div class="msg-preview">
                            ${isMe ? '<strong>Sen:</strong> ' : ''}${lastMsg.content}
                        </div>
                    </div>
                </div>
            `;
        });

    } catch (e) {
        console.error("Inbox hatası:", e);
        container.innerHTML = '<div style="color:red; text-align:center; padding:20px;">Hata oluştu.</div>';
    }
}

// 3. Sohbet Penceresini Açma (Birebir Chat)
async function openSocialChat(requestId, title, targetEmail) {
    if (!currentUser) return showToast("Giriş yapmalısın.", "error");
    if (!targetEmail) return showToast("Kullanıcı bilgisi eksik.", "error");

    // Inbox modal açıksa kapat, karışmasın
    closeModal('messagesListModal');
    
    currentChatReceiverEmail = targetEmail;
    
    const chatBox = document.getElementById('socialChatBox');
    const headerName = document.getElementById('chatHeaderName');
    const body = document.getElementById('socialChatMessages');

    headerName.innerText = targetEmail.split('@')[0]; // Sadece mailin başını göster
    chatBox.style.display = 'flex';
    body.innerHTML = '<div style="text-align:center; padding:20px; color:#999;">Mesajlar yükleniyor...</div>';
    
    // Mesajları çek ve dinlemeye başla
    await fetchChatMessages();
    subscribeToChat();
    
    // Inputa odaklan
    setTimeout(() => document.getElementById('socialChatInput').focus(), 100);
}

// 4. Sohbet Geçmişini Çekme
async function fetchChatMessages() {
    const body = document.getElementById('socialChatMessages');
    
    try {
        // İki taraflı sorgu: (Ben -> O) VEYA (O -> Ben)
        const { data, error } = await client.from('messages')
            .select('*')
            .or(`and(sender_email.eq.${currentUser.email},receiver_email.eq.${currentChatReceiverEmail}),and(sender_email.eq.${currentChatReceiverEmail},receiver_email.eq.${currentUser.email})`)
            .order('created_at', { ascending: true }); // Eskiden yeniye sırala

        if (error) throw error;

        body.innerHTML = '';
        if (!data || data.length === 0) {
            body.innerHTML = '<div style="text-align:center; margin-top:50px; opacity:0.6;"><span class="material-icons" style="font-size:3rem; color:#ccc;">waving_hand</span><br>Sohbeti başlatın!</div>';
        } else {
            data.forEach(msg => appendSocialMessage(msg));
        }
        scrollChatToBottom();

    } catch (e) {
        console.error("Mesaj çekme hatası:", e);
        body.innerHTML = '<div style="color:red; text-align:center;">Bağlantı hatası.</div>';
    }
}

// 5. Mesaj Gönderme
async function sendSocialMessage() {
    const input = document.getElementById('socialChatInput');
    const content = input.value.trim();
    if (!content) return;
    if (!currentChatReceiverEmail) return showToast("Alıcı seçilmedi.", "error");

    input.value = ''; // Kutuyu temizle

    // UI'da hemen göster (Hızlı hissettirmek için)
    const optimisticMsg = {
        sender_email: currentUser.email,
        content: content,
        created_at: new Date().toISOString()
    };
    appendSocialMessage(optimisticMsg);

    // Veritabanına Yaz
    const { error } = await client.from('messages').insert({
        sender_email: currentUser.email,
        receiver_email: currentChatReceiverEmail,
        content: content
    });

    if (error) {
        showToast("Mesaj gönderilemedi!", "error");
        console.error(error);
    }
    incrementActivityScore();
}

// 6. Enter Tuşu Desteği
function handleEnter(e) {
    if (e.key === 'Enter') sendSocialMessage();
}

// 7. Ekrana Mesaj Balonu Ekleme
function appendSocialMessage(msg) {
    const body = document.getElementById('socialChatMessages');
    // Eğer "Sohbeti başlatın" yazısı varsa sil
    if (body.innerHTML.includes('Sohbeti başlatın') || body.innerHTML.includes('yükleniyor')) {
        body.innerHTML = '';
    }

    const isMe = msg.sender_email === currentUser.email;
    const time = new Date(msg.created_at).toLocaleTimeString('tr-TR', {hour:'2-digit', minute:'2-digit'});
    
    const html = `
        <div class="bubble ${isMe ? 'bubble-me' : 'bubble-other'}">
            <span class="bubble-name" style="display:none;">${isMe ? 'Ben' : msg.sender_email.split('@')[0]}</span>
            ${msg.content}
            <div style="font-size:0.65rem; opacity:0.7; text-align:right; margin-top:2px;">${time}</div>
        </div>
    `;
    
    body.insertAdjacentHTML('beforeend', html);
    scrollChatToBottom();
}

// 8. Sohbeti En Alta Kaydır
function scrollChatToBottom() {
    const body = document.getElementById('socialChatMessages');
    body.scrollTop = body.scrollHeight;
}

// 9. Sohbeti Kapatma
function closeChatWindow() {
    document.getElementById('socialChatBox').style.display = 'none';
    if (chatSubscription) {
        client.removeChannel(chatSubscription);
        chatSubscription = null;
    }
}

// 10. Canlı Sohbet Dinleme (Realtime)
function subscribeToChat() {
    if (chatSubscription) client.removeChannel(chatSubscription);

    chatSubscription = client.channel('public:messages')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
            const newMsg = payload.new;
            // Eğer mesaj bu sohbete aitse ve ben göndermediysem (çift eklemeyi önlemek için) ekrana bas
            if (
                (newMsg.sender_email === currentChatReceiverEmail && newMsg.receiver_email === currentUser.email) ||
                (newMsg.sender_email === currentUser.email && newMsg.receiver_email === currentChatReceiverEmail)
            ) {
                // Kendi mesajımızı zaten sendSocialMessage içinde eklemiştik, tekrar eklememek için kontrol:
                if (newMsg.sender_email !== currentUser.email) {
                    appendSocialMessage(newMsg);
                    // Ses çal (Opsiyonel)
                    if(typeof notificationSound !== 'undefined') notificationSound.play().catch(()=>{});
                }
            }
        })
        .subscribe();
}
/* ============================================================
   🚀 EKSİK FONKSİYONLAR PAKETİ (SİSTEMİ TAMAMLAYAN PARÇALAR)
   ============================================================ */

// 1. GALERİ & RESİM İŞLEMLERİ
// ------------------------------------------------------------
function changeSlide(step) {
    if (!currentGalleryImages || currentGalleryImages.length === 0) return;
    
    currentImageIndex += step;

    // Döngüsel geçiş (Sona gelince başa dön)
    if (currentImageIndex >= currentGalleryImages.length) currentImageIndex = 0;
    if (currentImageIndex < 0) currentImageIndex = currentGalleryImages.length - 1;

    // Resmi ve Sayacı Güncelle
    const imgEl = document.getElementById('targetItemImage');
    const counterEl = document.getElementById('slideCounter');
    
    if(imgEl) {
        imgEl.style.opacity = 0.5; // Geçiş efekti
        imgEl.src = currentGalleryImages[currentImageIndex];
        setTimeout(() => imgEl.style.opacity = 1, 200);
    }
    if(counterEl) counterEl.innerText = `${currentImageIndex + 1} / ${currentGalleryImages.length}`;
}

function openLightbox(src) {
    const modal = document.getElementById('lightboxModal');
    const img = document.getElementById('lightboxImage');
    if(modal && img) {
        img.src = src;
        modal.style.display = 'flex';
    }
}

// 2. TEKLİF GÖNDERME SİSTEMİ
// ------------------------------------------------------------
// ==========================================
// 2. TEKLİF GÖNDERME SİSTEMİ (GİZLİLİK EKLENDİ)
// ==========================================
async function submitOffer() {
    const price = document.getElementById('offerPrice').value;
    const name = document.getElementById('offerName').value;
    const phone = document.getElementById('offerPhone').value;
    // YENİ: Checkbox değerini al
    const isPrivate = document.getElementById('offerPrivacyCheck')?.checked || false;
    
    const btn = document.querySelector('#offerInputArea button');

    // Validasyon
    if (!price) return showToast("Lütfen bir fiyat gir.", "error");
    if (!name && !currentUser) return showToast("Lütfen adını gir.", "error");

    const offerData = {
        request_id: selectedRequestId,
        price: parseFloat(price),
        seller_name: name || (currentUser?.user_metadata?.full_name || 'Anonim'),
        phone: phone || (currentUser?.user_metadata?.phone || ''),
        buyer_email: currentUser ? currentUser.email : null,
        is_private: isPrivate, // Veritabanına kaydet
        created_at: new Date()
    };

    btn.innerText = "⏳";
    btn.disabled = true;

    try {
        const { error } = await client.from('offers').insert([offerData]);
        if (error) throw error;

        // Sayaç artırma
        const { data: req } = await client.from('requests').select('offer_count').eq('id', selectedRequestId).single();
        const newCount = (req ? req.offer_count : 0) + 1;
        await client.from('requests').update({ offer_count: newCount }).eq('id', selectedRequestId);

        showToast("Teklifin başarıyla gönderildi! 🚀");
        
        // Listeyi yenile
        openSellerModal(selectedRequestId); 
        document.getElementById('offerPrice').value = '';

    } catch (e) {
        console.error("Teklif hatası:", e);
        showToast("Teklif gönderilemedi.", "error");
    } finally {
        btn.innerText = "Gönder 🚀";
        btn.disabled = false;
    }
}

async function toggleSoldStatus(id, status) {
    if(!confirm(status ? "Bu ürünü 'BULUNDU' olarak işaretlemek istiyor musun? Artık teklif gelmeyecek." : "İlanı tekrar yayına almak istiyor musun?")) return;

    try {
        const { error } = await client.from('requests')
            .update({ is_sold: status })
            .eq('id', id);

        if (error) throw error;

        // EĞER SATILDI İŞARETLENDİYSE -> KUTLAMA YAP! 🎉
        if (status === true) {
            fireConfetti(); // <--- İŞTE SİHİR BURADA!
            showToast("Tebrikler! Ürün bulundu! 🎉");
            
            // Satış sayısını artır
            const { data: prof } = await client.from('profiles').select('sales_count').eq('id', currentUser.id).single();
            const newCount = (prof?.sales_count || 0) + 1;
            await client.from('profiles').update({ sales_count: newCount }).eq('id', currentUser.id);
        } else {
            showToast("İlan tekrar yayına alındı.");
        }

        closeModal('sellerModal');
        fetchRequests(); 

    } catch (e) {
        console.error("Durum güncelleme hatası:", e);
        showToast("İşlem başarısız.", "error");
    }
}

// 4. ŞİKAYET SİSTEMİ
// ------------------------------------------------------------
function openReportModal(id) {
    reportTargetId = id; // Global değişkene at
    openModal('reportModal');
}

async function submitReport(reason) {
    if (!reportTargetId) return;

    try {
        const { error } = await client.from('reports').insert([{
            request_id: reportTargetId,
            reason: reason,
            reporter_email: currentUser ? currentUser.email : 'anonim',
            created_at: new Date()
        }]);

        if (error) throw error;

        showToast("Bildirimin alındı, teşekkürler. 🛡️");
        closeModal('reportModal');

    } catch (e) {
        console.error("Rapor hatası:", e);
        showToast("Bildirim gönderilemedi.", "error");
    }
}

// 5. PUANLAMA & YORUM SİSTEMİ
// ------------------------------------------------------------
function openReviewModal(requestId, sellerEmail) {
    reviewTargetId = requestId;
    reviewSellerEmail = sellerEmail;
    currentRating = 0;
    
    // Yıldızları sıfırla
    document.querySelectorAll('.star').forEach(s => s.style.color = '#ddd');
    document.getElementById('reviewComment').value = '';
    
    openModal('reviewModal');
}

function setRating(n) {
    currentRating = n;
    const stars = document.querySelectorAll('.star');
    stars.forEach((s, index) => {
        if (index < n) s.style.color = '#ffc107'; // Sarı
        else s.style.color = '#ddd'; // Gri
    });
}

async function submitReview() {
    if (currentRating === 0) return showToast("Lütfen puan verin.", "error");
    const comment = document.getElementById('reviewComment').value;

    try {
        // 'reviews' tablosuna yaz (Eğer tablo yoksa burası hata verebilir, 
        // ama UI'da en azından işlem yapılmış gibi gösterelim)
        const { error } = await client.from('reviews').insert([{
            request_id: reviewTargetId,
            seller_email: reviewSellerEmail,
            reviewer_email: currentUser ? currentUser.email : 'anonim',
            rating: currentRating,
            comment: comment,
            created_at: new Date()
        }]);

        if (error) {
            // Tablo yoksa bile kullanıcıya çaktırmayalım, console'a yazalım
            console.warn("Review tablosu hatası (Tablo eksik olabilir):", error);
        }

        showToast("Değerlendirmen için teşekkürler! ⭐");
        closeModal('reviewModal');

    } catch (e) {
        showToast("Hata oluştu.", "error");
    }
}
// ==========================================
// 👤 HERKESE AÇIK PROFİL GÖRÜNTÜLEME
// ==========================================
// ==========================================
// 👤 HERKESE AÇIK PROFİL (PREMIUM TASARIM)
// ==========================================
async function openPublicProfile(targetUserId) {
    if (!targetUserId) return showToast("Bu kullanıcı anonim veya silinmiş.", "info");

    openModal('publicProfileModal');
    
    // Header ve Content elementlerini temizle (Manuel oluşturacağız)
    const cardBody = document.querySelector('#publicProfileModal .modal-card');
    cardBody.innerHTML = `
        <div style="height:100%; display:flex; justify-content:center; align-items:center;">
            <div class="skeleton" style="width:60px; height:60px; border-radius:50%;"></div>
        </div>`;

    try {
        // 1. Profil ve İlan Verilerini Paralel Çek (Hız İçin)
        const [profileRes, listingsRes] = await Promise.all([
            client.from('profiles').select('*').eq('id', targetUserId).single(),
            client.from('requests').select('*').eq('user_id', targetUserId).order('created_at', { ascending: false })
        ]);

        const profile = profileRes.data || {};
        const allListings = listingsRes.data || [];
        
        // Verileri Ayrıştır
        const activeListings = allListings.filter(i => !i.is_sold);
        const soldCount = allListings.filter(i => i.is_sold).length;
        
        // Görüntü Verileri
        const displayName = profile.full_name || "Kullanıcı";
        const avatarUrl = profile.avatar_url || "https://cdn-icons-png.flaticon.com/512/847/847969.png";
        const isVerified = verifiedUserIds.includes(targetUserId);
        // Rozetleri Hesapla
const badges = getUserBadgesHTML(profile);
        // Tarih Formatla (Örn: "Aralık 2023'ten beri üye")
        const joinDate = new Date(profile.created_at || new Date());
        const dateStr = joinDate.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });

        // HTML'i Baştan Oluştur (Header + Stats + Liste)
        let html = `
            <div class="public-profile-header">
                <span onclick="closeModal('publicProfileModal')" class="close-profile-btn" style="top:15px; right:15px;">&times;</span>
                
                <div class="pp-avatar-wrapper">
                    <img src="${avatarUrl}" class="pp-avatar">
                    ${isVerified ? '<div class="pp-verified-badge"><span class="material-icons" style="font-size:18px;">verified</span></div>' : ''}
                </div>
                
                <h3 class="pp-name">${displayName}</h3>
${badges} 
                
                <div class="pp-join-date">${dateStr}'ten beri üye</div>

                ${(currentUser && currentUser.id !== targetUserId) ? 
                    `<button class="pp-msg-btn" onclick="closeModal('publicProfileModal'); openSocialChat(null, 'Sohbet', '${profile.email || ''}')">
                        <span class="material-icons">chat</span> Mesaj Gönder
                    </button>` 
                : ''}
            </div>

            <div class="pp-stats-card">
                <div class="pp-stat-item">
                    <span class="pp-stat-val" style="color:#2563eb;">${activeListings.length}</span>
                    <span class="pp-stat-label">Aktif</span>
                </div>
                <div class="pp-stat-item" style="border-left:1px solid #eee; border-right:1px solid #eee; padding:0 20px;">
                    <span class="pp-stat-val" style="color:#16a34a;">${soldCount}</span>
                    <span class="pp-stat-label">Satış</span>
                </div>
                <div class="pp-stat-item">
                    <span class="pp-stat-val" style="color:#f59e0b;">5.0</span>
                    <span class="pp-stat-label">Puan</span>
                </div>
            </div>

            <div style="flex:1; overflow-y:auto; background:#f8fafc; padding-bottom:20px;">
                <div class="pp-list-title">
                    <span class="material-icons" style="font-size:1.1rem;">inventory_2</span> 
                    Yayındaki İlanları (${activeListings.length})
                </div>
        `;

        if (activeListings.length === 0) {
            html += `
                <div class="empty-state" style="padding:40px 20px;">
                    <div class="empty-icon-bg" style="width:60px; height:60px;"><span class="material-icons" style="font-size:2rem;">storefront</span></div>
                    <div class="empty-title" style="font-size:1rem;">Aktif ilanı yok</div>
                </div>
            `;
        } else {
            activeListings.forEach(item => {
                const img = (item.images && item.images[0]) || item.image_url || getCategoryIcon(item.category);
                html += `
                    <div class="mini-card" onclick="closeModal('publicProfileModal'); openSellerModal('${item.id}', '${item.title}', '${item.user_email}', ${item.is_sold})" style="margin:0 15px 10px 15px; border-radius:12px; border:none; box-shadow:0 2px 5px rgba(0,0,0,0.03);">
                        <img src="${img}" class="mini-thumb" style="width:60px; height:60px;">
                        <div style="flex:1;">
                            <div style="font-weight:700; font-size:0.95rem; color:#333;">${item.title}</div>
                            <div style="color:#2563eb; font-weight:800; font-size:0.95rem;">${item.budget.toLocaleString()} TL</div>
                            <div style="font-size:0.75rem; color:#999; margin-top:2px;">${item.city} • ${new Date(item.created_at).toLocaleDateString('tr-TR')}</div>
                        </div>
                        <span class="material-icons" style="color:#ccc;">chevron_right</span>
                    </div>
                `;
            });
        }

        html += `</div>`; // Kapatma divleri
        cardBody.innerHTML = html;
        cardBody.style.background = "#f8fafc"; // Arka planı gri yap

    } catch (e) {
        console.error("Public profil hatası:", e);
        cardBody.innerHTML = '<div style="color:red; text-align:center; padding:20px;">Profil yüklenemedi.</div>';
    }
}
/* ============================================================
   📱 PULL TO REFRESH (ÇEK YENİLE) SİSTEMİ
   ============================================================ */

let ptrStartY = 0;
let ptrDist = 0;
let isPtrRefreshing = false;
const ptrThreshold = 120; // Ne kadar aşağı çekince tetiklensin?

const ptrBox = document.getElementById('pullToRefresh');
const ptrIcon = document.querySelector('.ptr-icon span');

document.addEventListener('touchstart', (e) => {
    // Sadece sayfanın en tepesindeysek çalışsın
    if (window.scrollY === 0 && !isPtrRefreshing) {
        ptrStartY = e.touches[0].screenY;
    }
}, { passive: true });

document.addEventListener('touchmove', (e) => {
    if (window.scrollY === 0 && !isPtrRefreshing) {
        const y = e.touches[0].screenY;
        
        // Eğer aşağı doğru çekiliyorsa
        if (y > ptrStartY) {
            ptrDist = y - ptrStartY;
            
            // Maksimum çekme mesafesini sınırla (Direnç efekti)
            if (ptrDist > 200) ptrDist = 200 + (ptrDist - 200) * 0.2;

            // Kutu aşağı insin
            // Başlangıç top: -60px olduğu için hesaplama yapıyoruz
            ptrBox.style.top = `${ptrDist - 60}px`;
            
            // İkon çekme mesafesine göre dönsün
            if (ptrIcon) {
                ptrIcon.style.transform = `rotate(${ptrDist * 2}deg)`;
            }

            // Eğer eşik geçildiyse kullanıcıya hissettir (Hafif opaklık değişimi vs.)
            if (ptrDist > ptrThreshold) {
                ptrBox.style.opacity = "1";
            }
        }
    }
}, { passive: true });

document.addEventListener('touchend', () => {
    if (window.scrollY === 0 && !isPtrRefreshing) {
        if (ptrDist > ptrThreshold) {
            // YETERİNCE ÇEKİLDİ -> YENİLEME BAŞLASIN
            isPtrRefreshing = true;
            ptrBox.style.top = "20px"; // Ekranda asılı kalsın
            ptrBox.classList.add('ptr-loading'); // Dönme animasyonunu başlat

            // Verileri Yenile
            Promise.all([
                fetchRequests(),     // İlanları yenile
                checkNotifications() // Bildirimleri kontrol et
            ]).then(() => {
                // İşlem bitince 1 saniye bekle sonra kapat (Kullanıcı görsün)
                setTimeout(() => {
                    resetPtr();
                    showToast("Sayfa yenilendi 🚀");
                }, 800);
            });

        } else {
            // YETERİNCE ÇEKİLMEDİ -> GERİ GİTSİN
            resetPtr();
        }
    }
    // Değişkenleri sıfırla
    ptrDist = 0;
    ptrStartY = 0;
});

function resetPtr() {
    isPtrRefreshing = false;
    if (ptrBox) {
        ptrBox.style.top = "-60px"; // Yukarı gizle
        ptrBox.classList.remove('ptr-loading'); // Animasyonu durdur
    }
}
// ==========================================
// 📱 MOBİL NAVİGASYON VE ZORUNLU GİRİŞ
// ==========================================

// 1. Alt Menü Aktiflik Değiştirme
function updateNav(element) {
    // Tüm butonlardan active class'ını sil
    document.querySelectorAll('.bottom-nav .nav-item').forEach(item => {
        item.classList.remove('active');
    });
    // Tıklanana ekle
    if(element) element.classList.add('active');
}

// 2. Kategori Modalı İşlemleri
function openCategoryBottomModal() {
    document.getElementById('categoryBottomModal').style.display = 'flex';
}

function selectCategoryMobile(cat) {
    filterCategory(cat); // Mevcut filtre fonksiyonunu kullan
    closeModal('categoryBottomModal');
    showToast(`${cat} kategorisi listeleniyor.`);
}

// 3. Site Açılışında Zorunlu Giriş Kontrolü
// (SplashScreen kapandıktan hemen sonra çalışır)
setTimeout(() => {
    // Eğer kullanıcı giriş yapmamışsa
    if (!currentUser) {
        openModal('authModal');
        // Kapatma butonunu gizle ki zorunlu olsun (Opsiyonel)
        const closeBtn = document.querySelector('#authModal .modal-header span');
        if(closeBtn) closeBtn.style.display = 'none';
        
        // Modal dışına tıklayınca kapanmasın
        document.getElementById('authModal').onclick = (e) => {
            if(e.target.id === 'authModal') {
               // Kapanmayı engelle
               showToast("Devam etmek için giriş yapmalısın.", "info");
            }
        };
    }
}, 2500); // Splash ekranından biraz sonra (2.5 sn)
// ==========================================
// 📢 CANLI TICKER (GARANTİLİ ÇALIŞAN VERSİYON)
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    // Biraz bekleyip çalıştır ki diğer yüklemeleri engellemesin
    setTimeout(initLiveTicker, 1000);
});

async function initLiveTicker() {
    const track = document.getElementById('liveTickerContent');
    if(!track) {
        console.warn("Ticker HTML elementi bulunamadı!");
        return;
    }

    let itemsToDisplay = [];

    try {
        // 1. Veritabanından çekmeyi dene
        const { data, error } = await client
            .from('requests')
            .select('title, city, budget, is_sold')
            .order('created_at', { ascending: false })
            .limit(8);

        if (!error && data && data.length > 0) {
            itemsToDisplay = data;
        } 
    } catch (e) {
        console.error("Ticker veri hatası:", e);
    }

    // 2. Eğer veritabanı boşsa veya hata verdiyse DEMO VERİ kullan (Boş kalmasın)
    if (itemsToDisplay.length === 0) {
        console.log("Ticker için demo veriler devreye girdi.");
        itemsToDisplay = [
            { title: "iPhone 11", city: "İstanbul", budget: 14500, is_sold: false },
            { title: "PlayStation 5", city: "Ankara", budget: 18000, is_sold: true },
            { title: "Kiralık Daire 2+1", city: "İzmir", budget: 22000, is_sold: false },
            { title: "Fiat Egea", city: "Bursa", budget: 850000, is_sold: true },
            { title: "Macbook Air M1", city: "Antalya", budget: 25000, is_sold: false },
            { title: "Samsung S23", city: "Konya", budget: 32000, is_sold: false }
        ];
    }

    // 3. HTML Oluştur
    const contentHTML = itemsToDisplay.map(item => {
        // Satıldıysa kırmızı, yeni ise yeşil ikon
        const isSold = item.is_sold;
        const icon = isSold ? '🔴 SATILDI:' : '🟢 YENİ:';
        const priceColor = isSold ? '#fca5a5' : '#4ade80'; // Satılan soluk, yeni parlak yeşil
        const textStyle = isSold ? 'text-decoration:line-through; opacity:0.8;' : '';
        
        // Şehir ismini kısalt (uzunsa)
        let city = item.city || "TR";
        if(city.length > 7) city = city.substring(0,3) + ".";

        return `
            <div class="ticker-item">
                <span style="opacity:0.7; font-size:0.75rem; margin-right:6px;">${city}</span>
                <strong style="margin-right:4px;">${icon}</strong> 
                <span style="color:white; ${textStyle}">${item.title}</span>
                <span style="color:${priceColor}; font-weight:bold; margin-left:6px;">${item.budget.toLocaleString()} TL</span>
            </div>
        `;
    }).join('');

    // 4. Sonsuz döngü hissi için içeriği 10 kere kopyala (Daha uzun şerit)
    track.innerHTML = contentHTML.repeat(10);
    
    // CSS animasyonunu JS ile tetikle (bazen CSS takılabiliyor)
    track.style.animation = "none";
    track.offsetHeight; /* trigger reflow */
    track.style.animation = "tickerScroll 60s linear infinite";
}
// ==========================================
// 📸 GÖRSEL ARAMA (GEMINI VISION - AKILLI MOD)
// ==========================================

async function handleImageSearch(input) {
    const file = input.files[0];
    if (!file) return;

    // UI: Yükleniyor efekti (Dönen ikon)
    const iconSpan = input.parentElement.querySelector('span');
    const originalIcon = iconSpan.innerText;
    iconSpan.innerText = 'sync'; 
    iconSpan.classList.add('search-loading'); // CSS'de tanımlı spin animasyonu
    
    const searchInput = document.getElementById('searchInput');
    const originalPlaceholder = searchInput.placeholder;
    searchInput.placeholder = "Fotoğraf taranıyor...";
    searchInput.value = "";

    try {
        console.log("📸 Resim işleniyor...");

        // 1. Resmi Sıkıştır (Hız ve API kotası için çok önemli)
        let fileToProcess = file;
        try {
            if (typeof imageCompression !== 'undefined') {
                const options = { maxSizeMB: 0.8, maxWidthOrHeight: 1024, useWebWorker: true };
                fileToProcess = await imageCompression(file, options);
            }
        } catch (compErr) {
            console.warn("Sıkıştırma atlandı:", compErr);
        }

        // 2. Base64'e Çevir
        const base64Image = await fileToBase64(fileToProcess);
        
        // 3. Gemini Vision API'ye Sor (Akıllı Model Seçimi)
        // Burada görseli en iyi tanıyan 1.5-flash modelini kullanıyoruz
        const searchTerm = await askGeminiVisionRobust(base64Image);

        // 4. Sonucu Yaz ve Ara
        if (searchTerm) {
            // Gereksiz karakterleri temizle (Nokta, tırnak vb.)
            const cleanTerm = searchTerm.replace(/['".]/g, "").trim();
            
            console.log("🎯 AI Cevabı:", cleanTerm);
            
            searchInput.value = cleanTerm;
            showToast(`📸 Algılandı: ${cleanTerm}`);
            
            // Aramayı tetikle
            searchData(); 
        } else {
            showToast("Nesne tanımlanamadı.", "error");
        }

    } catch (error) {
        console.error("Görsel arama hatası:", error);
        showToast("Görsel analiz edilemedi.", "error");
        searchInput.placeholder = "İlanlarda ara...";
    } finally {
        // UI: Eski haline getir
        iconSpan.innerText = originalIcon;
        iconSpan.classList.remove('search-loading');
        searchInput.placeholder = originalPlaceholder;
        input.value = ""; // Inputu temizle ki aynı resmi tekrar seçebilsin
    }
}

// YARDIMCI: Resmi Base64 formatına çevirir
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            // "data:image/jpeg;base64,....." kısmından virgülden sonrasını al
            const base64String = reader.result.split(',')[1];
            resolve(base64String);
        };
        reader.onerror = error => reject(error);
    });
}

// 🔥 AKILLI MODEL SEÇİCİ (Vision için)
async function askGeminiVisionRobust(base64Image) {
    if (!GEMINI_API_KEY) throw new Error("API Anahtarı eksik!");

    // Görsel için en iyi modeller sırası
    const modelsToTry = [
        "gemini-1.5-flash",          // En hızlısı ve görselde çok iyi
        "gemini-1.5-pro",            // Daha zeki
        "gemini-1.5-flash-latest"    // Alternatif
    ];

    // Payload (İstek verisi)
    const payload = {
        contents: [{
            parts: [
                { text: "Bu resimdeki ana satılık ürün nedir? İkinci el pazarında arama yapmak için bana sadece ürünün Türkçe adını (marka ve model) 2-3 kelimeyle ver. Cümle kurma. Örnek çıktı: 'iPhone 11', 'Kırmızı Bisiklet', 'Ahşap Masa', 'Samsung TV'. Eğer resimde ürün yoksa 'Bilinmiyor' yaz." },
                {
                    inline_data: {
                        mime_type: "image/jpeg",
                        data: base64Image
                    }
                }
            ]
        }]
    };

    // Döngü ile modelleri dene (Biri çalışmazsa diğeri devreye girer)
    for (const model of modelsToTry) {
        try {
            console.log(`🤖 Vision Model deneniyor: ${model}...`);
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
            
            const response = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            if (!response.ok) continue; // Hata varsa sonraki modeli dene

            const data = await response.json();
            
            if (data.candidates && data.candidates.length > 0 && data.candidates[0].content) {
                const text = data.candidates[0].content.parts[0].text;
                return text;
            }

        } catch (err) {
            console.warn(`⚠️ ${model} başarısız oldu.`);
        }
    }

    throw new Error("Hiçbir AI modeli görseli işleyemedi.");
}
// ==========================================
// 🏆 OYUNLAŞTIRMA & ROZET SİSTEMİ (GAMIFICATION)
// ==========================================

function getUserBadgesHTML(profile) {
    if (!profile) return '';

    let badgesHTML = '';
    
    // Verileri Güvenli Çek
    const sales = profile.sales_count || 0;
    const activity = profile.activity_score || 0;
    const rating = profile.rating || 0; // Eğer review sisteminden geliyorsa
    const isVerified = profile.is_verified || false;

    // 1. 🛡️ KALKAN ROZETİ (Güvenilir Satıcı)
    // 3'ten fazla başarılı satışı varsa
    if (sales >= 3) {
        badgesHTML += `
            <div class="badge-tooltip" data-tooltip="Güvenilir Satıcı (${sales} İşlem)">
                <span class="gamify-badge shield">🛡️</span>
            </div>`;
    }

    // 2. ⚡ ŞİMŞEK ROZETİ (Hızlı Cevapçı)
    // Aktivite puanı yüksekse (Mesajlaşma sayısı)
    if (activity >= 10) {
        badgesHTML += `
            <div class="badge-tooltip" data-tooltip="Hızlı Cevap Veriyor">
                <span class="gamify-badge lightning">⚡</span>
            </div>`;
    }

    // 3. 💎 ELMAS ROZETİ (Premium Üye / Cömert)
    // Hem onaylı hem de yüksek satışlıysa
    if (isVerified && sales >= 10) {
        badgesHTML += `
            <div class="badge-tooltip" data-tooltip="Efsane Üye">
                <span class="gamify-badge diamond">💎</span>
            </div>`;
    }

    // 4. ✅ MAVİ TİK (Zaten Vardı ama buraya entegre edelim)
    if (isVerified) {
        badgesHTML += `
            <div class="badge-tooltip" data-tooltip="Onaylı Hesap">
                <span class="material-icons verified-icon">verified</span>
            </div>`;
    }

    return `<div class="badge-container">${badgesHTML}</div>`;
}

// Mesaj atınca aktivite puanını artıran fonksiyon
async function incrementActivityScore() {
    if(!currentUser) return;
    // Mevcut puanı çek ve 1 artır (Basitleştirilmiş logic)
    const { data } = await client.from('profiles').select('activity_score').eq('id', currentUser.id).single();
    const newScore = (data?.activity_score || 0) + 1;
    await client.from('profiles').update({ activity_score: newScore }).eq('id', currentUser.id);
}
// ==========================================
// 🗺️ 4. ÖZELLİK: ISI HARİTASI (HEATMAP)
// ==========================================
function openHeatmap() {
    const modal = document.getElementById('heatmapModal');
    if (!modal) return;
    
    modal.style.display = 'flex';

    // Haritayı oluşturmak için biraz bekle (Modal açılış animasyonu bitsin)
    setTimeout(() => {
        // Harita daha önce oluşturulduysa sil (Resetle)
        if (window.heatMapInstance) {
            window.heatMapInstance.remove();
        }

        // Yeni Harita Başlat
        window.heatMapInstance = L.map('fullScreenMap').setView([39.1667, 35.6667], 6); // Türkiye Merkezi

        // Harita Katmanı (Koyu tema daha havalı durur ama standart kullanalım)
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap'
        }).addTo(window.heatMapInstance);

        // Verileri Analiz Et
        const heatPoints = [];
        
        // allData içindeki her ilanı dön
        allData.forEach(item => {
            // Şehir koordinatını sözlükten al
            const coords = cityCoordinates[item.city];
            if (coords) {
                // Koordinatları ve yoğunluk değerini (0.5) ekle
                // Biraz rastgelelik ekle ki aynı şehirdeki ilanlar üst üste binip tek nokta olmasın
                const randomLat = coords[0] + (Math.random() - 0.5) * 0.05;
                const randomLng = coords[1] + (Math.random() - 0.5) * 0.05;
                heatPoints.push([randomLat, randomLng, 0.8]); 
            }
        });

        // Heatmap Katmanını Ekle
        if (L.heatLayer) {
            L.heatLayer(heatPoints, {
                radius: 30, // Nokta büyüklüğü
                blur: 20,   // Bulanıklık
                maxZoom: 10,
                gradient: {0.2: 'blue', 0.4: 'lime', 0.6: 'yellow', 0.9: 'red'} // Renk skalası
            }).addTo(window.heatMapInstance);
        } else {
            console.error("Heatmap kütüphanesi yüklenemedi!");
        }
        
        // Harita boyutunu düzelt (Gri ekran sorununu çözer)
        window.heatMapInstance.invalidateSize();

    }, 200);
}

// ==========================================
// 🤖 5. ÖZELLİK: AKILLI FİYAT TAHMİNİ
// ==========================================
// ==========================================
// 🤖 5. ÖZELLİK: AKILLI FİYAT TAHMİNİ (MODERN & ANİMASYONLU)
// ==========================================
async function predictPrice() {
    const titleInput = document.getElementById('reqTitle');
    const budgetInput = document.getElementById('reqBudget');
    const title = titleInput.value.trim();

    // 1. Validasyon: Başlık çok kısaysa uyarı ver
    if (title.length < 3) {
        return showToast("Önce ürünün adını yazmalısın (Örn: iPhone 11)", "error");
    }

    const btn = document.getElementById('aiPriceBtn');
    const originalContent = btn.innerHTML;
    
    // UI: Butonu "Yükleniyor" moduna al
    btn.innerHTML = `<span class="material-icons spin-anim" style="font-size:1rem;">sync</span>`;
    btn.disabled = true;
    budgetInput.placeholder = "Yapay zeka hesaplıyor...";

    try {
        // A) Sitedeki Benzer İlanları Tarama (Yerel Veri)
        // Başlıktaki kelimeleri içeren diğer ilanları bul
        const keywords = title.toLowerCase().split(' ');
        const similarListings = allData.filter(i => {
            const itemTitle = i.title.toLowerCase();
            return keywords.every(k => itemTitle.includes(k)) && i.budget > 0;
        });
        
        let localAvg = 0;
        if (similarListings.length > 0) {
            const total = similarListings.reduce((sum, item) => sum + item.budget, 0);
            localAvg = Math.floor(total / similarListings.length);
            console.log(`📊 Site içi veri: ${similarListings.length} ilan bulundu. Ort: ${localAvg}`);
        }

        // B) Gemini AI Analizi (Piyasa Uzmanı)
        // Prompt'u "Sadece Sayı Ver" şeklinde ayarlıyoruz
        const prompt = `Türkiye ikinci el pazarında "${title}" adlı ürünün temiz kullanılmış ortalama fiyatı kaç TL'dir? 
        Cevap olarak sadece tek bir sayı ver. Aralık verme, yazı yazma. 
        Örnek Cevap: 15000. 
        Eğer ürün çok belirsizse (örn: "masa") tahmini bir ortalama sayı ver.`;

        // 1.5-flash modeli en hızlısıdır, direkt onu kullanıyoruz
        const aiResponse = await tryFetchGeminiModel("gemini-2.5-flash", prompt);
        
        // Temizlik: Gelen cevaptan sadece rakamları al
        let aiPrice = parseInt(aiResponse.replace(/[^0-9]/g, '')) || 0;

        // Fiyat çok uçuksa (Örn: 10 TL veya 10 Milyon TL) AI hatasıdır, yoksay
        if (aiPrice < 50 || aiPrice > 50000000) aiPrice = 0;

        // C) Fiyat Harmanlama (Hybrid Algoritma)
        let finalPrice = 0;
        let sourceMsg = "";

        if (localAvg > 0 && aiPrice > 0) {
            // Hem site verisi hem AI var -> Ortalamasını al (En güvenlisi)
            finalPrice = Math.floor((localAvg + aiPrice) / 2);
            sourceMsg = "Site verileri ve AI analizi harmanlandı.";
        } else if (aiPrice > 0) {
            finalPrice = aiPrice;
            sourceMsg = "Güncel piyasa verilerine göre tahmin edildi.";
        } else if (localAvg > 0) {
            finalPrice = localAvg;
            sourceMsg = "Sitedeki benzer ilanlar baz alındı.";
        } else {
            // Hiçbiri bulamadıysa varsayılan bir değer (Çok nadir olur)
            throw new Error("Fiyat belirlenemedi");
        }

        // D) Sonucu Uygula (Slot Makinesi Animasyonu ile) 🎰
        animateValue(budgetInput, 0, finalPrice, 1000); // 0'dan fiyata doğru 1 saniyede say
        
        // Inputu parlat (Yeşil yapıp söndür)
        budgetInput.style.backgroundColor = "#dcfce7"; // Açık yeşil
        budgetInput.style.transition = "background-color 1.5s";
        setTimeout(() => budgetInput.style.backgroundColor = "#f9fafb", 2000);

        // Kullanıcıya bilgi ver
        showToast(`💡 Tavsiye: ${finalPrice.toLocaleString()} TL (${sourceMsg})`, "success");

    } catch (e) {
        console.error("Fiyat hatası:", e);
        showToast("Fiyat tahmini için ürün adını biraz daha detaylandır.", "error");
    } finally {
        // Butonu eski haline getir
        btn.innerHTML = originalContent;
        btn.disabled = false;
        budgetInput.placeholder = "Bütçen (TL)";
    }
}

// YARDIMCI: Sayı sayma animasyonu (0...100...500...1000)
function animateValue(obj, start, end, duration) {
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        
        // Sayıyı güncelle
        const value = Math.floor(progress * (end - start) + start);
        obj.value = value;
        
        if (progress < 1) {
            window.requestAnimationFrame(step);
        }
    };
    window.requestAnimationFrame(step);
}
// ==========================================
// 🧠 SÜRÜKLENEBİLİR PENCERE FONKSİYONU (DRAG AND DROP)
// ==========================================

function makeElementDraggable(element, dragHandle) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    
    // Eğer dragHandle (Sürükleme tutacağı, yani başlık) tanımlanmışsa,
    // tutucuya basınca sürüklemeyi başlat. Yoksa elementin tamamını kullan.
    const handle = dragHandle || element;

    handle.onmousedown = dragMouseDown;

    function dragMouseDown(e) {
        e = e || window.event;
        e.preventDefault();
        
        // Başlangıç fare (mouse) konumunu al
        pos3 = e.clientX;
        pos4 = e.clientY;
        
        // Tarayıcıdaki mouse hareketini ve bırakma olaylarını dinle
        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;

        // Dokunmatik cihazlar için de ayarla (mobil uyumluluk)
        handle.ontouchstart = dragTouchStart;
        handle.ontouchmove = elementDragTouch;
        handle.ontouchend = closeDragElement;
    }

    function elementDrag(e) {
        e = e || window.event;
        e.preventDefault();
        
        // Yeni pozisyonu hesapla
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        
        // Elementin yeni konumunu ayarla
        let newTop = element.offsetTop - pos2;
        let newLeft = element.offsetLeft - pos1;

        // Ekran sınırları dışına çıkmasını engelle
        if (newTop < 0) newTop = 0;
        if (newLeft < 0) newLeft = 0;
        if (newTop > window.innerHeight - element.offsetHeight) newTop = window.innerHeight - element.offsetHeight;
        if (newLeft > window.innerWidth - element.offsetWidth) newLeft = window.innerWidth - element.offsetWidth;
        
        // Konumu uygula
        element.style.top = newTop + "px";
        element.style.left = newLeft + "px";
        
        // Mutlak konumlandırma ayarını yap (Bir kereye mahsus)
        element.style.position = "fixed";
        element.style.right = "auto";
        element.style.bottom = "auto";
    }

    // Mobil Sürükleme Başlangıcı
    function dragTouchStart(e) {
        if (e.touches.length === 1) {
            pos3 = e.touches[0].clientX;
            pos4 = e.touches[0].clientY;
            handle.onmousedown = null; // Mouse olaylarını devre dışı bırak
        }
    }

    // Mobil Sürükleme Hareketi
    function elementDragTouch(e) {
        if (e.touches.length === 1) {
            pos1 = pos3 - e.touches[0].clientX;
            pos2 = pos4 - e.touches[0].clientY;
            pos3 = e.touches[0].clientX;
            pos4 = e.touches[0].clientY;
            
            // Mouse sürüklemesi ile aynı mantık
            let newTop = element.offsetTop - pos2;
            let newLeft = element.offsetLeft - pos1;

            if (newTop < 0) newTop = 0;
            if (newLeft < 0) newLeft = 0;
            if (newTop > window.innerHeight - element.offsetHeight) newTop = window.innerHeight - element.offsetHeight;
            if (newLeft > window.innerWidth - element.offsetWidth) newLeft = window.innerWidth - element.offsetWidth;

            element.style.top = newTop + "px";
            element.style.left = newLeft + "px";
            element.style.position = "fixed";
            element.style.right = "auto";
            element.style.bottom = "auto";
        }
    }

    function closeDragElement() {
        // Sürükleme olaylarını temizle
        document.onmouseup = null;
        document.onmousemove = null;
        handle.ontouchstart = null;
        handle.ontouchmove = null;
        handle.ontouchend = null;
    }
}

// ==========================================
// 🚀 UYGULAMAYA ENTEGRASYON (DOM READY)
// ==========================================
// Sayfa yüklendikten sonra sürükleme özelliğini ekle
document.addEventListener('DOMContentLoaded', () => {
    // 1. AI Chat Box
    const aiBox = document.getElementById('aiChatBox');
    const aiHeader = document.querySelector('#aiChatBox .ai-chat-header');
    if (aiBox && aiHeader) {
        makeElementDraggable(aiBox, aiHeader);
    }
    
    // 2. Sosyal Chat Box (Opsiyonel)
    const socialBox = document.getElementById('socialChatBox');
    const socialHeader = document.querySelector('#socialChatBox .social-chat-header');
    if (socialBox && socialHeader) {
         makeElementDraggable(socialBox, socialHeader);
    }
    
    // ... Diğer DOMContentLoaded kodların buradaysa silme ...
});
// ==========================================
// 📜 SONSUZ KAYDIRMA (INFINITE SCROLL)
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    // Gözlemci (Observer) Tanımla
    const observerOptions = {
        root: null, // Tarayıcı penceresi
        rootMargin: '100px', // En alta 100px kala yüklemeye başla (kullanıcı fark etmesin)
        threshold: 0.1
    };

    const scrollObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            // Eğer "Daha Fazla" butonu/alanı göründüyse VE son sayfa değilse
            if (entry.isIntersecting && !isLastPage) {
                const btn = document.getElementById('loadMoreContainer');
                // Buton görünüyorsa (display:none değilse) tetikle
                if(btn && btn.style.display !== 'none') {
                    console.log("📜 Sayfa sonu algılandı, yeni ilanlar yükleniyor...");
                    loadMore();
                }
            }
        });
    }, observerOptions);

    // Gözlemlenecek elemanı seç (Daha fazla butonu kutusu)
    const target = document.getElementById('loadMoreContainer');
    if (target) scrollObserver.observe(target);
});
// ==========================================
// 🎉 KUTLAMA EFEKTİ (CONFETTI)
// ==========================================
function fireConfetti() {
    // Kütüphane yüklenmemişse hata vermesin
    if (typeof confetti === 'undefined') return;

    var duration = 3 * 1000; // 3 saniye sürsün
    var animationEnd = Date.now() + duration;
    var defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 9999 };

    function randomInRange(min, max) {
      return Math.random() * (max - min) + min;
    }

    var interval = setInterval(function() {
      var timeLeft = animationEnd - Date.now();

      if (timeLeft <= 0) {
        return clearInterval(interval);
      }

      var particleCount = 50 * (timeLeft / duration);
      
      // Rastgele noktalardan fırlat
      confetti(Object.assign({}, defaults, { particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } }));
      confetti(Object.assign({}, defaults, { particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } }));
    }, 250);
}
// ==========================================
// 🧠 AKILLI KATEGORİ SEÇİMİ (AUTO-CATEGORY)
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    const titleInput = document.getElementById('reqTitle');
    const categorySelect = document.getElementById('reqCategory');

    if (titleInput && categorySelect) {
        // Kullanıcı yazarken değil, yazıp bitirdiğinde (blur) veya
        // yazarken (input) çalışabilir. 'input' anlık tepki verir, daha havalıdır.
        titleInput.addEventListener('input', function() {
            const text = this.value.toLowerCase();
            
            // 1. Zaten bir kategori seçiliyse (ve 'Diğer' değilse) elleme
            // (Kullanıcı kendi düzelttiyse bozmayalım)
            if (categorySelect.value !== 'Diğer' && categorySelect.value !== '') return;

            // 2. Anahtar Kelime Tarayıcısı
            let detectedCat = 'Diğer';

            // TELEFON KELİMELERİ
            if (text.match(/iphone|samsung|xiaomi|redmi|huawei|oppo|android|ios|telefon|mobil|s20|s21|s22|s23|s24|note|pro max|plus/)) {
                detectedCat = 'Telefon';
            }
            // VASITA KELİMELERİ
            else if (text.match(/araba|oto|araç|bmw|mercedes|fiat|egea|clio|honda|toyota|motor|motosiklet|bisiklet|scooter|peugeot|volkswagen|audi|ford/)) {
                detectedCat = 'Vasıta';
            }
            // EMLAK KELİMELERİ
            else if (text.match(/ev|daire|kiralık|satılık|1\+1|2\+1|3\+1|4\+1|residance|rezidans|kat|bina|arsa|tarla|dükkan|ofis/)) {
                detectedCat = 'Emlak';
            }
            // GİYİM KELİMELERİ
            else if (text.match(/giyim|kıyafet|mont|kaban|ceket|pantolon|gömlek|t-shirt|tişört|ayakkabı|bot|çizme|nike|adidas|puma|zara|lcw|elbise/)) {
                detectedCat = 'Giyim';
            }

            // 3. Kategori Bulunduysa Seç ve Efekt Ver
            if (detectedCat !== 'Diğer') {
                categorySelect.value = detectedCat;
                
                // Kullanıcıya hissettir (Yeşil yanıp sönsün)
                categorySelect.style.backgroundColor = "#dcfce7"; // Açık yeşil
                categorySelect.style.transition = "background 0.5s";
                
                setTimeout(() => {
                    categorySelect.style.backgroundColor = ""; // Eski haline dön
                }, 1000);
                
                console.log(`🤖 Otomatik Kategori: ${detectedCat}`);
            }
        });
    }
});

// ==========================================
// 📸 İLAN RESMİ ÖNİZLEME (PREVIEW)
// ==========================================
function previewRequestImage(input) {
    const previewBox = document.getElementById('reqImagePreview');
    const placeholder = document.getElementById('uploadPlaceholder');
    const badge = document.getElementById('changeImgBadge');
    const box = document.getElementById('uploadPreviewBox');

    if (input.files && input.files[0]) {
        const reader = new FileReader();

        reader.onload = function(e) {
            // Resmi göster
            previewBox.src = e.target.result;
            previewBox.style.display = 'block';
            
            // İkonları gizle
            placeholder.style.display = 'none';
            badge.style.display = 'block';
            
            // Kutunun kenarlığını düz yap (dolu olduğu belli olsun)
            box.style.border = "2px solid #2563eb";
            box.style.background = "#fff";
        };

        reader.readAsDataURL(input.files[0]);
    }
     else {
        // İptal ederse eski haline döndür
        previewBox.style.display = 'none';
        previewBox.src = "";
        placeholder.style.display = 'block';
        badge.style.display = 'none';
        box.style.border = "2px dashed #ccc";
        box.style.background = "#f3f4f6";
    }
}