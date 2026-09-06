import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "orders" ADD COLUMN "shipping_name" varchar;
  ALTER TABLE "orders" ADD COLUMN "shipping_address_line1" varchar;
  ALTER TABLE "orders" ADD COLUMN "shipping_address_line2" varchar;
  ALTER TABLE "orders" ADD COLUMN "shipping_address_city" varchar;
  ALTER TABLE "orders" ADD COLUMN "shipping_address_postal_code" varchar;
  ALTER TABLE "orders" ADD COLUMN "shipping_address_country" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "orders" DROP COLUMN "shipping_name";
  ALTER TABLE "orders" DROP COLUMN "shipping_address_line1";
  ALTER TABLE "orders" DROP COLUMN "shipping_address_line2";
  ALTER TABLE "orders" DROP COLUMN "shipping_address_city";
  ALTER TABLE "orders" DROP COLUMN "shipping_address_postal_code";
  ALTER TABLE "orders" DROP COLUMN "shipping_address_country";`)
}
