export function distanceKm(a, b) {
  const rad = v => v * Math.PI / 180;
  const h = Math.sin(rad(b.latitude - a.latitude) / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(rad(b.longitude - a.longitude) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}

export function mergeSort(items, compare) {
  if (items.length < 2) return items.slice();
  const middle = Math.floor(items.length / 2);
  const left = mergeSort(items.slice(0, middle), compare);
  const right = mergeSort(items.slice(middle), compare);
  const result = [];
  let i = 0, j = 0;
  while (i < left.length && j < right.length) {
    result.push(compare(left[i], right[j]) <= 0 ? left[i++] : right[j++]);
  }
  return result.concat(left.slice(i), right.slice(j));
}

export function sortTrips(photos, trips, order = 'recent') {
  if (!['recent', 'photos', 'distance'].includes(order)) throw new Error('올바른 정렬 기준을 선택해주세요.');
  const summaries = trips.map((trip, index) => {
    let estimatedKm = 0;
    for (let i = trip.start + 1; i < trip.end; i++) estimatedKm += distanceKm(photos[i - 1], photos[i]);
    return { ...trip, index, count: trip.end - trip.start, recent: Date.parse(photos[trip.end - 1].takenAt), estimatedKm };
  });
  return mergeSort(summaries, (a, b) => {
    const primary = order === 'photos' ? b.count - a.count : order === 'distance' ? b.estimatedKm - a.estimatedKm : b.recent - a.recent;
    return primary || b.recent - a.recent;
  });
}

// Dense Prim considers all photo pairs, using O(n) auxiliary memory.
export function segmentTrips(photos, { mode = 'time', overrides = {} } = {}) {
  if (!['time', 'distance'].includes(mode)) throw new Error('올바른 여정 분리 방식을 선택해주세요.');
  const n = photos.length;
  const used = Array(n).fill(false), best = Array(n).fill(Infinity), parent = Array(n).fill(-1);
  const edges = [];
  best[0] = 0;
  for (let step = 0; step < n; step++) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!used[i] && (u < 0 || best[i] < best[u])) u = i;
    used[u] = true;
    if (parent[u] >= 0) edges.push({ a: parent[u], b: u, weight: best[u] });
    for (let v = 0; v < n; v++) {
      if (used[v]) continue;
      const weight = mode === 'time'
        ? Math.abs(Date.parse(photos[u].takenAt) - Date.parse(photos[v].takenAt)) / (24 * 3600000)
        : distanceKm(photos[u], photos[v]) / 50;
      if (weight < best[v]) { best[v] = weight; parent[v] = u; }
    }
  }
  const root = Array.from({ length: n }, (_, i) => i);
  const find = i => { while (root[i] !== i) { root[i] = root[root[i]]; i = root[i]; } return i; };
  for (const edge of edges) if (edge.weight <= 1) root[find(edge.b)] = find(edge.a);
  const boundaries = [];
  for (let i = 1; i < n; i++) {
    const key = JSON.stringify([photos[i - 1].name, photos[i].name]);
    boundaries.push({ index: i, key, automatic: find(i - 1) !== find(i), split: overrides[key] ?? (find(i - 1) !== find(i)) });
  }
  const trips = [];
  for (let i = 0; i < n; i++) {
    if (!i || boundaries[i - 1].split) trips.push({ start: i, end: i + 1 });
    else trips.at(-1).end = i + 1;
  }
  return { trips, boundaries, edges };
}
