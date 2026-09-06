import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  // Nullable, deliberately: existing order rows predate consent collection and
  // must not be back-filled with a timestamp nobody agreed at.
  await db.execute(sql`
   ALTER TABLE "orders" ADD COLUMN "terms_accepted_at" timestamp(3) with time zone;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "orders" DROP COLUMN "terms_accepted_at";`)
}
