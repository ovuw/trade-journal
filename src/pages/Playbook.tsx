import { useState, useRef } from 'react'
import { Plus, Pencil, Trash2, ChevronUp, ChevronDown, Check, X, BookOpen } from 'lucide-react'
import {
  getRules,
  saveRules,
  getChecklistItems,
  saveChecklistItems,
  getPlaybookNotes,
  savePlaybookNotes,
} from '../lib/db'
import { Rule, ChecklistItem } from '../types'

// ─── Constants ────────────────────────────────────────────────────────────────

const RULE_CATEGORIES = ['Risk', 'Entry', 'Exit', 'Psychology', 'Process'] as const
type RuleCategory = (typeof RULE_CATEGORIES)[number]

const CATEGORY_COLORS: Record<string, string> = {
  Risk: 'bg-loss/15 text-loss',
  Entry: 'bg-profit/15 text-profit',
  Exit: 'bg-accent/15 text-accent',
  Psychology: 'bg-warning/15 text-warning',
  Process: 'bg-text-muted/15 text-text-secondary',
}

const EMPTY_RULE_FORM = { name: '', description: '', category: 'Risk' as RuleCategory }

// ─── Helper ───────────────────────────────────────────────────────────────────

function newId(): string {
  return `rule-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

// ─── Rule Form (add / edit) ───────────────────────────────────────────────────

function RuleForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: { name: string; description: string; category: string }
  onSave: (data: { name: string; description: string; category: string }) => void
  onCancel: () => void
}) {
  const [form, setForm] = useState(initial)
  const nameRef = useRef<HTMLInputElement>(null)

  const handleSave = () => {
    if (!form.name.trim()) {
      nameRef.current?.focus()
      return
    }
    onSave(form)
  }

  return (
    <div className="bg-bg-secondary border border-accent/40 rounded-lg p-4 space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <label className="text-xs text-text-secondary block mb-1">Rule name *</label>
          <input
            ref={nameRef}
            type="text"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="e.g. Always set stop before entry"
            className="input text-sm"
            autoFocus
          />
        </div>
        <div>
          <label className="text-xs text-text-secondary block mb-1">Category</label>
          <select
            value={form.category}
            onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
            className="input text-sm"
          >
            {RULE_CATEGORIES.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="text-xs text-text-secondary block mb-1">Description (optional)</label>
        <textarea
          value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          placeholder="Why does this rule exist? What happens when you break it?"
          rows={2}
          className="input text-sm resize-none"
        />
      </div>
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="btn-secondary text-sm py-1.5 px-3">
          Cancel
        </button>
        <button type="button" onClick={handleSave} className="btn-primary text-sm py-1.5 px-4">
          Save Rule
        </button>
      </div>
    </div>
  )
}

// ─── Toggle Switch ────────────────────────────────────────────────────────────

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 ${
        on ? 'bg-profit' : 'bg-bg-hover'
      }`}
      title={on ? 'Active (shows on trade form)' : 'Inactive (hidden from trade form)'}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
          on ? 'translate-x-[18px]' : 'translate-x-[3px]'
        }`}
      />
    </button>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Playbook() {
  // ── Rules state ──
  const [rules, setRules] = useState<Rule[]>(() => getRules())
  const [editingId, setEditingId] = useState<string | null>(null) // null = none, 'new' = adding
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  // ── Checklist state ──
  const [items, setItems] = useState<ChecklistItem[]>(() => getChecklistItems())
  const [newItemLabel, setNewItemLabel] = useState('')
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editingItemLabel, setEditingItemLabel] = useState('')

  // ── Notes state ──
  const [notes, setNotes] = useState(() => getPlaybookNotes())
  const [notesDirty, setNotesDirty] = useState(false)
  const [notesSaved, setNotesSaved] = useState(false)

  // ─── Rules helpers ────────────────────────────────────────────────────────

  const persistRules = (updated: Rule[]) => {
    setRules(updated)
    saveRules(updated)
  }

  const handleAddRule = (data: { name: string; description: string; category: string }) => {
    const newRule: Rule = {
      id: newId(),
      name: data.name.trim(),
      description: data.description.trim(),
      category: data.category,
      is_active: true,
    }
    persistRules([...rules, newRule])
    setEditingId(null)
  }

  const handleEditRule = (id: string, data: { name: string; description: string; category: string }) => {
    persistRules(rules.map(r =>
      r.id === id
        ? { ...r, name: data.name.trim(), description: data.description.trim(), category: data.category }
        : r
    ))
    setEditingId(null)
  }

  const handleToggleRule = (id: string) => {
    persistRules(rules.map(r => r.id === id ? { ...r, is_active: !r.is_active } : r))
  }

  const handleDeleteRule = (id: string) => {
    persistRules(rules.filter(r => r.id !== id))
    setDeleteConfirm(null)
  }

  // ─── Checklist helpers ────────────────────────────────────────────────────

  const persistItems = (updated: ChecklistItem[]) => {
    const reindexed = updated.map((it, i) => ({ ...it, order_index: i }))
    setItems(reindexed)
    saveChecklistItems(reindexed)
  }

  const handleAddItem = () => {
    if (!newItemLabel.trim()) return
    const newItem: ChecklistItem = {
      id: `cl-${Date.now()}`,
      label: newItemLabel.trim(),
      order_index: items.length,
      is_active: true,
    }
    persistItems([...items, newItem])
    setNewItemLabel('')
  }

  const handleToggleItem = (id: string) => {
    persistItems(items.map(it => it.id === id ? { ...it, is_active: !it.is_active } : it))
  }

  const handleDeleteItem = (id: string) => {
    persistItems(items.filter(it => it.id !== id))
  }

  const handleMoveItem = (id: string, dir: -1 | 1) => {
    const idx = items.findIndex(it => it.id === id)
    if (idx < 0) return
    const next = idx + dir
    if (next < 0 || next >= items.length) return
    const arr = [...items]
    ;[arr[idx], arr[next]] = [arr[next], arr[idx]]
    persistItems(arr)
  }

  const handleSaveItemLabel = (id: string) => {
    if (!editingItemLabel.trim()) return
    persistItems(items.map(it => it.id === id ? { ...it, label: editingItemLabel.trim() } : it))
    setEditingItemId(null)
    setEditingItemLabel('')
  }

  // ─── Notes helpers ─────────────────────────────────────────────────────────

  const handleNotesChange = (v: string) => {
    setNotes(v)
    setNotesDirty(true)
    setNotesSaved(false)
  }

  const handleNotesSave = () => {
    savePlaybookNotes(notes)
    setNotesDirty(false)
    setNotesSaved(true)
    setTimeout(() => setNotesSaved(false), 2000)
  }

  // ─── Filtered rules ───────────────────────────────────────────────────────

  const filteredRules = categoryFilter === 'all'
    ? rules
    : rules.filter(r => r.category === categoryFilter)

  const activeCount = rules.filter(r => r.is_active).length

  return (
    <div className="p-6 space-y-6 max-w-4xl">

      {/* ── Header ── */}
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Playbook</h1>
        <p className="text-text-secondary text-sm mt-0.5">
          Your trading rules, pre-market checklist, and strategy notes
        </p>
      </div>

      {/* ════════════════════════════════════════════
          SECTION 1: TRADING RULES
      ════════════════════════════════════════════ */}
      <div className="bg-bg-card border border-border rounded-lg overflow-hidden">
        {/* Section header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="text-base font-semibold text-text-primary">Trading Rules</h2>
            <p className="text-xs text-text-muted mt-0.5">
              {activeCount} active · {rules.length} total · active rules appear on the trade form
            </p>
          </div>
          <button
            onClick={() => setEditingId(editingId === 'new' ? null : 'new')}
            className="btn-primary text-sm py-1.5 px-3 flex items-center gap-1.5"
          >
            <Plus size={14} />
            Add Rule
          </button>
        </div>

        <div className="p-4 space-y-3">
          {/* Add rule form */}
          {editingId === 'new' && (
            <RuleForm
              initial={EMPTY_RULE_FORM}
              onSave={handleAddRule}
              onCancel={() => setEditingId(null)}
            />
          )}

          {/* Category filter */}
          <div className="flex gap-1.5 flex-wrap">
            {(['all', ...RULE_CATEGORIES] as const).map(cat => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`px-3 py-1 text-xs rounded-full border transition-colors capitalize ${
                  categoryFilter === cat
                    ? 'border-accent text-accent bg-accent/10'
                    : 'border-border text-text-muted hover:text-text-primary hover:border-text-muted'
                }`}
              >
                {cat === 'all' ? `All (${rules.length})` : `${cat} (${rules.filter(r => r.category === cat).length})`}
              </button>
            ))}
          </div>

          {/* Rules list */}
          {filteredRules.length === 0 ? (
            <p className="text-text-muted text-sm text-center py-6">
              {rules.length === 0 ? 'No rules yet. Add your first rule.' : 'No rules in this category.'}
            </p>
          ) : (
            <div className="space-y-2">
              {filteredRules.map(rule => (
                <div key={rule.id}>
                  {editingId === rule.id ? (
                    <RuleForm
                      initial={{ name: rule.name, description: rule.description, category: rule.category }}
                      onSave={data => handleEditRule(rule.id, data)}
                      onCancel={() => setEditingId(null)}
                    />
                  ) : (
                    <div
                      className={`flex items-start gap-3 px-4 py-3 rounded-lg border transition-colors ${
                        rule.is_active
                          ? 'border-border bg-bg-secondary'
                          : 'border-border/50 bg-bg-secondary/40 opacity-60'
                      }`}
                    >
                      {/* Active toggle */}
                      <div className="pt-0.5">
                        <Toggle on={rule.is_active} onChange={() => handleToggleRule(rule.id)} />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-sm font-medium ${rule.is_active ? 'text-text-primary' : 'text-text-muted'}`}>
                            {rule.name}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[rule.category] ?? 'bg-bg-hover text-text-muted'}`}>
                            {rule.category}
                          </span>
                        </div>
                        {rule.description && (
                          <p className="text-xs text-text-muted mt-0.5 leading-relaxed">{rule.description}</p>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 shrink-0">
                        {deleteConfirm === rule.id ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-text-muted">Delete?</span>
                            <button
                              onClick={() => handleDeleteRule(rule.id)}
                              className="text-xs px-2 py-1 bg-loss/20 text-loss rounded hover:bg-loss/30 transition-colors"
                            >
                              Yes
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(null)}
                              className="text-xs px-2 py-1 bg-bg-hover text-text-muted rounded hover:bg-bg-card transition-colors"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <>
                            <button
                              onClick={() => setEditingId(rule.id)}
                              className="p-1.5 text-text-muted hover:text-text-primary hover:bg-bg-hover rounded transition-colors"
                              title="Edit rule"
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(rule.id)}
                              className="p-1.5 text-text-muted hover:text-loss hover:bg-loss/10 rounded transition-colors"
                              title="Delete rule"
                            >
                              <Trash2 size={13} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ════════════════════════════════════════════
          SECTION 2: PRE-MARKET CHECKLIST
      ════════════════════════════════════════════ */}
      <div className="bg-bg-card border border-border rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="text-base font-semibold text-text-primary">Pre-Market Checklist</h2>
            <p className="text-xs text-text-muted mt-0.5">
              {items.filter(i => i.is_active).length} active items · shown on the Dashboard every morning
            </p>
          </div>
        </div>

        <div className="p-4 space-y-2">
          {items.length === 0 && (
            <p className="text-text-muted text-sm text-center py-4">No checklist items yet.</p>
          )}

          {items.map((item, idx) => (
            <div
              key={item.id}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border transition-colors ${
                item.is_active ? 'border-border bg-bg-secondary' : 'border-border/50 bg-bg-secondary/40 opacity-60'
              }`}
            >
              {/* Reorder */}
              <div className="flex flex-col shrink-0">
                <button
                  onClick={() => handleMoveItem(item.id, -1)}
                  disabled={idx === 0}
                  className="p-0.5 text-text-muted hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronUp size={13} />
                </button>
                <button
                  onClick={() => handleMoveItem(item.id, 1)}
                  disabled={idx === items.length - 1}
                  className="p-0.5 text-text-muted hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronDown size={13} />
                </button>
              </div>

              {/* Active toggle */}
              <Toggle on={item.is_active} onChange={() => handleToggleItem(item.id)} />

              {/* Label — click to edit inline */}
              {editingItemId === item.id ? (
                <div className="flex-1 flex items-center gap-2">
                  <input
                    type="text"
                    value={editingItemLabel}
                    onChange={e => setEditingItemLabel(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleSaveItemLabel(item.id)
                      if (e.key === 'Escape') { setEditingItemId(null); setEditingItemLabel('') }
                    }}
                    className="input text-sm py-1 flex-1"
                    autoFocus
                  />
                  <button
                    onClick={() => handleSaveItemLabel(item.id)}
                    className="p-1 text-profit hover:bg-profit/10 rounded"
                  >
                    <Check size={14} />
                  </button>
                  <button
                    onClick={() => { setEditingItemId(null); setEditingItemLabel('') }}
                    className="p-1 text-text-muted hover:bg-bg-hover rounded"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <span
                  className={`flex-1 text-sm cursor-pointer hover:text-accent transition-colors ${
                    item.is_active ? 'text-text-primary' : 'text-text-muted'
                  }`}
                  onDoubleClick={() => {
                    setEditingItemId(item.id)
                    setEditingItemLabel(item.label)
                  }}
                  title="Double-click to edit"
                >
                  {item.label}
                </span>
              )}

              {/* Delete */}
              <button
                onClick={() => handleDeleteItem(item.id)}
                className="p-1.5 text-text-muted hover:text-loss hover:bg-loss/10 rounded transition-colors shrink-0"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}

          {/* Add new item */}
          <div className="flex gap-2 pt-1">
            <input
              type="text"
              value={newItemLabel}
              onChange={e => setNewItemLabel(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddItem()}
              placeholder="Add a checklist item..."
              className="input text-sm flex-1"
            />
            <button
              onClick={handleAddItem}
              disabled={!newItemLabel.trim()}
              className="btn-secondary text-sm py-2 px-3 flex items-center gap-1.5 disabled:opacity-40"
            >
              <Plus size={14} />
              Add
            </button>
          </div>
          <p className="text-xs text-text-muted pl-1">Double-click any item label to rename it.</p>
        </div>
      </div>

      {/* ════════════════════════════════════════════
          SECTION 3: PLAYBOOK NOTES
      ════════════════════════════════════════════ */}
      <div className="bg-bg-card border border-border rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <BookOpen size={16} className="text-text-muted" />
            <h2 className="text-base font-semibold text-text-primary">Strategy Notes</h2>
          </div>
          <div className="flex items-center gap-3">
            {notesSaved && (
              <span className="text-xs text-profit flex items-center gap-1">
                <Check size={12} /> Saved
              </span>
            )}
            <button
              onClick={handleNotesSave}
              disabled={!notesDirty}
              className="btn-primary text-sm py-1.5 px-3 disabled:opacity-40"
            >
              Save Notes
            </button>
          </div>
        </div>
        <div className="p-4">
          <p className="text-xs text-text-muted mb-2">
            Document your setups, edge, and strategy. Describe what makes an A+ trade for each setup you trade.
          </p>
          <textarea
            value={notes}
            onChange={e => handleNotesChange(e.target.value)}
            placeholder={`Example:\n\nMy VWAP Reclaim Setup\n─────────────────────\n• Price must be below VWAP at open\n• Wait for a clean reclaim candle with volume\n• Entry on the first pullback after reclaim\n• Stop below the wick of the reclaim candle\n• Target: VWAP + 1× the reclaim candle range\n\nI only take this setup on high-volume, trending stocks.`}
            rows={16}
            className="input resize-none text-sm leading-relaxed font-mono w-full"
          />
        </div>
      </div>
    </div>
  )
}
