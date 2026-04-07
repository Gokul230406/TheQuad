import * as React from 'react'
import { cn } from '../../lib/utils'

const Separator = React.forwardRef(({ className, orientation = 'horizontal', ...props }, ref) => (
  <div
    ref={ref}
    role="separator"
    aria-orientation={orientation}
    className={cn(
      'ui-separator',
      orientation === 'horizontal' ? 'ui-separator-horizontal' : 'ui-separator-vertical',
      className
    )}
    {...props}
  />
))
Separator.displayName = 'Separator'

export { Separator }
