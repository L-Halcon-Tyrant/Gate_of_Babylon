<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { DocumentKind } from '@learning-library/shared';

interface QueuedFile { id: string; file: File; relativePath: string; kind: DocumentKind; }
interface ImportedFile { id: string; name: string; relativePath: string; kind: DocumentKind; sizeBytes: number; }
interface LibraryTag { id: string; name: string; documentCount: number; }
interface LibraryCollection { id: string; name: string; documentCount: number; }
interface LibraryDocument extends ImportedFile {
  importId: string;
  storagePath: string;
  importedAt: string;
  collectionId: string | null;
  tags: LibraryTag[];
}
interface ImportResponse { importId: string; imported: ImportedFile[]; rejected: Array<{ name: string; reason: string }>; }
interface DocumentsResponse { documents: LibraryDocument[]; total: number; }
interface CollectionsResponse { collections: LibraryCollection[]; }
interface TagsResponse { tags: LibraryTag[]; }

const fileInput = ref<HTMLInputElement>();
const folderInput = ref<HTMLInputElement>();
const queuedFiles = ref<QueuedFile[]>([]);
const importedFiles = ref<ImportedFile[]>([]);
const libraryDocuments = ref<LibraryDocument[]>([]);
const libraryCollections = ref<LibraryCollection[]>([]);
const libraryTags = ref<LibraryTag[]>([]);
const libraryTotal = ref(0);
const libraryQuery = ref('');
const libraryKind = ref<DocumentKind | 'all'>('all');
const libraryCollectionFilter = ref('all');
const libraryTagFilter = ref('all');
const activeView = ref<'import' | 'library'>('import');
const notice = ref('');
const libraryError = ref('');
const isDragging = ref(false);
const isUploading = ref(false);
const isLibraryLoading = ref(false);
const selectedDocument = ref<LibraryDocument | null>(null);
const editorCollectionId = ref<string | null>(null);
const editorTagIds = ref<string[]>([]);
const newCollectionName = ref('');
const newTagName = ref('');
const isOrganizationSaving = ref(false);
const maxFiles = 500;

const totalBytes = computed(() => queuedFiles.value.reduce((total, item) => total + item.file.size, 0));
const libraryKinds: Array<{ value: DocumentKind | 'all'; label: string }> = [
  { value: 'all', label: '全部类型' }, { value: 'pdf', label: 'PDF' }, { value: 'word', label: 'Word' },
  { value: 'spreadsheet', label: '表格' }, { value: 'presentation', label: '演示文稿' }, { value: 'markdown', label: 'Markdown' },
  { value: 'text', label: '文本' }, { value: 'image', label: '图片' }, { value: 'video', label: '视频' },
  { value: 'audio', label: '音频' }, { value: 'archive', label: '压缩包' }, { value: 'other', label: '其他' },
];

const filteredLibraryDocuments = computed(() => {
  const query = libraryQuery.value.trim().toLocaleLowerCase();
  return libraryDocuments.value.filter((item) => {
    const matchesQuery = !query || (item.name + ' ' + item.relativePath).toLocaleLowerCase().includes(query);
    const matchesKind = libraryKind.value === 'all' || item.kind === libraryKind.value;
    const matchesCollection = libraryCollectionFilter.value === 'all' || (libraryCollectionFilter.value === 'none' ? !item.collectionId : item.collectionId === libraryCollectionFilter.value);
    const matchesTag = libraryTagFilter.value === 'all' || item.tags.some((tag) => tag.id === libraryTagFilter.value);
    return matchesQuery && matchesKind && matchesCollection && matchesTag;
  });
});

