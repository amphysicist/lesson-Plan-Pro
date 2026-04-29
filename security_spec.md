# Security Specification: API Key Management

## 1. Data Invariants
- A user document in `user_configs` must be keyed by the user's Authentication UID.
- `isAdmin` can only be set to `true` by an existing Admin.
- Users can managed their own `geminiApiKey` but cannot change their own `isAdmin` status.
- Admin access is strictly validated against the server-side `isAdmin` flag in Firestore.

## 2. The "Dirty Dozen" Payloads
1. **Self-Promotion**: User attempts to set `isAdmin: true` on their own doc during creation.
2. **Key Scraping**: User attempts to `list` the `user_configs` collection.
3. **Identity Theft**: User A attempts to `get` User B's config document.
4. **Shadow Field Injection**: User attempts to add `role: 'super-admin'` to their document.
5. **PII Leak**: Non-admin user attempts to read another user's email.
6. **Cross-User Write**: User A attempts to update User B's `geminiApiKey`.
7. **Type Poisoning**: User attempts to set `geminiApiKey` as a 1MB array instead of a string.
8. **ID Poisoning**: User attempts to create a document with a non-UID string (e.g., 'system_admin').
9. **Admin Spoofing**: User includes `isAdmin: true` in a client-side auth token (ignored by rules).
10. **Resource Exhaustion**: User attempts to save a 500KB string as an email.
11. **State Overwrite**: User attempts to delete their `isAdmin` flag to bypass checks.
12. **Unauthenticated Read**: Attempting to read any config without logging in.

## 3. Test Runner (Draft)
Verification of these payloads will be handled by the logic in `firestore.rules`.
- `allow read: if isOwner(userId) || isAdmin();`
- `allow create: if isOwner(userId) && incoming().isAdmin == false;`
- `allow update: if isOwner(userId) && (isAdmin() || incoming().isAdmin == existing().isAdmin);`
