<template>
  <div class="app">
    <MdAppBar title="Auth System">
      <template #left>
        <router-link to="/">
          <MdButton variant="text">首页</MdButton>
        </router-link>
        <router-link to="/docs">
          <MdButton variant="text">文档</MdButton>
        </router-link>
      </template>
      <template #actions>
        <router-link v-if="!isLoggedIn" to="/login">
          <MdButton variant="text">登录</MdButton>
        </router-link>
        <template v-else>
          <router-link to="/dashboard">
            <MdButton variant="text">个人中心</MdButton>
          </router-link>
          <router-link to="/developer">
            <MdButton variant="text">开发者</MdButton>
          </router-link>
          <MdButton variant="text" @click="handleLogout">退出</MdButton>
        </template>
      </template>
    </MdAppBar>
    <main>
      <router-view />
    </main>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import { MdAppBar, MdButton } from './components'
import { isLoggedIn, checkSession, logout as doLogout } from './lib/auth'

const router = useRouter()

async function handleLogout() {
  await doLogout()
  router.push('/')
}

checkSession()
</script>

<style>
.app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}
.app main {
  flex: 1;
}

a {
  text-decoration: none;
}
</style>