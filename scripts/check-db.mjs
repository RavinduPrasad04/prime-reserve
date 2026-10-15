import "dotenv/config";
import pg from "pg";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();
  const r = await client.query(
    "select current_database() as db, current_user as usr, version() as v",
  );
  console.log("CONNECTED=true");
  console.log("DB=" + r.rows[0].db);
  console.log("USER=" + r.rows[0].usr);
  console.log("VERSION=" + String(r.rows[0].v).split(",")[0]);
  const t = await client.query(
    "select tablename from pg_tables where schemaname = 'public' order by tablename",
  );
  console.log(
    "TABLES=" + (t.rows.map((x) => x.tablename).join(",") || "(none)"),
  );
  await client.end();
} catch (e) {
  console.log("CONNECTED=false");
  console.log("ERROR=" + e.message);
  process.exitCode = 1;
}
