import type { ChainInfo } from '../types'

interface ChainPickerProps {
  chains: ChainInfo[]
  selected: string[]
  defaultChainKey?: string
  disabled?: boolean
  onChange: (keys: string[]) => void
  onLoadAll: () => void
}

export function ChainPicker({
  chains,
  selected,
  defaultChainKey,
  disabled,
  onChange,
  onLoadAll,
}: ChainPickerProps) {
  const selectedSet = new Set(selected)

  const toggle = (key: string) => {
    if (selectedSet.has(key)) {
      const next = selected.filter((k) => k !== key)
      onChange(next.length ? next : [key])
    } else {
      onChange([...selected, key])
    }
  }

  return (
    <div className="chain-picker">
      <div className="chain-picker-header">
        <span className="field-label">Chains</span>
        <button
          type="button"
          className="btn ghost"
          disabled={disabled}
          onClick={onLoadAll}
          title="Select every chain (may be slow)"
        >
          Select all
        </button>
      </div>
      <div className="chain-list">
        {chains.length === 0 ? (
          <p className="detail-empty-copy">No chains connected yet.</p>
        ) : (
          chains.map((chain) => {
            const isDefault = chain.chain_key === defaultChainKey
            return (
              <label
                key={chain.chain_key}
                className={`chain-item${selectedSet.has(chain.chain_key) ? ' active' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={selectedSet.has(chain.chain_key)}
                  disabled={disabled}
                  onChange={() => toggle(chain.chain_key)}
                />
                <span className="chain-name">
                  {chain.chain_key}
                  {isDefault ? (
                    <span className="chain-default"> · default</span>
                  ) : null}
                </span>
                <span className="chain-count">{chain.thought_count}</span>
              </label>
            )
          })
        )}
      </div>
    </div>
  )
}
