const GEMINI_GENERATE_CONTENT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent'

/** @returns {string} */
export function getGeminiGenerateUrl() {
  const key = import.meta.env.VITE_GEMINI_API_KEY?.trim()
  if (!key) {
    throw new Error(
      'Missing VITE_GEMINI_API_KEY. Copy .env.example to .env and add your key.',
    )
  }
  return `${GEMINI_GENERATE_CONTENT}?key=${encodeURIComponent(key)}`
}
