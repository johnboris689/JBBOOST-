# JB Boster Password Reset Setup

JB Boster now uses a real server-side email OTP password-reset flow:

1. User enters their email.
2. The server generates a cryptographically random 6-digit OTP.
3. The OTP is delivered through Resend. The OTP itself is never written to application logs or stored in plaintext.
4. The OTP expires after 10 minutes and verification is limited to 5 attempts.
5. Successful verification creates a short-lived, single-use reset token.
6. The user enters and confirms a new password (minimum 8 characters).
7. The new password is stored as a bcrypt hash in PostgreSQL.
8. Reset requests return the same generic response whether or not the email exists.

## Required Render environment variables

```text
RESEND_API_KEY=your_resend_api_key
RESEND_FROM_EMAIL=JB Boster <no-reply@your-verified-domain.com>
```

Keep both values server-side. Never use a `VITE_` prefix for these secrets. Your Resend sender/domain must be verified with Resend.

## Security behavior

- OTPs are single-use and expire after 10 minutes.
- OTP values are stored as SHA-256 hashes.
- Reset tokens are random, hashed in the database, short-lived and single-use.
- Passwords are stored using bcrypt.
- Reset requests are rate-limited.
- The API does not reveal whether an email address is registered.
- The user is not automatically logged in after a reset.
