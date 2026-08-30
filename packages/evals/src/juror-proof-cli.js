import { runJurorProof } from "./juror-proof.js";

const proof = runJurorProof();
console.log(JSON.stringify(proof, null, 2));
process.exitCode = proof.summary.failed === 0 ? 0 : 1;
