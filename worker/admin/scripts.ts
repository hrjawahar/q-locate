// Names in Indian scripts: which ones a list of names already has.
export const SCRIPTS: Record<string, { label: string; re: RegExp }> = {
  ta: { label: 'Tamil', re: /[\u0B80-\u0BFF]/ }, te: { label: 'Telugu', re: /[\u0C00-\u0C7F]/ }, kn: { label: 'Kannada', re: /[\u0C80-\u0CFF]/ },
  ml: { label: 'Malayalam', re: /[\u0D00-\u0D7F]/ }, hi: { label: 'Hindi', re: /[\u0900-\u097F]/ },
}
export const missingScripts = (names: string[]) => Object.keys(SCRIPTS).filter((k) => !names.some((n) => SCRIPTS[k].re.test(n)))
/** Keep only AI names actually written in the right script. */
export const validScriptNames = (raw: unknown, want: string[]) => {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return want.map((k) => (typeof o[k] === 'string' && SCRIPTS[k].re.test(o[k] as string) ? (o[k] as string).trim().slice(0, 80) : '')).filter(Boolean)
}