function documentKindFor(fileName: string): DocumentKind {
  const extension = fileName.split('.').pop()?.toLowerCase() ?? '';
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

function relativePathFor(file: File): string { return file.webkitRelativePath || file.name; }
function newId(): string { return crypto.randomUUID(); }
function formatSize(sizeBytes: number): string {
  if (sizeBytes < 1024) return sizeBytes + ' B';
  if (sizeBytes < 1024 * 1024) return (sizeBytes / 1024).toFixed(1) + ' KB';
  return (sizeBytes / (1024 * 1024)).toFixed(1) + ' MB';
}
function formatDate(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}
function kindLabel(kind: DocumentKind): string {
  const labels: Record<DocumentKind, string> = {
    pdf: 'PDF', word: 'Word', spreadsheet: '表格', presentation: '演示文稿', markdown: 'Markdown',
    text: '文本', image: '图片', video: '视频', audio: '音频', archive: '压缩包', other: '其他',
  };
  return labels[kind];
}
function collectionName(id: string | null): string {
  return libraryCollections.value.find((item) => item.id === id)?.name ?? '';
}

async function loadLibrary() {
  isLibraryLoading.value = true;
  libraryError.value = '';
  try {
    const [documentsResponse, collectionsResponse, tagsResponse] = await Promise.all([
      fetch('/api/documents'), fetch('/api/collections'), fetch('/api/tags'),
    ]);
    if (!documentsResponse.ok || !collectionsResponse.ok || !tagsResponse.ok) throw new Error('资料库暂时无法读取，请确认 API 服务已启动。');
    const documents = await documentsResponse.json() as DocumentsResponse;
    const collections = await collectionsResponse.json() as CollectionsResponse;
    const tags = await tagsResponse.json() as TagsResponse;
    libraryDocuments.value = documents.documents;
    libraryTotal.value = documents.total;
    libraryCollections.value = collections.collections;
    libraryTags.value = tags.tags;
  } catch (error) {
    libraryError.value = error instanceof Error ? error.message : '资料库读取失败，请稍后重试。';
  } finally {
    isLibraryLoading.value = false;
  }
}

function showLibrary() { activeView.value = 'library'; void loadLibrary(); }
function addFiles(files: FileList | File[]) {
  const existing = new Set(queuedFiles.value.map((item) => item.relativePath + ':' + item.file.size + ':' + item.file.lastModified));
  const additions: QueuedFile[] = [];
  for (const file of Array.from(files)) {
    const relativePath = relativePathFor(file);
    const fingerprint = relativePath + ':' + file.size + ':' + file.lastModified;
    if (!existing.has(fingerprint) && queuedFiles.value.length + additions.length < maxFiles) {
      additions.push({ id: newId(), file, relativePath, kind: documentKindFor(file.name) });
      existing.add(fingerprint);
    }
  }
  queuedFiles.value.push(...additions);
  notice.value = additions.length ? '已加入 ' + additions.length + ' 个文件。' : '没有加入新文件；单次最多可导入 ' + maxFiles + ' 个文件。';
}
function onFileSelection(event: Event) {
  const input = event.target as HTMLInputElement;
  if (input.files) addFiles(input.files);
  input.value = '';
}
function onDrop(event: DragEvent) {
  event.preventDefault(); isDragging.value = false;
  if (event.dataTransfer?.files) addFiles(event.dataTransfer.files);
}
function removeFile(id: string) { queuedFiles.value = queuedFiles.value.filter((item) => item.id !== id); }

async function uploadQueuedFiles() {
  if (!queuedFiles.value.length || isUploading.value) return;
  isUploading.value = true; notice.value = '';
  const formData = new FormData();
  formData.append('manifest', JSON.stringify(queuedFiles.value.map(({ id, relativePath }) => ({ id, relativePath }))));
  for (const item of queuedFiles.value) formData.append('file:' + item.id, item.file, item.file.name);
  try {
    const response = await fetch('/api/imports', { method: 'POST', body: formData });
    const result = await response.json() as ImportResponse;
    if (!response.ok) throw new Error('导入服务暂时不可用，请确认 API 服务已启动。');
    importedFiles.value = result.imported; queuedFiles.value = []; await loadLibrary();
    notice.value = result.rejected.length ? '已导入 ' + result.imported.length + ' 个文件，另有 ' + result.rejected.length + ' 个文件未导入。' : '导入完成，已安全保存 ' + result.imported.length + ' 个文件。';
  } catch (error) {
    notice.value = error instanceof Error ? error.message : '导入失败，请稍后重试。';
  } finally { isUploading.value = false; }
}

function openOrganization(document: LibraryDocument) {
  selectedDocument.value = document;
  editorCollectionId.value = document.collectionId;
  editorTagIds.value = document.tags.map((tag) => tag.id);
  newCollectionName.value = ''; newTagName.value = '';
}
function closeOrganization() { if (!isOrganizationSaving.value) selectedDocument.value = null; }
function toggleEditorTag(tagId: string) {
  editorTagIds.value = editorTagIds.value.includes(tagId) ? editorTagIds.value.filter((id) => id !== tagId) : [...editorTagIds.value, tagId];
}
async function saveOrganization() {
  if (!selectedDocument.value || isOrganizationSaving.value) return;
  isOrganizationSaving.value = true;
  try {
    const response = await fetch('/api/documents/' + selectedDocument.value.id + '/organization', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ collectionId: editorCollectionId.value, tagIds: editorTagIds.value }),
    });
    if (!response.ok) throw new Error('分类保存失败，请稍后重试。');
    await loadLibrary(); selectedDocument.value = null; notice.value = '资料分类已保存。';
  } catch (error) {
    notice.value = error instanceof Error ? error.message : '分类保存失败，请稍后重试。';
  } finally { isOrganizationSaving.value = false; }
}
async function createCollection() {
  const name = newCollectionName.value.trim(); if (!name) return;
  const response = await fetch('/api/collections', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
  if (!response.ok) { notice.value = '专题创建失败。'; return; }
  const result = await response.json() as { collection: LibraryCollection };
  newCollectionName.value = ''; await loadLibrary(); editorCollectionId.value = result.collection.id;
}
async function createTag() {
  const name = newTagName.value.trim(); if (!name) return;
  const response = await fetch('/api/tags', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
  if (!response.ok) { notice.value = '标签创建失败。'; return; }
  const result = await response.json() as { tag: LibraryTag };
  newTagName.value = ''; await loadLibrary();
  if (!editorTagIds.value.includes(result.tag.id)) editorTagIds.value.push(result.tag.id);
}

onMounted(() => { void loadLibrary(); });
</script>

<template>
  <main class="app-shell">
    <header class="topbar">
      <a class="brand" href="/">学习库<span>尾</span></a>
      <nav class="view-nav" aria-label="主导航">
        <button type="button" :class="{ active: activeView === 'import' }" @click="activeView = 'import'">导入资料</button>
        <button type="button" :class="{ active: activeView === 'library' }" @click="showLibrary">我的资料库<span>{{ libraryTotal }}</span></button>
      </nav>
    </header>

    <template v-if="activeView === 'import'">
      <section class="intro">
        <p class="eyebrow">IMPORT YOUR MATERIALS</p>
        <h1>把学习文件带到一个清晰、有序的地方。</h1>
        <p>支持选择单个文件、多个文件或完整文件夹；会保留文件夹层级。PDF、Word、表格、演示文稿、图片、音视频和其他格式均可导入。</p>
      </section>
      <section class="import-card">
        <input ref="fileInput" class="visually-hidden" type="file" multiple @change="onFileSelection" />
        <input ref="folderInput" class="visually-hidden" type="file" multiple webkitdirectory directory @change="onFileSelection" />
        <div class="drop-zone" :class="{ dragging: isDragging }" @dragenter.prevent="isDragging = true" @dragover.prevent="isDragging = true" @dragleave.prevent="isDragging = false" @drop="onDrop">
          <div class="drop-icon">↑</div><h2>拖放文件到这里</h2><p>或者从设备中选择。导入文件夹时会保留内部目录结构。</p>
          <div class="actions"><button type="button" class="primary" @click="fileInput?.click()">选择文件</button><button type="button" class="secondary" @click="folderInput?.click()">选择文件夹</button></div>
        </div>
        <p class="format-note">支持 PDF、DOC/DOCX、XLS/XLSX、PPT/PPTX、MD、TXT、JPG/PNG、MP3、MP4 等常见格式，其他格式也会原样保存。</p>
      </section>
      <section v-if="queuedFiles.length" class="queue-card" aria-live="polite">
        <div class="section-heading"><div><p class="eyebrow">READY TO IMPORT</p><h2>{{ queuedFiles.length }} 个文件待导入</h2><p>{{ formatSize(totalBytes) }} · 单个文件最大 200 MB</p></div><button type="button" class="primary" :disabled="isUploading" @click="uploadQueuedFiles">{{ isUploading ? '正在导入…' : '确认导入' }}</button></div>
        <ul class="file-list"><li v-for="item in queuedFiles" :key="item.id"><span class="type-badge">{{ kindLabel(item.kind) }}</span><div class="file-name"><strong>{{ item.file.name }}</strong><small>{{ item.relativePath }} · {{ formatSize(item.file.size) }}</small></div><button type="button" class="remove" aria-label="移除文件" @click="removeFile(item.id)">×</button></li></ul>
      </section>
      <section v-if="importedFiles.length" class="queue-card success-card"><div class="section-heading compact"><div><p class="eyebrow">LAST IMPORT</p><h2>导入成功</h2></div></div><ul class="file-list"><li v-for="item in importedFiles" :key="item.id"><span class="type-badge">{{ kindLabel(item.kind) }}</span><div class="file-name"><strong>{{ item.name }}</strong><small>{{ item.relativePath }} · {{ formatSize(item.sizeBytes) }}</small></div></li></ul></section>
      <p v-if="notice" class="notice" role="status">{{ notice }}</p>
    </template>

    <section v-else class="library-page">
      <div class="library-heading"><div><p class="eyebrow">YOUR LIBRARY</p><h1>所有导入资料，都在这里。</h1><p>资料记录保存在本机；重新打开或刷新页面后仍可查看。</p></div><button type="button" class="secondary" :disabled="isLibraryLoading" @click="loadLibrary">{{ isLibraryLoading ? '正在刷新…' : '刷新列表' }}</button></div>
      <section class="library-card">
        <div class="library-summary"><strong>{{ libraryTotal }}</strong><span>份已归档资料</span></div>
        <div class="library-tools">
          <label class="search-field"><span>搜索资料</span><input v-model="libraryQuery" type="search" placeholder="输入文件名或文件夹名称" /></label>
          <label class="filter-field"><span>资料类型</span><select v-model="libraryKind"><option v-for="option in libraryKinds" :key="option.value" :value="option.value">{{ option.label }}</option></select></label>
          <label class="filter-field"><span>课程专题</span><select v-model="libraryCollectionFilter"><option value="all">全部专题</option><option value="none">未分类</option><option v-for="item in libraryCollections" :key="item.id" :value="item.id">{{ item.name }} ({{ item.documentCount }})</option></select></label>
          <label class="filter-field"><span>标签</span><select v-model="libraryTagFilter"><option value="all">全部标签</option><option v-for="item in libraryTags" :key="item.id" :value="item.id">{{ item.name }} ({{ item.documentCount }})</option></select></label>
          <p class="filter-count">显示 {{ filteredLibraryDocuments.length }} / {{ libraryTotal }} 份</p>
        </div>
        <p v-if="libraryError" class="notice">{{ libraryError }}</p>
        <p v-else-if="isLibraryLoading" class="empty-state">正在读取你的资料库…</p>
        <p v-else-if="!libraryDocuments.length" class="empty-state">还没有导入资料。切换到“导入资料”开始建立你的学习库。</p>
        <p v-else-if="!filteredLibraryDocuments.length" class="empty-state">没有匹配的资料，可以更换关键词或筛选条件。</p>
        <ul v-else class="file-list library-list">
          <li v-for="item in filteredLibraryDocuments" :key="item.id">
            <span class="type-badge">{{ kindLabel(item.kind) }}</span>
            <div class="file-name"><strong>{{ item.name }}</strong><small>{{ item.relativePath }} · {{ formatSize(item.sizeBytes) }}</small><div class="classification"><span v-if="item.collectionId" class="chip collection-chip">{{ collectionName(item.collectionId) }}</span><span v-for="tag in item.tags" :key="tag.id" class="chip">{{ tag.name }}</span></div></div>
            <time :datetime="item.importedAt">{{ formatDate(item.importedAt) }}</time>
            <button type="button" class="secondary organize-button" @click="openOrganization(item)">整理</button>
          </li>
        </ul>
      </section>
    </section>

    <div v-if="selectedDocument" class="modal-backdrop" @click.self="closeOrganization">
      <section class="organization-modal" role="dialog" aria-modal="true" aria-labelledby="organization-title">
        <div class="modal-header"><div><p class="eyebrow">ORGANIZE MATERIAL</p><h2 id="organization-title">整理：{{ selectedDocument.name }}</h2><p>{{ selectedDocument.relativePath }}</p></div><button type="button" class="icon-button" aria-label="关闭" @click="closeOrganization">×</button></div>
        <label class="modal-field"><span>课程专题</span><select v-model="editorCollectionId"><option :value="null">未分类</option><option v-for="item in libraryCollections" :key="item.id" :value="item.id">{{ item.name }}</option></select></label>
        <div class="create-row"><input v-model="newCollectionName" placeholder="新建专题名称" @keyup.enter="createCollection" /><button type="button" class="secondary" @click="createCollection">新建专题</button></div>
        <div class="modal-field"><span>标签（可多选）</span><div class="tag-picker"><button v-for="tag in libraryTags" :key="tag.id" type="button" class="tag-option" :class="{ selected: editorTagIds.includes(tag.id) }" :aria-pressed="editorTagIds.includes(tag.id)" @click="toggleEditorTag(tag.id)">{{ tag.name }}</button><span v-if="!libraryTags.length" class="muted">还没有标签</span></div></div>
        <div class="create-row"><input v-model="newTagName" placeholder="新建标签名称" @keyup.enter="createTag" /><button type="button" class="secondary" @click="createTag">新建标签</button></div>
        <div class="modal-actions"><button type="button" class="secondary" @click="closeOrganization">取消</button><button type="button" class="primary" :disabled="isOrganizationSaving" @click="saveOrganization">{{ isOrganizationSaving ? '保存中…' : '保存分类' }}</button></div>
      </section>
    </div>
  </main>
</template>