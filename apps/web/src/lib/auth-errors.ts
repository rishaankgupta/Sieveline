/** Turns auth API errors into plain messages. Never reveals whether an account exists. */
export function authErrorMessage(error: { status?: number; code?: string; message?: string } | null | undefined): string {
  if (!error) return "Something went wrong. Please try again.";
  if (error.status === 429) return "Too many attempts. Please wait a minute and try again.";
  switch (error.code) {
    case "INVALID_EMAIL_OR_PASSWORD":
      return "That email and password don't match.";
    case "EMAIL_NOT_VERIFIED":
      return "Please confirm your email first. We just sent you a new link.";
    case "PASSWORD_TOO_SHORT":
      return "Use at least 12 characters.";
    case "PASSWORD_TOO_LONG":
      return "Use at most 128 characters.";
    case "PASSWORD_COMPROMISED":
      return "This password appears in a known data breach. Please choose another.";
    case "INVALID_TOKEN":
      return "This link has expired or was already used. Please request a new one.";
    case "MISSING_RESPONSE":
    case "VERIFICATION_FAILED":
      return "Please complete the security check.";
    case "INVALID_TWO_FACTOR_CODE":
    case "INVALID_CODE":
      return "That code isn't right. Use the newest code from your authenticator app.";
    case "INVALID_BACKUP_CODE":
      return "That backup code didn't work, or it was already used.";
    case "INVALID_TWO_FACTOR_COOKIE":
      return "This sign-in took too long. Please sign in again.";
    case "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE":
      return "Too many wrong codes. Please sign in again.";
    case "ACCOUNT_TEMPORARILY_LOCKED":
      return "Too many wrong codes. Two-step sign-in is locked for 15 minutes.";
    default:
      return error.status === 403 && error.message === "This account is suspended."
        ? "This account is suspended. Contact support."
        : "Something went wrong. Please try again.";
  }
}
