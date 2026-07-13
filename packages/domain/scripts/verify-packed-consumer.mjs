import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const temporaryRoot = await mkdtemp(join(tmpdir(), 'gooes-domain-consumer-'));

try {
  await execFileAsync('pnpm', ['pack', '--pack-destination', temporaryRoot], {
    cwd: packageRoot,
    maxBuffer: 10 * 1024 * 1024,
  });

  const archiveName = (await readdir(temporaryRoot)).find((name) =>
    name.endsWith('.tgz'),
  );
  if (!archiveName) {
    throw new Error('未生成 domain package archive');
  }

  const consumerRoot = join(temporaryRoot, 'consumer');
  await mkdir(consumerRoot);
  await writeFile(
    join(consumerRoot, 'package.json'),
    JSON.stringify({ name: 'domain-packed-consumer', private: true, type: 'module' }),
  );
  await execFileAsync(
    'pnpm',
    [
      'add',
      '--offline',
      '--ignore-scripts',
      join(temporaryRoot, archiveName),
      'zod@4.4.2',
      'typescript@5.9.3',
    ],
    { cwd: consumerRoot, maxBuffer: 10 * 1024 * 1024 },
  );

  await writeFile(
    join(consumerRoot, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        module: 'ESNext',
        moduleResolution: 'Bundler',
        noEmit: true,
        strict: true,
        target: 'ES2022',
      },
      include: ['verify.ts'],
    }),
  );
  await writeFile(
    join(consumerRoot, 'verify.ts'),
    `import {
  SiteContentDraftBlockSchema,
  type SiteContentDraftBlock,
  type SiteContentPublicDetail,
  type SiteContentPublicSummary,
} from '@gooes/domain';
import { z } from 'zod';

const schema: z.ZodType<SiteContentDraftBlock> = SiteContentDraftBlockSchema;

const assertTypes = (
  block: SiteContentDraftBlock,
  detail: SiteContentPublicDetail,
): SiteContentPublicSummary => {
  if (block.type === 'heading') {
    const level: 2 | 3 = block.level;
    void level;
  }
  return detail;
};

void schema;
void assertTypes;
`,
  );
  await execFileAsync('pnpm', ['exec', 'tsc', '-p', 'tsconfig.json', '--noEmit'], {
    cwd: consumerRoot,
  });

  await writeFile(
    join(consumerRoot, 'verify.mjs'),
    `import { SiteContentDraftBlockSchema } from '@gooes/domain';
import { z } from 'zod';

if (!(SiteContentDraftBlockSchema instanceof z.ZodType)) {
  throw new Error('packed domain schema 与 consumer 使用了不同的 Zod 类型身份');
}

if (!SiteContentDraftBlockSchema.safeParse({ type: 'paragraph', text: 'packed consumer' }).success) {
  throw new Error('packed domain schema 无法执行解析');
}
`,
  );
  await execFileAsync('node', ['./verify.mjs'], { cwd: consumerRoot });
  process.stdout.write('packed domain consumer verified with shared zod identity\n');
} finally {
  await rm(temporaryRoot, { force: true, recursive: true });
}
