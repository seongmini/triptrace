export async function roadRoute(photos, key, fetchRoute = fetch) {
  const points = photos.filter((p, i) => !i || p.latitude !== photos[i - 1].latitude || p.longitude !== photos[i - 1].longitude);
  if (points.length < 2) return { paths: [], distance: 0, duration: 0 };
  if (!key) throw new Error('.env에 KAKAO_REST_API_KEY를 추가하고 서버를 재시작해주세요. JavaScript 키와 별도의 REST API 키가 필요합니다.');
  const paths = [];
  let distance = 0;
  let duration = 0;
  const coordinate = p => ({ x: p.longitude, y: p.latitude });
  for (let start = 0; start < points.length - 1; start += 31) {
    const batch = points.slice(start, start + 32);
    let response;
    try {
      response = await fetchRoute('https://apis-navi.kakaomobility.com/v1/waypoints/directions', {
        method: 'POST',
        headers: { Authorization: `KakaoAK ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ origin: coordinate(batch[0]), destination: coordinate(batch.at(-1)), waypoints: batch.slice(1, -1).map(coordinate), priority: 'RECOMMEND', summary: false }),
        signal: AbortSignal.timeout(20000),
      });
    } catch {
      throw new Error('도로 경로 서버에 연결하지 못했습니다. 잠시 후 새로고침해주세요.');
    }
    if (!response.ok) throw new Error(`도로 경로 요청 실패 (HTTP ${response.status}). REST API 키와 길찾기 API 사용 권한·쿼터를 확인해주세요.`);
    const data = await response.json();
    const route = data.routes?.[0];
    if (!route || route.result_code !== 0) throw new Error(`도로 경로를 찾지 못했습니다 (결과 코드 ${route?.result_code ?? '없음'}). 촬영 위치가 자동차로 연결 가능한지 확인해주세요.`);
    let count = 0;
    for (const section of route.sections ?? []) {
      for (const road of section.roads ?? []) {
        const vertices = road.vertexes;
        if (!Array.isArray(vertices) || vertices.length < 4 || vertices.length % 2 || !vertices.every(Number.isFinite)) continue;
        const path = [];
        for (let i = 0; i < vertices.length; i += 2) path.push({ longitude: vertices[i], latitude: vertices[i + 1] });
        paths.push(path);
        count++;
      }
    }
    if (!count) throw new Error('도로 경로 좌표를 받지 못했습니다.');
    distance += route.summary.distance;
    duration += route.summary.duration;
  }
  return { paths, distance, duration };
}
