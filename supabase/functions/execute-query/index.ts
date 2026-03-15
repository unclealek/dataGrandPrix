import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import initSqlJs from "npm:sql.js@1.10.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface QueryRequest {
  sql: string;
  currentData: {
    columns: string[];
    rows: Record<string, unknown>[];
  };
}

interface QueryResponse {
  success: boolean;
  columns?: string[];
  rows?: Record<string, unknown>[];
  rowCount?: number;
  error?: string;
}

function normalizeSql(sql: string) {
  return sql.replace(/--.*$/gm, "").trim();
}

function validateQuery(sql: string) {
  const normalizedSql = normalizeSql(sql);
  const uppercaseSql = normalizedSql.toUpperCase();

  if (!normalizedSql) {
    return "SQL query cannot be empty.";
  }

  if (normalizedSql.includes(";")) {
    const parts = normalizedSql.split(";").map((part) => part.trim()).filter(Boolean);
    if (parts.length > 1) {
      return "Only a single SELECT statement is allowed.";
    }
  }

  if (!(uppercaseSql.startsWith("SELECT") || uppercaseSql.startsWith("WITH"))) {
    return "Only SELECT queries are allowed.";
  }

  if (!uppercaseSql.includes("CURRENT_TABLE")) {
    return "Query must read from current_table.";
  }

  const dangerousKeywords = [
    "DROP", "DELETE", "TRUNCATE", "ALTER", "CREATE", "INSERT", "UPDATE",
    "GRANT", "REVOKE", "EXEC", "EXECUTE", "PRAGMA", "ATTACH", "DETACH",
    "VACUUM", "REINDEX", "MERGE", "REPLACE"
  ];

  for (const keyword of dangerousKeywords) {
    const pattern = new RegExp(`\\b${keyword}\\b`, "i");
    if (pattern.test(uppercaseSql)) {
      return `Query contains forbidden keyword: ${keyword}. Only SELECT queries are allowed.`;
    }
  }

  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { sql: userSql, currentData }: QueryRequest = await req.json();

    if (!userSql || !currentData) {
      return Response.json(
        {
          success: false,
          error: "Missing SQL query or current data",
        } as QueryResponse,
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const validationError = validateQuery(userSql);
    if (validationError) {
      return Response.json(
        {
          success: false,
          error: validationError,
        } as QueryResponse,
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const SQL = await initSqlJs();
    const db = new SQL.Database();

    if (currentData.rows.length === 0) {
      return Response.json(
        {
          success: false,
          error: "No data available in current table",
        } as QueryResponse,
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const columns = currentData.columns;
    const columnDefs = columns.map(col => `"${col}" TEXT`).join(", ");

    db.run(`CREATE TABLE current_table (${columnDefs})`);

    for (const row of currentData.rows) {
      const values = columns.map(col => {
        const value = row[col];
        if (value === null || value === undefined) {
          return "NULL";
        }
        return `'${String(value).replace(/'/g, "''")}'`;
      }).join(", ");

      db.run(`INSERT INTO current_table VALUES (${values})`);
    }

    const result = db.exec(normalizeSql(userSql).replace(/;+\s*$/, ""));

    if (result.length === 0) {
      return Response.json(
        {
          success: true,
          columns: [],
          rows: [],
          rowCount: 0,
        } as QueryResponse,
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const resultColumns = result[0].columns;
    const resultValues = result[0].values;

    const resultRows = resultValues.map(row => {
      const rowObj: Record<string, unknown> = {};
      resultColumns.forEach((col, idx) => {
        rowObj[col] = row[idx];
      });
      return rowObj;
    });

    db.close();

    return Response.json(
      {
        success: true,
        columns: resultColumns,
        rows: resultRows,
        rowCount: resultRows.length,
      } as QueryResponse,
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error) {
    console.error("Query execution error:", error);

    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred",
      } as QueryResponse,
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
