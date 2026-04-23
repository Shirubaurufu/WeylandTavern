# Tag review API

HTTP JSON API for **anonymous sessions**, **DeepDanbooru-derived tag suggestions** per Weybooru post, **community voting**, and optional **Weybooru webhook** ingestion. Intended for a separate UI (e.g. another repo in Cursor) that calls this service over the network.

Default base URL when running locally: **`http://127.0.0.1:3950`** (override with env `PORT` / `HOST` on the server).

All successful JSON responses use `Content-Type: application/json; charset=utf-8` and `Cache-Control: no-store`.

---

## CORS and browser clients

The server answers **`OPTIONS`** with **204** and sends:

- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: GET, POST, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type, Authorization, X-Webhook-Secret`

The same CORS headers are included on normal responses so **cross-origin** UIs (including pages opened as `file://`) can call the API with `fetch`.

**Cookies:** `/connect` may set an HttpOnly cookie `tagger_token`. Cross-origin pages often **do not** send that cookie on the next request unless you use `credentials: "include"` **and** serve the UI from an origin compatible with cookie rules. For maximum portability, **persist `token` from the JSON body** (e.g. `localStorage`) and send **`Authorization: Bearer <token>`** on `/connect` to resume the same session (see [POST /connect](#post-connect)).

---

## Session model

- A **session** is a random UUID string stored server-side.
- **`/vote` requires** that token in the **JSON body** (`token` field).
- **`/suggestions`** can associate the current user with suggestions via, in order of precedence:
  1. Query parameter **`token`**
  2. Cookie **`tagger_token`**
  3. Header **`Authorization: Bearer <token>`**

There is no login; tokens are only for avoiding accidental double-voting per device/session.

---

## POST `/connect`

Creates a **new** session **or** continues an existing one if the server receives a known token.

**Request**

- Method: **`POST`**
- Path: **`/connect`**
- Body: empty or ignored (no JSON required).
- Optional identity (for “continue”):
  - Cookie: `tagger_token=<uuid>`
  - **or** header: `Authorization: Bearer <uuid>`

If a cookie or bearer token is present **and** that value exists in the database, the response returns the **same** token. Otherwise a new token is inserted and returned.

**Response `200`**

```json
{
  "token": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Set-Cookie (when applicable)**

- Name: `tagger_token`
- Attributes: `Path=/; HttpOnly; SameSite=Lax; Max-Age=315360000` (long-lived)

**UI checklist**

1. After first connect, store `token` locally.
2. On later visits, call `/connect` with `Authorization: Bearer <stored token>` so the user keeps one session even without cookies.

---

## GET `/suggestions`

Returns **unresolved** tag suggestions for one Weybooru post, with vote counts and optional “my vote”.

**Request**

- Method: **`GET`**
- Path: **`/suggestions`**
- Query parameters:
  - **`postId`** (required): positive integer Weybooru post id.
  - **`token`** (optional): session token; if omitted, cookie `tagger_token` or `Authorization: Bearer` is used for `myVote`.

Example: `GET /suggestions?postId=42&token=<uuid>`

**Response `200`**

```json
{
  "suggestions": [
    {
      "tag": "1girl",
      "probability": 0.97,
      "votesFor": 3,
      "votesAgainst": 1,
      "myVote": "for"
    }
  ]
}
```

| Field | Type | Description |
|--------|------|-------------|
| `tag` | string | Canonical tag name (whitelist spelling). |
| `probability` | number | Model score / probability from classification. |
| `votesFor` | number | Count of distinct session tokens voting **for**. |
| `votesAgainst` | number | Count voting **against**. |
| `myVote` | `"for"` \| `"against"` \| `null` | How the given token voted, if any. |

Suggestions are sorted by **`probability` descending**. Resolved rows are not listed.

**Errors**

| Status | Body |
|--------|------|
| `400` | `{ "error": "Invalid or missing postId" }` |

---

## POST `/vote`

Registers a vote for one suggestion. The same token cannot occupy both sides; changing side moves the token. When vote totals meet the **resolution rule**, the suggestion is closed; if the outcome is **accepted**, the server may call Weybooru to create the tag (if needed) and add it to the post.

**Request**

- Method: **`POST`**
- Path: **`/vote`**
- Header: `Content-Type: application/json`
- Body:

```json
{
  "token": "<session-uuid>",
  "postId": 42,
  "tag": "1girl",
  "side": "for"
}
```

| Field | Type | Required | Description |
|--------|------|----------|-------------|
| `token` | string | yes | Must be a token returned by `/connect` and still present server-side. |
| `postId` | number or string | yes | Weybooru post id (digits as string accepted). |
| `tag` | string | yes | Tag to vote on; matched **case-insensitively** to an open suggestion. |
| `side` | string | yes | Exactly **`"for"`** or **`"against"`**. |

**Response `200`**

```json
{
  "ok": true,
  "resolved": false,
  "outcome": null,
  "votesFor": 2,
  "votesAgainst": 1
}
```

When the suggestion **just** reached resolution in this request:

- `resolved` is `true`.
- `outcome` is **`"accepted"`** or **`"rejected"`** (for wins vs against wins).

If `outcome` is `"accepted"`, the server then tries to apply the tag on Weybooru. If that apply step fails, the vote still counts as resolved accepted in the DB, but the response may include:

```json
{
  "ok": true,
  "resolved": true,
  "outcome": "accepted",
  "votesFor": 6,
  "votesAgainst": 1,
  "applyError": "human-readable error message"
}
```

**Resolution rule** (for UI copy / tooltips)

Let `f` = `votesFor`, `a` = `votesAgainst` **after** this vote (each token appears on at most one side).

1. **At least five voters:** `f + a >= 5`
2. **Clear margin:**
   - If `min(f, a) === 0`: need `max(f, a) >= 5` (unanimous side has at least five).
   - Else: need `max(f, a) >= 2 * min(f, a)` (e.g. 6 vs 3 resolves; 5 vs 3 does not).

The winning side is the larger count; ties on the threshold do not resolve.

**Errors**

| Status | Body |
|--------|------|
| `400` | `{ "error": "..." }` — missing `token`, bad `postId` / `tag` / `side`, or non-JSON body. |
| `403` | `{ "error": "Unknown session token" }` |
| `404` | `{ "error": "Suggestion not found" }` — no open row for that `postId` + `tag`. |
| `409` | `{ "error": "Suggestion already resolved" }` — that suggestion was already closed. |

---

## POST `/hooks/weybooru`

Endpoint for **Weybooru (Szurubooru)** to notify the service of a new post. Only a narrow subset of the real webhook snapshot is required.

**Request**

- Method: **`POST`**
- Path: **`/hooks/weybooru`**
- Header: `Content-Type: application/json`
- If the server has env **`WEBHOOK_SECRET`** set, the request must include header **`X-Webhook-Secret`** with that exact value; otherwise **`401`**.

**Body shape (minimal accepted “enqueue” payload)**

The server only acts when **all** of the following hold:

- `operation === "created"`
- `type === "post"`
- `id` is a positive integer (Weybooru post id)

Example:

```json
{
  "operation": "created",
  "type": "post",
  "id": 12345,
  "user": { "name": "uploader" },
  "data": { "tags": [], "safety": "safe" },
  "time": "2026-04-20T12:00:00.000Z"
}
```

Extra fields are ignored. The real Szurubooru snapshot may include more keys; that is fine.

**Responses**

| Status | Meaning |
|--------|---------|
| **`204`** | Success: either enqueued for classification, ignored as duplicate state, or ignored because the payload was not a “post created” event (still 204 for non-matching payloads). |
| **`400`** | `{ "error": "Expected JSON body" }` |
| **`401`** | `{ "error": "Invalid webhook secret" }` |

There is no JSON body on **`204`**.

**Behaviour (for UI / integrators)**

- If the post is **new** to the service, it is queued **`pending`** for the background classifier (DeepDanbooru + whitelist).
- If the post is already **`done`**, **`pending`**, or **`processing`**, the webhook does nothing further for that id.
- If the post was **`failed`**, it is reset to **`pending`** and re-queued.

---

## Unknown routes

Any other path/method returns **`404`** with:

```json
{ "error": "Not found" }
```

Server failures return **`500`** with `{ "error": "<message>" }`.

---

## Typical UI flow

1. **`POST /connect`** — store `token`; optionally send `Authorization: Bearer` on repeat visits.
2. **`GET /suggestions?postId=<id>&token=<token>`** — render open suggestions and counts; use `myVote` to highlight the user’s choice.
3. **`POST /vote`** — send votes; refresh suggestions (or remove row locally when `resolved` is true).
4. (Optional) **`POST /hooks/weybooru`** — only if this UI is used to **simulate** Weybooru; production Weybooru calls this URL directly.

---

## Operational notes (not part of the HTTP contract)

- Suggestions only exist after a post has been **classified** (webhook, seed script, or worker backlog).
- Tag strings are **whitelist-canonical**; voting must use the same spelling the API returns in `suggestions` (case-insensitive match is supported).
- Server env vars commonly used: `PORT`, `HOST`, `DATABASE_PATH`, `WEYBOORU_API_BASE`, `WEYBOORU_USERNAME`, `WEYBOORU_TOKEN`, `DEEPDANBOORU_URL`, `WEBHOOK_SECRET`.

For local manual testing, this repo includes **`test/tag-review-api-test.html`**.
