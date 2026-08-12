<template>
  <MdContainer class="developer-page">
    <div class="developer-page__header">
      <h1>开发者中心</h1>
      <MdButton variant="filled" @click="showCreateDialog = true">创建应用</MdButton>
    </div>

    <!-- 应用列表 -->
    <div v-if="loading" class="developer-page__loading">加载中...</div>

    <div v-else-if="clients.length === 0" class="developer-page__empty">
      <p>还没有创建任何应用</p>
      <p class="developer-page__empty-hint">创建一个 OAuth2 应用，让其他网站接入你的登录系统</p>
    </div>

    <div v-else class="developer-page__list">
      <MdCard
        v-for="client in clients"
        :key="client.clientId"
        variant="outlined"
        class="developer-page__client-card"
      >
        <div class="client-card__header">
          <h3>{{ client.name }}</h3>
          <span class="client-card__id">Client ID: {{ client.clientId }}</span>
        </div>
        <p v-if="client.description" class="client-card__desc">{{ client.description }}</p>
        <div class="client-card__meta">
          <span>回调 URL: {{ client.redirectUris.join(', ') }}</span>
          <span>创建于: {{ formatDate(client.createdAt) }}</span>
        </div>
        <div class="client-card__actions">
          <MdButton variant="text" @click="editClient(client)">编辑</MdButton>
          <MdButton variant="text" @click="confirmDelete(client)">删除</MdButton>
        </div>
      </MdCard>
    </div>

    <!-- 创建/编辑应用对话框 -->
    <MdDialog v-model="showCreateDialog" :title="editingClient ? '编辑应用' : '创建应用'">
      <div class="client-form">
        <MdTextField v-model="form.name" label="应用名称" :error="formErrors.name" />
        <MdTextField v-model="form.description" label="应用描述（选填）" />
        <MdTextField v-model="form.homepageUrl" label="主页 URL" :error="formErrors.homepageUrl" />
        <div class="client-form__redirects">
          <label>回调 URL（至少一个）</label>
          <div v-for="(uri, index) in form.redirectUris" :key="index" class="client-form__redirect-row">
            <MdTextField
              v-model="form.redirectUris[index]"
              label="回调 URL"
              :error="formErrors.redirectUris"
            />
            <MdButton
              v-if="form.redirectUris.length > 1"
              variant="text"
              @click="removeRedirectUri(index)"
            >
              删除
            </MdButton>
          </div>
          <MdButton variant="text" @click="addRedirectUri">+ 添加回调 URL</MdButton>
        </div>
        <div v-if="formError" class="client-form__error">{{ formError }}</div>
      </div>
      <template #actions>
        <MdButton variant="text" @click="closeDialog">取消</MdButton>
        <MdButton variant="filled" :disabled="submitting" @click="handleSubmit">
          {{ submitting ? '保存中...' : (editingClient ? '保存' : '创建') }}
        </MdButton>
      </template>
    </MdDialog>

    <!-- 新创建应用的 secret 展示对话框 -->
    <MdDialog v-model="showSecretDialog" title="应用创建成功">
      <p>请妥善保管以下凭证，<strong>Client Secret 仅显示一次</strong>。</p>
      <div class="secret-display">
        <div class="secret-display__item">
          <label>Client ID</label>
          <code>{{ newClient?.clientId }}</code>
        </div>
        <div class="secret-display__item">
          <label>Client Secret</label>
          <code>{{ newClient?.clientSecret }}</code>
        </div>
      </div>
      <template #actions>
        <MdButton variant="filled" @click="showSecretDialog = false">我已保存</MdButton>
      </template>
    </MdDialog>

    <!-- 删除确认 -->
    <MdDialog v-model="showDeleteDialog" title="确认删除">
      <p>确定要删除应用 <strong>{{ deletingClient?.name }}</strong> 吗？此操作不可撤销，已授权的用户将无法再使用此应用登录。</p>
      <template #actions>
        <MdButton variant="text" @click="showDeleteDialog = false">取消</MdButton>
        <MdButton variant="filled" @click="handleDelete">确认删除</MdButton>
      </template>
    </MdDialog>
  </MdContainer>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { MdButton, MdTextField, MdCard, MdContainer, MdDialog } from '../components'

interface Client {
  clientId: string
  name: string
  description?: string
  homepageUrl: string
  redirectUris: string[]
  createdAt: string
}

const clients = ref<Client[]>([])
const loading = ref(true)
const submitting = ref(false)

const showCreateDialog = ref(false)
const showSecretDialog = ref(false)
const showDeleteDialog = ref(false)
const editingClient = ref<Client | null>(null)
const deletingClient = ref<Client | null>(null)
const newClient = ref<{ clientId: string; clientSecret: string } | null>(null)

const form = reactive({
  name: '',
  description: '',
  homepageUrl: '',
  redirectUris: ['']
})
const formErrors = reactive({ name: '', homepageUrl: '', redirectUris: '' })
const formError = ref('')

onMounted(async () => {
  await loadClients()
})

async function loadClients() {
  loading.value = true
  try {
    const res = await fetch('/api/clients')
    const data = await res.json() as { success: boolean; data?: any; error?: string }
    if (data.success) {
      clients.value = data.data
    }
  } catch {
    // ignore
  } finally {
    loading.value = false
  }
}

