#!/usr/bin/env node

import { runAutoInvoices } from "@/lib/auto-invoices/run-auto-invoices";
import { prisma } from "@/lib/prisma";

function parseArgs(args: string[]) {
  const options: {
    dryRun: boolean;
    runDate?: string;
  } = {
    dryRun: true,
  };
  let hasIssue = false;
  let hasConfirmIssue = false;

  for (const arg of args) {
    if (arg.startsWith("--run-date=")) {
      options.runDate = arg.slice("--run-date=".length);
      continue;
    }

    if (arg === "--issue") {
      hasIssue = true;
      continue;
    }

    if (arg === "--confirm-issue") {
      hasConfirmIssue = true;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      console.log(
        [
          "Usage: npx tsx scripts/auto-issue-invoices.ts [--run-date=YYYY-MM-DD] [--issue --confirm-issue]",
          "",
          "Default mode is dry-run. Real invoice issuing requires both --issue and --confirm-issue.",
        ].join("\n")
      );
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (hasIssue !== hasConfirmIssue) {
    throw new Error(
      "Real invoice issuing requires both --issue and --confirm-issue"
    );
  }

  options.dryRun = !(hasIssue && hasConfirmIssue);

  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = await runAutoInvoices(options);

  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((error: unknown) => {
    console.error(
      JSON.stringify(
        {
          dry_run: true,
          status: "failed",
          error:
            error instanceof Error
              ? error.message
              : "Unknown error",
        },
        null,
        2
      )
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
