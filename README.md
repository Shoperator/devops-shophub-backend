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
| `SHOP_NAMESPACE` | `default` | Namespace the `Shop` resources are created in |
| `SHOP_BASE_DOMAIN` | `shop.local` | Domain the deployed shop sites are published under |

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

### Shops

A shop is a site the owner has ShopHub deploy. Every route is signed in and
works only on the shops of the account the token belongs to, so a shop owned by
somebody else answers `404` rather than `403`.

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/shops` | Create a shop and deploy it |
| `GET` | `/shops` | The shops this account owns |
| `GET` | `/shops/:id` | One shop |
| `PATCH` | `/shops/:id` | Reconfigure a deployed shop |
| `DELETE` | `/shops/:id` | Remove the shop and its cluster resources |

```json
{
  "id": "<uuid>",
  "name": "Prodavnica zdrave hrane",
  "slug": "prodavnica-zdrave-hrane-a1b2c3",
  "availability": "standard",
  "walletAddress": "0x742d35Cc6634C0532925a3b844Bc9e7595f42D0B",
  "database": "postgresql",
  "url": "http://prodavnica-zdrave-hrane-a1b2c3.shop.local",
  "createdAt": "<iso-8601>"
}
```

`availability` is `standard` (2 replicas) or `high` (3), and `database` is
`postgresql` or `redis` — the values the [Shop CRD](https://github.com/slepimis120/devops-shop-operator)
accepts. `PATCH` takes `availability` and `walletAddress` only: the name and the
database are settled when the shop is created, because the cluster resources and
the site's address are named after the name, and the two database engines come
from different operators.

`name` may hold latin letters, digits and single spaces. `slug` is derived from
it once — normalized to plain ASCII letters, with a random suffix so two shops
of the same name cannot collide — and is the name of the shop's resources in the
cluster.

Creating, reconfiguring and deleting a shop go through `ShopDeploymentService`,
which builds the `Shop` manifest the shop-operator reconciles. The Kubernetes
API calls themselves are not implemented yet; the manifest is logged and the URL
derived from `SHOP_BASE_DOMAIN`.
