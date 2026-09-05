import * as migration_20260904_135825_initial from './20260904_135825_initial';
import * as migration_20260905_211217_orders from './20260905_211217_orders';

export const migrations = [
  {
    up: migration_20260904_135825_initial.up,
    down: migration_20260904_135825_initial.down,
    name: '20260904_135825_initial',
  },
  {
    up: migration_20260905_211217_orders.up,
    down: migration_20260905_211217_orders.down,
    name: '20260905_211217_orders'
  },
];
