// Placeholder for scripts that later phases create.
// Fails loudly and usefully rather than with a confusing module-not-found error.
const [, , name, phase] = process.argv;
console.error(
  `\n  \x1b[33m✗ \`pnpm ${name}\` does not exist yet.\x1b[0m\n` +
    `    It is built in phase \x1b[1m${phase}\x1b[0m. See PLAN.md §6 and GUIDE.md §A for where we are.\n` +
    `    This is expected, not a broken install.\n`
);
process.exit(1);
