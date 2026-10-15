import { segmentTrips, sortTrips } from './trips.mjs';
const status = document.querySelector('#status');
const errorBox = document.querySelector('#error');
const fit = document.querySelector('#fit');
const timeline = document.querySelector('#timeline');
const requestedSource = new URLSearchParams(location.search).get('source');
const source = ['sumin', 'seongmin'].includes(requestedSource) ? requestedSource : 'sumin';
const sourceSelect = document.querySelector('#source');
sourceSelect.value = source;
sourceSelect.onchange = () => {
  timeline.replaceChildren();
  document.querySelector('#map').replaceChildren();
  fit.disabled = true;
  status.textContent = '선택한 사진의 지도와 타임라인을 불러오고 있습니다…';
  location.search = new URLSearchParams({ source: sourceSelect.value });
};
const sourceLabel = sourceSelect.selectedOptions[0].textContent.split(' · ')[0];
document.querySelector('#map-title').textContent = `${sourceLabel} 여행 지도`;

const viewer = document.querySelector('#photo-viewer');
const viewerImage = document.querySelector('#viewer-image');
const stage = document.querySelector('#viewer-stage');
let zoom = 1;
let offset = { x: 0, y: 0 };
let drag = null;
function renderZoom() {
  viewerImage.style.transform = `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`;
  document.querySelector('#zoom-level').textContent = `${Math.round(zoom * 100)}%`;
  document.querySelector('#zoom-out').disabled = zoom <= 1;
  document.querySelector('#zoom-in').disabled = zoom >= 5;
  stage.classList.toggle('zoomed', zoom > 1);
}
function setZoom(value) {
  const next = Math.max(1, Math.min(5, value));
  offset = next === 1 ? { x: 0, y: 0 } : { x: offset.x * next / zoom, y: offset.y * next / zoom };
  zoom = next;
  renderZoom();
}
function openPhoto(photo, alt) {
  viewerImage.src = photo.url;
  viewerImage.alt = alt;
  document.querySelector('#viewer-title').textContent = photo.name;
  zoom = 1;
  offset = { x: 0, y: 0 };
  renderZoom();
  viewer.showModal();
  document.body.classList.add('viewer-open');
}
document.querySelector('#zoom-in').onclick = () => setZoom(zoom + .25);
document.querySelector('#zoom-out').onclick = () => setZoom(zoom - .25);
document.querySelector('#zoom-reset').onclick = () => setZoom(1);
document.querySelector('#viewer-close').onclick = () => viewer.close();
viewer.addEventListener('close', () => { document.body.classList.remove('viewer-open'); drag = null; });
viewer.addEventListener('click', event => { if (event.target === viewer) viewer.close(); });
viewer.addEventListener('keydown', event => {
  if (['+', '=', '-', '0'].includes(event.key)) {
    event.preventDefault();
    setZoom(event.key === '0' ? 1 : zoom + (event.key === '-' ? -.25 : .25));
  }
});
stage.addEventListener('wheel', event => {
  event.preventDefault();
  setZoom(zoom + (event.deltaY < 0 ? .25 : -.25));
}, { passive: false });
stage.addEventListener('pointerdown', event => {
  if (zoom <= 1 || event.button !== 0) return;
  drag = { x: event.clientX - offset.x, y: event.clientY - offset.y };
  stage.setPointerCapture(event.pointerId);
});
stage.addEventListener('pointermove', event => {
  if (!drag) return;
  offset = { x: event.clientX - drag.x, y: event.clientY - drag.y };
  renderZoom();
});
stage.addEventListener('lostpointercapture', () => { drag = null; });
stage.addEventListener('pointerup', () => { drag = null; });
stage.addEventListener('pointercancel', () => { drag = null; });

async function json(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '데이터를 불러오지 못했습니다.');
  return data;
}

