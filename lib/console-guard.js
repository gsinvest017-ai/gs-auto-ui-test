// Collect pageerror + console.error events into an array, with caller-supplied
// ignore patterns (e.g. favicon noise). Returns the live errors[] so the
// caller can throw at end-of-scenario if any leaked through.

export function attachConsoleGuard(page, ignorePatterns = []) {
  const ignores = ignorePatterns.map(p => p instanceof RegExp ? p : new RegExp(p));
  const errors = [];
  page.on("pageerror", e => errors.push(`pageerror: ${e.message}`));
  page.on("console", m => {
    if (m.type() === "error") {
      const txt = m.text();
      if (!ignores.some(re => re.test(txt))) errors.push(`console.error: ${txt}`);
    }
  });
  return errors;
}
