'use strict';

const parts = {
  fuses: ['Caja de fusibles del motor', 'Consulta el plano de la caja y coteja su etiqueta con la del vehículo.'],
  washer: ['Sapito', 'Tapa del depósito del líquido limpiaparabrisas.'],
  dipstick: ['Varilla de aceite', 'Manilla de la varilla que se usa para revisar el nivel de aceite.'],
  coolant: ['Depósito de refrigerante', 'Identifica el depósito y consulta en el manual cómo leer sus marcas de nivel.'],
  air_filter: ['Caja del filtro de aire', 'Carcasa del filtro de aire del motor.'],
  oil_cap: ['Tapa de aceite', 'Punto de llenado de aceite del motor.'],
  brake_fluid: ['Depósito de líquido de frenos', 'Identifica el depósito y consulta en el manual cómo leer sus marcas de nivel.'],
  battery: ['Batería', 'Ubicación de la batería de 12 V.'],
  positive: ['Borne positivo', 'Terminal positivo de la batería.']
};

const byId = id => document.getElementById(id);
const canvas = byId('scene');
const context = canvas.getContext('2d');
const vehicleSelect = byId('vehicle');
const photo = new Image();
photo.onload = photo.onerror = () => {
  updateCoverage();
  draw();
};
let vehicle;
let selected;
let yaw;
let pitch;
let gesture;
let faces = [];

function hasPhoto() {
  return Boolean(vehicle?.photoFile && photo.complete && photo.naturalWidth
    && photo.getAttribute('src') === vehicle.photoFile);
}

function updateCoverage() {
  byId('coverage').textContent = hasPhoto() ? 'Foto de referencia con volúmenes 3D' : 'Esquema 3D con ubicaciones aproximadas';
}

function draw() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (!vehicle || !width || !height) return;
  const pixelRatio = window.devicePixelRatio || 1;
  const pixelWidth = Math.round(width * pixelRatio);
  const pixelHeight = Math.round(height * pixelRatio);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, width, height);
  const ratio = vehicle.aspectRatio || 1.65;
  const sinYaw = Math.sin(yaw);
  const cosYaw = Math.cos(yaw);
  const sinPitch = Math.sin(pitch);
  const cosPitch = Math.cos(pitch);
  const projectedWidth = Math.abs(cosYaw) + Math.abs(sinYaw) / ratio;
  const projectedHeight = (Math.abs(sinYaw) + Math.abs(cosYaw) / ratio) * sinPitch;
  const scale = Math.min(width * .86 / Math.max(projectedWidth, 1), height * .8 / Math.max(projectedHeight, .72));
  function project([u, v], rise = 0) {
    const x = u - .5;
    const y = (v - .5) / ratio;
    const depth = x * sinYaw + y * cosYaw;
    return [
      width / 2 + (x * cosYaw - y * sinYaw) * scale,
      height / 2 + (depth * sinPitch - rise * cosPitch) * scale,
      depth * cosPitch + rise * sinPitch
    ];
  }
  const [left, top] = project([0, 0]);
  const [right, upper] = project([1, 0]);
  const [lowerLeft, bottom] = project([0, 1]);
  context.save();
  context.transform(right-left, upper-top, lowerLeft-left, bottom-top, left, top);
  if (hasPhoto()) {
    context.drawImage(photo, 0, 0, 1, 1);
  } else {
    context.fillStyle = '#294238';
    context.fillRect(0, 0, 1, 1);
    context.fillStyle = '#39574a';
    context.fillRect(.02, .035, .96, .04);
    context.fillStyle = '#658e7b';
    context.fillRect(.02, .945, .96, .03);
  }
  context.restore();

  faces = [];
  function addFace(part, points, side) {
    const area = points.reduce((sum, [x,y], index) => {
      const [nextX,nextY] = points[(index+1) % points.length];
      return sum + x*nextY - y*nextX;
    }, 0);
    if (area <= .001) return;
    const path = new Path2D();
    points.forEach(([x,y], index) => index ? path.lineTo(x,y) : path.moveTo(x,y));
    path.closePath();
    const depth = points.reduce((sum, point) => sum + point[2], 0) / points.length;
    faces.push({part, path, depth, side});
  }
  for (const {part, outline, height: rise} of vehicle.volumes) {
    const base = outline.map(point => project(point));
    const top = outline.map(point => project(point, rise));
    outline.forEach((_, index) => {
      const next = (index+1) % outline.length;
      addFace(part, [base[index], base[next], top[next], top[index]], true);
    });
    addFace(part, top, false);
  }
  faces.sort((first, second) => first.depth - second.depth);
  context.lineJoin = 'round';
  for (const {part,path,side} of faces) {
    context.fillStyle = part === selected ? (side ? '#b8662b' : '#ffbc70d9') : (side ? '#347761' : '#78d8b6a8');
    context.strokeStyle = part === selected ? '#ffe0ad' : (side ? '#245243' : '#d4ffed');
    context.lineWidth = part === selected ? 1.8 : 1;
    context.fill(path);
    context.stroke(path);
  }
  if (!hasPhoto()) {
    context.fillStyle = '#d4e8df';
    context.font = '13px system-ui';
    context.textAlign = 'center';
    const [frontX, frontY] = project([.5, .99]);
    context.fillText('Frente del vehículo', frontX, frontY + 17);
  }
}

