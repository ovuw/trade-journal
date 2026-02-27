import { memo } from 'react'
import { Star } from 'lucide-react'

interface StarRatingProps {
  value: number
  onChange: (value: number) => void
  label?: string
}

function StarRating({ value, onChange, label }: StarRatingProps) {
  return (
    <div>
      {label && <p className="text-xs text-text-secondary mb-1.5">{label}</p>}
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className="p-0.5 transition-transform hover:scale-110"
          >
            <Star
              size={18}
              className={
                n <= value
                  ? 'text-warning fill-warning'
                  : 'text-text-muted hover:text-text-secondary'
              }
            />
          </button>
        ))}
      </div>
    </div>
  )
}

export default memo(StarRating)
