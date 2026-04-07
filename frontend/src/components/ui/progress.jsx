import * as React from 'react'
import { cn } from '../../lib/utils'

const Progress = React.forwardRef(({ className, value = 0, ...props }, ref) => {
  const bounded = Math.min(100, Math.max(0, value))

  return (
    <div ref={ref} className={cn('ui-progress', className)} {...props}>
      <div className="ui-progress-indicator" style={{ width: `${bounded}%` }} />
    </div>
  )
})
Progress.displayName = 'Progress'

export { Progress }
