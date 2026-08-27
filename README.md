# devops-shophub

Backend for the ShopHub platform.

## Running locally

```bash
npm install
cp .env.example .env
docker compose up -d     # PostgreSQL
npm run start:dev
```

## Tests

```bash
npm test         # unit tests
npm run test:e2e # integration tests, needs Docker (Testcontainers starts PostgreSQL)
```

The integration tests boot the whole application against a throwaway PostgreSQL
container, so they exercise real SQL, the real guards and the real validation
pipeline. Both suites run on every pull request.

## Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `DB_HOST` / `DB_PORT` / `DB_USERNAME` / `DB_PASSWORD` / `DB_NAME` | `localhost` / `5432` / `shophub` / `shophub` / `shophub` | PostgreSQL, provisioned by the CNPG operator |
| `DB_SYNCHRONIZE` | `true` | Create the schema from the entities |
| `JWT_SECRET` | — | Signing key for access tokens; the app refuses to start without it |
| `JWT_EXPIRES_IN` | `1h` | Access token lifetime |
| `CORS_ORIGIN` | `*` | Origin of the ShopHub frontend |
| `PORT` | `3000` | HTTP port |

## API

Everything is served under `/api/v1`.

### Auth

ShopHub has a single kind of account — the user who manages their own shop
sites — so there are no roles and nothing to authorize beyond being signed in.

| Method | Path | Access | Description |
| --- | --- | --- | --- |
| `POST` | `/auth/register` | public | Create an account and sign in |
| `POST` | `/auth/login` | public | Exchange credentials for a bearer token |
| `GET` | `/auth/me` | signed in | The profile the token belongs to |

`register` and `login` both answer with the same body, so a fresh account does
not have to send its password twice:

```json
{
  "accessToken": "<jwt>",
  "tokenType": "Bearer",
  "user": { "id": "<uuid>", "username": "owner", "createdAt": "<iso-8601>" }
}
```

The token is an HS256 JWT carrying `sub` (the user id) and `username`. Protected
routes read it from `Authorization: Bearer <token>`.

Passwords are stored as bcrypt hashes and never appear in a response. A failed
sign-in reports the same message whether the username or the password was wrong,
so the endpoint cannot be used to enumerate accounts.
