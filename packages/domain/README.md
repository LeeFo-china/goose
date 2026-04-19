# @gooes/domain

Shared domain constants, literal unions, config maps, and type guards for Gooes.

## Install

```bash
npm install @gooes/domain
```

## Usage

```ts
import {
  PROJECT_STATUS_VALUES,
  ProjectStatusConfig,
  type ProjectStatus,
} from "@gooes/domain";

const options = PROJECT_STATUS_VALUES.map((value) => ({
  label: ProjectStatusConfig[value].label,
  value,
}));
```

## Scope

This package only contains:

- business enums
- literal value arrays
- config maps
- type guards

It does not contain:

- database clients
- Fastify code
- Supabase types
- environment-dependent runtime logic
