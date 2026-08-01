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

export interface LearningDocument {
  id: string;
  title: string;
  sourcePath: string;
  relativePath?: string;
  kind: DocumentKind;
  sizeBytes: number;
  checksum?: string;
  tags: string[];
  collectionId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LearningCollection {
  id: string;
  name: string;
  description?: string;
}

export interface DocumentNote {
  id: string;
  documentId: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}
