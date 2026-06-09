/* =====================================================
   METTE & PALLE – BRYLLUPSAPP
   album.js – Hent og vis fotos fra Dropbox med paginering og infinite scroll
   ===================================================== */

const NETLIFY_PHOTOS_URL = 'https://bryllupsfotos.netlify.app/.netlify/functions/get-dropbox-photos';
const PAGE_SIZE = 30;

// Globale variable
let allPhotos  = [];
let currentPage = 0;
let isLoading  = false;
let hasMore    = true;
let currentIndex = -1;

// ─────────────────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  createPetals();
  loadNextPage();

  // Modal luk-knap
  document.getElementById('closeModal').addEventListener('click', closeModal);
  document.getElementById('imageModal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('imageModal')) closeModal();
  });

  // Navigationsknapper
  document.getElementById('prevBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    showPrev();
  });
  document.getElementById('nextBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    showNext();
  });

  // Tastatur: Navigering
  document.addEventListener('keydown', (e) => {
    if (!document.getElementById('imageModal').classList.contains('active')) return;
    if (e.key === 'Escape')     closeModal();
    if (e.key === 'ArrowLeft')  showPrev();
    if (e.key === 'ArrowRight') showNext();
  });

  // IntersectionObserver til infinite scroll
  const sentinel = document.getElementById('scrollSentinel');
  if (sentinel) {
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !isLoading && hasMore) {
        loadNextPage();
      }
    }, { rootMargin: '300px' });
    observer.observe(sentinel);
  }
});

// ─────────────────────────────────────────────────────
//  INDLÆS NÆSTE SIDE
// ─────────────────────────────────────────────────────
async function loadNextPage() {
  if (isLoading || !hasMore) return;
  isLoading = true;

  const grid       = document.getElementById('galleryGrid');
  const loading    = document.getElementById('loadingState');
  const empty      = document.getElementById('emptyState');
  const errorMsg   = document.getElementById('errorState');
  const loadingMore = document.getElementById('loadingMore');
  const photoCount = document.getElementById('photoCount');

  if (currentPage === 0) {
    loading.style.display = 'block';
  } else if (loadingMore) {
    loadingMore.style.display = 'block';
  }

  try {
    const offset = currentPage * PAGE_SIZE;
    const res = await fetch(`${NETLIFY_PHOTOS_URL}?offset=${offset}&limit=${PAGE_SIZE}`);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `HTTP ${res.status}`);
    }

    const data      = await res.json();
    const newPhotos = data.photos || [];
    hasMore         = data.hasMore || false;
    const total     = data.total  || 0;

    loading.style.display = 'none';
    if (loadingMore) loadingMore.style.display = 'none';

    if (currentPage === 0 && newPhotos.length === 0) {
      empty.style.display = 'block';
      isLoading = false;
      return;
    }

    const startIndex = allPhotos.length;
    allPhotos = allPhotos.concat(newPhotos);

    newPhotos.forEach((photo, i) => {
      const item = buildGalleryItem(photo, startIndex + i);
      grid.appendChild(item);
    });

    currentPage++;

    // Opdater billedtæller
    if (photoCount) {
      photoCount.textContent = hasMore
        ? `Viser ${allPhotos.length} af ${total} billeder`
        : `${allPhotos.length} billeder i alt`;
    }

  } catch (err) {
    console.error('Album fejl:', err);
    loading.style.display = 'none';
    if (loadingMore) loadingMore.style.display = 'none';
    if (currentPage === 0) errorMsg.style.display = 'block';
  }

  isLoading = false;
}

// ─────────────────────────────────────────────────────
//  BYGG ET GALLERI-ELEMENT
// ─────────────────────────────────────────────────────
function buildGalleryItem(photo, index) {
  const item = document.createElement('div');
  item.className = 'gallery-item';

  const isVideo = /\.(mov|mp4)$/i.test(photo.name);

  // Udled uploaderens navn fra filnavnet
  const parts = photo.name.split('_');
  const uploaderLabel = parts.length >= 3
    ? parts[1].replace(/-/g, ' ')
    : 'Gæst';

  if (isVideo) {
    const video = document.createElement('video');
    video.src = photo.url;
    video.muted = true;
    video.playsInline = true;
    video.loop = true;
    item.appendChild(video);

    item.addEventListener('mouseenter', () => video.play());
    item.addEventListener('mouseleave', () => { video.pause(); video.currentTime = 0; });
    item.addEventListener('click', () => window.open(photo.url, '_blank'));

    const badge = document.createElement('span');
    badge.className = 'video-badge';
    badge.textContent = '▶ Video';
    item.appendChild(badge);
  } else {
    const img = document.createElement('img');
    img.src = photo.url;
    img.alt = `Billede uploadet af ${uploaderLabel}`;
    img.loading = 'lazy';
    item.appendChild(img);

    item.addEventListener('click', () => openModal(index));
  }

  const label = document.createElement('div');
  label.className = 'gallery-uploader';
  label.textContent = uploaderLabel;
  item.appendChild(label);

  return item;
}

// ─────────────────────────────────────────────────────
//  MODAL LOGIK
// ─────────────────────────────────────────────────────
function openModal(index) {
  currentIndex = index;
  updateModalContent();
  const modal = document.getElementById('imageModal');
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function updateModalContent() {
  const photo  = allPhotos[currentIndex];
  const img    = document.getElementById('modalImg');
  const credit = document.getElementById('modalCredit');

  const parts = photo.name.split('_');
  const uploaderLabel = parts.length >= 3 ? parts[1].replace(/-/g, ' ') : 'Gæst';

  img.style.opacity = '0';
  img.src = photo.url;
  img.onload = () => { img.style.opacity = '1'; };

  if (credit) credit.textContent = uploaderLabel ? `📷 ${uploaderLabel}` : '';

  document.getElementById('prevBtn').style.display = currentIndex > 0 ? 'flex' : 'none';
  document.getElementById('nextBtn').style.display = currentIndex < allPhotos.length - 1 ? 'flex' : 'none';
}

function showNext() {
  if (currentIndex < allPhotos.length - 1) {
    currentIndex++;
    if (/\.(mov|mp4)$/i.test(allPhotos[currentIndex].name)) {
      showNext();
    } else {
      updateModalContent();
    }
  }
}

function showPrev() {
  if (currentIndex > 0) {
    currentIndex--;
    if (/\.(mov|mp4)$/i.test(allPhotos[currentIndex].name)) {
      showPrev();
    } else {
      updateModalContent();
    }
  }
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
  const count = 15;

  for (let i = 0; i < count; i++) {
    const petal = document.createElement('span');
    petal.className = 'petal';
    petal.textContent = symbols[Math.floor(Math.random() * symbols.length)];
    const left     = Math.random() * 100;
    const duration = 8 + Math.random() * 14;
    const delay    = Math.random() * -20;
    const size     = 0.7 + Math.random() * 0.9;
    petal.style.cssText = `left: ${left}%; font-size: ${size}rem; animation-duration: ${duration}s; animation-delay: ${delay}s;`;
    container.appendChild(petal);
  }
}
