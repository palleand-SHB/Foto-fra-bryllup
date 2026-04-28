/* =====================================================
   METTE & PALLE – BRYLLUPSAPP
   app.js – Dropbox upload + UI logic
   =====================================================
   Token læses fra config.js (som IKKE er på GitHub).
   Se config.example.js for opsætningsvejledning.
   ===================================================== */

// Token og mappe hentes fra config.js (ikke på GitHub)
// Fallback til tomme strenge hvis config.js mangler
const DROPBOX_ACCESS_TOKEN = (typeof DROPBOX_CONFIG !== 'undefined') ? DROPBOX_CONFIG.token : '';
const DROPBOX_FOLDER       = (typeof DROPBOX_CONFIG !== 'undefined') ? DROPBOX_CONFIG.folder : '/Bryllup-Mette-og-Palle';

// ─────────────────────────────────────────────────────
//  GLOBALS
// ─────────────────────────────────────────────────────
let selectedFiles = [];

// ─────────────────────────────────────────────────────
//  DOM REFS
// ─────────────────────────────────────────────────────
const dropzone         = document.getElementById('dropzone');
const fileInput        = document.getElementById('fileInput');
const previewGrid      = document.getElementById('previewGrid');
const fileCount        = document.getElementById('fileCount');
const uploadBtn        = document.getElementById('uploadBtn');
const progressContainer = document.getElementById('progressContainer');
const progressFill     = document.getElementById('progressFill');
const progressText     = document.getElementById('progressText');
const uploadSection    = document.getElementById('uploadSection');
const successScreen    = document.getElementById('successScreen');
const uploadMoreBtn    = document.getElementById('uploadMoreBtn');
const tokenWarning     = document.getElementById('tokenWarning');

// ─────────────────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  createPetals();

  // Show token warning if not configured
  if (!DROPBOX_ACCESS_TOKEN || DROPBOX_ACCESS_TOKEN === 'DIN_TOKEN_HER') {
    tokenWarning.classList.add('visible');
  }

  // File input change
  fileInput.addEventListener('change', (e) => {
    handleFiles(Array.from(e.target.files));
  });

  // Drag & drop
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('drag-over');
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('drag-over');
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('drag-over');
    handleFiles(Array.from(e.dataTransfer.files));
  });

  // Upload button
  uploadBtn.addEventListener('click', startUpload);

  // Upload more
  uploadMoreBtn.addEventListener('click', resetUI);
});

// ─────────────────────────────────────────────────────
//  HANDLE FILES
// ─────────────────────────────────────────────────────
function handleFiles(files) {
  const allowed = files.filter(f =>
    f.type.startsWith('image/') || f.type.startsWith('video/')
  );

  if (allowed.length < files.length) {
    alert('Kun billeder og videoer er tilladt.');
  }

  // Deduplicate by name+size
  allowed.forEach(file => {
    const isDup = selectedFiles.some(
      f => f.name === file.name && f.size === file.size
    );
    if (!isDup) selectedFiles.push(file);
  });

  renderPreviews();
  updateCount();
  uploadBtn.disabled = selectedFiles.length === 0;
}

// ─────────────────────────────────────────────────────
//  RENDER PREVIEWS
// ─────────────────────────────────────────────────────
function renderPreviews() {
  previewGrid.innerHTML = '';
  selectedFiles.forEach((file, index) => {
    const item = document.createElement('div');
    item.className = 'preview-item';

    if (file.type.startsWith('video/')) {
      const video = document.createElement('video');
      video.src = URL.createObjectURL(file);
      video.muted = true;
      video.playsInline = true;
      item.appendChild(video);

      const badge = document.createElement('span');
      badge.className = 'video-badge';
      badge.textContent = '▶ Video';
      item.appendChild(badge);
    } else {
      const img = document.createElement('img');
      img.src = URL.createObjectURL(file);
      img.alt = file.name;
      item.appendChild(img);
    }

    // Remove button
    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-btn';
    removeBtn.innerHTML = '✕';
    removeBtn.title = 'Fjern fil';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      selectedFiles.splice(index, 1);
      renderPreviews();
      updateCount();
      uploadBtn.disabled = selectedFiles.length === 0;
    });
    item.appendChild(removeBtn);

    previewGrid.appendChild(item);
  });
}

// ─────────────────────────────────────────────────────
//  FILE COUNT TEXT
// ─────────────────────────────────────────────────────
function updateCount() {
  if (selectedFiles.length === 0) {
    fileCount.textContent = '';
  } else if (selectedFiles.length === 1) {
    fileCount.textContent = '1 fil valgt';
  } else {
    fileCount.textContent = `${selectedFiles.length} filer valgt`;
  }
}

// ─────────────────────────────────────────────────────
//  UPLOAD TO DROPBOX
// ─────────────────────────────────────────────────────
async function startUpload() {
  if (selectedFiles.length === 0) return;

  if (!DROPBOX_ACCESS_TOKEN || DROPBOX_ACCESS_TOKEN === 'DIN_TOKEN_HER') {
    alert('⚠️ Dropbox API-nøgle mangler!\n\nÅbn app.js og indsæt din token øverst i filen.');
    return;
  }

  // Disable button, show progress
  uploadBtn.disabled = true;
  progressContainer.classList.add('visible');
  setProgress(0, `Uploader 0 af ${selectedFiles.length}...`);

  let uploaded = 0;
  const errors = [];

  for (const file of selectedFiles) {
    try {
      await uploadFileToDropbox(file);
      uploaded++;
      const pct = Math.round((uploaded / selectedFiles.length) * 100);
      setProgress(pct, `Uploader ${uploaded} af ${selectedFiles.length}...`);
    } catch (err) {
      console.error(`Fejl ved upload af ${file.name}:`, err);
      errors.push(file.name);
    }
  }

  if (errors.length > 0) {
    alert(`Disse filer kunne ikke uploades:\n${errors.join('\n')}\n\nPrøv venligst igen.`);
    uploadBtn.disabled = false;
    progressContainer.classList.remove('visible');
  } else {
    setProgress(100, 'Alle filer uploadet! 🎉');
    setTimeout(showSuccessScreen, 800);
  }
}

