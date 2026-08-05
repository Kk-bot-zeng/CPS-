import json, sys
import pandas as pd

plans_path, skus_path, alliances_path, output_path = sys.argv[1:]
plans_raw = pd.read_excel(plans_path, header=None).iloc[:, 0].dropna().astype(str).str.strip()
plans = list(dict.fromkeys(value for value in plans_raw if value))
skus = pd.read_excel(skus_path)
skus["_key"] = skus.iloc[:, 0].map(lambda x: str(int(x)) if pd.notna(x) else "")
sku_map = {}
for item, group in skus.groupby("_key"):
    values = sorted(set(group.iloc[:, 3].dropna().astype(str).str.strip()))
    if len(values) == 1: sku_map[item] = values[0]
alliances = pd.read_excel(alliances_path)
alliances["_key"] = alliances.iloc[:, 0].map(lambda x: str(int(x)) if pd.notna(x) else "")
alliance_map = {}
for item, group in alliances.groupby("_key"):
    values = sorted(set(group.iloc[:, 1].dropna().astype(str).str.strip()))
    if len(values) == 1: alliance_map[item] = values[0]
with open(output_path, "w", encoding="utf-8") as file:
    json.dump({"plans": plans, "skus": sku_map, "alliances": alliance_map}, file, ensure_ascii=False, indent=2)
print({"plans": len(plans), "skus": len(sku_map), "alliances": len(alliance_map)})
