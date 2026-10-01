const firstString = (...values: unknown[]): string | undefined =>
  values.find((value): value is string => typeof value === "string")

// Saved records may lack a full Twitter tweet payload. The dashboard only
// needs display fields, so it should not run the ingest mapper.
export function getInterceptedRecordPreview(data: unknown) {
  if (typeof data === "string") {
    return { text: data, username: undefined }
  }

  if (!data || typeof data !== "object") {
    return { text: undefined, username: undefined }
  }

  const record = data as Record<string, any>
  const user = record.core?.user_results?.result

  return {
    text: firstString(
      record.note_tweet?.note_tweet_results?.result?.text,
      record.legacy?.full_text,
      record.tweet?.full_text
    ),
    username: firstString(
      user?.legacy?.screen_name,
      user?.core?.screen_name,
      record.account?.username
    )
  }
}
