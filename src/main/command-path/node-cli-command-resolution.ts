// Ported from stablyai/orca src/shared/shell/command-resolution/node-cli-command-resolution.ts (MIT)
// Why: 只取 getExecutableNames——Windows 上 agent CLI 常以 .cmd/.exe/.bat 或无扩展名 shim 形态安装,
// 探测时需要按平台展开候选可执行名。原文件的 fnm/nvm/系统安装目录发现树不移植(本仓检测只走 PATH)。

export function getExecutableNames(platform: NodeJS.Platform, commandName: string): string[] {
  if (platform === 'win32') {
    return [`${commandName}.cmd`, `${commandName}.exe`, `${commandName}.bat`, commandName]
  }

  return [commandName]
}
