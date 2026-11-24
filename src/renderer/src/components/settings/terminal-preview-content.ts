// 终端外观预览的示例输出(T7)。
// Ported from stablyai/orca src/renderer/src/components/settings/terminal/appearance/terminal-preview-content.ts (MIT)
// Why 移植现成文本:它已覆盖 16 色、斜体、暗淡与背景色,并在 36 列宽度下逐行不折行——
// 预览的价值就是让这些色位同时露面,自己另写一段不会有更好的覆盖。
const RESET = '\x1b[0m'
const DIM = '\x1b[2m'
const ITALIC = '\x1b[3m'
const RED = '\x1b[31m'
const GREEN = '\x1b[32m'
const YELLOW = '\x1b[33m'
const BLUE = '\x1b[34m'
const MAGENTA = '\x1b[35m'
const CYAN = '\x1b[36m'
const BG_GREEN = '\x1b[42m'
const FG_BLACK = '\x1b[30m'

function prompt(): string {
  return `${BLUE}~/orca${RESET} ${MAGENTA}main${RESET} ${YELLOW}*${RESET} $ `
}

// Fit PREVIEW_COLS at the default font so xterm does not wrap preview lines.
const lines: string[] = [
  `${prompt()}npm test`,
  ` ${BG_GREEN}${FG_BLACK} PASS ${RESET} src/preview.test.ts`,
  ` ${GREEN}✓${RESET} renders sample output ${DIM}(3ms)${RESET}`,
  ` ${RED}✗ ligatures: => != >= <= ===${RESET}`,
  ``,
  `${YELLOW}def${RESET} ${CYAN}total${RESET}(xs: list[${CYAN}int${RESET}]) -> ${CYAN}int${RESET}:`,
  `    ${ITALIC}${GREEN}"""Sum the values."""${RESET}`,
  `    ${YELLOW}return${RESET} ${CYAN}sum${RESET}(x ${YELLOW}for${RESET} x ${YELLOW}in${RESET} xs)`,
  ``,
  `${prompt()}git diff`,
  `${CYAN}@@ -1,2 +1,3 @@${RESET}`,
  `${RED}-const size = 13${RESET}`,
  `${GREEN}+const size = 14${RESET}`,
  ``,
  `${prompt()}`
]

// term.write treats LF without carriage return as vertical-only movement; use CRLF to reset each line.
export const PREVIEW_BUFFER = lines.join('\r\n')
