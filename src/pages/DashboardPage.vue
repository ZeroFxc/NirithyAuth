<template>
  <MdContainer class="dashboard-page">
    <h1 class="dashboard-page__title">个人中心</h1>

    <div v-if="loading" class="dashboard-page__loading">加载中...</div>

    <template v-else-if="user">
      <!-- 用户信息卡片 -->
      <MdCard variant="elevated" class="dashboard-page__profile">
        <div class="profile__header">
          <MdAvatar :name="user.name" :size="64" />
          <div class="profile__info">
            <h2>{{ user.name }}</h2>
            <p>{{ user.email }}</p>
            <p class="profile__id">ID: {{ user.id }}</p>
          </div>
        </div>
        <div class="profile__actions">
          <MdButton variant="outlined" @click="showEditDialog = true">编辑资料</MdButton>
        </div>
      </MdCard>

      <!-- 已授权应用 -->
      <MdCard variant="elevated" class="dashboard-page__apps">
        <h3>已授权应用</h3>
        <div v-if="authorizations.length === 0" class="apps__empty">
          暂无已授权的应用
        </div>
        <div v-else class="apps__list">
          <div v-for="auth in authorizations" :key="auth.clientId" class="apps__item">
            <div class="apps__item-icon">
              {{ auth.clientName.charAt(0).toUpperCase() }}
            </div>
            <div class="apps__item-info">
              <div class="apps__item-name">{{ auth.clientName }}</div>
              <div class="apps__item-date">授权于 {{ formatDate(auth.authorizedAt) }}</div>
            </div>
            <MdButton variant="text" @click="revokeAuth(auth.clientId)">撤销</MdButton>
          </div>
        </div>
      </MdCard>

      <!-- 账户信息 -->
      <MdCard variant="elevated" class="dashboard-page__account">
        <h3>账户信息</h3>
        <div class="account__row">
          <span>注册时间</span>
          <span>{{ formatDate(user.createdAt) }}</span>
        </div>
      </MdCard>
    </template>

    <!-- 编辑资料对话框 -->
    <MdDialog v-model="showEditDialog" title="编辑资料">
      <div class="edit-form">
        <MdTextField v-model="editForm.name" label="昵称" :error="editError" />
        <MdTextField v-model="editForm.avatar" label="头像 URL（选填）" />
      </div>
      <template #actions>
        <MdButton variant="text" @click="showEditDialog = false">取消</MdButton>
        <MdButton variant="filled" :disabled="saving" @click="handleUpdateProfile">
          {{ saving ? '保存中...' : '保存' }}
        </MdButton>
      </template>
    </MdDialog>
  </MdContainer>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { MdButton, MdCard, MdContainer, MdAvatar, MdDialog, MdTextField } from '../components'

interface User {
  id: string
  email: string
  name: string
  avatar?: string
  createdAt: string
}

interface Authorization {
  clientId: string
  clientName: string
  clientDescription?: string
  authorizedAt: string
}

const user = ref<User | null>(null)
const authorizations = ref<Authorization[]>([])
const loading = ref(true)
const saving = ref(false)
const showEditDialog = ref(false)
const editError = ref('')

const editForm = reactive({
  name: '',
  avatar: ''
})

onMounted(async () => {
  await loadProfile()
  await loadAuthorizations()
})

async function loadProfile() {
  try {
    const res = await fetch('/api/user/profile')
    const data = await res.json() as { success: boolean; data?: any; error?: string }
    if (data.success) {
      user.value = data.data
      editForm.name = data.data.name
      editForm.avatar = data.data.avatar || ''
    }
  } catch {
    // ignore
  } finally {
    loading.value = false
  }
}

async function loadAuthorizations() {
  try {
    const res = await fetch('/api/user/authorizations')
    const data = await res.json() as { success: boolean; data?: any; error?: string }
    if (data.success) {
      authorizations.value = data.data
    }
  } catch {
    // ignore
  }
}

async function handleUpdateProfile() {
  editError.value = ''
  if (!editForm.name.trim()) {
    editError.value = '昵称不能为空'
    return
  }

  saving.value = true
  try {
    const res = await fetch('/api/user/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editForm.name.trim(), avatar: editForm.avatar.trim() })
    })
    const data = await res.json() as { success: boolean; data?: any; error?: string }
    if (data.success) {
      showEditDialog.value = false
      await loadProfile()
    } else {
      editError.value = data.error || '更新失败'
    }
  } catch {
    editError.value = '网络错误'
  } finally {
    saving.value = false
  }
}

async function revokeAuth(clientId: string) {
  try {
    await fetch(`/api/user/authorizations/${clientId}`, { method: 'DELETE' })
    await loadAuthorizations()
  } catch {
    // ignore
  }
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('zh-CN')
}
</script>

<style scoped>
.dashboard-page {
  max-width: 720px;
  padding-top: 32px;
}
.dashboard-page__title {
  font-size: 28px;
  font-weight: 400;
  color: var(--md-sys-color-on-surface);
  margin-bottom: 24px;
}
.dashboard-page__loading {
  text-align: center;
  padding: 48px 0;
  color: var(--md-sys-color-on-surface-variant);
}
.dashboard-page__profile {
  margin-bottom: 16px;
}
.profile__header {
  display: flex;
  align-items: center;
  gap: 16px;
}
.profile__info h2 {
  font-size: 22px;
  font-weight: 500;
  color: var(--md-sys-color-on-surface);
}
.profile__info p {
  font-size: 14px;
  color: var(--md-sys-color-on-surface-variant);
  margin-top: 2px;
}
.profile__id {
  font-family: monospace;
  font-size: 12px !important;
}
.profile__actions {
  margin-top: 16px;
  display: flex;
  gap: 8px;
}
.dashboard-page__apps,
.dashboard-page__account {
  margin-bottom: 16px;
}
.dashboard-page__apps h3,
.dashboard-page__account h3 {
  font-size: 16px;
  font-weight: 500;
  color: var(--md-sys-color-on-surface);
  margin-bottom: 16px;
}
.apps__empty {
  font-size: 14px;
  color: var(--md-sys-color-on-surface-variant);
  padding: 16px 0;
}
.apps__list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.apps__item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: var(--md-sys-shape-corner-small);
  background: var(--md-sys-color-surface-variant);
}
.apps__item-icon {
  width: 40px;
  height: 40px;
  border-radius: var(--md-sys-shape-corner-small);
  background: var(--md-sys-color-primary-container);
  color: var(--md-sys-color-on-primary-container);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 500;
  flex-shrink: 0;
}
.apps__item-info {
  flex: 1;
}
.apps__item-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--md-sys-color-on-surface);
}
.apps__item-date {
  font-size: 12px;
  color: var(--md-sys-color-on-surface-variant);
  margin-top: 2px;
}
.account__row {
  display: flex;
  justify-content: space-between;
  padding: 12px 0;
  font-size: 14px;
  color: var(--md-sys-color-on-surface);
  border-bottom: 1px solid var(--md-sys-color-outline-variant);
}
.account__row:last-child {
  border-bottom: none;
}
.edit-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 320px;
}
</style>