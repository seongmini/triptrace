import test from 'node:test';
import assert from 'node:assert/strict';
import { photoMetadata } from './photos.mjs';

const tags = { DateTimeOriginal: '2026:10:04 14:37:46', OffsetTimeOriginal: '+09:00', latitude: 37.5, longitude: 127 };

test('촬영 시간대와 좌표를 보존한다', () => {
  const photo = photoMetadata('a b.jpg', tags);
  assert.equal(photo.takenAt, '2026-10-04T14:37:46+09:00');
  assert.equal(new Date(photo.takenAt).toISOString(), '2026-10-04T05:37:46.000Z');
  assert.equal(photo.url, '/photos/a%20b.jpg');
  assert.equal(photo.latitude, 37.5);
});

test('누락·손상된 메타데이터를 경로에 넣지 않는다', () => {
  for (const invalid of [undefined, {}, { ...tags, latitude: NaN }, { ...tags, latitude: null }, { ...tags, longitude: 181 }, { ...tags, DateTimeOriginal: '\0broken' }, { ...tags, OffsetTimeOriginal: undefined }]) {
    assert.throws(() => photoMetadata('bad.jpg', invalid));
  }
  assert.equal(photoMetadata('zero.jpg', { ...tags, latitude: 0, longitude: 0 }).latitude, 0);
});
