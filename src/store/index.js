// Ponto unico para obter o armazenamento. Hoje aponta para o JsonStore local.
// Para producao, troque aqui por um adaptador de banco na nuvem que exponha a
// mesma interface (putTip/getReport/upsertReport/reportsForTip/markAuthSeen/purgeBet).
import { config } from '../config.js';
import { JsonStore } from './jsonStore.js';

let instance = null;

export function getStore() {
  if (!instance) instance = new JsonStore(config.storeFile);
  return instance;
}
