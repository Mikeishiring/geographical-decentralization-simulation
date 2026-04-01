import { createContext, useContext } from 'react'

interface PaperNavContextValue {
  /** Switch to the PDF reader view and scroll to the given page */
  readonly goToPdfPage: (page: number) => void
}

const PaperNavContext = createContext<PaperNavContextValue>({
  goToPdfPage: () => {},
})

export const PaperNavProvider = PaperNavContext.Provider

export function usePaperNav() {
  return useContext(PaperNavContext)
}