function selectPart(part) {
  selected = part;
  for (const button of byId('parts').children) {
    button.setAttribute('aria-pressed', String(button.dataset.part === selected));
  }
  byId('part-title').textContent = part ? parts[part][0] : 'Selecciona una pieza';
  byId('part-detail').textContent = part ? parts[part][1] : 'Toca un volumen en el mapa o usa la lista de piezas.';
  byId('fuses').hidden = part !== 'fuses';
  draw();
}

function resetView() {
  yaw = -.15;
  pitch = 1.05;
  draw();
}

function openVehicle() {
  gesture = undefined;
  vehicle = vehicles[vehicleSelect.value];
  canvas.removeAttribute('data-pickable');
  if (vehicle.photoFile) photo.src = vehicle.photoFile;
  else photo.removeAttribute('src');
  byId('variant').textContent = vehicle.year + ' · ' + vehicle.variant;
  byId('vehicle-title').textContent = vehicle.title;
  updateCoverage();
  byId('note').textContent = vehicle.note;
  byId('manual').href = vehicle.manualUrl;
  byId('fuses').href = vehicle.fuseUrl || vehicle.manualUrl;
  byId('photo-link').hidden = !vehicle.photoUrl;
  if (vehicle.photoUrl) byId('photo-link').href = vehicle.photoUrl;
  byId('photo-source').hidden = !vehicle.photoPage;
  if (vehicle.photoPage) byId('photo-source').href = vehicle.photoPage;
  const buttons = Object.entries(parts)
    .filter(([part]) => vehicle.volumes.some(volume => volume.part === part))
    .map(([part, [label]]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.part = part;
      button.textContent = label;
      button.onclick = () => selectPart(part);
      return button;
    });
  byId('parts').replaceChildren(...buttons);
  yaw = -.15;
  pitch = 1.05;
  selectPart(undefined);
}

function partAt(event) {
  const {left, top} = canvas.getBoundingClientRect();
  context.save();
  context.resetTransform();
  const face = faces.findLast(({path}) => context.isPointInPath(path,event.clientX-left,event.clientY-top));
  context.restore();
  return face?.part;
}

canvas.addEventListener('pointerdown', event => {
  if (gesture || event.button !== 0) return;
  gesture = {id:event.pointerId, x:event.clientX, y:event.clientY, yaw, pitch, moved:false};
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointermove', event => {
  if (!gesture) {
    canvas.toggleAttribute('data-pickable', Boolean(partAt(event)));
    return;
  }
  if (gesture.id !== event.pointerId) return;
  const dx = event.clientX - gesture.x;
  const dy = event.clientY - gesture.y;
  gesture.moved ||= Math.hypot(dx, dy) > 4;
  if (!gesture.moved) return;
  yaw = gesture.yaw + dx / 130;
  pitch = Math.max(.45, Math.min(Math.PI / 2, gesture.pitch + dy / 150));
  draw();
});
canvas.addEventListener('pointerup', event => {
  if (gesture?.id !== event.pointerId) return;
  if (!gesture.moved) {
    const part = partAt(event);
    if (part) selectPart(part);
  }
  gesture = undefined;
});
canvas.addEventListener('lostpointercapture', event => {
  if (gesture?.id === event.pointerId) gesture = undefined;
});
canvas.addEventListener('pointerleave', () => canvas.removeAttribute('data-pickable'));
byId('angle').onclick = resetView;
byId('top').onclick = () => {
  yaw = 0;
  pitch = Math.PI / 2;
  draw();
};
Object.entries(vehicles).forEach(([id, model]) => {
  vehicleSelect.add(new Option(model.title + ' · ' + model.year, id));
});
vehicleSelect.addEventListener('change',openVehicle);
new ResizeObserver(draw).observe(canvas);
openVehicle();
