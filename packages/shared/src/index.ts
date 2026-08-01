export type DocumentKind = 'pdf' | 'word' | 'markdown' | 'image' | 'video' | 'other';

export interface LearningDocument {
  id: string;
  title: string;
  sourcePath: string;
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