function resetForm() {
  form.name = ''
  form.description = ''
  form.homepageUrl = ''
  form.redirectUris = ['']
  formErrors.name = ''
  formErrors.homepageUrl = ''
  formErrors.redirectUris = ''
  formError.value = ''
  editingClient.value = null
}

function editClient(client: Client) {
  editingClient.value = client
  form.name = client.name
  form.description = client.description || ''
  form.homepageUrl = client.homepageUrl
  form.redirectUris = [...client.redirectUris]
  showCreateDialog.value = true
}

function closeDialog() {
  showCreateDialog.value = false
  resetForm()
}

function addRedirectUri() {
  form.redirectUris.push('')
}

function removeRedirectUri(index: number) {
  form.redirectUris.splice(index, 1)
}

async function handleSubmit() {
  formErrors.name = ''
  formErrors.homepageUrl = ''
  formErrors.redirectUris = ''
  formError.value = ''

  if (!form.name.trim()) { formErrors.name = '请输入应用名称'; return }
  if (!form.homepageUrl.trim()) { formErrors.homepageUrl = '请输入主页 URL'; return }
  const validUris = form.redirectUris.filter(u => u.trim())
  if (validUris.length === 0) { formErrors.redirectUris = '请至少添加一个回调 URL'; return }

  submitting.value = true
  try {
    const body = {
      name: form.name.trim(),
      description: form.description.trim(),
      homepageUrl: form.homepageUrl.trim(),
      redirectUris: validUris
    }

    if (editingClient.value) {
      const res = await fetch(`/api/clients/${editingClient.value.clientId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      const data = await res.json() as { success: boolean; data?: any; error?: string }
      if (data.success) {
        showCreateDialog.value = false
        resetForm()
        await loadClients()
      } else {
        formError.value = data.error || '更新失败'
      }
    } else {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      const data = await res.json() as { success: boolean; data?: any; error?: string }
      if (data.success) {
        showCreateDialog.value = false
        newClient.value = { clientId: data.data.clientId, clientSecret: data.data.clientSecret }
        showSecretDialog.value = true
        resetForm()
        await loadClients()
      } else {
        formError.value = data.error || '创建失败'
      }
    }
  } catch {
    formError.value = '网络错误，请稍后重试'
  } finally {
    submitting.value = false
  }
}

function confirmDelete(client: Client) {
  deletingClient.value = client
  showDeleteDialog.value = true
}

async function handleDelete() {
  if (!deletingClient.value) return
  try {
    await fetch(`/api/clients/${deletingClient.value.clientId}`, { method: 'DELETE' })
    showDeleteDialog.value = false
    deletingClient.value = null
    await loadClients()
  } catch {
    // ignore
  }
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('zh-CN')
}
</script>

<style scoped>
.developer-page {
  max-width: 720px;
  padding-top: 32px;
}
.developer-page__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}
.developer-page__header h1 {
  font-size: 28px;
  font-weight: 400;
  color: var(--md-sys-color-on-surface);
}
.developer-page__loading,
.developer-page__empty {
  text-align: center;
  padding: 48px 0;
  color: var(--md-sys-color-on-surface-variant);
}
.developer-page__empty-hint {
  font-size: 14px;
  margin-top: 8px;
}
.developer-page__list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.developer-page__client-card {
  padding: 20px;
}
.client-card__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 8px;
}
.client-card__header h3 {
  font-size: 18px;
  font-weight: 500;
  color: var(--md-sys-color-on-surface);
}
.client-card__id {
  font-size: 12px;
  color: var(--md-sys-color-on-surface-variant);
  font-family: monospace;
  background: var(--md-sys-color-surface-variant);
  padding: 2px 8px;
  border-radius: 4px;
}
.client-card__desc {
  font-size: 14px;
  color: var(--md-sys-color-on-surface-variant);
  margin-bottom: 8px;
}
.client-card__meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  color: var(--md-sys-color-on-surface-variant);
  margin-bottom: 8px;
}
.client-card__actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
.client-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 400px;
}
.client-form__redirects {
  margin-top: 8px;
}
.client-form__redirects > label {
  display: block;
  font-size: 14px;
  color: var(--md-sys-color-on-surface);
  margin-bottom: 8px;
}
.client-form__redirect-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}
.client-form__redirect-row .md-text-field {
  flex: 1;
}
.client-form__error {
  background: var(--md-sys-color-error-container);
  color: var(--md-sys-color-on-error-container);
  padding: 12px 16px;
  border-radius: var(--md-sys-shape-corner-extra-small);
  font-size: 14px;
}
.secret-display {
  margin-top: 16px;
}
.secret-display__item {
  margin-bottom: 12px;
}
.secret-display__item label {
  display: block;
  font-size: 12px;
  color: var(--md-sys-color-on-surface-variant);
  margin-bottom: 4px;
}
.secret-display__item code {
  display: block;
  font-family: monospace;
  font-size: 13px;
  background: var(--md-sys-color-surface-variant);
  padding: 8px 12px;
  border-radius: var(--md-sys-shape-corner-extra-small);
  word-break: break-all;
}
</style>