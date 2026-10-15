const status = document.querySelector('#status');
const errorBox = document.querySelector('#error');
const fit = document.querySelector('#fit');
const timeline = document.querySelector('#timeline');

async function json(url) {
  const response = await fetch(url);
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
  const { photos, skipped } = await json('/api/photos');
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
  const buttons = photos.map((photo, index) => {
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.className = 'photo';
    button.disabled = true;
    button.setAttribute('aria-pressed', 'false');
    const img = document.createElement('img');
    img.src = photo.url;
    img.alt = `${index + 1}번째 촬영 사진`;
    img.loading = 'lazy';
    const caption = document.createElement('span');
    caption.className = 'caption';
    const title = document.createElement('strong');
    title.textContent = `${index + 1}. ${photo.takenAt.slice(0, 19).replace('T', ' ')}`;
    const detail = document.createElement('small');
    detail.textContent = `UTC${photo.takenAt.slice(19)} · ${photo.latitude.toFixed(5)}, ${photo.longitude.toFixed(5)}`;
    const name = document.createElement('small');
    name.textContent = photo.name;
    caption.append(title, detail, name);
    button.append(img, caption);
    li.append(button);
    timeline.append(li);
    return button;
  });
  if (!photos.length) {
    status.textContent += ' · 촬영 시간·시간대·GPS가 있는 JPG 사진을 photo_sumin에 넣어주세요.';
    return;
  }
  const { key } = await json('/api/config');
  await loadMap(key);
  const points = photos.map(photo => new kakao.maps.LatLng(photo.latitude, photo.longitude));
  const map = new kakao.maps.Map(document.querySelector('#map'), { center: points[0], level: 5 });
  const bounds = new kakao.maps.LatLngBounds();
  points.forEach(point => bounds.extend(point));
  const fitBounds = () => points.length === 1 ? map.setCenter(points[0]) : map.setBounds(bounds, 70, 70, 70, 70);
  new kakao.maps.Polyline({ map, path: points, strokeWeight: 4, strokeColor: '#16705a', strokeOpacity: 0.8, strokeStyle: 'solid' });
  const overlays = [];
  photos.forEach((photo, index) => {
    const label = document.createElement('button');
    label.className = 'pin';
    label.textContent = `${index + 1} · ${photo.takenAt.slice(5, 10)} ${photo.takenAt.slice(11, 16)}`;
    label.setAttribute('aria-label', `${index + 1}번째 사진 보기`);
    const overlay = new kakao.maps.CustomOverlay({ map, position: points[index], content: label, yAnchor: 1.2, zIndex: index + 1 });
    overlays.push(overlay);
    const select = () => {
      map.panTo(points[index]);
      buttons.forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
      overlays.forEach((item, i) => item.setZIndex(i === index ? photos.length + 1 : i + 1));
      buttons[index].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };
    label.onclick = select;
    buttons[index].disabled = false;
    buttons[index].onclick = select;
  });
  fit.disabled = false;
  fit.onclick = fitBounds;
  fitBounds();
  window.addEventListener('resize', () => { map.relayout(); fitBounds(); });
}

main().catch(error => {
  errorBox.hidden = false;
  errorBox.textContent = error.message;
  if (!timeline.children.length) status.textContent = '사진을 불러오지 못했습니다.';
});
