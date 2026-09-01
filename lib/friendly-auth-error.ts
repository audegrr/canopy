// Supabase can return an AuthError whose .message is empty or literally "{}"
// (e.g. AuthRetryableFetchError wrapping a 500 with no parseable error body —
// seen in practice when the project's mailer fails outright on signup/reset).
// Showing that raw text to the user is worse than a generic message.
export function friendlyAuthError(message: string | undefined | null): string {
  const trimmed = (message ?? '').trim()
  if (!trimmed || trimmed === '{}' || trimmed.startsWith('{')) {
    return 'Something went wrong. Please try again in a moment.'
  }
  return trimmed
}
