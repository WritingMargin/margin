# SQLite metadata and encrypted S3 content

SQLite is the default metadata database at `SQLITE_PATH=.data/margin.db`. Set `DATABASE_URL` to use PostgreSQL. Metadata includes owner credentials, session/token hashes, configuration, post titles and excerpts, comments, and AI history. These fields are not encrypted by the S3 encryption layer.

The Go storage implementation encrypts article bodies, generated images, and uploaded logos before sending them to S3. Reads authenticate the entire object before returning plaintext. Public routes enforce publication and asset permissions. Remote image links and Cloudinary media are hosted separately.

## Startup keys

When `CONTENT_ENCRYPTION_KEY` or `SETUP_TOKEN` is empty, `margin serve` generates an independent random 32-byte key, encoded as 64 hexadecimal characters, and saves it for subsequent restarts:

| File | Purpose |
| --- | --- |
| `content-encryption-key.secret` | Encrypt content and saved credentials |
| `setup-token.secret` | Authorize first-owner setup and server bootstrap |
| `encryption-key.sha256` | Detect encryption-key changes between startups; contains no key |

Files live beside `SQLITE_PATH` (default `.data/margin.db`), or in `--data-dir`. This remains true with PostgreSQL: persist this local directory even when the database is remote. Docker's `/app/.data` volume contains these files. Generated files are private (`0600` on Linux/macOS, restricted to the current account and SYSTEM on Windows). Startup logs show their paths, never their values. Read the setup-token file to create the first owner; for Compose, use `docker compose exec app cat /app/.data/setup-token.secret`.

Nonempty environment values override the saved defaults, including values loaded from `.env` or `--env-file`; process environment values take precedence over the env file. Overrides do not replace the generated files. Removing an override returns to the saved default and may therefore change the effective encryption key. If no generated encryption key exists after a previous startup, Margin refuses to invent a replacement: supply or restore the previous key. Corrupt or insecure saved key files also fail startup rather than being silently replaced. A malformed explicit encryption key fails startup.

To supply your own key, run `margin keygen` and save its output as `CONTENT_ENCRYPTION_KEY` in your environment or secret manager. The command prints a new key; it does not edit configuration. Never put keys in frontend variables or source control.

**Removing or losing the old encryption key before re-encryption completes loses access to data that still uses it.** Set `CONTENT_ENCRYPTION_KEY_PREVIOUS` to enable dual-key reads: the server first authenticates with `CONTENT_ENCRYPTION_KEY`, then tries the fallback. All new content and credential writes use only the primary key. Startup validates both keys and reports dual-key mode and effective primary-key changes without exposing either value. Changing environment values alone does not migrate existing ciphertext. `SETUP_TOKEN` is separate and can be changed without re-encrypting content.

Back up the generated key files securely, separately from the bucket, and retain any environment-supplied keys. Keep a coordinated snapshot of SQLite (including its WAL) or PostgreSQL and S3 objects. Ciphertext is bound to its bucket and object key, so restoring requires the corresponding key and object locations. Multiple server instances must use the same keys, supplied through shared persistent files or environment configuration.

## Re-encrypt while serving traffic

`margin reencrypt` can migrate data while properly configured servers continue reading and writing. Both object storage and encrypted database credentials support dual-key reads. No database transaction is held during S3 I/O; individual updates use conditional writes to preserve concurrent edits.

Use this rollout order, including when multiple instances share a database or bucket:

1. Back up the database and bucket, retain the old key, and generate the new key with `margin keygen`. Keep both in private environment configuration or a secret manager, never shell arguments or logs. If the old key was generated, obtain it from `content-encryption-key.secret`.
2. **Prepare every reader before changing any writer.** Deploy the dual-key-capable server to every instance with the **old key as `CONTENT_ENCRYPTION_KEY`** and the **new key as `CONTENT_ENCRYPTION_KEY_PREVIOUS`**. Despite its name, the fallback can temporarily hold the upcoming key. Complete this rollout before the next step. All instances still write old ciphertext but can now read ciphertext encrypted with either key.
3. Switch every instance to the **new primary key** and **old fallback key**, restarting/replacing instances to apply the environment. Complete this rollout and let old-key processes and in-flight work drain before migrating. With multiple instances, the two-stage rollout keeps both keys readable throughout. With one instance, configuration changes require a restart; the data migration itself can run online.

   ```dotenv
   CONTENT_ENCRYPTION_KEY=NEW_64_CHARACTER_HEX_KEY
   CONTENT_ENCRYPTION_KEY_PREVIOUS=OLD_64_CHARACTER_HEX_KEY
   ```

4. Give the migration command the same two keys and existing database/storage settings in a private env file, such as `.env.rotation`, then run it against the same data directory:

   ```sh
   chmod 600 .env.rotation
   margin reencrypt --env-file .env.rotation --data-dir .data
   margin reencrypt --verify-only --env-file .env.rotation --data-dir .data
   ```

   For bundled Compose, after updating the running app configuration as above, run `docker compose run --rm --no-deps app margin reencrypt --data-dir /app/.data`, then repeat with `--verify-only`. Keep the app, S3, and PostgreSQL (if used) running. Explicit process environment variables override env-file values for native commands.

5. After successful verification, remove `CONTENT_ENCRYPTION_KEY_PREVIOUS` from server environments and roll out that configuration. Keep the new `CONTENT_ENCRYPTION_KEY` override on subsequent restarts: migration does not replace `content-encryption-key.secret` on disk. Retain the old key securely for old backups and noncurrent S3 versions.

The command authenticates all referenced content and encrypted settings before beginning rewrites. It migrates live articles, revision history, staged drafts, logos, uploaded/generated images, videos, source documents, and saved CAPTCHA, SMTP, and Margin account credentials. Credentials can be migrated even when no S3 content is configured. S3 writes require ETags and conditional `If-Match` support from the storage provider. Database credential updates compare the original ciphertext (and account service URL) so a concurrent edit is never overwritten.

If interrupted or a concurrent change causes a conflict, keep both keys configured and rerun with the same pair. Servers can continue using migrated and unmigrated values. Already migrated values are authenticated with the new key and skipped. The database and S3 do not commit as one transaction; failed runs can leave a mixture of both keys, which is why the fallback must remain enabled.

Migration finishes with a fresh verification pass. `--verify-only` repeats that check without rewriting ciphertext and requires only the primary key. Verification deliberately ignores the fallback, even if it is configured. It fails if any currently referenced content or encrypted setting still needs the old key. This is a point-in-time check, not a guarantee about misconfigured writers: **every instance and background writer must already use the new primary key before you retire the old one**. The command cannot inspect other processes' environment variables.

Unreferenced bucket objects, external backups, and noncurrent S3 object versions are not rewritten or verified. Retain the old key for those copies. The command cannot recover data if a required key has been lost.

## Encryption format

The binary envelope is `MRGSEC01` (8 bytes), a random 12-byte nonce, a 16-byte authentication tag, then AES-256-GCM ciphertext. Additional authenticated data binds the format, bucket, and full object key. Repeated writes of the same content produce different ciphertext; moved or modified objects fail authentication. Empty objects are valid. The overhead is 36 bytes without base64 expansion.

Objects use `application/octet-stream` and an encryption-format metadata marker. The key and plaintext are not stored in S3 metadata. Object names, sizes, and access patterns remain visible to the storage provider. Go's authenticated decryption returns content only after verification succeeds.
