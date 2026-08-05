import os, sys, psycopg2
with open(sys.argv[1], encoding="utf-8") as f: sql=f.read()
conn=psycopg2.connect(os.environ["DATABASE_URL"])
with conn,conn.cursor() as cur: cur.execute(sql)
