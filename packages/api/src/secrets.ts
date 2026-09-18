import { GetParametersCommand, SSMClient } from "@aws-sdk/client-ssm";

/**
 * Secrets are read from SSM at cold start, not injected as Lambda environment
 * variables. Environment variables are visible in the CloudFormation template
 * and in the Lambda console; SSM SecureString values are not. One SSM call per
 * cold start is a price worth paying, and the result is cached for the life of
 * the container.
 *
 * Locally, .env wins and SSM is never called.
 */
const PREFIX = process.env.GX_SSM_PREFIX ?? "/growthx";
const NAMES = ["DATABASE_URL", "GEMINI_API_KEY"] as const;
export type SecretName = (typeof NAMES)[number];

let cache: Partial<Record<SecretName, string>> | null = null;

export async function loadSecrets(): Promise<Partial<Record<SecretName, string>>> {
  if (cache) return cache;

  const local: Partial<Record<SecretName, string>> = {};
  for (const n of NAMES) if (process.env[n]) local[n] = process.env[n];
  if (NAMES.every((n) => local[n])) {
    cache = local;
    return cache;
  }

  const ssm = new SSMClient({});
  const res = await ssm.send(
    new GetParametersCommand({
      Names: NAMES.map((n) => `${PREFIX}/${n}`),
      WithDecryption: true,
    })
  );
  const fetched: Partial<Record<SecretName, string>> = { ...local };
  for (const p of res.Parameters ?? []) {
    const short = (p.Name ?? "").split("/").pop() as SecretName | undefined;
    if (short && p.Value) fetched[short] = p.Value;
  }
  cache = fetched;
  return cache;
}

export async function requireSecret(name: SecretName): Promise<string> {
  const s = await loadSecrets();
  const v = s[name];
  if (!v) {
    throw new Error(
      `Secret ${name} is not available. Locally it comes from .env; in Lambda ` +
        `from SSM at ${PREFIX}/${name}. Run \`pnpm secrets:push\` to publish it.`
    );
  }
  return v;
}
