import { useEffect, useState } from 'react'

/**
 * Scroll-to-top button that appears after the user scrolls down.
 * @returns {import('react').ReactElement | null}
 */
export default function ScrollToTop() {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    /** @returns {void} */
    const onScroll = () => setIsVisible(window.scrollY > 300)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  if (!isVisible) return null

  return (
    <button
      type="button"
      className="scroll-to-top"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label="Scroll to top"
    >
      ↑
    </button>
  )
}