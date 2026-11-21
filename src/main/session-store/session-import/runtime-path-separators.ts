// Ported from stablyai/orca src/shared/file-access/cross-platform-path.ts (v1.4.265, MIT)
// 裁剪:只保留本任务需要的「Windows 绝对路径判定」与「运行时分隔符归一」;WSL/UNC 别名改写、
// 相对路径归一、比较键的 NFC/大小写折叠、macOS 特例未搬(本任务只有 Windows 首发平台 + claude 编码)。

/** 路径语法即 Windows 盘符/UNC(与客户端 OS 无关;网络/远端路径不会走到本应用) */
export function isWindowsAbsolutePathLike(value: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(value) || value.startsWith('\\\\') || value.startsWith('//')
}

/** 反斜杠统一成正斜杠并压掉重复斜杠;UNC 前缀 `//` 保留 */
export function normalizeRuntimePathSeparators(value: string): string {
  const normalized = collapseRuntimePathSlashes(
    value.includes('\\') ? value.replace(/\\/g, '/') : value
  )
  if (value.startsWith('\\\\') || value.startsWith('//')) {
    return `//${normalized.replace(/^\/+/, '')}`
  }
  return normalized
}

// Why: 只在真的出现 `//` 时才做替换(与 Orca 同)——占绝大多数的普通路径省掉一次全串扫描
function collapseRuntimePathSlashes(value: string): string {
  return value.includes('//') ? value.replace(/\/+/g, '/') : value
}
