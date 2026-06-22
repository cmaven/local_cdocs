<!-- DocHeader.vue: 문서 상단 프로젝트 라벨 + 제목 + 설명 (frontmatter 자동 렌더링) | 생성일: 2026-04-09 -->
<script setup>
import { computed, ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useData, useRoute } from 'vitepress'

const { frontmatter, page } = useData()
const route = useRoute()
const firstHeading = ref('')

function extractFirstHeading() {
  firstHeading.value = ''
  if (!frontmatter.value.title) {
    nextTick(() => {
      setTimeout(() => {
        const h1 = document.querySelector('.vp-doc h1, .vp-doc h2')
        if (h1) {
          firstHeading.value = h1.textContent?.trim() || ''
        }
      }, 150)
    })
  }
}

// 라우트 변경 시 리셋 + 재추출
watch(() => route.path, () => {
  extractFirstHeading()
})

onMounted(() => {
  extractFirstHeading()
  document.body.classList.add('has-doc-header')
})

onUnmounted(() => {
  document.body.classList.remove('has-doc-header')
})

const projectLabel = computed(() => {
  const p = page.value.relativePath
  // 연도/프로젝트 경로: 2025/project-alpha/index.md → Project Alpha
  const yearMatch = p.match(/\d{4}\/([\w-]+)/)
  if (yearMatch) {
    return yearMatch[1]
      .split(/[-_]/)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ')
  }
  // guide 경로: guide/index.md → 가이드
  if (p.startsWith('guide/')) return '가이드'
  // 기타 경로: 첫 번째 디렉토리명
  const dirMatch = p.match(/^([\w-]+)\//)
  if (dirMatch) {
    return dirMatch[1].charAt(0).toUpperCase() + dirMatch[1].slice(1)
  }
  return null
})

const title = computed(() => frontmatter.value.title || firstHeading.value || '')
const description = computed(() => frontmatter.value.description || '')
const showHeader = computed(() => !!title.value)
</script>

<template>
  <div v-if="showHeader" class="doc-header">
    <span class="doc-label">{{ projectLabel }}</span>
    <h1 class="doc-title">{{ title }}</h1>
    <p v-if="description" class="doc-description">{{ description }}</p>
  </div>
</template>

<style scoped>
.doc-header {
  margin-bottom: 2rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--vp-c-border);
}
.doc-label {
  display: inline-block;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--vp-c-brand-1);
  margin-bottom: 0.25rem;
}
.doc-title {
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--vp-c-text-1);
  line-height: 1.3;
  margin: 0;
  border: none;
  padding: 0;
}
.doc-description {
  font-size: 0.95rem;
  color: var(--vp-c-text-2);
  margin: 0.5rem 0 0;
}
</style>
