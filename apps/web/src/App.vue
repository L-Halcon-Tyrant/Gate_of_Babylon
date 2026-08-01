<script setup lang="ts">
import { computed, ref } from 'vue';
import type { DocumentKind } from '@learning-library/shared';

interface QueuedFile {
  id: string;
  file: File;
  relativePath: string;
  kind: DocumentKind;
}

interface ImportedFile {
  id: string;
  name: string;
  relativePath: string;
  kind: DocumentKind;
  sizeBytes: number;
}

interface ImportResponse {
  importId: string;
  imported: ImportedFile[];
  rejected: Array<{ name: string; reason: string }>;
}

const fileInput = ref<HTMLInputElement>();
const folderInput = ref<HTMLInputElement>();
const queuedFiles = ref<QueuedFile[]>([]);
const importedFiles = ref<ImportedFile[]>([]);
const notice = ref('');
const isDragging = ref(false);
const isUploading = ref(false);
const maxFiles = 500;

const totalBytes = computed(() => queuedFiles.value.reduce((total, item) => total + item.file.size, 0));

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

function relativePathFor(file: File): string {
  return file.webkitRelativePath || file.name;
}

function newId(): string {
  return crypto.randomUUID();
}

function formatSize(sizeBytes: number): string {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function kindLabel(kind: DocumentKind): string {
  const labels: Record<DocumentKind, string> = {
    pdf: 'PDF', word: 'Word', spreadsheet: '表格', presentation: '演示文稿', markdown: 'Markdown',
    text: '文本', image: '图片', video: '视频', audio: '音频', archive: '压缩包', other: '其他',
  };
  return labels[kind];
}

function addFiles(files: FileList | File[]) {
  const existing = new Set(queuedFiles.value.map((item) => `${item.relativePath}:${item.file.size}:${item.file.lastModified}`));
  const additions: QueuedFile[] = [];

  for (const file of Array.from(files)) {
    const relativePath = relativePathFor(file);
    const fingerprint = `${relativePath}:${file.size}:${file.lastModified}`;
    if (!existing.has(fingerprint) && queuedFiles.value.length + additions.length < maxFiles) {
      additions.push({ id: newId(), file, relativePath, kind: documentKindFor(file.name) });
      existing.add(fingerprint);
    }
  }

  queuedFiles.value.push(...additions);
  notice.value = additions.length
    ? `已加入 ${additions.length} 个文件。所有格式都可导入，系统会自动识别常见学习资料。`
    : `没有加入新文件；单次最多可导入 ${maxFiles} 个文件。`;
}

function onFileSelection(event: Event) {
  const input = event.target as HTMLInputElement;
  if (input.files) addFiles(input.files);
  input.value = '';
}

function onDrop(event: DragEvent) {
  event.preventDefault();
  isDragging.value = false;
  if (event.dataTransfer?.files) addFiles(event.dataTransfer.files);
}

function removeFile(id: string) {
  queuedFiles.value = queuedFiles.value.filter((item) => item.id !== id);
}

async function uploadQueuedFiles() {
  if (!queuedFiles.value.length || isUploading.value) return;

  isUploading.value = true;
  notice.value = '';
  const formData = new FormData();
  formData.append('manifest', JSON.stringify(queuedFiles.value.map(({ id, relativePath }) => ({ id, relativePath }))));

  for (const item of queuedFiles.value) {
    formData.append(`file:${item.id}`, item.file, item.file.name);
  }

  try {
    const response = await fetch('/api/imports', { method: 'POST', body: formData });
    const result = await response.json() as ImportResponse;
    if (!response.ok) throw new Error('导入服务暂时不可用。请确认 API 服务已启动。');

    importedFiles.value = result.imported;
    queuedFiles.value = [];
    notice.value = result.rejected.length
      ? `已导入 ${result.imported.length} 个文件，${result.rejected.length} 个文件未导入。`
      : `导入完成，已安全保存 ${result.imported.length} 个文件。`;
  } catch (error) {
    notice.value = error instanceof Error ? error.message : '导入失败，请稍后重试。';
  } finally {
    isUploading.value = false;
  }
}
</script>

<template>
  <main class="app-shell">
    <header class="topbar">
      <a class="brand" href="/">学习库 <span>β</span></a>
      <p>资料导入中心</p>
    </header>

    <section class="intro">
      <p class="eyebrow">IMPORT YOUR MATERIALS</p>
      <h1>把学习文件带到一个清晰、有序的地方。</h1>
      <p>支持选择单个文件、多个文件或完整文件夹；会保留文件夹层级。PDF、Word、表格、演示文稿、图片、音视频和其他格式均可导入。</p>
    </section>

    <section class="import-card">
      <input ref="fileInput" class="visually-hidden" type="file" multiple @change="onFileSelection" />
      <input ref="folderInput" class="visually-hidden" type="file" multiple webkitdirectory directory @change="onFileSelection" />

      <div
        class="drop-zone"
        :class="{ dragging: isDragging }"
        @dragenter.prevent="isDragging = true"
        @dragover.prevent="isDragging = true"
        @dragleave.prevent="isDragging = false"
        @drop="onDrop"
      >
        <div class="drop-icon">↥</div>
        <h2>拖放文件到这里</h2>
        <p>或从设备中选择。导入文件夹时将保留内部目录结构。</p>
        <div class="actions">
          <button type="button" class="primary" @click="fileInput?.click()">选择文件</button>
          <button type="button" class="secondary" @click="folderInput?.click()">选择文件夹</button>
        </div>
      </div>

      <p class="format-note">常见资料格式：PDF、DOC/DOCX、XLS/XLSX、PPT/PPTX、MD、TXT、JPG/PNG、MP3、MP4 等；其他格式也会原样保存。</p>
    </section>

    <section v-if="queuedFiles.length" class="queue-card" aria-live="polite">
      <div class="section-heading">
        <div>
          <p class="eyebrow">READY TO IMPORT</p>
          <h2>{{ queuedFiles.length }} 个文件待导入</h2>
          <p>{{ formatSize(totalBytes) }} · 单个文件最大 200 MB</p>
        </div>
        <button type="button" class="primary" :disabled="isUploading" @click="uploadQueuedFiles">
          {{ isUploading ? '正在导入…' : '确认导入' }}
        </button>
      </div>
      <ul class="file-list">
        <li v-for="item in queuedFiles" :key="item.id">
          <span class="type-badge">{{ kindLabel(item.kind) }}</span>
          <div class="file-name"><strong>{{ item.file.name }}</strong><small>{{ item.relativePath }} · {{ formatSize(item.file.size) }}</small></div>
          <button type="button" class="remove" aria-label="移除文件" @click="removeFile(item.id)">×</button>
        </li>
      </ul>
    </section>

    <section v-if="importedFiles.length" class="queue-card success-card">
      <div class="section-heading compact"><div><p class="eyebrow">LAST IMPORT</p><h2>导入成功</h2></div></div>
      <ul class="file-list">
        <li v-for="item in importedFiles" :key="item.id">
          <span class="type-badge">{{ kindLabel(item.kind) }}</span>
          <div class="file-name"><strong>{{ item.name }}</strong><small>{{ item.relativePath }} · {{ formatSize(item.sizeBytes) }}</small></div>
        </li>
      </ul>
    </section>

    <p v-if="notice" class="notice" role="status">{{ notice }}</p>
  </main>
</template>
