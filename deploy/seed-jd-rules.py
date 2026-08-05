import json, os, psycopg2
cfg=json.load(open('/srv/cps-data/jd-collector/jd-mappings.json',encoding='utf-8'))
conn=psycopg2.connect(os.environ['DATABASE_URL'])
with conn,conn.cursor() as cur:
 cur.execute("update plan_whitelist_uploads set active=false where channel='jd'")
 cur.execute("insert into plan_whitelist_uploads(channel,file_name,row_count,active) values('jd','初始计划匹配表.xlsx',%s,true) returning id",[len(cfg['plans'])]); upload=cur.fetchone()[0]
 for p in cfg['plans']:cur.execute("insert into plan_whitelist_items(upload_id,channel,plan_name) values(%s,'jd',%s)",[upload,p])
 cur.execute("update product_mapping_uploads set active=false where channel='jd'")
 cur.execute("insert into product_mapping_uploads(channel,file_name,row_count,active) values('jd','初始SKU匹配表.xlsx',%s,true) returning id",[len(cfg['skus'])]); up=cur.fetchone()[0]
 for sku,name in cfg['skus'].items():cur.execute("insert into product_mappings(upload_id,channel,merchant_code,promotion_name,count_in_sales) values(%s,'jd',%s,%s,true)",[up,sku,name])
 for mid,name in cfg['alliances'].items():
  cur.execute("select id from leaders where platform='jd' and name=%s limit 1",[name]); row=cur.fetchone()
  if row:cur.execute("update leaders set match_id=%s where id=%s",[mid,row[0]])
  else:cur.execute("insert into leaders(name,platform,match_id,cooperation_status) values(%s,'jd',%s,'合作中')",[name,mid])
