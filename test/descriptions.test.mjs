import test from 'node:test';
import assert from 'node:assert/strict';
import { createDescriber } from './descriptions.mjs';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('서버 재생성 후에도 저장된 제목을 키와 API 요청 없이 재사용한다', async () => {
  const cacheDirectory = await mkdtemp(path.join(tmpdir(), 'triptrace-titles-'));
  try {
    const image = Buffer.from('persistent photo');
    let calls = 0;
    const request = async url => {
      calls++;
      assert.match(url, /gemini-2\.5-flash-lite/);
      return { ok: true, json: async () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '푸른 바다' }] } }] }) };
    };
    const first = createDescriber({ key: 'secret', cacheDirectory, request });
    await first(image);
    const restarted = createDescriber({ cacheDirectory, request: () => { throw new Error('must not request'); } });
    assert.equal((await restarted(image)).description, '푸른 바다');
    assert.equal(calls, 1);
    assert.equal((await readdir(cacheDirectory)).filter(n => n.endsWith('.json')).length, 1);
    await assert.rejects(restarted(Buffer.from('changed photo')), /GEMINI_API_KEY/);
  } finally { await rm(cacheDirectory, { recursive: true, force: true }); }
});

test('사진을 전달하고 동시 요청과 반복 요청은 결과를 재사용한다', async () => {
  let calls = 0;
  const describe = createDescriber({ key: 'secret', request: async (url, options) => {
    calls++;
    assert.equal(options.headers['x-goog-api-key'], 'secret');
    assert.equal(JSON.parse(options.body).contents[0].parts[1].inlineData.data, Buffer.from('photo').toString('base64'));
    return { ok: true, json: async () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '푸른 바다가 보입니다.' }] } }] }) };
  } });
  const image = Buffer.from('photo');
  const results = await Promise.all([describe(image), describe(image)]);
  assert.equal(results[0].description, '푸른 바다가 보입니다.');
  await describe(image);
  assert.equal(calls, 1);
});
test('실패는 재시도할 수 있고 누락 키와 빈 응답을 알린다', async () => {
  let calls = 0;
  const image = Buffer.from('photo');
  const describe = createDescriber({ key: 'secret', request: async () => { calls++; return { ok: false, status: 429 }; } });
  await assert.rejects(describe(image), /한도/);
  await assert.rejects(describe(image), /한도/);
  assert.equal(calls, 2);
  await assert.rejects(createDescriber({})(image), /GEMINI_API_KEY/);
  await assert.rejects(createDescriber({ key: 'secret', request: async () => ({ ok: true, json: async () => ({}) }) })(image), /완성된 설명/);
});

test('일시적 서비스 오류는 최대 3회 시도하며 성공 결과를 재사용한다', async () => {
  let calls = 0;
  const delays = [];
  const describe = createDescriber({ key: 'secret', wait: async ms => delays.push(ms), request: async () => {
    calls++;
    if (calls < 3) return { ok: false, status: 503 };
    return { ok: true, json: async () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '풍경입니다.' }] } }] }) };
  } });
  assert.equal((await describe(Buffer.from('photo'))).description, '풍경입니다.');
  assert.deepEqual(delays, [1000, 2000]);
  assert.equal(calls, 3);
  let failures = 0;
  const fail = createDescriber({ key: 'secret', wait: async () => {}, request: async () => { failures++; return { ok: false, status: 503 }; } });
  await assert.rejects(fail(Buffer.from('photo')), /503/);
  assert.equal(failures, 3);
});
