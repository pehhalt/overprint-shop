import * as migration_20260904_135825_initial from './20260904_135825_initial';
import * as migration_20260905_211217_orders from './20260905_211217_orders';
import * as migration_20260906_031301_order_size from './20260906_031301_order_size';
import * as migration_20260906_033052_order_terms_consent from './20260906_033052_order_terms_consent';
import * as migration_20260906_034519_order_shipping from './20260906_034519_order_shipping';
import * as migration_20260906_035440_order_fulfilment from './20260906_035440_order_fulfilment';

export const migrations = [
  {
    up: migration_20260904_135825_initial.up,
    down: migration_20260904_135825_initial.down,
    name: '20260904_135825_initial',
  },
  {
    up: migration_20260905_211217_orders.up,
    down: migration_20260905_211217_orders.down,
    name: '20260905_211217_orders',
  },
  {
    up: migration_20260906_031301_order_size.up,
    down: migration_20260906_031301_order_size.down,
    name: '20260906_031301_order_size',
  },
  {
    up: migration_20260906_033052_order_terms_consent.up,
    down: migration_20260906_033052_order_terms_consent.down,
    name: '20260906_033052_order_terms_consent',
  },
  {
    up: migration_20260906_034519_order_shipping.up,
    down: migration_20260906_034519_order_shipping.down,
    name: '20260906_034519_order_shipping',
  },
  {
    up: migration_20260906_035440_order_fulfilment.up,
    down: migration_20260906_035440_order_fulfilment.down,
    name: '20260906_035440_order_fulfilment'
  },
];
