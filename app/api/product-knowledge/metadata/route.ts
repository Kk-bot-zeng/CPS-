import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { pool } from "@/lib/db";
import { fixedFieldMetadata, isProductCategory, type ProductCategory, type ProductField } from "@/lib/product-knowledge";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;
  const requested = new URL(request.url).searchParams.get("category");
  const categories: ProductCategory[] = requested && isProductCategory(requested) ? [requested] : ["tv", "monitor"];
  const result = [];
  for (const category of categories) {
    const { rows: fields } = await pool.query<ProductField>(
      `select id, product_category, field_key, field_label, field_type, options,
              required, active, sort_order, notes, created_at, updated_at
         from public.product_knowledge_fields
        where product_category = $1 order by sort_order asc, field_label asc`, [category],
    );
    result.push({ category, fixedFields: fixedFieldMetadata(category), fields });
  }
  return NextResponse.json({ categories: ["tv", "monitor"], data: result, importModes: ["insert_only", "merge", "overwrite"] }, { headers: { "Cache-Control": "no-store" } });
}

