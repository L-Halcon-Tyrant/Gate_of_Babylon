import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import Fastify from 'fastify';
import { createWriteStream } from 'node:fs';
import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { LibraryDatabase, type DocumentKind, type LibraryDocument } from './library-database.js';

interface ImportManifestEntry {
  id: string;
  relativePath: string;
}

const maxFileSize = 200 * 1024 * 1024;
const maxFiles = 500;
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const importsDirectory = path.resolve(projectRoot, 'uploads');
const legacyImportsDirectory = path.resolve(projectRoot, 'apps', 'api', 'uploads');
const database = new LibraryDatabase(path.resolve(projectRoot, 'data', 'learning-library.db'));

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
  const segments = input.replace(/\\/g, '/').split('/').filter(Boolean);
  if (!segments.length || segments.some((segment) => segment === '.' || segment === '..')) return undefined;
  return segments.map((segment) => segment.replace(/[<>:"|?*\u0000-\u001f]/g, '_')).join(path.sep);
}

async function discoverExistingDocuments(directory: string): Promise<LibraryDocument[]> {
  const discovered: LibraryDocument[] = [];
  let importDirectories;
  try {
    importDirectories = await readdir(directory, { withFileTypes: true });
  } catch {
    return discovered;
  }

  for (const importEntry of importDirectories) {
    if (!importEntry.isDirectory()) continue;
    const importId = importEntry.name;
    const importRoot = path.join(directory, importId);
    const walk = async (currentDirectory: string): Promise<void> => {
      for (const entry of await readdir(currentDirectory, { withFileTypes: true })) {
        const filePath = path.join(currentDirectory, entry.name);
        if (entry.isDirectory()) {
          await walk(filePath);
          continue;
        }
        if (!entry.isFile()) continue;

        const fileStats = await stat(filePath);
        discovered.push({
          id: randomUUID(),
          importId,
          name: entry.name,
          relativePath: path.relative(importRoot, filePath).split(path.sep).join('/'),
          storagePath: path.relative(projectRoot, filePath).split(path.sep).join('/'),
          kind: documentKindFor(entry.name),
          sizeBytes: fileStats.size,
          importedAt: fileStats.birthtime.toISOString(),
        });
      }
    };
    await walk(importRoot);
  }

  return discovered;
}

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });
await app.register(multipart, { limits: { files: maxFiles, fileSize: maxFileSize, fields: 10 } });
app.addHook('onClose', () => database.close());

app.get('/health', async () => ({ status: 'ok', service: 'learning-library-api' }));
app.get('/documents', async () => ({ documents: database.listDocuments(), total: database.countDocuments() }));

app.post('/imports', async (request, reply) => {
  const importId = randomUUID();
  const importDirectory = path.resolve(importsDirectory, importId);
  const manifest = new Map<string, ImportManifestEntry>();
  const imported: LibraryDocument[] = [];
  const rejected: Array<{ name: string; reason: string }> = [];

  try {
    for await (const part of request.parts()) {
      if (part.type === 'field') {
        if (part.fieldname !== 'manifest') continue;
        const entries = (typeof part.value === 'string' ? JSON.parse(part.value) : part.value) as ImportManifestEntry[];
        if (!Array.isArray(entries)) throw new Error('导入清单格式无效。');
        for (const entry of entries) {
          if (typeof entry.id === 'string' && typeof entry.relativePath === 'string') manifest.set(entry.id, entry);
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
        importId,
        name: path.basename(relativePath),
        relativePath: relativePath.split(path.sep).join('/'),
        storagePath: path.relative(projectRoot, destination).split(path.sep).join('/'),
        kind: documentKindFor(relativePath),
        sizeBytes: fileStats.size,
        importedAt: new Date().toISOString(),
      });
    }
    database.addDocuments(imported);
  } catch (error) {
    await rm(importDirectory, { recursive: true, force: true });
    throw error;
  }

  return reply.code(201).send({ importId, imported, rejected });
});

const existingDocuments = await discoverExistingDocuments(legacyImportsDirectory);
database.addDocuments(existingDocuments);

const port = Number(process.env.PORT ?? 3100);
try {
  await app.listen({ port, host: '127.0.0.1' });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}