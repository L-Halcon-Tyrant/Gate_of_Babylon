<script setup lang="ts">
const roadmap = [
  ['01', '导入资料', '建立文件索引，保留原始目录'],
  ['02', '整理归档', '标签、专题与学习状态'],
  ['03', '快速检索', '按标题、内容和标签搜索'],
];
</script>

<template>
  <main class="shell">
    <section class="hero">
      <p class="eyebrow">LEARNING LIBRARY</p>
      <h1>把每一份学习资料，放回它该在的位置。</h1>
      <p class="intro">
        学习库会先建立安全的资料索引，再逐步帮助你分类、检索、记录与复习。
      </p>
      <button type="button">开始导入资料（即将推出）</button>
    </section>

    <section class="roadmap" aria-label="产品路线">
      <article v-for="item in roadmap" :key="item[0]" class="card">
        <span>{{ item[0] }}</span>
        <h2>{{ item[1] }}</h2>
        <p>{{ item[2] }}</p>
      </article>
    </section>
  </main>
</template>
