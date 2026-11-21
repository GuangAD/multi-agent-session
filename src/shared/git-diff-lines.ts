// unified diff 行分类(纯函数,T10 接缝 parseDiffLines 的实现)
// Why 落 shared 而非 main:主进程的解析接缝(契约落点 src/main/git-service.ts 再导出本文件)与
// 渲染层 DiffView 的行着色必须用同一套分类规则,两份实现会漂移;本文件不依赖任何 Node API。
export interface DiffLine {
  type: 'added' | 'removed' | 'context' | 'other'
  text: string
}

// diff 头行(diff --git / index / +++ / --- / @@ / \ No newline / rename / mode 等)一律 other
const DIFF_HEADER_PREFIXES = [
  'diff ',
  'index ',
  '+++',
  '---',
  '@@',
  '\\',
  'new file ',
  'deleted file ',
  'old mode ',
  'new mode ',
  'similarity ',
  'dissimilarity ',
  'rename ',
  'copy ',
  'Binary files '
]

function classifyDiffLine(line: string): DiffLine['type'] {
  if (DIFF_HEADER_PREFIXES.some((prefix) => line.startsWith(prefix))) {
    return 'other'
  }
  if (line.startsWith('+')) {
    return 'added'
  }
  if (line.startsWith('-')) {
    return 'removed'
  }
  // 其余都是 diff 正文的上下文行(以单个空格开头;空行也算)
  return 'context'
}

// 逐行分类 unified diff;空输入 → 空数组
export function parseDiffLines(raw: string): DiffLine[] {
  if (raw === '') {
    return []
  }
  const lines = raw.split(/\r?\n/)
  // 去掉输出末尾的分隔换行造成的空尾行(否则会多数一条虚假上下文行)
  if (lines[lines.length - 1] === '') {
    lines.pop()
  }
  return lines.map((text) => ({ type: classifyDiffLine(text), text }))
}
