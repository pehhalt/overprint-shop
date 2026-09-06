import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_orders_fulfilment_status" AS ENUM('unfulfilled', 'shipped');
  ALTER TABLE "orders" ADD COLUMN "fulfilment_status" "enum_orders_fulfilment_status" DEFAULT 'unfulfilled' NOT NULL;
  ALTER TABLE "orders" ADD COLUMN "fulfilled_at" timestamp(3) with time zone;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "orders" DROP COLUMN "fulfilment_status";
  ALTER TABLE "orders" DROP COLUMN "fulfilled_at";
  DROP TYPE "public"."enum_orders_fulfilment_status";`)
}
