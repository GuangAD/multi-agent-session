// 文件预览读取(spec:T9 落点 src/main/file-content.ts;移植参考 plan 附录 A6 Orca
// local-file-io 的单句柄思路,按本任务契约裁剪:纯文本只读,不做 MIME/图片/PDF)
// 单文件句柄完成大小检查、二进制探测与有界读取——三者看到同一文件,避免 stat 后文件被换的竞态
import { open } from 'node:fs/promises'
import type { FilePreviewResult } from '../shared/ipc-contract'

// 渲染层传值超限按上限处理(controller 裁决 4,防渲染层误传巨值);下限 1 防 0/负值
const MIN_MAX_BYTES = 1
const MAX_MAX_BYTES = 2_000_000
// 二进制嗅探窗口:读出内容的前 8KB 查 NUL 字节(裁决 4:buffer.includes(0) 前 8192 字节窗口)
const BINARY_SNIFF_BYTES = 8192

// 常见错误码翻成界面文案;未知错误退回原始 message
function toErrorMessage(error: unknown): string {
  const code = error instanceof Error ? (error as NodeJS.ErrnoException).code : undefined
  if (code === 'ENOENT') {
    return '文件不存在'
  }
  if (code === 'EACCES' || code === 'EPERM') {
    return '无权限访问'
  }
  if (code === 'EISDIR') {
    return '是目录,不能预览'
  }
  return error instanceof Error ? error.message : String(error)
}

export async function readFilePreview(p: {
  path: string
  maxBytes: number
}): Promise<FilePreviewResult> {
  // clamp(裁决 4):越界值夹进 [1, 2_000_000];非法值(非有限数)按上限处理
  const requested = Number.isFinite(p.maxBytes) ? Math.trunc(p.maxBytes) : MAX_MAX_BYTES
  const maxBytes = Math.min(Math.max(requested, MIN_MAX_BYTES), MAX_MAX_BYTES)

  let handle
  try {
    handle = await open(p.path, 'r')
  } catch (error) {
    // 文件不存在/无权限 → 结构化错误对象,不抛未捕获异常(契约错误行为)
    return { content: '', truncated: false, binary: false, error: toErrorMessage(error) }
  }
  try {
    const stat = await handle.stat()
    if (!stat.isFile()) {
      return { content: '', truncated: false, binary: false, error: '不是常规文件,不能预览' }
    }
    const planned = Math.min(stat.size, maxBytes)
    const chunk = Buffer.alloc(planned)
    let readTotal = 0
    while (readTotal < planned) {
      // 从同一句柄按绝对位置续读,补齐 fstat 报告的长度(单次 read 不保证读满)
      const { bytesRead } = await handle.read(chunk, readTotal, planned - readTotal, readTotal)
      if (bytesRead === 0) {
        break // 读到 EOF:fstat 之后文件被并发截短,读到多少算多少
      }
      readTotal += bytesRead
    }
    // 二进制嗅探:只看前 8KB 窗口;命中即 binary=true 且 content 返回空串(不渲染乱码,裁决 4)
    const binary = chunk.subarray(0, Math.min(readTotal, BINARY_SNIFF_BYTES)).includes(0)
    return {
      content: binary ? '' : chunk.subarray(0, readTotal).toString('utf8'),
      truncated: stat.size > maxBytes,
      binary
    }
  } catch (error) {
    return { content: '', truncated: false, binary: false, error: toErrorMessage(error) }
  } finally {
    await handle.close()
  }
}
