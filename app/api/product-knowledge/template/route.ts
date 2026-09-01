import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { pool } from "@/lib/db";
import { FIXED_PRODUCT_FIELDS, fixedFieldMetadata, isProductCategory, type ProductCategory, type ProductField } from "@/lib/product-knowledge";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;
  const params = new URL(request.url).searchParams;
  const category = params.get("category") || params.get("product_category") || "tv";
  if (!isProductCategory(category)) return NextResponse.json({ error: "无效品类" }, { status: 400 });
  const { rows: fields } = await pool.query<ProductField>(
    `select id, product_category, field_key, field_label, field_type, options,
            required, active, sort_order, notes, created_at, updated_at
       from public.product_knowledge_fields
      where product_category = $1 and active = true
      order by sort_order asc, field_label asc`, [category],
  );
  const columns = [
    ...fixedFieldMetadata(category),
    ...fields.map((field) => ({ key: field.field_key, header: field.field_label, label: field.field_label, type: field.field_type, required: field.required, fixed: false, options: field.options || [], category })),
  ];
  return NextResponse.json({
    category,
    fileName: `${category === "tv" ? "TV" : "显示器"}产品资料库导入模板.xlsx`,
    columns,
    fixedFields: FIXED_PRODUCT_FIELDS,
    customFields: fields,
    importModes: [
      { value: "insert_only", label: "仅新增", description: "已有标准型号跳过，不修改原资料" },
      { value: "merge", label: "合并更新", description: "空白单元格不覆盖现有内容" },
      { value: "overwrite", label: "完整覆盖", description: "上传内容覆盖当前值，空白可清空旧值" },
    ],
    exampleRow: Object.fromEntries(columns.map((column) => [column.key, column.key === "product_category" ? category : ""])),
  }, { headers: { "Cache-Control": "no-store" } });
}

