// agent 品牌图标(M7:首字母字母块 → 品牌 SVG;来源与许可见各组件注释)
// 固定比例:viewBox 锁死为「实测墨迹紧贴框」(200px 渲染逐像素量得),渲染层只调 size;
// 单色图标 fill="currentColor",颜色由 AgentBadge 按 agent 固定;Antigravity 用官方
// 多色原文件整体内联(彩色挂在嵌套 <g> + defs 高斯模糊滤镜上,不可拆),根节点
// fill:none 用内联 style 写死,防止外层 CSS 的 fill 规则覆盖官方配色。来源:
//   Claude        星芒      Wikimedia 公有领域版(与 claude.ai 官方同形)
//   Codex         ChatGPT 结环   simple-icons(CC0)
//   Antigravity   官方全彩 A 形   antigravity.google/press(全彩版)
//   Pi            三方块    pi.dev/press-kit 官方 logo.svg
//   Kimi          K + 蓝点  官方形态简化(蓝点=品牌蓝,随前景同色)
import type { AgentId } from '../../shared/types'

export function ClaudeIcon({ size }: { size: number }): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden fill="currentColor">
      <path d="m19.6 66.5 19.7-11 .3-1-.3-.5h-1l-3.3-.2-11.2-.3L14 53l-9.5-.5-2.4-.5L0 49l.2-1.5 2-1.3 2.9.2 6.3.5 9.5.6 6.9.4L38 49.1h1.6l.2-.7-.5-.4-.4-.4L29 41l-10.6-7-5.6-4.1-3-2-1.5-2-.6-4.2 2.7-3 3.7.3.9.2 3.7 2.9 8 6.1L37 36l1.5 1.2.6-.4.1-.3-.7-1.1L33 25l-6-10.4-2.7-4.3-.7-2.6c-.3-1-.4-2-.4-3l3-4.2L28 0l4.2.6L33.8 2l2.6 6 4.1 9.3L47 29.9l2 3.8 1 3.4.3 1h.7v-.5l.5-7.2 1-8.7 1-11.2.3-3.2 1.6-3.8 3-2L61 2.6l2 2.9-.3 1.8-1.1 7.7L59 27.1l-1.5 8.2h.9l1-1.1 4.1-5.4 6.9-8.6 3-3.5L77 13l2.3-1.8h4.3l3.1 4.7-1.4 4.9-4.4 5.6-3.7 4.7-5.3 7.1-3.2 5.7.3.4h.7l12-2.6 6.4-1.1 7.6-1.3 3.5 1.6.4 1.6-1.4 3.4-8.2 2-9.6 2-14.3 3.3-.2.1.2.3 6.4.6 2.8.2h6.8l12.6 1 3.3 2 1.9 2.7-.3 2-5.1 2.6-6.8-1.6-16-3.8-5.4-1.3h-.8v.4l4.6 4.5 8.3 7.5L89 80.1l.5 2.4-1.3 2-1.4-.2-9.2-7-3.6-3-8-6.8h-.5v.7l1.8 2.7 9.8 14.7.5 4.5-.7 1.4-2.6 1-2.7-.6-5.8-8-6-9-4.7-8.2-.5.4-2.9 30.2-1.3 1.5-3 1.2-2.5-2-1.4-3 1.4-6.2 1.6-8 1.3-6.4 1.2-7.9.7-2.6v-.2H49L43 72l-9 12.3-7.2 7.6-1.7.7-3-1.5.3-2.8L24 86l10-12.8 6-7.9 4-4.6-.1-.5h-.3L17.2 77.4l-4.7.6-2-2 .2-3 1-1 8-5.5Z" />
    </svg>
  )
}

export function CodexIcon({ size }: { size: number }): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden fill="currentColor">
      <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z" />
    </svg>
  )
}

