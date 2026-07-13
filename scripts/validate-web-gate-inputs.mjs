const [environment, commitSha, migrationVersion] = process.argv.slice(2);

if (!new Set(["development", "production"]).has(environment)) process.exit(1);
if (!/^[a-f0-9]{40}$/.test(commitSha ?? "")) process.exit(1);
if (migrationVersion !== "20260711120000") process.exit(1);
