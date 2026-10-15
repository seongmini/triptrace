import test from 'node:test';
import assert from 'node:assert/strict';
import { segmentTrips, distanceKm, sortTrips, mergeSort } from './trips.mjs';
const photo = (name, hour, longitude = 127) => ({ name, takenAt: new Date(Date.UTC(2026, 0, 1) + hour * 3600000).toISOString(), latitude: 37, longitude });
test('세 정렬 기준은 여행 ID와 원본 사진 순서를 유지하고 동점은 최근순으로 정렬한다', () => {
  const photos = [photo('a', 0), photo('b', 1, 130), photo('c', 100), photo('d', 101), photo('e', 102), photo('f', 200), photo('g', 201)];
  const trips = [{ start: 0, end: 2 }, { start: 2, end: 5 }, { start: 5, end: 7 }];
  const original = JSON.stringify({ photos, trips });
  assert.deepEqual(sortTrips(photos, trips).map(t => t.index), [2, 1, 0]);
  assert.deepEqual(sortTrips(photos, trips, 'photos').map(t => t.index), [1, 2, 0]);
  const distance = sortTrips(photos, trips, 'distance');
  assert.deepEqual(distance.map(t => t.index), [0, 2, 1]);
  assert.ok(distance[0].estimatedKm > 100);
  assert.equal(JSON.stringify({ photos, trips }), original);
  assert.deepEqual(sortTrips([], []), []);
  assert.throws(() => sortTrips(photos, trips, 'bad'));
  const equal = [{ id: 1 }, { id: 2 }, { id: 3 }];
  assert.deepEqual(mergeSort(equal, () => 0), equal);
});
test('시간과 거리 모드가 각 기준만 반영한다', () => {
  const photos = [photo('a', 0), photo('b', 1), photo('c', 100), photo('d', 101, 130)];
  const result = segmentTrips(photos);
  assert.deepEqual(result.trips, [{ start: 0, end: 2 }, { start: 2, end: 4 }]);
  assert.equal(result.edges.length, photos.length - 1);
  assert.ok(distanceKm(photos[2], photos[3]) > 100);
  assert.deepEqual(segmentTrips(photos, { mode: 'distance' }).trips, [{ start: 0, end: 3 }, { start: 3, end: 4 }]);
});
test('비인접 사진도 MST에 포함하며 반복 방문은 시간상 연속 구간으로 나눈다', () => {
  const photos = [photo('a', 0), photo('b', 1, 135), photo('c', 2)];
  const result = segmentTrips(photos, { mode: 'distance' });
  assert.ok(result.edges.some(e => e.a === 0 && e.b === 2));
  assert.equal(result.trips.length, 3);
});
test('수동 합치기·나누기가 자동 경계를 덮어쓴다', () => {
  const photos = [photo('a', 0), photo('b', 1), photo('c', 100)];
  const { boundaries } = segmentTrips(photos);
  const result = segmentTrips(photos, { overrides: { [boundaries[0].key]: true, [boundaries[1].key]: false } });
  assert.deepEqual(result.trips, [{ start: 0, end: 1 }, { start: 1, end: 3 }]);
  assert.deepEqual(segmentTrips([]).trips, []);
  assert.deepEqual(segmentTrips([photos[0]]).trips, [{ start: 0, end: 1 }]);
  assert.throws(() => segmentTrips(photos, { mode: 'unknown' }));
});

test('시간 기준은 24시간 초과일 때 분리하고 시간대를 반영한다', () => {
  assert.equal(segmentTrips([photo('a', 0), photo('b', 24)]).trips.length, 1);
  assert.equal(segmentTrips([photo('a', 0), photo('b', 25)]).trips.length, 2);
  const a = { ...photo('a', 0), takenAt: '2026-01-01T09:00:00+09:00' };
  assert.equal(segmentTrips([a, photo('b', 0)]).trips.length, 1);
});
