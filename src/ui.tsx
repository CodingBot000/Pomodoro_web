import { useEffect, useId, useRef } from 'react'
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react'

export function asset(path: string) {
  return import.meta.env.BASE_URL + path
}

export function Button({
  variant = 'text', className = '', type = 'button', ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'text' | 'filled' | 'outline' }) {
  return <button type={type} className={`button button--${variant} ${className}`} {...props} />
}

export function Modal({
  title, className = '', onDismiss, children,
}: { title: string; className?: string; onDismiss: () => void; children: ReactNode }) {
  const id = useId()
  const dialog = useRef<HTMLDialogElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    const element = dialog.current!
    element.showModal()
    heading.current?.focus({ preventScroll: true })
    return () => element.close()
  }, [])

  return (
    <dialog
      ref={dialog}
      className={`modal ${className}`}
      aria-labelledby={id}
      onCancel={(event) => {
        event.preventDefault()
        onDismiss()
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return
        const { top, bottom, left, right } = event.currentTarget.getBoundingClientRect()
        if (event.clientX < left || event.clientX > right || event.clientY < top || event.clientY > bottom) onDismiss()
      }}
    >
      <h2 id={id} ref={heading} className="modal-title" tabIndex={-1}>{title}</h2>
      {children}
    </dialog>
  )
}

type FieldProps = {
  label: string
  invalid?: boolean
} & (
  | ({ multiline: true } & TextareaHTMLAttributes<HTMLTextAreaElement>)
  | ({ multiline?: false } & InputHTMLAttributes<HTMLInputElement>)
)

export function Field({ label, invalid = false, ...props }: FieldProps) {
  const id = useId()
  const { multiline, ...input } = props
  const attributes = { id, 'aria-invalid': invalid || undefined, placeholder: ' ' }

  return (
    <div className="field">
      {multiline
        ? <textarea {...(input as TextareaHTMLAttributes<HTMLTextAreaElement>)} {...attributes} />
        : <input {...(input as InputHTMLAttributes<HTMLInputElement>)} {...attributes} />}
      <label htmlFor={id}>{label}</label>
    </div>
  )
}

export function Switch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="switch">
      <span>{label}</span>
      <input type="checkbox" role="switch" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="switch-track" aria-hidden="true" />
    </label>
  )
}