function loadMap(key) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const fail = () => reject(new Error('지도를 불러오지 못했습니다. JavaScript 키, 카카오맵 사용 설정, SDK 도메인 http://localhost:5173 및 인터넷 연결을 확인해주세요.'));
    const timeout = setTimeout(fail, 15000);
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&autoload=false`;
    script.onerror = () => { clearTimeout(timeout); fail(); };
    script.onload = () => {
      if (!window.kakao?.maps) { clearTimeout(timeout); fail(); return; }
      kakao.maps.load(() => { clearTimeout(timeout); resolve(); });
    };
    document.head.append(script);
  });
}

async function main() {
  const { photos: allPhotos, skipped } = await json(`/api/photos?source=${encodeURIComponent(source)}`);
  const storageKey = `triptrace:trips:v2:${source}`;
  let settings = { mode: 'time', overrides: {} };
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey));
    if (stored && ['time', 'distance'].includes(stored.mode)) settings = { mode: stored.mode, overrides: stored.overrides && typeof stored.overrides === 'object' ? stored.overrides : {} };
  } catch { /* Browser storage may be unavailable. */ }
  const reloadTrips = (trip = 0) => {
    try { localStorage.setItem(storageKey, JSON.stringify(settings)); } catch { errorBox.hidden = false; errorBox.textContent = '여행 설정을 저장할 수 없습니다. 브라우저 저장소를 허용해주세요.'; return; }
    location.search = new URLSearchParams({ source, trip });
  };
  for (const [id, mode] of [['split-time', 'time'], ['split-distance', 'distance']]) {
    const button = document.getElementById(id);
    button.setAttribute('aria-pressed', String(settings.mode === mode));
    button.onclick = () => {
      if (settings.mode === mode) return;
      settings = { mode, overrides: {} };
      reloadTrips();
    };
  }
  const modeHint = document.querySelector('#trip-mode-hint');
  modeHint.hidden = settings.mode !== 'time';
  modeHint.textContent = settings.mode === 'time'
    ? '촬영 시간 간격이 24시간을 넘는 연결을 끊어 여정을 나눕니다.'
    : '';
  const segmentation = segmentTrips(allPhotos, settings);
  const tripSelect = document.querySelector('#trip-select');
  const sortSelect = document.querySelector('#trip-sort');
  const sortKey = `triptrace:sort:${source}`;
  try {
    const saved = localStorage.getItem(sortKey);
    if (['recent', 'photos', 'distance'].includes(saved)) sortSelect.value = saved;
  } catch { /* Default to recent when storage is unavailable. */ }
  let sorted = sortTrips(allPhotos, segmentation.trips, sortSelect.value);
  const tripParam = new URLSearchParams(location.search).get('trip');
  const requestedTrip = tripParam === null ? NaN : Number(tripParam);
  const tripIndex = Number.isInteger(requestedTrip) && requestedTrip >= 0 && requestedTrip < segmentation.trips.length ? requestedTrip : (sorted[0]?.index ?? 0);
  const renderTripOptions = () => {
    sorted = sortTrips(allPhotos, segmentation.trips, sortSelect.value);
    tripSelect.replaceChildren();
    for (const trip of sorted) {
      const option = document.createElement('option');
      option.value = trip.index;
      option.textContent = `여행 ${trip.index + 1} · ${allPhotos[trip.start].takenAt.slice(0, 10)} ~ ${allPhotos[trip.end - 1].takenAt.slice(0, 10)} · ${trip.count}장 · 추정 ${trip.estimatedKm.toFixed(1)}km`;
      tripSelect.append(option);
    }
    tripSelect.value = tripIndex;
  };
  renderTripOptions();
  sortSelect.onchange = () => {
    try { localStorage.setItem(sortKey, sortSelect.value); } catch { /* Sorting still works without persistence. */ }
    renderTripOptions();
  };
  tripSelect.disabled = !segmentation.trips.length;
  tripSelect.onchange = () => reloadTrips(Number(tripSelect.value));
  const selectedTrip = segmentation.trips[tripIndex] ?? { start: 0, end: 0 };
  const photos = allPhotos.slice(selectedTrip.start, selectedTrip.end);
  const routeRange = new URLSearchParams({ source, start: selectedTrip.start, end: selectedTrip.end });
  document.querySelector('#timeline-title').textContent = `여행 ${tripIndex + 1} 촬영 타임라인`;
  status.textContent = `전체 ${photos.length + skipped.length}장 · 경로 표시 ${photos.length}장 · 제외 ${skipped.length}장`;
  if (skipped.length) {
    document.querySelector('#excluded').hidden = false;
    document.querySelector('#excluded-title').textContent = `경로에서 제외된 사진 ${skipped.length}장`;
    for (const item of skipped) {
      const li = document.createElement('li');
      li.textContent = `${item.name} — ${item.reason}`;
      document.querySelector('#skipped').append(li);
    }
  }
  const descriptionTasks = [];
  const buttons = photos.map((photo, index) => {
    const li = document.createElement('li');
    const card = document.createElement('div');
    card.className = 'photo';
    const imageButton = document.createElement('button');
    imageButton.className = 'photo-image';
    imageButton.onclick = () => openPhoto(photo, img.alt);
    imageButton.setAttribute('aria-haspopup', 'dialog');
    imageButton.setAttribute('aria-label', `${index + 1}번째 사진 크게 보기`);
    const img = document.createElement('img');
    img.src = photo.url;
    img.alt = `${index + 1}번째 촬영 사진`;
    img.loading = 'lazy';
    const caption = document.createElement('button');
    caption.className = 'caption';
    caption.setAttribute('aria-pressed', 'false');
    caption.disabled = true;
    const title = document.createElement('strong');
    title.className = 'photo-title';
    title.textContent = '사진 설명을 준비하고 있어요…';
    title.setAttribute('aria-live', 'polite');
    const date = document.createElement('small');
    date.textContent = `${index + 1}. ${photo.takenAt.slice(0, 19).replace('T', ' ')}`;
    const badge = document.createElement('small');
    badge.className = 'ai-label';
    badge.textContent = 'AI 설명';
    caption.append(badge, title, date);
    imageButton.append(img);
    card.append(imageButton, caption);
    li.append(card);
    descriptionTasks.push(async () => {
      title.textContent = '사진을 살펴보고 있어요…';
      title.setAttribute('aria-busy', 'true');
      try {
        const result = await json(`/api/description?source=${encodeURIComponent(source)}&name=${encodeURIComponent(photo.name)}`, { method: 'POST' });
        title.textContent = result.description;
        img.alt = result.description;
      } catch (error) {
        title.textContent = '여행의 한 장면';
        badge.textContent = 'AI 설명을 불러오지 못했어요';
        const message = document.createElement('small');
        message.className = 'description-error';
        message.textContent = error.message;
        caption.append(message);
      } finally {
        title.removeAttribute('aria-busy');
      }
    });
    timeline.append(li);
    return caption;
  });
  // Run separately from map loading so either feature can fail independently.
  void (async () => {
    for (const task of descriptionTasks) await task();
  })();
  if (!photos.length) {
    status.textContent += ' · 촬영 시간·시간대·GPS가 있는 JPG 사진을 선택한 폴더에 넣어주세요.';
    return;
  }
  const { key } = await json('/api/config');
  await loadMap(key);
  const points = photos.map(photo => new kakao.maps.LatLng(photo.latitude, photo.longitude));
  const map = new kakao.maps.Map(document.querySelector('#map'), { center: points[0], level: 5 });
  const bounds = new kakao.maps.LatLngBounds();
  points.forEach(point => bounds.extend(point));
  const fitBounds = () => points.length === 1 ? map.setCenter(points[0]) : map.setBounds(bounds, 70, 70, 70, 70);
  const overlays = [];
  const labels = [];
  let selectedIndex = null;
  photos.forEach((photo, index) => {
    const label = document.createElement('button');
    label.className = 'pin';
    label.textContent = `${index + 1} · ${photo.takenAt.slice(5, 10)} ${photo.takenAt.slice(11, 16)}`;
    label.setAttribute('aria-label', `${index + 1}번째 사진 보기`);
    label.setAttribute('aria-pressed', 'false');
    const preview = document.createElement('img');
    preview.className = 'pin-preview';
    preview.src = photo.url;
    preview.alt = '';
    preview.loading = 'lazy';
    label.append(preview);
    labels.push(label);
    const overlay = new kakao.maps.CustomOverlay({ map, position: points[index], content: label, yAnchor: 1.2, zIndex: index + 1 });
    overlays.push(overlay);
    for (const event of ['mouseenter', 'mouseleave', 'focus', 'blur']) {
      label.addEventListener(event, () => {
        overlay.setZIndex(label.matches(':hover, :focus-visible') ? photos.length + 2 : selectedIndex === index ? photos.length + 1 : index + 1);
      });
    }
    const select = () => {
      selectedIndex = index;
      map.setLevel(4);
      map.panTo(points[index]);
      buttons.forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
      labels.forEach((item, i) => item.setAttribute('aria-pressed', String(i === index)));
      overlays.forEach((item, i) => item.setZIndex(i === index ? photos.length + 1 : i + 1));
      document.querySelector('#map-title').textContent = `${sourceLabel} · ${index + 1}번째 사진 · ${photo.takenAt.slice(0, 19).replace('T', ' ')}`;
      buttons[index].closest('.photo').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };
    label.onclick = select;
    buttons[index].disabled = false;
    buttons[index].onclick = select;
    const imageButton = buttons[index].previousElementSibling;
    imageButton.onclick = () => {
      select();
      openPhoto(photo, imageButton.querySelector('img').alt);
    };
  });
  fit.disabled = false;
  fit.onclick = () => {
    selectedIndex = null;
    buttons.forEach(button => button.setAttribute('aria-pressed', 'false'));
    labels.forEach(label => label.setAttribute('aria-pressed', 'false'));
    document.querySelector('#map-title').textContent = `${sourceLabel} 여행 지도`;
    fitBounds();
  };
  fitBounds();
  window.addEventListener('resize', () => { map.relayout(); fitBounds(); });
  if (photos.length > 1) {
    status.textContent += ' · 도로 경로를 찾고 있습니다…';
    try {
      const route = await json(`/api/route?${routeRange}`);
      for (const path of route.paths) {
        const coordinates = path.map(p => new kakao.maps.LatLng(p.latitude, p.longitude));
        coordinates.forEach(p => bounds.extend(p));
        new kakao.maps.Polyline({ map, path: coordinates, strokeWeight: 4, strokeColor: '#16705a', strokeOpacity: 0.8, strokeStyle: 'solid' });
      }
      status.textContent = status.textContent.replace('도로 경로를 찾고 있습니다…', route.paths.length ? `자동차 추천 경로 ${(route.distance / 1000).toFixed(1)}km · 약 ${Math.ceil(route.duration / 60)}분` : '동일한 촬영 위치입니다.');
      if (selectedIndex === null) fitBounds();
    } catch (error) {
      status.textContent = status.textContent.replace('도로 경로를 찾고 있습니다…', '도로 경로를 표시하지 못했습니다.');
      errorBox.hidden = false;
      errorBox.textContent = error.message;
    }
  }
}

main().catch(error => {
  errorBox.hidden = false;
  errorBox.textContent = error.message;
  if (!timeline.children.length) status.textContent = '사진을 불러오지 못했습니다.';
});
