"use strict";
require("dotenv").config();
const { Pool } = require("pg");
const pool = new Pool({ connectionString: (process.env.DATABASE_URL ?? "").trim(), ssl: { rejectUnauthorized: false } });
async function main() {
  const client = await pool.connect();
  const { rows } = await client.query(`
    SELECT
      (SELECT COUNT(*) FROM "StockEntry") AS entries,
      (SELECT COUNT(*) FROM "EntryItem")  AS items,
      (SELECT COUNT(*) FROM "StockExit")  AS exits,
      (SELECT COUNT(*) FROM "ExitItem")   AS exit_items,
      (SELECT COUNT(*) FROM "DeliveryOrder") AS deliveries,
      (SELECT COUNT(*) FROM "BudgetMovement") AS budget_movements
  `);
  console.log("Contagens:", rows[0]);
  const { rows: exitSample } = await client.query(`
    SELECT se.id, se."exitDate", se.reason, se."isExtra", u.name as user, COUNT(ei.id) as items
    FROM "StockExit" se
    JOIN "User" u ON u.id = se."userId"
    LEFT JOIN "ExitItem" ei ON ei."exitId" = se.id
    GROUP BY se.id, se."exitDate", se.reason, se."isExtra", u.name
    ORDER BY se."exitDate" DESC LIMIT 10
  `);
  console.log("Últimas 10 saídas:", exitSample);
  client.release();
  await pool.end();
}
main().catch(console.error);