// ─────────────────────────────────────────────────────
//  DROPBOX API UPLOAD (single file)
// ─────────────────────────────────────────────────────
async function uploadFileToDropbox(file) {
  // Create unique filename: timestamp_originalname
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const dropboxPath = `${DROPBOX_FOLDER}/${timestamp}_${safeName}`;

  const CHUNK_SIZE = 8 * 1024 * 1024; // 8 MB

  if (file.size <= CHUNK_SIZE) {
    // Simple upload
    const arrayBuffer = await file.arrayBuffer();
    const response = await fetch('https://content.dropboxapi.com/2/files/upload', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DROPBOX_ACCESS_TOKEN}`,
        'Content-Type': 'application/octet-stream',
        'Dropbox-API-Arg': JSON.stringify({
          path: dropboxPath,
          mode: 'add',
          autorename: true,
          mute: false,
        }),
      },
      body: arrayBuffer,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errText}`);
    }
  } else {
    // Chunked upload for large files
    await chunkedUpload(file, dropboxPath, CHUNK_SIZE);
  }
}

// ─────────────────────────────────────────────────────
//  CHUNKED UPLOAD (store filer)
// ─────────────────────────────────────────────────────
async function chunkedUpload(file, dropboxPath, chunkSize) {
  let offset = 0;
  let sessionId = null;

  while (offset < file.size) {
    const chunk = file.slice(offset, offset + chunkSize);
    const buffer = await chunk.arrayBuffer();
    const isFirst = offset === 0;
    const isLast  = offset + chunkSize >= file.size;

    if (isFirst) {
      // Start session
      const res = await fetch('https://content.dropboxapi.com/2/files/upload_session/start', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${DROPBOX_ACCESS_TOKEN}`,
          'Content-Type': 'application/octet-stream',
          'Dropbox-API-Arg': JSON.stringify({ close: false }),
        },
        body: buffer,
      });
      if (!res.ok) throw new Error(`Session start fejl: HTTP ${res.status}`);
      const data = await res.json();
      sessionId = data.session_id;

    } else if (isLast) {
      // Finish session
      const res = await fetch('https://content.dropboxapi.com/2/files/upload_session/finish', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${DROPBOX_ACCESS_TOKEN}`,
          'Content-Type': 'application/octet-stream',
          'Dropbox-API-Arg': JSON.stringify({
            cursor: { session_id: sessionId, offset },
            commit: {
              path: dropboxPath,
              mode: 'add',
              autorename: true,
              mute: false,
            },
          }),
        },
        body: buffer,
      });
      if (!res.ok) throw new Error(`Session finish fejl: HTTP ${res.status}`);

    } else {
      // Append
      const res = await fetch('https://content.dropboxapi.com/2/files/upload_session/append_v2', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${DROPBOX_ACCESS_TOKEN}`,
          'Content-Type': 'application/octet-stream',
          'Dropbox-API-Arg': JSON.stringify({
            cursor: { session_id: sessionId, offset },
            close: false,
          }),
        },
        body: buffer,
      });
      if (!res.ok) throw new Error(`Session append fejl: HTTP ${res.status}`);
    }

    offset += chunkSize;
  }
}

// ─────────────────────────────────────────────────────
//  PROGRESS
// ─────────────────────────────────────────────────────
function setProgress(pct, text) {
  progressFill.style.width = `${pct}%`;
  progressText.textContent = text;
}

// ─────────────────────────────────────────────────────
//  SUCCESS SCREEN
// ─────────────────────────────────────────────────────
function showSuccessScreen() {
  uploadSection.style.display = 'none';
  successScreen.classList.add('visible');
}

function resetUI() {
  selectedFiles = [];
  previewGrid.innerHTML = '';
  fileCount.textContent = '';
  uploadBtn.disabled = true;
  progressContainer.classList.remove('visible');
  setProgress(0, '');
  successScreen.classList.remove('visible');
  uploadSection.style.display = 'block';
  fileInput.value = '';
}

// ─────────────────────────────────────────────────────
//  FLOATING PETALS
// ─────────────────────────────────────────────────────
function createPetals() {
  const container = document.getElementById('petalsContainer');
  const symbols = ['🌸', '🌷', '✨', '🌺', '💛', '🌼'];
  const count = 18;

  for (let i = 0; i < count; i++) {
    const petal = document.createElement('span');
    petal.className = 'petal';
    petal.textContent = symbols[Math.floor(Math.random() * symbols.length)];

    const left     = Math.random() * 100;
    const duration = 8 + Math.random() * 14;
    const delay    = Math.random() * -20;
    const size     = 0.7 + Math.random() * 0.9;

    petal.style.cssText = `
      left: ${left}%;
      font-size: ${size}rem;
      animation-duration: ${duration}s;
      animation-delay: ${delay}s;
    `;

    container.appendChild(petal);
  }
}
