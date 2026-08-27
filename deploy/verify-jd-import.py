#!/usr/bin/env python3
import os, json, psycopg2
conn = psycopg2.connect(os.environ["DATABASE_URL"])
with conn, conn.cursor() as cur:
    cur.execute("select status,total_rows,inserted_rows,created_at::text from import_jobs where channel='jd' order by created_at desc limit 3")
    jobs = cur.fetchall()
    cur.execute("select count(*),min(paid_at)::text,max(paid_at)::text,sum(quantity),sum(payable_amount)::text from orders where platform='jd'")
    totals = cur.fetchone()
    cur.execute("select split_part(source_key,':',1),count(*) from orders where platform='jd' group by 1 order by 1")
    stores = cur.fetchall()
print(json.dumps({"jobs":jobs,"totals":totals,"stores":stores},ensure_ascii=False))
