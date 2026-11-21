// cwd 归一化匹配:导入候选的 cwd 与项目路径「同一目录」的判定(接缝 matchProjectDir)
// 归一化三步:分隔符统一、去尾分隔符、Windows 路径折叠大小写(Orca isCaseInsensitiveRuntimeRoot 同思路:
// 按路径语法判,不看客户端 OS——Linux 上 /home/Foo 与 /home/foo 是两个目录,不得折叠)。
import {
  isWindowsAbsolutePathLike,
  normalizeRuntimePathSeparators
} from './runtime-path-separators'

function normalizeForComparison(value: string): string {
  const separated = normalizeRuntimePathSeparators(value)
  // 根(`/`、`D:/`)保留分隔符,其余去尾(`D:\work\` 与 `D:\work` 是同一目录)
  const trimmed =
    separated === '/' || /^[A-Za-z]:\/$/.test(separated) ? separated : separated.replace(/\/+$/, '')
  return isWindowsAbsolutePathLike(trimmed) ? trimmed.toLowerCase() : trimmed
}

/** 两侧归一化后精确相等才算命中(不做前缀/子目录匹配:子目录的会话不属于该项目) */
export function matchProjectDir(candidateCwd: string, projectPath: string): boolean {
  return normalizeForComparison(candidateCwd) === normalizeForComparison(projectPath)
}
