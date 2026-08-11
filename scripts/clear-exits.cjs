"use strict";
require("dotenv").config();
const { Pool } = require("pg");
const pool = new Pool({ connectionString: (process.env.DATABASE_URL ?? "").trim(), ssl: { rejectUnauthorized: false } });
async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const ei = await client.query(`DELETE FROM "ExitItem"`);
    const se = await client.query(`DELETE FROM "StockExit"`);
    // Remove BudgetMovements gerados por saídas extras
    const bm = await client.query(`DELETE FROM "BudgetMovement" WHERE category = 'EXTRA' AND reference NOT LIKE 'NF-EXTRA-%'`);
    await client.query("COMMIT");
    console.log(`ExitItems removidos: ${ei.rowCount}`);
    console.log(`StockExits removidas: ${se.rowCount}`);
    console.log(`BudgetMovements extras removidos: ${bm.rowCount}`);
    console.log("✅ Saídas limpas com sucesso.");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Erro:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}
main();
