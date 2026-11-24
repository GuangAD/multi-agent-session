// kimi 全局 config.toml 的 marker 块合并接缝(hook-run-state T3)。
// Ported from stablyai/orca src/main/kimi/kimi-hook-config-toml.ts (MIT) 的 marker 方案,裁剪:
// 只保留「单 marker 区间 + 字面量 TOML 字符串」形态(我们只有一个 hook 服务、一种条目形状;
// Orca 的命令认领/fail-closed 未知结构的双保险随区间方案合并为「区间整体认领」)。
// 字节保留口径:marker 区间外的文本逐字节不动;remove 只删区间;apply 幂等(区间整体替换)。
// 区间外用户自有 [[hooks]] 表与本区间零交互——配置解析根本不发生,未知结构天然 fail-closed。
export const KIMI_MARKER_START = '# >>> soloport-managed-kimi-hooks (managed by Soloport; do not edit) >>>'
export const KIMI_MARKER_END = '# <<< soloport-managed-kimi-hooks <<<'

export interface ManagedHookEntry {
  event: string
  command: string
}

// TOML 字面量字符串(literal string):内部不转义,路径原样;值不含单引号由构造方保证
// (command 经 buildHookCommand 生成:Windows 路径不含 ',launcher 命令亦无 ')
function tomlEntry(entry: ManagedHookEntry): string {
  return `[[hooks]]\nevent = '${entry.event}'\ncommand = '${entry.command}'\ntimeout = 10\n`
}

function buildBlock(managed: ManagedHookEntry[]): string {
  const body = managed.map(tomlEntry).join('\n')
  return `${KIMI_MARKER_START}\n${body}${KIMI_MARKER_END}\n`
}

// 区间后剩余文本:吃掉紧跟 END 的一个换行(那是块自带行尾,防反复 apply 渐增空行)
function restAfterEnd(text: string, end: number): string {
  const rest = text.slice(end + KIMI_MARKER_END.length)
  return rest.startsWith('\n') ? rest.slice(1) : rest
}

export function applyKimiToml(
  text: string,
  managed: ManagedHookEntry[]
): { text: string; changed: boolean } {
  const start = text.indexOf(KIMI_MARKER_START)
  if (start === -1) {
    // 无区间:追加(空文件直接放块;非空确保以换行收尾,块首空一行分隔)
    const output =
      text.length === 0 ? buildBlock(managed) : (text.endsWith('\n') ? text : text + '\n') + '\n' + buildBlock(managed)
    return { text: output, changed: true }
  }
  const end = text.indexOf(KIMI_MARKER_END, start)
  if (end === -1) {
    return { text, changed: false } // 半截区间:fail-closed 不动(用户可能在编辑)
  }
  const output = text.slice(0, start) + buildBlock(managed) + restAfterEnd(text, end)
  return { text: output, changed: output !== text }
}

export function removeKimiToml(text: string): { text: string; changed: boolean } {
  const start = text.indexOf(KIMI_MARKER_START)
  if (start === -1) {
    return { text, changed: false }
  }
  const end = text.indexOf(KIMI_MARKER_END, start)
  if (end === -1) {
    return { text, changed: false } // 半截区间:fail-closed 不动
  }
  // 摘区间;若区间前是「为区间补的空行」(前文以空行紧邻)一并收回,避免反复 apply/remove 留下渐增空行
  let cutStart = start
  if (cutStart >= 2 && text.slice(0, cutStart).endsWith('\n\n')) {
    cutStart -= 1
  }
  const output = text.slice(0, cutStart) + restAfterEnd(text, end)
  return { text: output, changed: true }
}
