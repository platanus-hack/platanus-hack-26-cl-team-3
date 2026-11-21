'use strict';

const camera = document.querySelector('#camera');
const statusText = document.querySelector('#camera-status');
const cameraButton = document.querySelector('#toggle-camera');
const notice = document.querySelector('#notice');
const noticeButton = document.querySelector('#show-notice');
const idleMessage = 'Apunta la cámara al capó abierto.';
let stream;
let requestId = 0;

function stopCamera(message = idleMessage) {
  requestId += 1;
  stream?.getTracks().forEach(track => track.stop());
  stream = undefined;
  camera.srcObject = null;
  camera.hidden = true;
  cameraButton.disabled = false;
  cameraButton.textContent = 'Activar cámara';
  statusText.textContent = message;
}

async function startCamera() {
  if (!window.isSecureContext) {
    statusText.textContent = 'Abre Capo AR por HTTPS o localhost para activar la cámara.';
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    statusText.textContent = 'Este navegador no permite usar la cámara.';
    return;
  }
  const id = ++requestId;
  cameraButton.disabled = true;
  statusText.textContent = 'Esperando permiso para usar la cámara…';
  try {
    const incoming = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false,
    });
    if (id !== requestId) {
      incoming.getTracks().forEach(track => track.stop());
      return;
    }
    stream = incoming;
    stream.getVideoTracks().forEach(track => {
      track.addEventListener('ended', () => {
        if (id === requestId) stopCamera('La cámara se desconectó.');
      });
    });
    camera.srcObject = stream;
    camera.hidden = false;
    await camera.play();
    if (id !== requestId) return;
    cameraButton.disabled = false;
    cameraButton.textContent = 'Apagar cámara';
    statusText.textContent = 'Vista en vivo · Reconocimiento aún no disponible';
  } catch (error) {
    if (id !== requestId) return;
    const messages = {
      NotAllowedError: 'Permiso denegado. Habilita la cámara en los ajustes del sitio y vuelve a intentarlo.',
      NotFoundError: 'No se encontró una cámara disponible.',
      NotReadableError: 'La cámara está ocupada o no se puede abrir.',
    };
    stopCamera(messages[error.name] || 'No se pudo abrir la cámara. Inténtalo de nuevo.');
  }
}

cameraButton.addEventListener('click', () => stream ? stopCamera() : startCamera());
noticeButton.addEventListener('click', () => notice.showModal());
window.addEventListener('pagehide', () => stopCamera());
document.addEventListener('visibilitychange', () => {
  if (document.hidden && (stream || cameraButton.disabled)) stopCamera();
});

const noticeKey = 'capo-ar:notice-v1';
let acknowledged = false;
try {
  acknowledged = localStorage.getItem(noticeKey) === 'yes';
} catch {
  // Restricted browser storage can require acknowledging again on reload.
}
notice.addEventListener('cancel', event => {
  if (!acknowledged) event.preventDefault();
});
notice.addEventListener('close', () => {
  if (notice.returnValue !== 'confirmed') return;
  acknowledged = true;
  try {
    localStorage.setItem(noticeKey, 'yes');
  } catch {
    // The acknowledgment still applies to the current page.
  }
});
if (!acknowledged) notice.showModal();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(error => {
    console.warn('Could not register the Capo AR service worker.', error);
  });
}

fetch('/maps/index.html', { method: 'HEAD' }).then(response => {
  if (response.ok) document.querySelector('#maps').hidden = false;
}).catch(() => {});
