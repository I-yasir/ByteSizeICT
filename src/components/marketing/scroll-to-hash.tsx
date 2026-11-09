'use client';

import { useEffect } from 'react';

/**
 * "Enroll Now" from another page navigates to /#pricing (CR8). The (public) route streams behind a
 * loading boundary, so the router's own hash scroll runs before the section exists; this repeats it
 * once the section has mounted. CSS `scroll-behavior` keeps it smooth, or instant under reduced motion.
 */
export function ScrollToHash({ id }: { id: string }) {
  useEffect(() => {
    if (window.location.hash === `#${id}`) document.getElementById(id)?.scrollIntoView();
  }, [id]);
  return null;
}
