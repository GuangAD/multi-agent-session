// Ported from stablyai/orca src/main/ipc/command-path/command-path-resolver.ts (MIT)
// 移植适配(与原件的差异,Why 见各处注释):
// 1) 对外只暴露契约接口 resolveCommandPath(command, { pathEnv, exts, platform, cwd });其组成 =
//    原件 findLocalCommandPaths 骨架(返回首个绝对路径命中)+ findCommandsOnLocalPath 的检测
//    扩展与折叠清单(win32 批检测扩展集、directoryNameKey 折叠名匹配、listed 回填);
//    isCommandOnLocalPath / listLocalCommandPaths 及 gh/glab selection 缓存
//    (beginLocalCommandSelection/resolveSelectedLocalCommand)不属本任务接口,未移植。
// 2) PATH/PATHEXT/platform 由注入值直接替换(原件注入整个 env 对象);platform 缺省取
//    process.platform(原件同款注入;本仓 Windows 首发,win32 分支即真实分支)。
// 3) 目录清单读取用进程内 readDetectionDirectory(原件经 worker 线程):目录过大/不可读/
//    含非 ASCII 名时返回 null,语义保留——退回逐个 stat 探测,行为不变。
// 4) 目录读取与 stat 均为异步(原件即异步),故返回 Promise<string | null>;契约伪代码的
//    同步记法以此为准(测试与消费方均 await)。
import { access, constants as fsConstants, stat } from 'node:fs/promises'
import path from 'node:path'
import { readDetectionDirectory, directoryNameKey } from './command-path-directory'
import { getExecutableNames } from './node-cli-command-resolution'

export interface ResolveCommandPathOptions {
  /** 直接替换 PATH 值;缺省读 process.env(键大小写不敏感)。 */
  pathEnv?: string
  /**
   * 直接替换探测扩展集(已拆分的扩展名数组);win32 缺省 = PATHEXT 并入批检测可执行名,
   * POSIX 分支缺省仅裸名 [''](原件两条检测路径非 win32 一律 [''])。
   */
  exts?: string[]
  /** Defaults to `process.platform`. Lets tests exercise the win32 lookup on posix. */
  platform?: NodeJS.Platform
  /** 仅 win32「先搜当前目录」规则使用;缺省 process.cwd()。 */
  cwd?: string
}

// Windows 环境变量键不区分大小写,而这个 Record 区分(原件同款)。
function readEnvCaseInsensitive(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const direct = env[key]
  if (direct !== undefined) {
    return direct
  }
  const lowerKey = key.toLowerCase()
  for (const [envKey, value] of Object.entries(env)) {
    if (envKey.toLowerCase() === lowerKey) {
      return value
    }
  }
  return undefined
}

// Windows 安装器常给 PATH 条目带引号;cmd 只剥双引号,与终端行为一致(原件同款)。
const stripWindowsPathQuotes = (entry: string): string => entry.replace(/^"(.*)"$/, '$1')

// 默认扩展名集合来自 PATHEXT 缺省值(原件同款:.EXE;.CMD;.BAT;.COM,读取大小写不敏感)。
function getWindowsPathSearchExtensions(injected: string[] | undefined, command: string): string[] {
  const extensions =
    injected ??
    (readEnvCaseInsensitive(process.env, 'PATHEXT') ?? '.EXE;.CMD;.BAT;.COM')
      .split(';')
      .filter((ext) => ext.length > 0)
  // 与 libuv 一致:仅当命令基本名含点才允许精确名匹配,带点的父目录
  // (node_modules\.bin\prettier)选不到无扩展名的 POSIX shim(原件同款)。
  if (path.win32.basename(command).includes('.')) {
    extensions.unshift('')
  }
  return extensions
}

/** agent CLI 检测兜底:在 PATHEXT 之上并入字面可执行名(含无扩展名 shim)。 */
function getWindowsBatchDetectionExtensions(injected: string[] | undefined, command: string): string[] {
  return [
    ...new Set([
      ...getWindowsPathSearchExtensions(injected, command),
      ...getExecutableNames('win32', command).map((name) => name.slice(command.length))
    ])
  ]
}

async function isExecutableFile(candidate: string, isWin: boolean): Promise<boolean> {
  try {
    // 跟随符号链接到真实目标。
    const stats = await stat(candidate)
    if (stats.isDirectory()) {
      // PATH 目录虽有搜索位但不是可执行文件。
      return false
    }
    if (isWin) {
      // 扩展名合法性已由 PATHEXT 排列保证。
      return stats.isFile()
    }
    await access(candidate, fsConstants.X_OK)
    return true
  } catch {
    return false
  }
}

/**
 * PATH 探测:返回命令的绝对路径,未命中返回 null。
 * 组成(按实况):findLocalCommandPaths 骨架——先搜当前目录、PATH 按 ';' 分隔并去重、
 * 条目剥双引号、stat 可执行判定;findCommandsOnLocalPath 检测扩展与折叠清单——
 * directoryNameKey 折叠名匹配、listed 回填,非 win32 扩展集仅裸名 [''],
 * win32 用批检测扩展集(PATHEXT 排列 + 字面可执行名兜底,含无扩展名 shim)。
 */
export async function resolveCommandPath(
  command: string,
  options: ResolveCommandPathOptions = {}
): Promise<string | null> {
  if (!command) {
    return null
  }
  const isWin = (options.platform ?? process.platform) === 'win32'
  const pathValue = options.pathEnv ?? (readEnvCaseInsensitive(process.env, 'PATH') ?? '')
  const rawPathDirs = pathValue.split(isWin ? ';' : ':')
  const pathDirs = isWin ? rawPathDirs.map(stripWindowsPathQuotes) : rawPathDirs
  // 带分隔符的命令绕过 PATH;Windows 先搜当前目录(原件同款)。
  const hasPathSeparator = command.includes('/') || (isWin && command.includes('\\'))
  const cwd = options.cwd ?? process.cwd()
  const searchDirs = hasPathSeparator ? [''] : isWin ? [cwd, ...pathDirs] : pathDirs
  // 用请求平台的绝对路径规则,而非测试宿主的(原件同款);platform 可注入,缺省 process.platform。
  const isAbsolute = isWin ? path.win32.isAbsolute : path.posix.isAbsolute
  // POSIX 分支仅裸名(原件两条检测路径非 win32 一律 ['']);exts 注入能力保留给测试与调用方。
  const extensions = isWin
    ? getWindowsBatchDetectionExtensions(options.exts, command)
    : (options.exts ?? [''])

  const seen = new Set<string>()
  for (const dir of searchDirs) {
    // 折叠名 → 实际名清单;带分隔符的命令对空目录('')按字面 stat(保留原件绝对命令直查行为)。
    const names = dir === '' ? null : await readDetectionDirectory(dir)
    for (const ext of extensions) {
      const wanted = command + ext
      const listed = names?.get(directoryNameKey(wanted))
      // 清单可用且未列出的候选不必逐个 stat;清单为 null(目录过大/不可读)退回逐个 stat。
      if (names !== null && listed === undefined) {
        continue
      }
      // Windows 接受正斜杠;POSIX join 保持合成 Windows 查找在任何宿主可测(原件同款)。
      const candidate = path.posix.join(dir, isWin ? (listed ?? wanted) : wanted)
      const candidateKey = isWin ? candidate.toLowerCase() : candidate
      // 保留原件 where/which 的绝对路径过滤与去重。
      if (!isAbsolute(candidate) || seen.has(candidateKey)) {
        continue
      }
      seen.add(candidateKey)
      if (await isExecutableFile(candidate, isWin)) {
        return candidate
      }
    }
  }
  return null
}
