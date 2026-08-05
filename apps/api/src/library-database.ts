import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';

export type DocumentKind =
  | 'pdf' | 'word' | 'spreadsheet' | 'presentation' | 'markdown' | 'text'
  | 'image' | 'video' | 'audio' | 'archive' | 'other';

export interface LibraryTag {
  id: string;
  name: string;
  documentCount: number;
}

export interface LibraryCollection {
  id: string;
  name: string;
  documentCount: number;
}

export interface LibraryDocument {
  id: string;
  importId: string;
  name: string;
  relativePath: string;
  storagePath: string;
  kind: DocumentKind;
  sizeBytes: number;
  importedAt: string;
  collectionId: string | null;
  tags: LibraryTag[];
}

interface DocumentRow extends Omit<LibraryDocument, 'tags'> {
  collectionId: string | null;
}

export class LibraryDatabase {
  private readonly database: DatabaseSync;

  constructor(databasePath: string) {
    mkdirSync(path.dirname(databasePath), { recursive: true });
    this.database = new DatabaseSync(databasePath);
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        import_id TEXT NOT NULL,
        name TEXT NOT NULL,
        relative_path TEXT NOT NULL,
        storage_path TEXT NOT NULL UNIQUE,
        kind TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        imported_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS collections (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL COLLATE NOCASE UNIQUE,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS tags (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL COLLATE NOCASE UNIQUE,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS document_tags (
        document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
        PRIMARY KEY (document_id, tag_id)
      );
      CREATE INDEX IF NOT EXISTS documents_imported_at ON documents(imported_at DESC);
    `);

    const columns = this.database.prepare('PRAGMA table_info(documents)').all() as Array<{ name: string }>;
    if (!columns.some((column) => column.name === 'collection_id')) {
      this.database.exec('ALTER TABLE documents ADD COLUMN collection_id TEXT REFERENCES collections(id)');
    }
  }

  addDocuments(documents: LibraryDocument[]): void {
    if (!documents.length) return;
    const insert = this.database.prepare(`
      INSERT OR IGNORE INTO documents (
        id, import_id, name, relative_path, storage_path, kind, size_bytes, imported_at, collection_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    this.database.exec('BEGIN');
    try {
      for (const document of documents) {
        insert.run(document.id, document.importId, document.name, document.relativePath, document.storagePath,
          document.kind, document.sizeBytes, document.importedAt, document.collectionId ?? null);
      }
      this.database.exec('COMMIT');
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  listDocuments(): LibraryDocument[] {
    const rows = this.database.prepare(`
      SELECT id, import_id AS importId, name, relative_path AS relativePath,
        storage_path AS storagePath, kind, size_bytes AS sizeBytes,
        imported_at AS importedAt, collection_id AS collectionId
      FROM documents ORDER BY imported_at DESC, name COLLATE NOCASE ASC
    `).all() as unknown as DocumentRow[];
    const tags = this.database.prepare(`
      SELECT t.id, t.name, 0 AS documentCount FROM tags t
      INNER JOIN document_tags dt ON dt.tag_id = t.id WHERE dt.document_id = ?
      ORDER BY t.name COLLATE NOCASE ASC
    `);
    return rows.map((row) => ({ ...row, tags: tags.all(row.id) as unknown as LibraryTag[] }));
  }

  countDocuments(): number {
    const result = this.database.prepare('SELECT COUNT(*) AS total FROM documents').get() as { total: number };
    return result.total;
  }

  listCollections(): LibraryCollection[] {
    return this.database.prepare(`
      SELECT c.id, c.name, COUNT(d.id) AS documentCount FROM collections c
      LEFT JOIN documents d ON d.collection_id = c.id
      GROUP BY c.id ORDER BY c.name COLLATE NOCASE ASC
    `).all() as unknown as LibraryCollection[];
  }

  listTags(): LibraryTag[] {
    return this.database.prepare(`
      SELECT t.id, t.name, COUNT(dt.document_id) AS documentCount FROM tags t
      LEFT JOIN document_tags dt ON dt.tag_id = t.id
      GROUP BY t.id ORDER BY t.name COLLATE NOCASE ASC
    `).all() as unknown as LibraryTag[];
  }

  createCollection(name: string): LibraryCollection {
    const normalized = name.trim();
    if (!normalized || normalized.length > 60) throw new Error('专题名称不能为空且不能超过 60 个字符。');
    this.database.prepare('INSERT OR IGNORE INTO collections (id, name, created_at) VALUES (?, ?, ?)')
      .run(randomUUID(), normalized, new Date().toISOString());
    const collection = this.database.prepare('SELECT id, name, 0 AS documentCount FROM collections WHERE name = ?')
      .get(normalized) as unknown as LibraryCollection;
    return collection;
  }

  createTag(name: string): LibraryTag {
    const normalized = name.trim();
    if (!normalized || normalized.length > 30) throw new Error('标签名称不能为空且不能超过 30 个字符。');
    this.database.prepare('INSERT OR IGNORE INTO tags (id, name, created_at) VALUES (?, ?, ?)')
      .run(randomUUID(), normalized, new Date().toISOString());
    const tag = this.database.prepare('SELECT id, name, 0 AS documentCount FROM tags WHERE name = ?')
      .get(normalized) as unknown as LibraryTag;
    return tag;
  }

  updateOrganization(documentId: string, collectionId: string | null, tagIds: string[]): void {
    const document = this.database.prepare('SELECT id FROM documents WHERE id = ?').get(documentId);
    if (!document) throw new Error('资料不存在。');
    if (collectionId && !this.database.prepare('SELECT id FROM collections WHERE id = ?').get(collectionId)) {
      throw new Error('专题不存在。');
    }
    const uniqueTags = [...new Set(tagIds)];
    for (const tagId of uniqueTags) {
      if (!this.database.prepare('SELECT id FROM tags WHERE id = ?').get(tagId)) throw new Error('标签不存在。');
    }

    this.database.exec('BEGIN');
    try {
      this.database.prepare('UPDATE documents SET collection_id = ? WHERE id = ?').run(collectionId, documentId);
      this.database.prepare('DELETE FROM document_tags WHERE document_id = ?').run(documentId);
      const insertTag = this.database.prepare('INSERT INTO document_tags (document_id, tag_id) VALUES (?, ?)');
      for (const tagId of uniqueTags) insertTag.run(documentId, tagId);
      this.database.exec('COMMIT');
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  close(): void {
    this.database.close();
  }
}