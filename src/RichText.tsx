import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import type { Root } from 'mdast'
import type { Plugin } from 'unified'

const normalizeWrappedMath: Plugin<[], Root> = function () {
  return (tree, file) => {
    let source = String(file)
    let repaired: boolean

    do {
      repaired = false
      for (const node of tree.children) {
        if (node.type !== 'math' || !node.meta) continue
        const start = node.position?.start.offset
        if (start === undefined) continue

        // An opening fence with TeX on the same line is parsed as metadata.
        // Look for its attached closing fence before a blank line or another fence.
        const block = source.slice(start, node.position?.end.offset)
        const match = /^\$\$([^\r\n$]+(?:\r?\n(?=[ \t]*[^ \t\r\n$])[^\r\n$]+)+)\$\$[ \t]*(?=\r?\n|$)/.exec(block)
        if (!match) continue

        source = `${source.slice(0, start)}$$\n${match[1]}\n$$${source.slice(start + match[0].length)}`
        tree = this.parse(source) as Root
        repaired = true
        break
      }
    } while (repaired)

    return tree
  }
}

export default function RichText({ text, className = '' }: { text: string; className?: string }) {
  return <div className={`rich-text ${className}`}><ReactMarkdown remarkPlugins={[remarkMath, normalizeWrappedMath]} rehypePlugins={[rehypeKatex]}>{text}</ReactMarkdown></div>
}
