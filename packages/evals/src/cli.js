import { runTokenEconomyEval } from "./index.js";

const report = runTokenEconomyEval();
console.log(JSON.stringify(report, null, 2));
if (report.summary.failed > 0) process.exitCode = 1;
