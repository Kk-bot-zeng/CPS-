import { Pool, type QueryResultRow } from "pg";

const globalDb = globalThis as typeof globalThis & { cpsPool?: Pool };
export const pool = globalDb.cpsPool || new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
if (process.env.NODE_ENV !== "production") globalDb.cpsPool = pool;

export async function sql<T extends QueryResultRow = QueryResultRow>(text: string, values: unknown[] = []) {
  return pool.query<T>(text, values);
}

const allowedTables = new Set(["talents", "leaders", "products", "orders", "import_jobs", "product_mapping_uploads", "product_mappings"]);
const ident = (value: string) => {
  if (!/^[a-z_][a-z0-9_]*$/i.test(value)) throw new Error("Invalid identifier");
  return `"${value}"`;
};

type Mode = "select" | "insert" | "update" | "delete" | "upsert";
class Builder implements PromiseLike<any> {
  private mode: Mode = "select"; private fields = "*"; private filters: string[] = [];
  private values: unknown[] = []; private payload: any; private ordering = ""; private limitClause = "";
  private one: "single" | "maybe" | null = null; private conflict = ""; private wantCount = false; private head = false;
  constructor(private table: string) { if (!allowedTables.has(table)) throw new Error("Invalid table"); }
  select(fields = "*", opts?: { count?: string; head?: boolean }) { this.fields = fields; this.wantCount = Boolean(opts?.count); this.head = Boolean(opts?.head); return this; }
  insert(payload: any) { this.mode = "insert"; this.payload = payload; return this; }
  update(payload: any) { this.mode = "update"; this.payload = payload; return this; }
  delete() { this.mode = "delete"; return this; }
  upsert(payload: any, opts?: { onConflict?: string }) { this.mode = "upsert"; this.payload = payload; this.conflict = opts?.onConflict || ""; return this; }
  eq(field: string, value: unknown) { return this.where(field, "=", value); }
  neq(field: string, value: unknown) { return this.where(field, "<>", value); }
  gte(field: string, value: unknown) { return this.where(field, ">=", value); }
  lte(field: string, value: unknown) { return this.where(field, "<=", value); }
  ilike(field: string, value: unknown) { return this.where(field, "ilike", value); }
  in(field: string, values: unknown[]) { this.values.push(values); this.filters.push(`${ident(field)} = any($${this.values.length})`); return this; }
  private where(field: string, op: string, value: unknown) { this.values.push(value); this.filters.push(`${ident(field)} ${op} $${this.values.length}`); return this; }
  order(field: string, opts?: { ascending?: boolean }) { this.ordering = ` order by ${ident(field)} ${opts?.ascending === false ? "desc" : "asc"}`; return this; }
  range(from: number, to: number) { this.limitClause = ` limit ${Math.max(0, to - from + 1)} offset ${Math.max(0, from)}`; return this; }
  limit(count: number) { this.limitClause = ` limit ${Math.max(0, count)}`; return this; }
  single() { this.one = "single"; return this; }
  maybeSingle() { this.one = "maybe"; return this; }
  then<TResult1 = any, TResult2 = never>(resolve?: ((v: any) => TResult1 | PromiseLike<TResult1>) | null, reject?: ((r: any) => TResult2 | PromiseLike<TResult2>) | null) {
    return this.run().then(resolve, reject);
  }
  private async run() {
    try {
      const table = ident(this.table), where = this.filters.length ? ` where ${this.filters.join(" and ")}` : "";
      let text = "", vals = [...this.values];
      if (this.mode === "select") {
        const joinLeader = this.fields.includes("leaders(name)");
        const fields = joinLeader ? `t.*, case when l.id is null then null else json_build_object('name',l.name) end as leaders` : this.fields === "*" ? "*" : this.fields.split(",").filter(x => !x.includes("(")).map(x => ident(x.trim())).join(",");
        text = joinLeader ? `select ${fields} from ${table} t left join leaders l on l.id=t.leader_id${where.replace(/"([^"]+)"/g, 't."$1"')}${this.ordering.replace(/"([^"]+)"/g, 't."$1"')}${this.limitClause}` : `select ${fields || "*"} from ${table}${where}${this.ordering}${this.limitClause}`;
      } else if (this.mode === "delete") text = `delete from ${table}${where} returning *`;
      else {
        const rows = Array.isArray(this.payload) ? this.payload : [this.payload];
        const keys = [...new Set(rows.flatMap((r: any) => Object.keys(r)))];
        if (this.mode === "update") {
          const sets = keys.map((k) => { vals.push(this.payload[k]); return `${ident(k)}=$${vals.length}`; });
          text = `update ${table} set ${sets.join(",")}${where} returning *`;
        } else {
          vals = [];
          const blocks = rows.map((r: any) => `(${keys.map(k => { vals.push(r[k] ?? null); return `$${vals.length}`; }).join(",")})`);
          let conflict = "";
          if (this.mode === "upsert" && this.conflict) {
            const cols = this.conflict.split(",").map(x => ident(x.trim()));
            const updates = keys.filter(k => !this.conflict.split(",").includes(k)).map(k => `${ident(k)}=excluded.${ident(k)}`);
            conflict = ` on conflict (${cols.join(",")}) do update set ${updates.join(",")}`;
          }
          text = `insert into ${table} (${keys.map(ident).join(",")}) values ${blocks.join(",")}${conflict} returning *`;
        }
      }
      const result = await pool.query(text, vals);
      const data = this.head ? null : this.one ? (result.rows[0] || null) : result.rows;
      if (this.one === "single" && !data) throw new Error("Record not found");
      return { data, count: this.wantCount ? result.rowCount : null, error: null };
    } catch (error) { return { data: null, count: null, error: error instanceof Error ? error : new Error(String(error)) }; }
  }
}

export const localAdmin = {
  from(table: string) { return new Builder(table); },
  async rpc(name: string, args: Record<string, any>) {
    try {
      if (name === "delete_import_jobs") {
        const ids = args.p_job_ids || [];
        const client = await pool.connect();
        try { await client.query("begin"); const a = await client.query("delete from orders where import_job_id=any($1::uuid[])", [ids]); const b = await client.query("delete from import_jobs where id=any($1::uuid[])", [ids]); await client.query("commit"); return { data: { ok: true, deletedJobs: b.rowCount, deletedOrders: a.rowCount }, error: null }; }
        catch (e) { await client.query("rollback"); throw e; } finally { client.release(); }
      }
      if (name === "replace_product_mappings") {
        const client = await pool.connect();
        try { await client.query("begin"); await client.query("update product_mapping_uploads set active=false where channel=$1", [args.p_channel]); const u = await client.query("insert into product_mapping_uploads(channel,file_name,row_count,active,created_by) values($1,$2,$3,true,$4) returning id", [args.p_channel,args.p_file_name,args.p_rows.length,args.p_user_id]); for (const r of args.p_rows) await client.query("insert into product_mappings(upload_id,channel,merchant_code,promotion_name,model_name) values($1,$2,$3,$4,$5) on conflict(upload_id,merchant_code) do update set promotion_name=excluded.promotion_name,model_name=excluded.model_name",[u.rows[0].id,args.p_channel,r.merchantCode,r.promotionName,r.modelName||null]); await client.query("commit"); return { data:{ok:true,uploadId:u.rows[0].id,rowCount:args.p_rows.length},error:null}; }
        catch(e){await client.query("rollback");throw e;}finally{client.release();}
      }
      throw new Error("Unsupported operation");
    } catch (error) { return { data: null, error: error instanceof Error ? error : new Error(String(error)) }; }
  },
};
