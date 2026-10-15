import { readdir } from 'node:fs/promises';
import path from 'node:path';
import exifr from 'exifr';

export function photoMetadata(name, tags = {}) {
  const rawTime = tags.DateTimeOriginal;
  if (typeof rawTime !== 'string' || !/^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}$/.test(rawTime)) {
    throw new Error('촬영 시간을 읽을 수 없습니다.');
  }
  const offset = tags.OffsetTimeOriginal;
  if (typeof offset !== 'string' || !/^[+-](?:0\d|1[0-4]):[0-5]\d$/.test(offset)) {
    throw new Error('촬영 시간대가 없거나 올바르지 않습니다.');
  }
  const takenAt = rawTime.slice(0, 10).replaceAll(':', '-') + 'T' + rawTime.slice(11) + offset;
  if (!Number.isFinite(Date.parse(takenAt))) throw new Error('촬영 시간이 올바르지 않습니다.');
  const { latitude, longitude } = tags;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    throw new Error('유효한 GPS 좌표가 없습니다.');
  }
  return { name, takenAt, latitude, longitude, url: '/photos/' + encodeURIComponent(name) };
}

export async function readPhotos(directory) {
  const photos = [];
  const skipped = [];
  // shortcut: 현재 테스트는 JPG만 지원, HEIC 사진을 추가할 때 미리보기도 함께 지원한다.
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    if (!/\.jpe?g$/i.test(entry.name)) {
      skipped.push({ name: entry.name, reason: '현재 테스트는 JPG 파일만 지원합니다.' });
      continue;
    }
    try {
      const tags = await exifr.parse(path.join(directory, entry.name), { reviveValues: false });
      photos.push(photoMetadata(entry.name, tags));
    } catch (error) {
      skipped.push({ name: entry.name, reason: error instanceof Error ? error.message : '메타데이터 읽기 실패' });
    }
  }
  photos.sort((a, b) => Date.parse(a.takenAt) - Date.parse(b.takenAt) || a.name.localeCompare(b.name));
  return { photos, skipped };
}
