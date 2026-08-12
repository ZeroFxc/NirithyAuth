/**
 * R2 存储封装
 * 提供 JSON 格式数据的读写操作
 */

export interface StorageAdapter {
  getJSON<T>(key: string): Promise<T | null>
  putJSON<T>(key: string, data: T): Promise<void>
  delete(key: string): Promise<void>
  list(prefix: string): Promise<string[]>
}

/**
 * 在 Workers Functions 中使用 R2 binding
 */
export function createR2Storage(bucket: R2Bucket): StorageAdapter {
  return {
    async getJSON<T>(key: string): Promise<T | null> {
      const obj = await bucket.get(key)
      if (!obj) return null
      const text = await obj.text()
      return JSON.parse(text) as T
    },

    async putJSON<T>(key: string, data: T): Promise<void> {
      const json = JSON.stringify(data)
      await bucket.put(key, json, {
        httpMetadata: { contentType: 'application/json' }
      })
    },

    async delete(key: string): Promise<void> {
      await bucket.delete(key)
    },

    async list(prefix: string): Promise<string[]> {
      const result = await bucket.list({ prefix })
      const keys: string[] = []
      for (const obj of result.objects) {
        keys.push(obj.key)
      }
      // 处理分页
      let cursor = result.truncated ? result.cursor : undefined
      while (cursor) {
        const next = await bucket.list({ prefix, cursor })
        for (const obj of next.objects) {
          keys.push(obj.key)
        }
        cursor = next.truncated ? next.cursor : undefined
      }
      return keys
    }
  }
}