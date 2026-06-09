/* =====================================================
   METTE & PALLE – BRYLLUPSAPP
   album.js – Lazy-loading album via to nye Netlify-funktioner:
     1. list-photos  → henter alle filstier (ingen links, lynhurtigt)
     2. photo-link   → henter ét midlertidigt link per billede (lazy)
   ===================================================== */

const BASE_URL       = 'https://bryllupsfotos.netlify.app/.netlify/functions';
const LIST_URL       = `${BASE_URL}/list-photos`;
const LINK_URL       = `${BASE_URL}/photo-link`;

// Globale variable
let allPhotos    = [];   // { name, path, modified }
let currentIndex = -1;  // modal-index (kun billeder, ikke videoer)
let imagePhotos  = [];  // kun ikke-videoer, til modal-navigation

// ─────────────────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  createPetals();
  loadAlbum();

  document.getElementById('closeModal').addEventListener('click', closeModal);
  document.getElementById('imageModal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('imageModal')) closeModal();
  });
  document.getElementById('prevBtn').addEventListener('click', (e) => { e.stopPropagation(); showPrev(); });
  document.getElementById('nextBtn').addEventListener('click', (e) => { e.stopPropagation(); showNext(); });

  document.addEventListener('keydown', (e) => {
    if (!document.getElementById('imageModal').classList.contains('active')) return;
    if (e.key === 'Escape')     closeModal();
    if (e.key === 'ArrowLeft')  showPrev();
    if (e.key === 'ArrowRight') showNext();
  });
});

// ─────────────────────────────────────────────────────
//  INDLÆS FILLISTE (ét hurtigt kald – ingen links endnu)
// ─────────────────────────────────────────────────────
async function loadAlbum() {
  const grid      = document.getElementById('galleryGrid');
  const loading   = document.getElementById('loadingState');
  const empty     = document.getElementById('emptyState');
  const errorMsg  = document.getElementById('errorState');
  const photoCount = document.getElementById('photoCount');

  try {
    const res = await fetch(LIST_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    allPhotos = data.photos || [];

    loading.style.display = 'none';

    if (allPhotos.length === 0) { empty.style.display = 'block'; return; }

    // Opdater tæller
    if (photoCount) photoCount.textContent = `${allPhotos.length} billeder i alt`;

    // Opbyg liste over billeder (ikke videoer) til modal-navigation
    imagePhotos = allPhotos.filter(p => !/\.(mov|mp4)$/i.test(p.name));

    // Render alle kort som skeletons — links hentes lazy
    allPhotos.forEach((photo, index) => {
      const item = buildSkeletonItem(photo, index);
      grid.appendChild(item);
    });

    // IntersectionObserver: fetch link når kortet bliver synligt
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const el = entry.target;
          if (!el.dataset.loaded) {
            el.dataset.loaded = 'true';
            fetchAndFillItem(el);
          }
          observer.unobserve(el);
        }
      });
    }, { rootMargin: '400px' });

    grid.querySelectorAll('.gallery-item').forEach(el => observer.observe(el));

  } catch (err) {
    console.error('Album fejl:', err);
    loading.style.display = 'none';
    errorMsg.style.display = 'block';
  }
}

// ─────────────────────────────────────────────────────
//  BYGG ET SKELETON-KORT (ingen URL endnu)
// ─────────────────────────────────────────────────────
function buildSkeletonItem(photo, index) {
  const item = document.createElement('div');
  item.className = 'gallery-item loading-placeholder';
  item.dataset.path  = photo.path;
  item.dataset.name  = photo.name;
  item.dataset.index = index;

  const isVideo = /\.(mov|mp4)$/i.test(photo.name);
  item.dataset.isvideo = isVideo ? 'true' : 'false';

  const parts = photo.name.split('_');
  const uploaderLabel = parts.length >= 3 ? parts[1].replace(/-/g, ' ') : 'Gæst';

  const label = document.createElement('div');
  label.className = 'gallery-uploader';
  label.textContent = uploaderLabel;
  item.appendChild(label);

  return item;
}

