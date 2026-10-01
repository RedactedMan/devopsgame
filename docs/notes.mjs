#!/usr/bin/env node
/**
 * Builds docs/SPEAKER_NOTES.pdf, the printable copy of SPEAKER_NOTES.md.
 *
 *   pnpm notes
 *
 * The Markdown is the source; rebuild the PDF whenever it changes. The
 * converter handles only what that file uses: headings, paragraphs, tables,
 * lists, rules, links, and bold, italic and code spans. Inside a slide, every
 * paragraph that isn't a stage direction is script, and set large. Printed for reading
 * at a lectern: large type, each slide kept on one page, the slide name and
 * its time on the left, and the spoken lines set apart from stage directions.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const here = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(join(here, 'SPEAKER_NOTES.md'), 'utf8')

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const inline = (s) =>
  esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/\*\*((?:[^*]|\*[^*]+\*)+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/ -- /g, ' – ')
    .replace(/~(?=\d)/g, '≈')

/** Markdown blocks, split on blank lines, to HTML. */
function render(md) {
  const out = []
  let open = false // inside a slide's <section>
  const close = () => {
    if (open) out.push('</div></section>')
    open = false
  }
  for (const block of md.split(/\n{2,}/)) {
    const text = block.trim()
    if (!text) continue
    const lines = text.split('\n')
    if (text.startsWith('# ')) {
      out.push(`<h1>${inline(text.slice(2))}</h1>`)
    } else if (text.startsWith('## ')) {
      close()
      const m = text.slice(3).match(/^(\d+:\d+)?\s*(.*?)(?:\s*\((.*)\))?$/)
      out.push(
        `<h2>${m[1] ? `<span class="clock">${m[1]}</span>` : ''}${inline(m[2])}` +
          `${m[3] ? `<span class="slot">${inline(m[3])}</span>` : ''}</h2>`,
      )
    } else if (text.startsWith('### ')) {
      close()
      const m = text.slice(4).match(/^(\S+)\s*(?:\((.*)\))?$/)
      out.push(
        `<section class="slide"><div class="name"><b>${esc(m[1])}</b>` +
          `${m[2] ? `<span>${inline(m[2])}</span>` : ''}</div><div class="body">`,
      )
      open = true
    } else if (text === '---') {
      close()
    } else if (text.startsWith('|')) {
      const rows = lines.filter((l) => !/^\|[-| ]+\|$/.test(l))
      const cells = (l) => l.slice(1, -1).split('|').map((c) => inline(c.trim()))
      out.push(
        `<table><thead><tr>${cells(rows[0]).map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>` +
          rows
            .slice(1)
            .map((r) => `<tr>${cells(r).map((c) => `<td>${c}</td>`).join('')}</tr>`)
            .join('') +
          '</tbody></table>',
      )
    } else if (text.startsWith('- ')) {
      const items = text.split(/\n(?=- )/).map((i) => `<li>${inline(i.slice(2).replace(/\n\s*/g, ' '))}</li>`)
      out.push(`<ul>${items.join('')}</ul>`)
    } else {
      const joined = lines.join(' ')
      const say = /^\*\*Say[^*]*\*\*/.test(joined)
      const direction = /^\*[^*]/.test(joined) && joined.endsWith('*')
      const cls = direction ? 'direction' : say || open ? 'say' : ''
      const html = say
        ? inline(joined).replace(/^<strong>(Say[^<]*)<\/strong>\s*/, (_, cue) =>
            cue === 'Say:' ? '' : `<span class="cue">${cue}</span> `,
          )
        : inline(joined)
      out.push(`<p${cls ? ` class="${cls}"` : ''}>${html}</p>`)
    }
  }
  close()
  return out.join('\n')
}

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Speaker notes</title>
<style>
  @page { size: Letter; margin: 0.6in 0.65in 0.7in; }
  * { box-sizing: border-box; }
  body { font: 13pt/1.45 Georgia, 'Times New Roman', serif; color: #111; margin: 0; }
  h1 { font: 700 22pt/1.2 Helvetica, Arial, sans-serif; margin: 0 0 8pt; }
  h2 { font: 700 15pt/1.2 Helvetica, Arial, sans-serif; margin: 22pt 0 8pt; padding: 6pt 0;
       border-bottom: 2pt solid #111; break-after: avoid; display: flex; gap: 10pt; align-items: baseline; }
  h2 .clock { font-family: 'Courier New', monospace; }
  h2 .slot { margin-left: auto; font: 400 10pt Helvetica, Arial, sans-serif; color: #555; }
  p, li { margin: 0 0 7pt; }
  code { font: 0.85em 'Courier New', monospace; }
  table { border-collapse: collapse; width: 100%; font: 10pt/1.3 Helvetica, Arial, sans-serif; margin: 6pt 0 10pt; }
  th, td { border: 0.75pt solid #999; padding: 3pt 5pt; text-align: left; vertical-align: top; }
  th { background: #eee; }
  ul { padding-left: 16pt; font-size: 11.5pt; }
  .slide { display: grid; grid-template-columns: 1.15in 1fr; gap: 12pt; padding: 8pt 0;
           border-bottom: 0.75pt solid #ccc; break-inside: avoid; }
  .slide .name { font: 10pt/1.3 Helvetica, Arial, sans-serif; }
  .slide .name b { display: block; font-size: 12pt; text-transform: uppercase; letter-spacing: 0.04em; }
  .slide .name span { color: #555; }
  .say { font-size: 14pt; line-height: 1.5; }
  .say .cue { font: italic 10.5pt Helvetica, Arial, sans-serif; color: #444; }
  .direction { font: italic 10.5pt/1.35 Helvetica, Arial, sans-serif; color: #444;
               border-left: 3pt solid #bbb; padding-left: 7pt; }
  h1 + p, h1 ~ p:not(.say):not(.direction) { font-size: 11pt; }
</style></head><body>
${render(src)}
</body></html>`

const outHtml = join(here, '..', 'node_modules', '.speaker-notes.html')
writeFileSync(outHtml, html)

const bundled = process.env.PLAYWRIGHT_BROWSERS_PATH && join(process.env.PLAYWRIGHT_BROWSERS_PATH, 'chromium')
const browser = await chromium.launch(
  bundled && existsSync(bundled) ? { executablePath: bundled } : { channel: 'chrome' },
)
const page = await browser.newPage()
await page.goto(`file://${outHtml}`)
await page.pdf({
  path: join(here, 'SPEAKER_NOTES.pdf'),
  format: 'Letter',
  preferCSSPageSize: true,
  displayHeaderFooter: true,
  headerTemplate: '<span></span>',
  footerTemplate:
    '<div style="font:9px Helvetica,Arial,sans-serif;color:#666;width:100%;padding:0 0.65in;display:flex">' +
    '<span>Flow State · speaker notes</span><span style="margin-left:auto">' +
    '<span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',
})
await browser.close()
console.log('wrote docs/SPEAKER_NOTES.pdf')
