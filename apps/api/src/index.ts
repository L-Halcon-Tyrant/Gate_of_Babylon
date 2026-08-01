import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import Fastify from 'fastify';
import { createWriteStream } from 'node:fs';
import { mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { randomUUID } from 'node:crypto';

type DocumentKind =
  | 'pdf'
  | 'word'
  | 'spreadsheet'
  | 'presentation'
  | 'markdown'
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'archive'
  | 'other';

interface ImportManifestEntry {
  id: string;
  relativePath: string;
}

const maxFileSize = 200 * 1024 * 1024;
const maxFiles = 500;
const importsDirectory = path.resolve(process.cwd(), 'uploads');

function documentKindFor(fileName: string): DocumentKind {
  const extension = path.extname(fileName).slice(1).toLowerCase();

  if (extension === 'pdf') return 'pdf';
  if (['doc', 'docx', 'odt', 'rtf', 'wps'].includes(extension)) return 'word';
  if (['xls', 'xlsx', 'csv', 'ods'].includes(extension)) return 'spreadsheet';
  if (['ppt', 'pptx', 'odp'].includes(extension)) return 'presentation';
  if (['md', 'mdx'].includes(extension)) return 'markdown';
  if (['txt', 'log', 'json', 'xml', 'html', 'htm', 'epub'].includes(extension)) return 'text';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'heic'].includes(extension)) return 'image';
  if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(extension)) return 'video';
  if (['mp3', 'wav', 'm4a', 'flac', 'aac', 'ogg'].includes(extension)) return 'audio';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(extension)) return 'archive';
  return 'other';
}

function safeRelativePath(input: string): string | undefined {
  const segments = input
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean);

  if (!segments.length || segments.some((segment) => segment === '.' || segment === '..')) {
    return undefined;
  }

  return segments
    .map((segment) => segment.replace(/[<>:"|?*\u0000-\u001f]/g, '_'))
    .join(path.sep);
}

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });
await app.register(multipart, {
  limits: { files: maxFiles, fileSize: maxFileSize, fields: 10 },
});

app.get('/health', async () => ({ status: 'ok', service: 'learning-library-api' }));

app.post('/imports', async (request, reply) => {
  const importId = randomUUID();
  const importDirectory = path.resolve(importsDirectory, importId);
  const manifest = new Map<string, ImportManifestEntry>();
  const imported: Array<{
    id: string;
    name: string;
    relativePath: string;
    kind: DocumentKind;
    sizeBytes: number;
  }> = [];
  const rejected: Array<{ name: string; reason: string }> = [];

  try {
    for await (const part of request.parts()) {
      if (part.type === 'field') {
        if (part.fieldname !== 'manifest') continue;

        const entries = (typeof part.value === 'string'
          ? JSON.parse(part.value)
          : part.value) as ImportManifestEntry[];
        if (!Array.isArray(entries)) {
          throw new Error('导入清单格式无效。');
        }
        for (const entry of entries) {
          if (typeof entry.id === 'string' && typeof entry.relativePath === 'string') {
            manifest.set(entry.id, entry);
          }
        }
        continue;
      }

      const entry = manifest.get(part.fieldname.replace(/^file:/, ''));
      const relativePath = entry && safeRelativePath(entry.relativePath);

      if (!relativePath) {
        rejected.push({ name: part.filename, reason: '文件路径无效，未导入。' });
        part.file.resume();
        continue;
      }

      const destination = path.resolve(importDirectory, relativePath);
      if (!destination.startsWith(`${importDirectory}${path.sep}`)) {
        rejected.push({ name: part.filename, reason: '文件路径不在允许范围内。' });
        part.file.resume();
        continue;
      }

      await mkdir(path.dirname(destination), { recursive: true });
      await pipeline(part.file, createWriteStream(destination, { flags: 'wx' }));

      if (part.file.truncated) {
        await rm(destination, { force: true });
        rejected.push({ name: part.filename, reason: '单个文件超过 200 MB 限制。' });
        continue;
      }

      const fileStats = await stat(destination);
      imported.push({
        id: randomUUID(),
        name: path.basename(relativePath),
        relativePath: relativePath.split(path.sep).join('/'),
        kind: documentKindFor(relativePath),
        sizeBytes: fileStats.size,
      });
    }
  } catch (error) {
    await rm(importDirectory, { recursive: true, force: true });
    throw error;
  }

  return reply.code(201).send({ importId, imported, rejected });
});

const port = Number(process.env.PORT ?? 3100);

try {
  await app.listen({ port, host: '127.0.0.1' });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
