/* =====================================================
   METTE & PALLE – BRYLLUPSAPP
   album.js – Hent og vis fotos fra Dropbox (via Netlify)
   ===================================================== */

const NETLIFY_PHOTOS_URL = 'https://bryllupsfotos.netlify.app/.netlify/functions/get-dropbox-photos';

// ─────────────────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  createPetals();
  loadAlbum();

  // Modal luk-knap
  document.getElementById('closeModal').addEventListener('click', closeModal);
  document.getElementById('imageModal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('imageModal')) closeModal();
  });

  // Tastatur: Esc lukker modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });
});

// ─────────────────────────────────────────────────────
//  INDLÆS ALBUM
// ─────────────────────────────────────────────────────
async function loadAlbum() {
  const grid     = document.getElementById('galleryGrid');
  const loading  = document.getElementById('loadingState');
  const empty    = document.getElementById('emptyState');
  const errorMsg = document.getElementById('errorState');

  try {
    // Hent alle billeder fra Netlify Function (server-side, ingen CORS-problem)
    const res = await fetch(NETLIFY_PHOTOS_URL);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `HTTP ${res.status}`);
    }

    const data = await res.json();
    const photos = data.photos || [];

    loading.style.display = 'none';

    if (photos.length === 0) {
      empty.style.display = 'block';
      return;
    }

    // Vis hvert billede/video
    for (const photo of photos) {
      const item = buildGalleryItem(photo);
      grid.appendChild(item);
    }

  } catch (err) {
    console.error('Album fejl:', err);
    loading.style.display = 'none';
    errorMsg.style.display = 'block';
  }
}

// ─────────────────────────────────────────────────────
//  BYGG ET GALLERI-ELEMENT
// ─────────────────────────────────────────────────────
function buildGalleryItem(photo) {
  const item = document.createElement('div');
  item.className = 'gallery-item';

  const isVideo = /\.(mov|mp4)$/i.test(photo.name);

  // Udled uploaderens navn fra filnavnet
  // Format: timestamp_Navn_originalfilnavn.ext
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

    item.addEventListener('click', () => openModal(photo.url, uploaderLabel));
  }

  // Uploaderens navn-label
  const label = document.createElement('div');
  label.className = 'gallery-uploader';
  label.textContent = uploaderLabel;
  item.appendChild(label);

  return item;
}

// ─────────────────────────────────────────────────────
//  MODAL (FULDSKÆRM BILLEDE)
// ─────────────────────────────────────────────────────
function openModal(url, uploaderLabel) {
  const modal  = document.getElementById('imageModal');
  const img    = document.getElementById('modalImg');
  const credit = document.getElementById('modalCredit');
  img.src = url;
  if (credit) credit.textContent = uploaderLabel ? `📷 ${uploaderLabel}` : '';
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
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
