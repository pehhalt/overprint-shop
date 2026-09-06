import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_media_generated_by" AS ENUM('ai', 'photograph', 'unknown');
  ALTER TABLE "media" ADD COLUMN "generated_by" "enum_media_generated_by" DEFAULT 'unknown' NOT NULL;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "media" DROP COLUMN "generated_by";
  DROP TYPE "public"."enum_media_generated_by";`)
}
