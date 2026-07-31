// Armadilha 11: carimbo de versao visivel. Le o arquivo VERSION uma vez.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read() {
  try {
    return fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim();
  } catch {
    return 'desconhecida';
  }
}

export const VERSION = read();
// Momento em que o processo subiu — ajuda a saber qual build esta no ar.
export const BOOTED_AT = new Date().toISOString();
