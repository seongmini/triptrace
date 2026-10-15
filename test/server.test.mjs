import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { server } from './server.mjs';

test('선택한 폴더의 사진만 제공하고 잘못된 폴더 접근을 차단한다', async () => {
  // 소켓 없이 실제 요청 핸들러를 실행해 외부 API 호출을 피한다.
  const request = (url, method = 'GET') => new Promise(resolve => {
    let status;
    server.emit('request', { url, method, headers: {} }, {
      writeHead(code) { status = code; },
      end(body) { resolve({ status, body }); },
    });
  });
  for (const source of ['sumin', 'seongmin']) {
    const response = await request(`/api/photos?source=${source}`);
    // 개인 사진은 Git 제외: 체크아웃에 폴더가 없어도 테스트 가능하다.
    if (response.status === 404) continue;
    assert.equal(response.status, 200);
    const { photos } = JSON.parse(response.body);
    for (const photo of photos) {
      assert.ok(photo.url.endsWith(`?source=${source}`));
      const image = await request(photo.url);
      assert.equal(image.status, 200);
      assert.deepEqual(image.body, await readFile(new URL(`../photo_${source}/${encodeURIComponent(photo.name)}`, import.meta.url)));
    }
  }
  for (const endpoint of ['/api/photos', '/api/route', '/api/description', '/photos/test.jpg']) {
    const response = await request(`${endpoint}?source=../`, endpoint === '/api/description' ? 'POST' : 'GET');
    assert.equal(response.status, 400);
  }
  assert.equal((await request('/.env')).status, 404);
  assert.equal((await request('/trips.mjs')).status, 200);
  for (const source of ['sumin', 'seongmin']) {
    const response = await request(`/api/photos?source=${source}`);
    if (response.status !== 200) continue;
    const count = JSON.parse(response.body).photos.length;
    for (const range of ['start=-1', 'start=0.5', `end=${count + 1}`, 'start=2&end=1']) {
      assert.equal((await request(`/api/route?source=${source}&${range}`)).status, 400);
    }
    const single = await request(`/api/route?source=${source}&start=0&end=${Math.min(1, count)}`);
    assert.equal(single.status, 200);
    assert.deepEqual(JSON.parse(single.body).paths, []);
  }
  assert.equal((await request('/photos/%2e%2e%2f.env?source=seongmin')).status, 404);
});
