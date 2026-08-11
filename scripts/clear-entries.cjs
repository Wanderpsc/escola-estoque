// Script de limpeza: remove todas as StockEntries (e EntryItems em cascade)
// Uso: node scripts/clear-entries.cjs
"use strict";

require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: (process.env.DATABASE_URL ?? "").trim(),
  ssl: { rejectUnauthorized: false },
});

async function main() {
  const client = await pool.connect();
  try {
    // Contagem antes
    const { rows: counts } = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM "StockEntry") AS entries,
        (SELECT COUNT(*) FROM "EntryItem")  AS items,
        (SELECT COUNT(*) FROM "DeliveryOrder" WHERE "stockEntryId" IS NOT NULL) AS deliveries
    `);
    console.log("Registros encontrados:", counts[0]);

    await client.query("BEGIN");

    // 1. Desvincula DeliveryOrders das NFs (mantém as entregas, remove a referência)
    const d = await client.query(`UPDATE "DeliveryOrder" SET "stockEntryId" = NULL WHERE "stockEntryId" IS NOT NULL`);
    console.log(`DeliveryOrders desvinculadas: ${d.rowCount}`);

    // 2. Remove BudgetMovements gerados por NFs (referência "NF-EXTRA-*")
    const bm = await client.query(`DELETE FROM "BudgetMovement" WHERE reference LIKE 'NF-EXTRA-%'`);
    console.log(`BudgetMovements NF-EXTRA removidos: ${bm.rowCount}`);

    // 3. Remove EntryItems (cascata via FK, mas garantindo explicitamente)
    const ei = await client.query(`DELETE FROM "EntryItem"`);
    console.log(`EntryItems removidos: ${ei.rowCount}`);

    // 4. Remove todas as StockEntries
    const se = await client.query(`DELETE FROM "StockEntry"`);
    console.log(`StockEntries removidas: ${se.rowCount}`);

    await client.query("COMMIT");
    console.log("\n✅ Limpeza concluída com sucesso.");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Erro — rollback feito:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
