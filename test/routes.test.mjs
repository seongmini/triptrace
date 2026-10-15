import test from 'node:test';
import assert from 'node:assert/strict';
import { roadRoute } from './routes.mjs';

const photos = Array.from({ length: 34 }, (_, i) => ({ longitude: 127 + i / 10000, latitude: 37 }));
test('경유지 제한에 맞춰 나누고 경계 지점을 공유하며 경도·위도를 변환한다', async () => {
  const requests = [];
  const result = await roadRoute(photos, 'test', async (url, options) => {
    requests.push(JSON.parse(options.body));
    return { ok: true, json: async () => ({ routes: [{ result_code: 0, summary: { distance: 100, duration: 20 }, sections: [{ roads: [{ vertexes: [127, 37, 128, 38] }] }] }] }) };
  });
  assert.equal(requests.length, 2);
  assert.equal(requests[0].waypoints.length, 30);
  assert.deepEqual(requests[0].destination, requests[1].origin);
  assert.deepEqual(requests[1].destination, { x: photos.at(-1).longitude, y: 37 });
  assert.deepEqual(result.paths[0][0], { longitude: 127, latitude: 37 });
  assert.equal(result.distance, 200);
});
test('키 누락과 API 실패를 알리고 한 위치는 요청하지 않는다', async () => {
  assert.deepEqual(await roadRoute([photos[0], photos[0]], undefined), { paths: [], distance: 0, duration: 0 });
  await assert.rejects(roadRoute(photos, undefined), /KAKAO_REST_API_KEY/);
  await assert.rejects(roadRoute(photos, 'test', async () => ({ ok: false, status: 401 })), /401/);
  await assert.rejects(roadRoute(photos, 'test', async () => ({ ok: true, json: async () => ({ routes: [{ result_code: 104 }] }) })), /104/);
});
