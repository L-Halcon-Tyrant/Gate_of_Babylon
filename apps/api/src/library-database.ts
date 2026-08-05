import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export type DocumentKind =
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

export interface LibraryDocument {
  id: string;
  importId: string;
  name: string;
  relativePath: string;
  storagePath: string;
  kind: DocumentKind;
  sizeBytes: number;
  importedAt: string;
}

interface DocumentRow {
  id: string;
  importId: string;
  name: string;
  relativePath: string;
  storagePath: string;
  kind: DocumentKind;
  sizeBytes: number;
  importedAt: string;
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
      CREATE INDEX IF NOT EXISTS documents_imported_at ON documents(imported_at DESC);
    `);
  }

  addDocuments(documents: LibraryDocument[]): void {
    if (!documents.length) return;

    const insert = this.database.prepare(`
      INSERT OR IGNORE INTO documents (
        id, import_id, name, relative_path, storage_path, kind, size_bytes, imported_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.database.exec('BEGIN');
    try {
      for (const document of documents) {
        insert.run(
          document.id,
          document.importId,
          document.name,
          document.relativePath,
          document.storagePath,
          document.kind,
          document.sizeBytes,
          document.importedAt,
        );
      }
      this.database.exec('COMMIT');
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  listDocuments(): LibraryDocument[] {
    const rows = this.database.prepare(`
      SELECT
        id,
        import_id AS importId,
        name,
        relative_path AS relativePath,
        storage_path AS storagePath,
        kind,
        size_bytes AS sizeBytes,
        imported_at AS importedAt
      FROM documents
      ORDER BY imported_at DESC, name COLLATE NOCASE ASC
    `).all() as unknown as DocumentRow[];

    return rows;
  }

  countDocuments(): number {
    const result = this.database.prepare('SELECT COUNT(*) AS total FROM documents').get() as { total: number };
    return result.total;
  }

  close(): void {
    this.database.close();
  }
}