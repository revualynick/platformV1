#!/usr/bin/env tsx
/**
 * Provision one Revualy tenant (subdomain.revualy.com) on Railway.
 *
 * DRY RUN BY DEFAULT: prints every command and API request it would make,
 * with secrets redacted, and changes nothing (no state file, no secrets).
 * --apply performs the steps. Only run --apply once Nick has read the dry run.
 *
 * First run:
 *   pnpm tenant:provision --name "Acme Corp" --subdomain acme \
 *     --admin-email ops@acme.com --chat-platform google_chat \
 *     --region europe-west4-drams3a --template <railway-template-code>
 * Later runs only need --subdomain; inputs come from the state file.
 *
 * See .claude/skills/revualy-tenant/SKILL.md and docs/deployment.md.
 */
import { SecretStore, makeSaver, tenantPaths, type StepContext } from "./lib/context.js";
import { STEP_IDS, STEP_TITLES } from "./lib/constants.js";
import { DryRunExecutor, LiveExecutor } from "./lib/executor.js";
import { mergeWithRecordedInput, parseProvisionArgs, validateSubdomain, validateTenantInput } from "./lib/inputs.js";
import { loadState, newState, selectSteps } from "./lib/state.js";
import { revealKey, runSteps } from "./lib/steps.js";

const HELP = `Usage: pnpm tenant:provision [options]

Tenant (required on the first run, then read from the state file):
  --name <org name>           e.g. "Acme Corp"
  --subdomain <label>         acme -> acme.revualy.com
  --admin-email <email>       first super_admin; their domain becomes the allowed login domain
  --chat-platform <p>         google_chat | slack | teams
  --region <railway region>   europe-west4-drams3a | us-west2 | us-east4-eqdc4a | asia-southeast1-eqsg3a
Optional:
  --admin-name <name>         defaults to the email's local part
  --template <code>           Railway template code (or REVUALY_RAILWAY_TEMPLATE)
  --workspace <id|name>       Railway workspace, if the account has several

Control:
  --apply                     actually do it (default is a dry run)
  --from-step <step>          re-run from a step (${STEP_IDS.join(", ")})
  --key-backed-up             confirm the encryption key is in the password manager
  --oauth-configured          confirm the Google OAuth redirect URIs were added
  --reveal-key                print the encryption key (terminal only, never through Claude Code)
  -h, --help
`;

async function main(): Promise<number> {
  const opts = parseProvisionArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(HELP);
    return 0;
  }

  const subErrors = validateSubdomain(opts.input.subdomain);
  if (subErrors.length > 0) {
    console.error(subErrors.join("\n"));
    return 1;
  }
  const subdomain = opts.input.subdomain!;
  const paths = tenantPaths(subdomain);
  const recorded = loadState(paths.stateDir, subdomain);

  opts.input.template ??= process.env.REVUALY_RAILWAY_TEMPLATE;
  const { merged, conflicts } = mergeWithRecordedInput(opts.input, recorded?.input);
  if (conflicts.length > 0) {
    console.error(`Inputs conflict with the state file ${paths.stateDir}/${subdomain}.json:\n  ${conflicts.join("\n  ")}`);
    return 1;
  }
  const validated = validateTenantInput(merged);
  if (!validated.ok) {
    console.error(`Invalid input:\n  ${validated.errors.join("\n  ")}`);
    return 1;
  }
  const input = validated.value;

  const live = opts.apply || opts.revealKey;
  const now = () => new Date();
  const state = recorded ?? newState(input, now());
  state.input = input;
  const secrets = new SecretStore(paths.secretsFile, live);
  const exec = live ? new LiveExecutor(() => secrets.forRedaction()) : new DryRunExecutor(() => secrets.forRedaction());
  const ctx: StepContext = {
    input,
    state,
    paths,
    flags: { keyBackedUp: opts.keyBackedUp, oauthConfigured: opts.oauthConfigured },
    exec,
    operatorEnv: process.env,
    now,
    isTTY: Boolean(process.stdout.isTTY),
    secrets,
    save: makeSaver(live, paths.stateDir, state, secrets, now),
  };

  if (opts.revealKey) {
    try {
      revealKey(ctx);
      return 0;
    } catch (err) {
      console.error((err as Error).message);
      return 1;
    }
  }

  const { steps, warnings } = selectSteps(recorded, opts.fromStep, opts.apply ? "apply" : "dry-run");
  console.log(`${opts.apply ? "APPLY" : "DRY RUN (nothing will change; add --apply to run for real)"}: ${input.subdomain}.revualy.com`);
  console.log(`  state:   ${paths.stateDir}/${subdomain}.json${recorded ? "" : " (new)"}`);
  console.log(`  railway: ${paths.linkDir}`);
  for (const w of warnings) console.log(`  warning: ${w}`);
  if (steps.length === 0) {
    console.log("All steps are complete. Use --from-step <step> to re-run one.");
    return 0;
  }
  ctx.save();

  const result = await runSteps(ctx, steps);
  switch (result.status) {
    case "complete":
      console.log(opts.apply ? `\n${input.subdomain} is provisioned.` : `\nEnd of dry run (${steps.length} steps). Nothing was changed.`);
      return 0;
    case "waiting":
      console.log(opts.apply ? `\nPaused at ${result.step}: ${result.reason}` : `\nEnd of dry run. A live run would first pause at ${result.step}: ${result.reason}`);
      return opts.apply ? 2 : 0;
    case "failed":
      console.error(`\nStep ${result.step} (${STEP_TITLES[result.step]}) failed:\n  ${result.error}`);
      console.error(`Fix the cause, dry-run again, then: pnpm tenant:provision --subdomain ${subdomain} --from-step ${result.step}${opts.apply ? " --apply" : ""}`);
      return 1;
  }
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error((err as Error).message);
    process.exit(1);
  },
);
