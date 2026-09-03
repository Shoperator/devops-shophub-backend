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
| `KUBERNETES_ENABLED` | `false` | Talk to a cluster. While this is not `true`, shops are recorded but never deployed |
| `KUBERNETES_AUTH_MODE` | `auto` | `auto`, `in-cluster` or `kubeconfig`. `auto` picks in-cluster when running as a pod |
| `KUBERNETES_FIELD_MANAGER` | `shophub` | Names ShopHub as the author of the fields it writes |

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

## Deploying a shop

Creating, reconfiguring and deleting a shop go through `ShopDeploymentService`,
which writes a single `Shop` custom resource — `shop.shophub.local/v1`, named
after the slug, in `SHOP_NAMESPACE`. ShopHub creates nothing else: the
shop-operator watches for those resources and reconciles each one into the
deployments, services, ingress and database behind the running site, and it
derives the replica count from `availability`, so ShopHub does not send one.

Creating and reconfiguring are the same call. It POSTs the resource, and on a
`409` merge-patches the spec instead — which covers both an owner changing a
setting and a retry of a create the API server accepted but ShopHub never saw
the answer to. Deleting tolerates a `404`, so a shop removed out of band can
still be removed here; the operator's children carry owner references, so the
cluster garbage-collects them.

The site's URL is derived from the slug and `SHOP_BASE_DOMAIN` rather than read
back from `status.url`, which the operator writes only after it has reconciled —
too late for the request that created the shop. Both sides build the same host
from the same slug, but **the domain is hardcoded in the operator**
(`shop_controller.go`), so `SHOP_BASE_DOMAIN` has to be kept equal to it.

`KUBERNETES_ENABLED=false` logs each manifest instead of sending it, which is
what lets ShopHub run — and its tests pass — with no cluster. It is off by
default; the Helm chart turns it on.

Two known gaps: calls carry no timeout, so an API server that accepts a
connection and then goes quiet holds the request open, and nothing checks at
startup that the CRD is installed and the credentials are accepted — the first
shop is where that surfaces.

### Permissions

Running against a real cluster, the pod's service account needs `create`,
`patch` and `delete` on `shops.shop.shophub.local` in `SHOP_NAMESPACE`. That
Role and its binding are not in this repository — they belong to the deployment,
in the `shophub` Helm chart.
