import { Extension } from '@tiptap/core'
import Highlight from '@tiptap/extension-highlight'
import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'
import Subscript from '@tiptap/extension-subscript'
import Superscript from '@tiptap/extension-superscript'
import Underline from '@tiptap/extension-underline'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import {
  Bold,
  Braces,
  Code,
  Highlighter,
  ImagePlus,
  Italic,
  List,
  ListOrdered,
  Redo2,
  SquareCode,
  Strikethrough,
  Subscript as SubIcon,
  Superscript as SupIcon,
  Underline as UnderlineIcon,
  Undo2,
} from 'lucide-react'
import { useEffect, useReducer, useRef, type ReactNode } from 'react'

const TB = 17

export function normalizeHtml(html: string): string {
  return html === '<p></p>' ? '' : html
}

/** Wrap the selection (or the word at the cursor) in `{{ }}` to make a cloze blank. */
export function makeBlank(editor: Editor) {
  const { from, to } = editor.state.selection
  const text = editor.state.doc.textBetween(from, to, ' ')
  if (text) editor.chain().focus().insertContentAt({ from, to }, `{{${text}}}`).run()
  else editor.chain().focus().insertContent('{{}}').setTextSelection(from + 2).run()
}

/** Downscale an image file to a JPEG data URL so cards stay small enough to sync. */
export async function fileToDataUrl(file: File, max = 1200): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new window.Image()
      i.onload = () => res(i)
      i.onerror = rej
      i.src = url
    })
    const scale = Math.min(1, max / Math.max(img.width, img.height))
    const c = document.createElement('canvas')
    c.width = Math.round(img.width * scale)
    c.height = Math.round(img.height * scale)
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
    return c.toDataURL('image/jpeg', 0.82)
  } finally {
    URL.revokeObjectURL(url)
  }
}

interface Props {
  value: string
  placeholder: string
  autofocus?: boolean
  onChange: (html: string) => void
  /** Tab outside a list moves to the next field; return value unused. */
  onTab?: () => void
  onShiftTab?: () => void
  /** Hands the editor up so one shared toolbar (EditorToolbar) can drive whichever side is active. */
  onEditor?: (editor: Editor | null) => void
  /** When this turns true the editor takes focus (used for Tab between sides). */
  focused?: boolean
}

export function RichEditor({ value, placeholder, autofocus, onChange, onTab, onShiftTab, onEditor, focused }: Props) {
  // Keep latest callbacks in refs so the editor (created once) always calls the current ones.
  const cb = useRef({ onChange, onTab, onShiftTab, placeholder })
  cb.current = { onChange, onTab, onShiftTab, placeholder }

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Highlight,
      Subscript,
      Superscript,
      Image.configure({ allowBase64: true }),
      Placeholder.configure({ placeholder: () => cb.current.placeholder }),
      Extension.create({
        name: 'cardKeys',
        addKeyboardShortcuts() {
          return {
            'Mod-Shift-c': () => {
              makeBlank(this.editor as Editor)
              return true
            },
            Tab: () => {
              if (this.editor.isActive('listItem') || !cb.current.onTab) return false
              cb.current.onTab()
              return true
            },
            'Shift-Tab': () => {
              if (this.editor.isActive('listItem') || !cb.current.onShiftTab) return false
              cb.current.onShiftTab()
              return true
            },
          }
        },
      }),
    ],
    content: value,
    autofocus: autofocus ? 'end' : false,
    onUpdate: ({ editor }) => cb.current.onChange(normalizeHtml(editor.getHTML())),
  })

  // Pick up outside changes (e.g. swap sides) without clobbering what is being typed.
  useEffect(() => {
    if (editor && !editor.isFocused && normalizeHtml(editor.getHTML()) !== value) {
      editor.commands.setContent(value, false)
    }
  }, [editor, value])

  useEffect(() => {
    if (editor && focused && !editor.isFocused) editor.commands.focus('end')
  }, [editor, focused])

  useEffect(() => {
    onEditor?.(editor)
    return () => onEditor?.(null)
  }, [editor]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!editor) return null

  return (
    <div>
      <EditorContent editor={editor} className="rich" />
    </div>
  )
}

/** Formatting buttons for one editor. Stays in one place above both sides; buttons wait while no side is ready. */
export function EditorToolbar({ editor }: { editor: Editor | null | undefined }) {
  const fileRef = useRef<HTMLInputElement>(null)
  // Re-render on every change so the active marks (bold, lists...) stay current.
  const [, rerender] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    if (!editor) return
    editor.on('transaction', rerender)
    return () => void editor.off('transaction', rerender)
  }, [editor])

  const btn = (label: string, icon: ReactNode, run: (e: Editor) => void, active?: (e: Editor) => boolean) => (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={!editor}
      className={editor && active?.(editor) ? 'active' : ''}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => editor && run(editor)}
    >
      {icon}
    </button>
  )
  const ch = (e: Editor) => e.chain().focus()
  const is = (name: string) => (e: Editor) => e.isActive(name)

  return (
    <div className="toolbar">
      {btn('Bold', <Bold size={TB} />, (e) => ch(e).toggleBold().run(), is('bold'))}
      {btn('Italic', <Italic size={TB} />, (e) => ch(e).toggleItalic().run(), is('italic'))}
      {btn('Underline', <UnderlineIcon size={TB} />, (e) => ch(e).toggleUnderline().run(), is('underline'))}
      {btn('Strikethrough', <Strikethrough size={TB} />, (e) => ch(e).toggleStrike().run(), is('strike'))}
      {btn('Highlight', <Highlighter size={TB} />, (e) => ch(e).toggleHighlight().run(), is('highlight'))}
      <span className="sep" />
      {btn('Inline code', <Code size={TB} />, (e) => ch(e).toggleCode().run(), is('code'))}
      {btn('Code block', <SquareCode size={TB} />, (e) => ch(e).toggleCodeBlock().run(), is('codeBlock'))}
      {btn('Subscript', <SubIcon size={TB} />, (e) => ch(e).toggleSubscript().run(), is('subscript'))}
      {btn('Superscript', <SupIcon size={TB} />, (e) => ch(e).toggleSuperscript().run(), is('superscript'))}
      {btn('Bullet list', <List size={TB} />, (e) => ch(e).toggleBulletList().run(), is('bulletList'))}
      {btn('Numbered list', <ListOrdered size={TB} />, (e) => ch(e).toggleOrderedList().run(), is('orderedList'))}
      <span className="sep" />
      {btn('Make blank (Cmd+Shift+C)', <Braces size={TB} />, makeBlank)}
      {btn('Insert image', <ImagePlus size={TB} />, () => fileRef.current?.click())}
      {btn('Undo', <Undo2 size={TB} />, (e) => ch(e).undo().run())}
      {btn('Redo', <Redo2 size={TB} />, (e) => ch(e).redo().run())}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={async (ev) => {
          const f = ev.target.files?.[0]
          ev.target.value = ''
          if (f && editor) ch(editor).setImage({ src: await fileToDataUrl(f) }).run()
        }}
      />
    </div>
  )
}
