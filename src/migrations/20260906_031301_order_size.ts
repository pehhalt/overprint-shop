import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  // Nullable at the database level, deliberately: orders placed before sizes
  // existed have none to backfill, and inventing one would record a size
  // nobody chose. Nothing in the schema enforces a size in the other
  // direction either — `sizeSnapshot` is `required: false` in the Payload
  // config, because Payload validates the whole merged document on update, so
  // a required field would make every one of those older rows unwritable
  // (unshippable, unerasable, and fatal to a late Stripe webhook). The
  // guarantee that new orders always carry a valid size lives in the checkout
  // handler, not here: `isValidSize` in
  // src/app/(frontend)/shop/checkout/route.ts, the only code path that
  // creates an order.
  await db.execute(sql`
   ALTER TABLE "orders_items" ADD COLUMN "size_snapshot" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "orders_items" DROP COLUMN "size_snapshot";`)
}
