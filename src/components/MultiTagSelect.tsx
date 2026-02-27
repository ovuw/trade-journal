import { memo } from 'react'
import { X } from 'lucide-react'

interface Option {
  id: string
  name: string
  color?: string
}

interface MultiTagSelectProps {
  label: string
  options: Option[]
  selected: string[]
  onChange: (selected: string[]) => void
}

function MultiTagSelect({ label, options, selected, onChange }: MultiTagSelectProps) {
  const toggle = (id: string) => {
    onChange(
      selected.includes(id)
        ? selected.filter(s => s !== id)
        : [...selected, id]
    )
  }

  return (
    <div>
      <p className="text-xs text-text-secondary mb-2">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map(opt => {
          const isSelected = selected.includes(opt.id)
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => toggle(opt.id)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border transition-all ${
                isSelected
                  ? 'text-white border-transparent'
                  : 'border-border text-text-secondary hover:border-text-secondary hover:text-text-primary'
              }`}
              style={
                isSelected
                  ? { backgroundColor: opt.color ?? '#58a6ff', borderColor: opt.color ?? '#58a6ff' }
                  : undefined
              }
            >
              {opt.name}
              {isSelected && <X size={10} className="ml-0.5" />}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default memo(MultiTagSelect)
