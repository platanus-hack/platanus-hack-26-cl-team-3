'use strict';

const camera = document.querySelector('#camera');
const statusText = document.querySelector('#status-text');
const metrics = document.querySelector('#metrics');
const cameraButton = document.querySelector('#toggle-camera');
const notice = document.querySelector('#notice');
const noticeButton = document.querySelector('#show-notice');
const idleMessage = 'Apunta la cámara al capó abierto.';
let stream;
let requestId = 0;
let worker;
let timer;
const viewer = document.querySelector('.viewer');
const footer = document.querySelector('footer');
const menu = document.querySelector('#menu');

function scanFrames(id) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 224;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  let frames = 0;
  let average = 0;
  let detected = false;
  let failures = 0;
  let started;
  const fail = () => stopCamera('No se pudo analizar la imagen. Vuelve a activar la cámara.');
  worker = new Worker('/detector.js', { type: 'module' });
  worker.onerror = () => { if (id === requestId) fail(); };
  function capture() {
    if (id !== requestId) return;
    const side = Math.min(camera.videoWidth, camera.videoHeight);
    if (!side) { timer = setTimeout(capture, 200); return; }
    try {
      started = performance.now();
      context.drawImage(camera, (camera.videoWidth - side) / 2, (camera.videoHeight - side) / 2, side, side, 0, 0, 224, 224);
      const pixels = context.getImageData(0, 0, 224, 224).data;
      worker.postMessage(pixels, [pixels.buffer]);
    } catch { fail(); }
  }
  worker.onmessage = ({ data }) => {
    if (id !== requestId) return;
    if (data.ready) return capture();
    if (data.error) {
      if (started === undefined || ++failures >= 5) return fail();
      timer = setTimeout(capture, 800);
      return;
    }
    failures = 0;
    average = frames++ ? (average + data.score) / 2 : data.score;
    if (frames >= 2 && average >= 0.6) detected = true;
    if (average < 0.45) detected = false;
    viewer.classList.toggle('detected', detected);
    const label = detected ? 'Capó abierto detectado' : 'Buscando un capó abierto';
    if (statusText.textContent !== label) statusText.textContent = label;
    metrics.textContent = ' · Confianza ' + Math.round(average * 100) + ' % · ' + Math.round(performance.now() - started) + ' ms';
    timer = setTimeout(capture, 200);
  };
  worker.postMessage(null);
}

function stopCamera(message = idleMessage) {
  requestId += 1;
  metrics.textContent = '';
  clearTimeout(timer);
  worker?.terminate();
  worker = undefined;
  viewer.classList.remove('detected');
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
    statusText.textContent = 'Preparando el reconocimiento…';
    scanFrames(id);
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

function showRoute() {
  const scanning = location.hash === '#escanear';
  menu.hidden = scanning;
  viewer.hidden = footer.hidden = !scanning;
  if (!scanning) stopCamera();
}
window.addEventListener('hashchange', showRoute);
document.querySelector('#scan').addEventListener('click', () => { location.hash = 'escanear'; });
document.querySelector('#back').addEventListener('click', () => { location.hash = ''; });
showRoute();

cameraButton.addEventListener('click', () => stream ? stopCamera() : startCamera());
noticeButton.addEventListener('click', () => {
  stopCamera();
  notice.showModal();
});
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