export function AntigravityIcon({ size }: { size: number }): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="17.1 22.5 145.8 135"
      aria-hidden
      style={{ fill: 'none' }}
    >
      <path
        d="M144.248 149.062C151.748 154.688 162.998 150.938 152.685 140.625C121.748 110.625 128.31 28.125 89.8727 28.125C51.4352 28.125 57.9977 110.625 27.0602 140.625C15.8102 151.875 27.9977 154.688 35.4977 149.062C64.5602 129.375 62.6852 94.6875 89.8727 94.6875C117.06 94.6875 115.185 129.375 144.248 149.062Z"
        fill="#3186FF"
      />
      <mask
        id="mask0_6001_409"
        style={{ maskType: 'alpha' }}
        maskUnits="userSpaceOnUse"
        x="22"
        y="28"
        width="136"
        height="125"
      >
        <path
          d="M144.248 149.062C151.748 154.688 162.998 150.938 152.685 140.625C121.748 110.625 128.31 28.125 89.8727 28.125C51.4352 28.125 57.9977 110.625 27.0602 140.625C15.8102 151.875 27.9977 154.688 35.4977 149.062C64.5602 129.375 62.6852 94.6875 89.8727 94.6875C117.06 94.6875 115.185 129.375 144.248 149.062Z"
          fill="#fff"
        />
      </mask>
      <g mask="url(#mask0_6001_409)">
        <g filter="url(#filter0_f_6001_409)">
          <ellipse
            cx="36.6225"
            cy="43.0872"
            rx="36.6225"
            ry="43.0872"
            transform="matrix(-0.112784 0.99362 -0.99362 -0.112781 106.557 -26.4847)"
            fill="#FFE432"
          />
        </g>
        <g filter="url(#filter1_f_6001_409)">
          <ellipse
            cx="155.163"
            cy="54.9292"
            rx="47.4118"
            ry="48.4541"
            transform="rotate(76.9243 155.163 54.9292)"
            fill="#FC413D"
          />
        </g>
        <g filter="url(#filter2_f_6001_409)">
          <ellipse
            cx="14.6006"
            cy="65.4425"
            rx="49.5515"
            ry="64.192"
            transform="rotate(74.1257 14.6006 65.4425)"
            fill="#00B95C"
          />
        </g>
        <g filter="url(#filter3_f_6001_409)">
          <ellipse
            cx="14.6006"
            cy="65.4425"
            rx="49.5515"
            ry="64.192"
            transform="rotate(74.1257 14.6006 65.4425)"
            fill="#00B95C"
          />
        </g>
        <g filter="url(#filter4_f_6001_409)">
          <ellipse
            cx="18.1226"
            cy="67.414"
            rx="48.5679"
            ry="53.4688"
            transform="rotate(45.6065 18.1226 67.414)"
            fill="#00B95C"
          />
        </g>
        <g filter="url(#filter5_f_6001_409)">
          <ellipse
            cx="121.837"
            cy="166.945"
            rx="46.6356"
            ry="44.9084"
            transform="rotate(76.9243 121.837 166.945)"
            fill="#3186FF"
          />
        </g>
        <g filter="url(#filter6_f_6001_409)">
          <ellipse
            cx="53.9456"
            cy="56.8997"
            rx="53.9456"
            ry="56.8997"
            transform="matrix(-0.409539 0.912293 -0.912294 -0.409537 162.811 -25.895)"
            fill="#FBBC04"
          />
        </g>
        <g filter="url(#filter7_f_6001_409)">
          <path
            d="M4.21557 239.063C-25.3231 227.467 25.1577 132.061 37.7105 100.085C50.2634 68.1097 84.3853 51.5888 113.924 63.1848C143.463 74.7809 178.474 138.65 165.921 170.626C153.368 202.601 33.7543 250.659 4.21557 239.063Z"
            fill="#3186FF"
          />
        </g>
        <g filter="url(#filter8_f_6001_409)">
          <path
            d="M183.197 120.315C175.289 129.545 154.652 124.839 137.102 109.803C119.553 94.7668 111.738 75.0955 119.646 65.8656C127.554 56.6357 148.191 61.3423 165.74 76.3782C183.289 91.414 191.105 111.085 183.197 120.315Z"
            fill="#749BFF"
          />
        </g>
        <g filter="url(#filter9_f_6001_409)">
          <ellipse
            cx="148.928"
            cy="36.7252"
            rx="71.1018"
            ry="44.199"
            transform="rotate(34.0763 148.928 36.7252)"
            fill="#FC413D"
          />
        </g>
        <g filter="url(#filter10_f_6001_409)">
          <ellipse
            cx="37.848"
            cy="46.0346"
            rx="38.1008"
            ry="22.1575"
            transform="rotate(112.516 37.848 46.0346)"
            fill="#FFEE48"
          />
        </g>
      </g>
      <defs>
        <filter
          id="filter0_f_6001_409"
          x="4.09591"
          y="-44.1761"
          width="111.037"
          height="98.4416"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feGaussianBlur stdDeviation="6.25234" />
        </filter>
        <filter
          id="filter1_f_6001_409"
          x="46.2974"
          y="-53.0009"
          width="217.731"
          height="215.86"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feGaussianBlur stdDeviation="30.2268" />
        </filter>
        <filter
          id="filter2_f_6001_409"
          x="-100.018"
          y="-36.7558"
          width="229.238"
          height="204.397"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feGaussianBlur stdDeviation="25.6957" />
        </filter>
        <filter
          id="filter3_f_6001_409"
          x="-100.018"
          y="-36.7558"
          width="229.238"
          height="204.397"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feGaussianBlur stdDeviation="25.6957" />
        </filter>
        <filter
          id="filter4_f_6001_409"
          x="-84.3985"
          y="-35.003"
          width="205.042"
          height="204.834"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feGaussianBlur stdDeviation="25.6957" />
        </filter>
        <filter
          id="filter5_f_6001_409"
          x="27.9915"
          y="71.5493"
          width="187.691"
          height="190.791"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feGaussianBlur stdDeviation="24.4184" />
        </filter>
        <filter
          id="filter6_f_6001_409"
          x="-11.8808"
          y="-98.7085"
          width="201.38"
          height="197.45"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feGaussianBlur stdDeviation="22.1301" />
        </filter>
        <filter
          id="filter7_f_6001_409"
          x="-44.4432"
          y="19.9522"
          width="252.513"
          height="260.404"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feGaussianBlur stdDeviation="19.7631" />
        </filter>
        <filter
          id="filter8_f_6001_409"
          x="81.1915"
          y="25.7722"
          width="140.46"
          height="134.637"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feGaussianBlur stdDeviation="17.6843" />
        </filter>
        <filter
          id="filter9_f_6001_409"
          x="55.1499"
          y="-47.2531"
          width="187.555"
          height="167.957"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feGaussianBlur stdDeviation="14.9365" />
        </filter>
        <filter
          id="filter10_f_6001_409"
          x="-24.2633"
          y="-27.1515"
          width="124.223"
          height="146.372"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feGaussianBlur stdDeviation="18.4865" />
        </filter>
      </defs>
    </svg>
  )
}

export function PiIcon({ size }: { size: number }): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="164.8 164.8 470.4 470.4"
      aria-hidden
      fill="currentColor"
    >
      <path d="M165.29 165.29H517.36V400H400V282.65H165.29Z" />
      <path d="M165.29 282.65H282.65V400H400V517.36H282.65V634.72H165.29Z" />
      <path d="M517.36 400H634.72V634.72H517.36Z" />
    </svg>
  )
}

export function KimiIcon({ size }: { size: number }): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="5.6 3.4 15.3 15.6" aria-hidden fill="currentColor">
      <path d="M6.2 5.6h2.9v5.1l4.2-5.1h3.4l-4.9 5.9 5 6.9h-3.5l-4.2-6v6H6.2Z" />
      <circle cx="18.4" cy="5.9" r="1.9" />
    </svg>
  )
}

// agentId → 图标组件;固定色见 agents-display 的 AGENT_COLORS
export const AGENT_ICONS: Record<AgentId, (props: { size: number }) => React.JSX.Element> = {
  claude: ClaudeIcon,
  codex: CodexIcon,
  antigravity: AntigravityIcon,
  pi: PiIcon,
  kimi: KimiIcon
}