// ─────────────────────────────────────────────────────
//  FETCH LINK OG UDFYLD KORTET
// ─────────────────────────────────────────────────────
async function fetchAndFillItem(item) {
  const path    = item.dataset.path;
  const isVideo = item.dataset.isvideo === 'true';
  const index   = parseInt(item.dataset.index, 10);

  try {
    const res  = await fetch(`${LINK_URL}?path=${encodeURIComponent(path)}`);
    if (!res.ok) return;
    const data = await res.json();
    const url  = data.url;
    if (!url) return;

    // Gem URL på photo-objektet til modal-brug
    allPhotos[index].url = url;

    const parts = item.dataset.name.split('_');
    const uploaderLabel = parts.length >= 3 ? parts[1].replace(/-/g, ' ') : 'Gæst';

    item.classList.remove('loading-placeholder');

    // Fjern eksisterende label midlertidigt
    const existingLabel = item.querySelector('.gallery-uploader');
    if (existingLabel) item.removeChild(existingLabel);

    if (isVideo) {
      const video = document.createElement('video');
      video.src = url;
      video.muted = true;
      video.playsInline = true;
      video.loop = true;
      item.appendChild(video);
      item.addEventListener('mouseenter', () => video.play());
      item.addEventListener('mouseleave', () => { video.pause(); video.currentTime = 0; });
      item.addEventListener('click', () => window.open(url, '_blank'));
      const badge = document.createElement('span');
      badge.className = 'video-badge';
      badge.textContent = '▶ Video';
      item.appendChild(badge);
    } else {
      const img = document.createElement('img');
      img.src = url;
      img.alt = `Billede uploadet af ${uploaderLabel}`;
      img.loading = 'lazy';
      item.appendChild(img);
      // Find billede-index i imagePhotos til modal
      const imgIndex = imagePhotos.findIndex(p => p.path === path);
      item.addEventListener('click', () => { if (imgIndex >= 0) openModal(imgIndex); });
    }

    const label = document.createElement('div');
    label.className = 'gallery-uploader';
    label.textContent = uploaderLabel;
    item.appendChild(label);

  } catch (err) {
    console.error('Link fejl:', path, err);
  }
}

// ─────────────────────────────────────────────────────
//  MODAL LOGIK
// ─────────────────────────────────────────────────────
function openModal(imgIndex) {
  currentIndex = imgIndex;
  updateModalContent();
  document.getElementById('imageModal').classList.add('active');
  document.body.style.overflow = 'hidden';
}

function updateModalContent() {
  const photo  = imagePhotos[currentIndex];
  const img    = document.getElementById('modalImg');
  const credit = document.getElementById('modalCredit');

  const parts = photo.name.split('_');
  const uploaderLabel = parts.length >= 3 ? parts[1].replace(/-/g, ' ') : 'Gæst';

  if (photo.url) {
    img.style.opacity = '0';
    img.src = photo.url;
    img.onload = () => { img.style.opacity = '1'; };
  } else {
    // Link ikke hentet endnu – hent det nu
    fetch(`${LINK_URL}?path=${encodeURIComponent(photo.path)}`)
      .then(r => r.json())
      .then(d => {
        photo.url = d.url;
        img.style.opacity = '0';
        img.src = d.url;
        img.onload = () => { img.style.opacity = '1'; };
      });
  }

  if (credit) credit.textContent = uploaderLabel ? `📷 ${uploaderLabel}` : '';
  document.getElementById('prevBtn').style.display = currentIndex > 0 ? 'flex' : 'none';
  document.getElementById('nextBtn').style.display = currentIndex < imagePhotos.length - 1 ? 'flex' : 'none';
}

function showNext() {
  if (currentIndex < imagePhotos.length - 1) { currentIndex++; updateModalContent(); }
}

function showPrev() {
  if (currentIndex > 0) { currentIndex--; updateModalContent(); }
}

function closeModal() {
  document.getElementById('imageModal').classList.remove('active');
  document.getElementById('modalImg').src = '';
  document.body.style.overflow = '';
}

// ─────────────────────────────────────────────────────
//  FLOATING PETALS
// ─────────────────────────────────────────────────────
function createPetals() {
  const container = document.getElementById('petalsContainer');
  if (!container) return;
  const symbols = ['🌸', '🌷', '✨', '🌺', '💛', '🌼'];
  for (let i = 0; i < 15; i++) {
    const petal = document.createElement('span');
    petal.className = 'petal';
    petal.textContent = symbols[Math.floor(Math.random() * symbols.length)];
    const left = Math.random() * 100;
    const dur  = 8 + Math.random() * 14;
    const del  = Math.random() * -20;
    const size = 0.7 + Math.random() * 0.9;
    petal.style.cssText = `left:${left}%;font-size:${size}rem;animation-duration:${dur}s;animation-delay:${del}s;`;
    container.appendChild(petal);
  }
}
