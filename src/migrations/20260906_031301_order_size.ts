import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  // Nullable at the database level, deliberately: existing order rows were
  // placed before sizes existed and have none to backfill. `required: true`
  // in the Payload config still enforces the constraint for every new write
  // that goes through the Local API; history is left alone rather than
  // filled in with a size nobody actually chose.
  await db.execute(sql`
   ALTER TABLE "orders_items" ADD COLUMN "size_snapshot" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "orders_items" DROP COLUMN "size_snapshot";`)
}
