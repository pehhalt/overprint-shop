import * as migration_20260904_135825_initial from './20260904_135825_initial';

export const migrations = [
  {
    up: migration_20260904_135825_initial.up,
    down: migration_20260904_135825_initial.down,
    name: '20260904_135825_initial'
  },
];
