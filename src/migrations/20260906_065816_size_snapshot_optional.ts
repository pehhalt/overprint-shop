import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  // A no-op against every real database, and generated anyway on purpose. The column
  // has been nullable since it was added (20260906_031301_order_size), but Payload's
  // schema snapshot recorded it as NOT NULL, because the field was `required: true` in
  // the config. Dropping that `required` makes the config agree with the database;
  // this migration makes the snapshot agree too. Without it the diff stays pending, and
  // the next unrelated `migrate:create` folds this statement into itself unannounced.
  await db.execute(sql`
   ALTER TABLE "orders_items" ALTER COLUMN "size_snapshot" DROP NOT NULL;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // Restores the snapshot's previous state, which is not a state any database was ever
  // in: this fails against any database holding an order placed before sizes existed —
  // the exact rows the column is nullable for.
  await db.execute(sql`
   ALTER TABLE "orders_items" ALTER COLUMN "size_snapshot" SET NOT NULL;`)
}
