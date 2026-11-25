import { join } from 'node:path'

// Ported from stablyai/orca src/shared/shell/command-resolution/{node-cli-command-resolution,fnm-default-alias-dirs}.ts (MIT, 裁剪版)
// Why: PATH 之外的常见 CLI 安装位兜底(D7)——GUI 进程的 PATH 常缺用户级安装目录
// (Claude/Codex 官方 Windows 安装位、npm/pnpm 全局 bins),PATH 未命中时按此清单兜底。
// 裁剪说明:不搬 nvm 别名链解析与 fnm 目录扫描的动态发现树(~120 行,Windows 首发用不上,
// 需要时按 Orca 原件单独移植);Homebrew/nix 等 POSIX 系统目录不搬(通常已在 PATH)。

export function getCliInstallDirs(
  platform: NodeJS.Platform,
  homePath: string,
  env: NodeJS.ProcessEnv = process.env
): string[] {
  if (platform === 'win32') {
    const appData = env.APPDATA || join(homePath, 'AppData', 'Roaming')
    // fnm 默认别名目录:FNM_DIR 显式覆盖,否则 %APPDATA%\fnm,再退 ~\.fnm;Windows 上直接含 node.exe
    const fnmDir = env.FNM_DIR
    const fnmBases = fnmDir ? [fnmDir] : [join(appData, 'fnm'), join(homePath, '.fnm')]
    return [
      join(homePath, '.local', 'bin'), // Claude 官方 Windows 安装位,GUI 启动的用户 PATH 常缺
      join(homePath, 'AppData', 'Local', 'Programs', 'OpenAI', 'Codex', 'bin'), // Codex 官方安装位,同上
      join(homePath, 'AppData', 'Roaming', 'npm'), // npm 全局 shim 目录
      join(homePath, 'AppData', 'Local', 'pnpm'),
      join(homePath, 'AppData', 'Local', 'Yarn', 'bin'),
      join(homePath, '.volta', 'bin'),
      join(homePath, '.bun', 'bin'),
      ...fnmBases.map((base) => join(base, 'aliases', 'default'))
    ]
  }
  // 非 win32 保留 Orca 清单的用户级常用子集;系统目录(/usr/local/bin 等)通常已在 PATH,不重复
  return [
    join(homePath, '.local', 'bin'),
    join(homePath, '.local', 'share', 'pnpm'),
    join(homePath, '.yarn', 'bin'),
    join(homePath, '.volta', 'bin'),
    join(homePath, '.bun', 'bin'),
    join(homePath, '.asdf', 'shims'),
    join(homePath, '.local', 'share', 'mise', 'shims')
  ]
}
