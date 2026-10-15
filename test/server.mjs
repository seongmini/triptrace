import { createServer } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPhotos } from './photos.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(directory);
const photoDirectory = path.join(root, 'photo_sumin');
try {
  process.loadEnvFile(path.join(root, '.env'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

export const server = createServer(async (request, response) => {
  const send = (status, type, body) => {
    response.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    response.end(body);
  };
  if (request.method !== 'GET') return send(405, 'text/plain; charset=utf-8', 'GET only');
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname === '/api/photos') {
      const data = await readPhotos(photoDirectory);
      return send(200, 'application/json', JSON.stringify(data));
    }
    if (pathname === '/api/config') {
      const key = process.env.KAKAO_MAP_JAVASCRIPT_KEY;
      if (!key) return send(503, 'application/json', JSON.stringify({ error: '.env에 KAKAO_MAP_JAVASCRIPT_KEY를 설정해주세요.' }));
      return send(200, 'application/json', JSON.stringify({ key }));
    }
    const assets = { '/': ['index.html', 'text/html; charset=utf-8'], '/app.js': ['app.js', 'text/javascript; charset=utf-8'], '/style.css': ['style.css', 'text/css; charset=utf-8'] };
    if (Object.hasOwn(assets, pathname)) {
      const [file, type] = assets[pathname];
      return send(200, type, await readFile(path.join(directory, file)));
    }
    if (pathname.startsWith('/photos/')) {
      const name = pathname.slice('/photos/'.length);
      if (name !== path.basename(name) || name.includes('\\') || !/\.jpe?g$/i.test(name)) return send(404, 'text/plain', 'Not found');
      const file = await realpath(path.join(photoDirectory, name));
      if (path.dirname(file) !== await realpath(photoDirectory)) return send(404, 'text/plain', 'Not found');
      return send(200, 'image/jpeg', await readFile(file));
    }
    send(404, 'text/plain', 'Not found');
  } catch (error) {
    const status = error.code === 'ENOENT' ? 404 : 500;
    send(status, 'application/json', JSON.stringify({ error: '파일을 읽지 못했습니다. photo_sumin 폴더와 파일을 확인해주세요.' }));
  }
});

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  server.listen(5173, '127.0.0.1', () => console.log('TripTrace 테스트: http://localhost:5173'));
  server.on('error', (error) => {
    console.error(error.code === 'EADDRINUSE' ? '5173 포트가 사용 중입니다. 사용 중인 서버를 종료해주세요.' : error.message);
    process.exitCode = 1;
  });
}
