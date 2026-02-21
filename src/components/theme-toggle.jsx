import { Moon, Sun } from 'lucide-react'
import { Button } from './ui/button'
import { useDarkMode } from '@/hooks/useDarkMode'

export function ThemeToggle() {
  const { isDark, toggle } = useDarkMode()

  return (
    <Button
      onClick={toggle}
      variant="ghost"
      size="icon"
      className="rounded-full"
      aria-label="Toggle theme"
    >
      {isDark ? (
        <Sun className="size-5" />
      ) : (
        <Moon className="size-5" />
      )}
    </Button>
  )
}
