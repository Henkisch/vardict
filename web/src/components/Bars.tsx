type Props = {uphold: number; overturn: number; size?: 'big' | 'small'}

// The live split. Upheld above 55%, overturned below 45%: the two markers show where the lines are.
export function Bars({uphold, overturn, size = 'big'}: Props) {
  const total = uphold + overturn
  const pct = total ? (uphold / total) * 100 : 50
  const big = size === 'big'
  return (
    <div className="flex flex-col gap-2">
      <div className={`flex justify-between gap-3 whitespace-nowrap font-display font-bold tabular ${big ? 'text-3xl' : 'text-2xl'}`}>
        <span className="text-uphold">Uphold {Math.round(pct)}%</span>
        {/* Derived from the rounded uphold share, so the two always add up to 100. */}
        <span className="text-overturn">{100 - Math.round(pct)}% Overturn</span>
      </div>
      <div className={`relative flex overflow-hidden rounded-md bg-overturn ${big ? 'h-10' : 'h-6'}`}>
        <div className="bar h-full bg-uphold" style={{width: `${pct}%`}} />
        <div className="absolute inset-y-0 w-0.5 bg-ink/70" style={{left: '45%'}} aria-hidden />
        <div className="absolute inset-y-0 w-0.5 bg-ink/70" style={{left: '55%'}} aria-hidden />
      </div>

    </div>
  )
}
